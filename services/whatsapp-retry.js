// Retry only known failed WhatsApp jobs. Sent or in-flight messages are not replayed.
function installWhatsAppRetry({app,pool,requireAuth,asyncRoute,isSimulated}){
  app.post('/api/alerts/:id/retry-whatsapp',requireAuth,asyncRoute(async(req,res)=>{
    if(!/^\d{1,10}$/.test(req.params.id))throw Object.assign(new Error('Choose a valid alert.'),{status:400});
    await pool.transaction(async()=>{
      const {rows:[alert]}=await pool.query('SELECT * FROM alerts WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.session.user.id]);
      if(!alert)throw Object.assign(new Error('Alert not found.'),{status:404});
      if(isSimulated&&!['dhan','news'].includes(alert.source))throw Object.assign(new Error('Simulated alerts cannot be sent to WhatsApp.'),{status:409});
      const {rows:[job]}=await pool.query("SELECT * FROM notification_jobs WHERE alert_id=$1 AND channel='whatsapp' FOR UPDATE",[alert.id]);
      if(alert.status!=='failed'||job?.status!=='failed')throw Object.assign(new Error('Only a failed WhatsApp delivery can be retried. Queued messages retry automatically.'),{status:409});
      const {rows:[user]}=await pool.query('SELECT active,whatsapp_opt_in,whatsapp_phone FROM users WHERE id=$1',[req.session.user.id]);
      if(!user?.active||!user.whatsapp_opt_in||!user.whatsapp_phone)throw Object.assign(new Error('Enable WhatsApp consent and save your phone number in settings first.'),{status:400});
      if(!process.env.WHATSAPP_ACCESS_TOKEN||!process.env.WHATSAPP_PHONE_NUMBER_ID||!process.env.WHATSAPP_TEMPLATE_NAME)throw Object.assign(new Error('WhatsApp delivery is not configured. Contact support.'),{status:503});
      await pool.query("UPDATE alerts SET status='queued',attempts=0,next_attempt_at=NOW() WHERE id=$1",[alert.id]);
      await pool.query("UPDATE notification_jobs SET status='ready',attempts=0,last_error=NULL,rendered_payload=NULL,available_at=NOW(),claim_token=NULL,lease_until=NULL WHERE id=$1",[job.id]);
    });
    res.json({ok:true,status:'queued'});
  }));
}
module.exports={installWhatsAppRetry};
