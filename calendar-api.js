const directory=require('./services/symbol-directory');
const {createCalendarFeeds}=require('./services/calendar-feeds');
const CATEGORIES=['economic','earnings','dividends','ipo','events'];
const SOURCES={
  economic:{name:'MoSPI release calendar',url:'https://www.mospi.gov.in/release-calendar'},
  earnings:{name:'NSE event calendar',url:'https://www.nseindia.com/companies-listing/corporate-filings-event-calendar'},
  dividends:{name:'NSE corporate actions',url:'https://www.nseindia.com/companies-listing/corporate-filings-actions'},
  ipo:{name:'NSE upcoming issues',url:'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'},
  events:{name:'NSE board meetings and corporate actions',url:'https://www.nseindia.com/static/rss-feed'}
};
function fail(message){throw Object.assign(new Error(message),{status:400});}
function safeUrl(value){if(!value)return null;let url;try{url=new URL(value);}catch{fail('Enter a valid source URL.');}if(url.protocol!=='https:')fail('Source links must use HTTPS.');return url.href.slice(0,1000);}
function installCalendar({app,pool,requireAuth,requireAdminAuth,asyncRoute,deliveryStatus,runtime}){
  const feeds=createCalendarFeeds(pool);
  app.get('/api/calendar/feeds',requireAuth,asyncRoute(async(req,res)=>{res.set('Cache-Control','no-store');res.json({feeds:await feeds.status(),ipoDocuments:await feeds.documents()});}));
  app.get('/api/admin/calendar/feeds',requireAdminAuth,asyncRoute(async(req,res)=>{res.set('Cache-Control','no-store');res.json({feeds:await feeds.status()});}));
  app.post('/api/admin/calendar/feeds/refresh',requireAdminAuth,asyncRoute(async(req,res)=>{await feeds.refresh();res.json({feeds:await feeds.status()});}));
  app.post('/api/calendar/documents/:key/reminder',requireAuth,asyncRoute(async(req,res)=>{
    const due=new Date(req.body.dueAt),channel=req.body.notification||'in_app';if(!Number.isFinite(+due)||+due<=Date.now()||!['in_app','email','whatsapp','all'].includes(channel))fail('Choose a future review time and notification channel.');
    const doc=(await pool.query('SELECT * FROM calendar_feed_documents WHERE external_key=$1',[req.params.key])).rows[0];if(!doc)throw Object.assign(new Error('IPO document not found.'),{status:404});
    const id=req.session.user.id,entry=await pool.transaction(async()=>{const key='review:'+id+':'+doc.external_key+':'+due.toISOString();const {rows:[e]}=await pool.query(`INSERT INTO calendar_events(user_id,external_key,category,title,starts_at,source_name,source_url,details,metadata) VALUES($1,$2,'events',$3,$4,'Personal IPO document review',$5,$6,$7) ON CONFLICT(external_key) DO UPDATE SET title=EXCLUDED.title RETURNING *`,[id,key,('IPO filing review · '+doc.title).slice(0,160),due.toISOString(),doc.source_url,'Personal reminder to review an NSE IPO filing. This is not a confirmed IPO opening or listing date.',JSON.stringify({company:doc.title})]);const {rows:[r]}=await pool.query(`INSERT INTO calendar_reminders(user_id,event_id,due_at,notification,message) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,event_id,due_at,notification) DO UPDATE SET enabled=TRUE,message=EXCLUDED.message WHERE calendar_reminders.fired_at IS NULL RETURNING *`,[id,e.id,due.toISOString(),channel,String(req.body.message||'Review the source document.').slice(0,500)]);if(!r)fail('This review reminder already triggered.');await history(id,r.id,'scheduled','IPO filing review · '+due.toISOString());return r;});res.status(201).json({reminder:entry});
  }));
  async function history(owner,id,action,detail){await pool.query('INSERT INTO calendar_alert_history(user_id,reminder_id,action,detail) VALUES($1,$2,$3,$4)',[owner,id,action,detail]);}
  app.get('/api/calendar/ipos',requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query("SELECT * FROM calendar_events WHERE category='ipo' AND (user_id IS NULL OR user_id=$1) AND starts_at>NOW()-INTERVAL '1 year' ORDER BY starts_at DESC LIMIT 500",[req.session.user.id]);res.json({events:rows});}));
  app.get('/api/calendar/alerts',requireAuth,asyncRoute(async(req,res)=>{
    const id=req.session.user.id;
    const reminders=(await pool.query('SELECT r.*,e.title,e.symbol,e.starts_at,e.category,e.metadata FROM calendar_reminders r JOIN calendar_events e ON e.id=r.event_id WHERE r.user_id=$1 ORDER BY r.due_at DESC LIMIT 200',[id])).rows;
    const logs=(await pool.query("SELECT a.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('channel',j.channel,'status',j.status,'attempts',j.attempts)) FROM notification_jobs j WHERE j.alert_id=a.id),'[]'::jsonb) AS deliveries FROM alerts a WHERE a.user_id=$1 AND a.source='calendar' ORDER BY a.created_at DESC LIMIT 200",[id])).rows;
    const changes=(await pool.query('SELECT h.*,e.title FROM calendar_alert_history h JOIN calendar_reminders r ON r.id=h.reminder_id JOIN calendar_events e ON e.id=r.event_id WHERE h.user_id=$1 ORDER BY h.id DESC LIMIT 200',[id])).rows;
    res.json({reminders,logs,changes});
  }));
  app.patch('/api/calendar/reminders/:id',requireAuth,asyncRoute(async(req,res)=>{
    const result=await pool.transaction(async()=>{
      const r=(await pool.query('SELECT * FROM calendar_reminders WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.session.user.id])).rows[0];if(!r)throw Object.assign(new Error('Calendar alert not found.'),{status:404});if(r.fired_at)fail('This alert has triggered. Create a new alert for another date.');
      const enabled=req.body.enabled===undefined?r.enabled:req.body.enabled;if(typeof enabled!=='boolean')fail('Enabled must be true or false.');
      const due=req.body.dueAt===undefined?new Date(r.due_at):new Date(req.body.dueAt),channel=req.body.notification||r.notification,message=req.body.message===undefined?r.message:String(req.body.message).slice(0,500);
      if(!Number.isFinite(+due)||(enabled&&+due<=Date.now()))fail('Choose a future alert date and time.');if(!['in_app','email','whatsapp','all'].includes(channel))fail('Choose a notification channel.');
      if((await pool.query('SELECT id FROM calendar_reminders WHERE user_id=$1 AND event_id=$2 AND due_at=$3 AND notification=$4 AND id<>$5',[r.user_id,r.event_id,due.toISOString(),channel,r.id])).rows.length)fail('An alert already exists for this event, time and channel. Edit that alert or choose another time.');
      const {rows}=await pool.query('UPDATE calendar_reminders SET due_at=$1,notification=$2,message=$3,enabled=$4 WHERE id=$5 RETURNING *',[due.toISOString(),channel,message,enabled,r.id]);await history(req.session.user.id,r.id,req.body.dueAt||req.body.message!==undefined||req.body.notification?'modified':enabled?'resumed':'paused',due.toISOString()+' · '+channel+' · '+(enabled?'Scheduled':'Paused'));return rows[0];
    });res.json({reminder:result});
  }));
  async function setup(){await pool.query(`CREATE TABLE IF NOT EXISTS calendar_events(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,external_key TEXT UNIQUE,category TEXT NOT NULL,title TEXT NOT NULL,symbol TEXT,starts_at TIMESTAMPTZ NOT NULL,source_name TEXT NOT NULL,source_url TEXT,details TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS calendar_reminders(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,event_id INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,due_at TIMESTAMPTZ NOT NULL,notification TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,fired_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,event_id,due_at,notification));
    ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE calendar_reminders ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS calendar_alert_history(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,reminder_id INTEGER NOT NULL REFERENCES calendar_reminders(id) ON DELETE CASCADE,action TEXT NOT NULL,detail TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS calendar_alert_history_owner_idx ON calendar_alert_history(user_id,id);
    CREATE INDEX IF NOT EXISTS calendar_reminders_owner_idx ON calendar_reminders(user_id,due_at DESC);
    CREATE INDEX IF NOT EXISTS calendar_ipo_time_idx ON calendar_events(category,starts_at DESC);
    CREATE INDEX IF NOT EXISTS calendar_events_time_idx ON calendar_events(starts_at);
    CREATE INDEX IF NOT EXISTS calendar_reminders_due_idx ON calendar_reminders(due_at) WHERE enabled=TRUE AND fired_at IS NULL;`);await feeds.setup();}
  async function validate(body){if(!body||typeof body!=='object')fail('Enter valid event details.');const metadata={};const keys=['actual','forecast','previous','country','currency','importance','epsActual','epsEstimate','revenueActual','revenueEstimate','dividendAmount','exDate','recordDate','ipoPriceBand','lotSize','issueOpen','issueClose','listingDate','company','securityType','ipoSymbol','issueStatus','issueSize','documentUrl'];if(body.metadata!==undefined){if(!body.metadata||typeof body.metadata!=='object'||Array.isArray(body.metadata))fail('Event metadata must be an object.');for(const [key,value] of Object.entries(body.metadata)){if(!keys.includes(key))fail('Unknown event data field: '+key);if(value===null)continue;if(!(typeof value==='string'||typeof value==='number')||String(value).length>200||(typeof value==='number'&&!Number.isFinite(value)))fail('Invalid event data field: '+key);metadata[key]=key==='documentUrl'?safeUrl(value):value;}}const category=body.category,title=String(body.title||'').trim(),startsAt=body.startsAt;
    if(!CATEGORIES.includes(category)||!title||title.length>160)fail('Choose a category and enter a title up to 160 characters.');
    if(!Number.isFinite(Date.parse(startsAt)))fail('Choose an event date and time.');
    const symbol=String(body.symbol||'').trim().toUpperCase();if(symbol&&!directory.find(symbol)&&!(await pool.query('SELECT symbol FROM market_symbols WHERE symbol=$1 AND active=TRUE',[symbol])).rows.length)fail('Choose a stock from the stock search results.');
    return {metadata,category,title,symbol:symbol||null,startsAt:new Date(startsAt).toISOString(),sourceUrl:safeUrl(body.sourceUrl),details:String(body.details||'').slice(0,2000)};
  }
  app.get('/api/calendar',requireAuth,asyncRoute(async(req,res)=>{
    const from=new Date(req.query.from),to=new Date(req.query.to);if(!Number.isFinite(+from)||!Number.isFinite(+to)||to<=from||to-from>32*86400000)fail('Choose a calendar range up to 31 days.');
    const {rows}=await pool.query('SELECT * FROM calendar_events WHERE (user_id IS NULL OR user_id=$1) AND starts_at >= $2 AND starts_at < $3 ORDER BY starts_at,id',[req.session.user.id,from.toISOString(),to.toISOString()]);
    const reminders=(await pool.query('SELECT r.*,e.title,e.symbol,e.starts_at FROM calendar_reminders r JOIN calendar_events e ON e.id=r.event_id WHERE r.user_id=$1 ORDER BY r.due_at DESC LIMIT 100',[req.session.user.id])).rows;
    feeds.refresh().catch(err=>console.error('Calendar RSS refresh failed:',err.message));
    res.json({events:rows,reminders,sources:SOURCES,feeds:await feeds.status(),ipoDocuments:await feeds.documents(),feedStatus:'NSE public RSS summaries refresh every 30 minutes while the service is awake. Feeds contain recent announcements, not a complete exchange calendar. IPO documents are filings, not confirmed issue dates. Economic data uses the separate public widget.',timezone:'Asia/Kolkata'});
  }));
  app.post('/api/calendar/events',requireAuth,asyncRoute(async(req,res)=>{const e=await validate(req.body);if(Date.parse(e.startsAt)<=Date.now())fail('Choose a future date for your personal event.');const {rows}=await pool.query("INSERT INTO calendar_events(user_id,category,title,symbol,starts_at,source_name,source_url,details,metadata) VALUES($1,$2,$3,$4,$5,'Personal event',$6,$7,$8) RETURNING *",[req.session.user.id,e.category,e.title,e.symbol,e.startsAt,e.sourceUrl,e.details,JSON.stringify(e.metadata)]);res.status(201).json({event:rows[0]});}));
  app.post('/api/admin/calendar/events',requireAdminAuth,asyncRoute(async(req,res)=>{
    if(!Array.isArray(req.body.events)||req.body.events.length<1||req.body.events.length>200)fail('Import between 1 and 200 source-attributed events.');
    const entries=[];for(const body of req.body.events){const e=await validate(body),key=String(body.externalKey||'').trim(),name=String(body.sourceName||'').trim();if(!key||key.length>160||!name||name.length>100||!e.sourceUrl)fail('Each imported event needs an external key, source name and HTTPS source link.');entries.push({...e,key,name});}
    await pool.transaction(async()=>{for(const e of entries)await pool.query('INSERT INTO calendar_events(external_key,category,title,symbol,starts_at,source_name,source_url,details,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(external_key) DO UPDATE SET category=EXCLUDED.category,title=EXCLUDED.title,symbol=EXCLUDED.symbol,starts_at=EXCLUDED.starts_at,source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,details=EXCLUDED.details,metadata=EXCLUDED.metadata',[e.key,e.category,e.title,e.symbol,e.startsAt,e.name,e.sourceUrl,e.details,JSON.stringify(e.metadata)]);});res.json({imported:entries.length});
  }));
  app.post('/api/calendar/reminders',requireAuth,asyncRoute(async(req,res)=>{
    const eventId=Number(req.body.eventId),lead=Number(req.body.leadMinutes),notification=req.body.notification||'in_app';if(!Number.isSafeInteger(eventId)||![0,15,60,1440,10080].includes(lead)||!['in_app','email','whatsapp','all'].includes(notification))fail('Choose a reminder time and notification channel.');
    const e=(await pool.query('SELECT * FROM calendar_events WHERE id=$1 AND (user_id IS NULL OR user_id=$2)',[eventId,req.session.user.id])).rows[0];if(!e)throw Object.assign(new Error('Event not found.'),{status:404});
    const dueAt=req.body.dueAt?new Date(req.body.dueAt):new Date(Date.parse(e.starts_at)-lead*60000);if(!Number.isFinite(+dueAt))fail('Choose a valid alert date.');if(+dueAt<=Date.now())fail('This reminder time has passed. Choose a later reminder.');
    const reminder=await pool.transaction(async()=>{const {rows}=await pool.query('INSERT INTO calendar_reminders(user_id,event_id,due_at,notification,message) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,event_id,due_at,notification) DO UPDATE SET enabled=TRUE,message=EXCLUDED.message WHERE calendar_reminders.fired_at IS NULL RETURNING *',[req.session.user.id,eventId,dueAt.toISOString(),notification,String(req.body.message||'').slice(0,500)]);if(!rows[0])fail('This reminder has already been sent.');await history(req.session.user.id,rows[0].id,'scheduled',dueAt.toISOString()+' · '+notification);return rows[0];});res.status(201).json({reminder});
  }));
  async function scan(){if(runtime.shard===0)feeds.refresh().catch(err=>console.error('Calendar RSS refresh failed:',err.message));await pool.transaction(async()=>{
    await runtime.assertLeadership();const {rows}=await pool.query(`SELECT r.*,e.title,e.symbol,e.starts_at,e.source_name,e.source_url,u.whatsapp_opt_in FROM calendar_reminders r JOIN calendar_events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id WHERE r.enabled=TRUE AND r.fired_at IS NULL AND r.due_at<=NOW() AND u.active=TRUE AND u.role='customer' AND (r.user_id % $1)=$2 ORDER BY r.due_at LIMIT 100 FOR UPDATE OF r SKIP LOCKED`,[runtime.shards,runtime.shard]);
    for(const r of rows){await pool.query("INSERT INTO alerts(user_id,symbol,title,detail,source,status,event_key,email_requested) VALUES($1,$2,$3,$4,'calendar',$5,$6,$7) ON CONFLICT(event_key) DO NOTHING",[r.user_id,r.symbol||'CALENDAR','Calendar alert · '+r.title,`${r.title}. Scheduled ${new Date(r.starts_at).toISOString()}. ${r.message?r.message+' · ':''}Source: ${r.source_name}${r.source_url?' · '+r.source_url:''}. Reminder scheduled ${new Date(r.due_at).toISOString()}.`,deliveryStatus(r.whatsapp_opt_in,r.notification),'calendar-reminder:'+r.id,['email','all'].includes(r.notification)]);await history(r.user_id,r.id,'triggered','Alert created and queued for notification delivery.');await pool.query('UPDATE calendar_reminders SET fired_at=NOW(),enabled=FALSE WHERE id=$1',[r.id]);}
  });}
  return {setup,scan};
}
module.exports={installCalendar};
