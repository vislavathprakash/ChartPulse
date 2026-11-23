const DEFAULTS=Object.freeze({
  emailSubject:'ChartPulse · {{alert_name}}',emailHeading:'{{alert_name}}',emailBody:'{{symbol}}\n\n{{message}}\n\nTriggered: {{triggered_at}}\nSource: {{source}}',emailFooter:'You are receiving this because you enabled alerts in ChartPulse.',emailCta:'Open ChartPulse',
  whatsappSymbol:'{{symbol}}',whatsappTitle:'{{alert_name}}',whatsappDetails:'{{message}}'
});
const TOKENS={alert_name:'Alert name',symbol:'Stock or market symbol',message:'Trigger details and custom message',source:'Alert source',triggered_at:'Triggered date and time in IST',app_url:'ChartPulse workspace link',user_name:'Your display name'};
const LIMITS={emailSubject:180,emailHeading:180,emailBody:3000,emailFooter:500,emailCta:40,whatsappSymbol:200,whatsappTitle:300,whatsappDetails:1500};
const APPROVED_BODY='Your saved AlertPe alert for {{1}} has triggered.\nAlert name: {{2}}\nTrigger details: {{3}}\nOpen AlertPe to review this alert.';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const invalid=message=>Object.assign(new Error(message),{status:400});
function validate(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw invalid('Enter a notification template.');
  for(const key of Object.keys(config))if(!Object.hasOwn(DEFAULTS,key))throw invalid('Unknown template field: '+key);
  const result={...DEFAULTS,...config};
  for(const [key,value] of Object.entries(result)){
    if(typeof value!=='string'||value.length>LIMITS[key]||!value.trim())throw invalid('Complete '+key+' using up to '+LIMITS[key]+' characters.');
    if(['emailSubject','emailHeading','emailCta'].includes(key)&&/[\r\n]/.test(value))throw invalid('Use one line for subject, heading and button label.');
    const remainder=value.replace(/{{\s*([a-z_]+)\s*}}/g,(match,token)=>{if(!Object.hasOwn(TOKENS,token))throw invalid('Unknown placeholder: '+token);return '';});
    if(remainder.includes('{{')||remainder.includes('}}'))throw invalid('Use supported placeholders such as {{symbol}}.');
  }
  return result;
}
function valuesFor(alert,user,origin){
  const date=new Date(alert.created_at),valid=Number.isFinite(+date);
  return {alert_name:String(alert.title||'Market alert'),symbol:String(alert.symbol||'Market'),message:String(alert.detail||'No additional trigger details.'),source:({dhan:'DhanHQ',news:'News',calendar:'Calendar',tradingview:'TradingView',screener:'Screener',drawing:'Chart drawing'})[alert.source]||'ChartPulse',triggered_at:valid?date.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'})+' IST':'Time unavailable',app_url:origin+(alert.source==='news'?'/app?view=news':alert.source==='dhan'?'/app?view=private-dhan':'/app'),user_name:String(user?.name||'Trader')};
}
const expand=(text,values)=>text.replace(/{{\s*([a-z_]+)\s*}}/g,(_,key)=>values[key]??'');
function render(config,alert,user,origin){
  config=validate(config);const values=valuesFor(alert,user,origin);
  const subject=expand(config.emailSubject,values).replace(/[\r\n]/g,' ').slice(0,180),heading=expand(config.emailHeading,values).slice(0,500),body=expand(config.emailBody,values).slice(0,20000),footer=expand(config.emailFooter,values).slice(0,2000),cta=expand(config.emailCta,values).slice(0,60);
  const text=[heading,'',body,'',cta+': '+values.app_url,'',footer].join('\n');
  const html=`<!doctype html><html><body style="margin:0;padding:24px 12px;background:#0b1017;color:#f1f5f9;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="max-width:620px;width:100%;margin:auto;border:1px solid #273342;border-radius:16px;background:#121a24" cellpadding="0" cellspacing="0"><tr><td style="padding:28px"><div style="color:#6ed7ad;font-size:20px;font-weight:700;margin-bottom:24px">ChartPulse</div><p style="font-size:12px;letter-spacing:1px;color:#94a3b8;margin:0 0 12px">MARKET ALERT</p><h1 style="font-size:24px;line-height:1.4;margin:0 0 16px">${escape(heading)}</h1><div style="display:inline-block;padding:7px 12px;border-radius:6px;background:#1d3c33;color:#8ce9c2;font-size:13px;margin-bottom:20px">${escape(values.symbol)}</div><div style="font-size:15px;line-height:1.85;color:#d4dfeb;overflow-wrap:anywhere">${escape(body).replace(/\n/g,'<br>')}</div><p style="margin:28px 0"><a href="${escape(values.app_url)}" style="display:inline-block;padding:13px 20px;background:#6ed7ad;border-radius:8px;color:#0b1017;font-size:14px;font-weight:700;text-decoration:none">${escape(cta)}</a></p><div style="border-top:1px solid #273342;padding-top:18px;font-size:12px;line-height:1.7;color:#94a3b8">${escape(footer).replace(/\n/g,'<br>')}</div></td></tr></table></body></html>`;
  const warnings=[];
  const parameter=(key,max)=>{const value=expand(config[key],values).replace(/\s+/g,' ').trim();if(!value)throw invalid('The rendered WhatsApp field is empty.');const chars=Array.from(value);if(chars.length>max)warnings.push(key+' was shortened to '+max+' characters.');return chars.length>max?chars.slice(0,max-1).join('')+'…':value;};
  const parameters=[parameter('whatsappSymbol',60),parameter('whatsappTitle',100),parameter('whatsappDetails',500)];
  return {email:{subject,heading,body,footer,cta,text,html,url:values.app_url},whatsapp:{parameters,body:APPROVED_BODY.replace(/{{([123])}}/g,(_,number)=>parameters[Number(number)-1])},warnings};
}
async function savedConfig(pool,userId){const {rows:[row]}=await pool.query('SELECT config,version,updated_at FROM notification_templates WHERE user_id=$1',[userId]);return {config:validate(Object.fromEntries(Object.entries(row?.config||DEFAULTS).map(([key,value])=>[key,typeof value==='string'?value.replace(/\bAlertPe\b/g,'ChartPulse'):value]))),version:row?.version||0,updatedAt:row?.updated_at||null};}
async function frozenPayload({pool,job,channel,alert,user,origin}){
  if(job.rendered_payload?.channel===channel)return job.rendered_payload.content;
  const saved=await savedConfig(pool,alert.user_id),message=render(saved.config,alert,user,origin),content=message[channel];
  const payload={channel,content,templateVersion:saved.version};
  const {rows:[updated]}=await pool.query('UPDATE notification_jobs SET rendered_payload=COALESCE(rendered_payload,$2::jsonb) WHERE id=$1 AND claim_token=$3 RETURNING rendered_payload',[job.id,JSON.stringify(payload),job.claim_token]);
  if(!updated)throw new Error('Delivery lease changed before message rendering.');
  return updated.rendered_payload.content;
}
function installNotificationTemplates({app,pool,requireAuth,asyncRoute,origin}){
  const meta=()=>({name:process.env.WHATSAPP_TEMPLATE_NAME||'Not configured',language:process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en_US',approvedBody:process.env.WHATSAPP_TEMPLATE_NAME==='alertpe_market_alert'?APPROVED_BODY:null});
  app.get('/api/account/notification-templates',requireAuth,asyncRoute(async(req,res)=>{
    const saved=await savedConfig(pool,req.session.user.id),{rows:alerts}=await pool.query('SELECT id,title,symbol,source,created_at FROM alerts WHERE user_id=$1 ORDER BY id DESC LIMIT 20',[req.session.user.id]);
    res.json({...saved,defaults:DEFAULTS,tokens:TOKENS,limits:LIMITS,whatsapp:meta(),alerts});
  }));
  app.put('/api/account/notification-templates',requireAuth,asyncRoute(async(req,res)=>{
    const config=validate(req.body.config),version=req.body.version,userId=req.session.user.id;
    if(!Number.isSafeInteger(version)||version<0)throw invalid('Reload the template settings before saving.');
    const saved=await pool.transaction(async()=>{
      await pool.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
      const current=await savedConfig(pool,userId);if(current.version!==version)throw Object.assign(new Error('Templates changed in another tab. Reload before saving.'),{status:409});
      const {rows:[row]}=await pool.query(`INSERT INTO notification_templates(user_id,config,version) VALUES($1,$2,1) ON CONFLICT(user_id) DO UPDATE SET config=EXCLUDED.config,version=notification_templates.version+1,updated_at=NOW() RETURNING version,updated_at`,[userId,JSON.stringify(config)]);
      await pool.query("INSERT INTO account_activity(user_id,action) VALUES($1,'Notification templates updated')",[userId]);return row;
    });res.json({config,version:saved.version,updatedAt:saved.updated_at});
  }));
  app.post('/api/account/notification-templates/preview',requireAuth,asyncRoute(async(req,res)=>{
    const config=validate(req.body.config),userId=req.session.user.id;
    const {rows:[user]}=await pool.query('SELECT name FROM users WHERE id=$1',[userId]);let alert;
    if(req.body.alertId){if(!/^\d{1,10}$/.test(String(req.body.alertId)))throw invalid('Choose a valid preview alert.');alert=(await pool.query('SELECT * FROM alerts WHERE id=$1 AND user_id=$2',[req.body.alertId,userId])).rows[0];if(!alert)throw Object.assign(new Error('Preview alert not found.'),{status:404});}
    else alert={title:'Sample price alert',symbol:'NSE:RELIANCE',source:'dhan',detail:'Sample preview only · price ₹1,500 crossed your target of ₹1,495. Your custom alert message appears here.',created_at:new Date().toISOString()};
    const message=render(config,alert,user,origin());const provider=meta();
    if(!provider.approvedBody)message.whatsapp.body=message.whatsapp.parameters.map((v,i)=>'Variable '+(i+1)+': '+v).join('\n');
    res.json({...message,whatsapp:{...message.whatsapp,...provider},sample:!req.body.alertId});
  }));
  return {setup:async()=>{await pool.query(`CREATE TABLE IF NOT EXISTS notification_templates(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,config JSONB NOT NULL DEFAULT '{}'::jsonb,version INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS rendered_payload JSONB;`);}};
}
module.exports={DEFAULTS,TOKENS,LIMITS,APPROVED_BODY,validate,valuesFor,render,savedConfig,frozenPayload,installNotificationTemplates};
