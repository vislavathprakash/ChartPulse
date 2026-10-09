const crypto=require('crypto');const metrics=require('./metrics');
const {deliverEmail}=require('./email');
async function processNotifications({pool,runtime,deliver}){
  for(let index=0;index<10;index++){
  const token=crypto.randomUUID();
  const {rows}=await pool.query(`WITH candidates AS (
    SELECT id FROM notification_jobs WHERE (status='ready' AND available_at<=NOW()) OR (status='processing' AND lease_until<NOW())
    ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
  ) UPDATE notification_jobs j SET status='processing',lease_until=NOW()+INTERVAL '30 seconds',claim_token=$1
    FROM candidates c WHERE j.id=c.id RETURNING j.*`,[token]);
  if(!rows.length)break;
  for(const job of rows){try{
    const {rows:alerts}=await pool.query('SELECT * FROM alerts WHERE id=$1',[job.alert_id]);const alert=alerts[0];
    if(job.channel==='email'){
      const result=alert?await deliverEmail({pool,alert,job}):{status:'skipped'};
      await pool.query('UPDATE notification_jobs SET status=$1,provider_message_id=$2,last_error=NULL,claim_token=NULL,lease_until=NULL WHERE id=$3 AND claim_token=$4',[result.status,result.providerId||null,job.id,token]);
      metrics.count('email_'+result.status);continue;
    }
    if(alert){if(job.channel==='in_app')await runtime.notify(alert.user_id,{type:'alert',alert});else if(job.channel==='whatsapp'&&(alert.status==='queued'||alert.status==='sending')){await pool.query("UPDATE alerts SET status='sending' WHERE id=$1",[alert.id]);await deliver(alert);}}
    const {rows:status}=await pool.query('SELECT status FROM alerts WHERE id=$1',[job.alert_id]);
    if(job.channel==='whatsapp'&&status[0]?.status==='queued'){
      await pool.query("UPDATE notification_jobs SET status='ready',attempts=attempts+1,available_at=(SELECT next_attempt_at FROM alerts WHERE id=$2),claim_token=NULL,lease_until=NULL WHERE id=$1 AND claim_token=$3",[job.id,job.alert_id,token]);
    }else await pool.query("UPDATE notification_jobs SET status=$1,claim_token=NULL,lease_until=NULL WHERE id=$2 AND claim_token=$3",[job.channel==='whatsapp'&&status[0]?.status==='failed'?'failed':'done',job.id,token]);
    metrics.count('notification_jobs');
  }catch(err){await pool.query("UPDATE notification_jobs SET status=CASE WHEN attempts>=4 OR $4 THEN 'failed' ELSE 'ready' END,attempts=attempts+1,available_at=NOW()+INTERVAL '1 minute'*LEAST(60,POWER(2,attempts)),last_error=$1,claim_token=NULL,lease_until=NULL WHERE id=$2 AND claim_token=$3",[err.message.slice(0,300),job.id,token,err.permanent===true]);runtime.error('delivery',err);}}
  }
}
module.exports={processNotifications};
