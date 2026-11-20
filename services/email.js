const crypto = require('crypto');
const {frozenPayload}=require('./notification-templates');
function emailReady() { return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM); }
function externalEmailEnabled() { return (process.env.MARKET_DATA_PROVIDER || 'simulated') !== 'simulated' || process.env.EMAIL_SEND_IN_SIMULATION === 'true'; }
function applicationOrigin() {
  const url = new URL(process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000');
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('APP_BASE_URL must be an HTTPS application URL.');
  return url.origin;
}
async function sendEmail({to, subject, text, html, key}) {
  if (!emailReady()) { const err=new Error('Email delivery is not configured.'); err.status=503; throw err; }
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST', signal:AbortSignal.timeout(8000),
    headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},
    body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject:String(subject).replace(/[\r\n]/g,' ').slice(0,180),text,...(html?{html}:{})})
  });
  if (!response.ok) { const err=new Error('Email provider rejected the request ('+response.status+').'); err.permanent=response.status>=400 && response.status<500 && ![408,409,429].includes(response.status); throw err; }
  const result=await response.json();
  if (!result.id) throw new Error('Email provider did not acknowledge the message.');
  return result.id;
}
async function deliverEmail({pool,alert,job}) {
  const {rows}=await pool.query('SELECT name,email,email_opt_in,email_verified,active,role FROM users WHERE id=$1',[alert.user_id]);
  const user=rows[0];
  if(!user || !user.active || user.role!=='customer' || !user.email_opt_in || !user.email_verified) return {status:'skipped'};
  if(!externalEmailEnabled()) return {status:'simulated'};
  // Do not retry beyond the provider's 24-hour idempotency retention window.
  if(Date.now()-Date.parse(job.created_at)>23*60*60*1000) { const err=new Error('Email retry window expired; check delivery before resending.'); err.permanent=true; throw err; }
  const origin=applicationOrigin();
  const message=await frozenPayload({pool,job,channel:'email',alert,user,origin});
  const id=await sendEmail({to:user.email,subject:message.subject,text:message.text,html:message.html,key:'chartpulse-email-'+job.delivery_key});
  return {status:'done',providerId:id};
}
const hashToken=token=>crypto.createHash('sha256').update(token).digest('hex');
module.exports={emailReady,externalEmailEnabled,applicationOrigin,sendEmail,deliverEmail,hashToken};
