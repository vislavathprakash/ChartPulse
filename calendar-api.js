const directory=require('./services/symbol-directory');
const CATEGORIES=['economic','earnings','dividends','ipo'];
const SOURCES={
  economic:{name:'MoSPI release calendar',url:'https://www.mospi.gov.in/release-calendar'},
  earnings:{name:'NSE event calendar',url:'https://www.nseindia.com/companies-listing/corporate-filings-event-calendar'},
  dividends:{name:'NSE corporate actions',url:'https://www.nseindia.com/companies-listing/corporate-filings-actions'},
  ipo:{name:'NSE upcoming issues',url:'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'}
};
function fail(message){throw Object.assign(new Error(message),{status:400});}
function safeUrl(value){if(!value)return null;let url;try{url=new URL(value);}catch{fail('Enter a valid source URL.');}if(url.protocol!=='https:')fail('Source links must use HTTPS.');return url.href.slice(0,1000);}
function installCalendar({app,pool,requireAuth,requireAdminAuth,asyncRoute,deliveryStatus,runtime}){
  async function setup(){await pool.query(`CREATE TABLE IF NOT EXISTS calendar_events(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,external_key TEXT UNIQUE,category TEXT NOT NULL,title TEXT NOT NULL,symbol TEXT,starts_at TIMESTAMPTZ NOT NULL,source_name TEXT NOT NULL,source_url TEXT,details TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS calendar_reminders(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,event_id INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,due_at TIMESTAMPTZ NOT NULL,notification TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,fired_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,event_id,due_at,notification));
    ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE INDEX IF NOT EXISTS calendar_events_time_idx ON calendar_events(starts_at);
    CREATE INDEX IF NOT EXISTS calendar_reminders_due_idx ON calendar_reminders(due_at) WHERE enabled=TRUE AND fired_at IS NULL;`);}
  async function validate(body){if(!body||typeof body!=='object')fail('Enter valid event details.');const metadata={};const keys=['actual','forecast','previous','country','currency','importance','epsActual','epsEstimate','revenueActual','revenueEstimate','dividendAmount','exDate','recordDate','ipoPriceBand','lotSize','issueOpen','issueClose','listingDate'];if(body.metadata!==undefined){if(!body.metadata||typeof body.metadata!=='object'||Array.isArray(body.metadata))fail('Event metadata must be an object.');for(const [key,value] of Object.entries(body.metadata)){if(!keys.includes(key))fail('Unknown event data field: '+key);if(value===null)continue;if(!(typeof value==='string'||typeof value==='number')||String(value).length>200||(typeof value==='number'&&!Number.isFinite(value)))fail('Invalid event data field: '+key);metadata[key]=value;}}const category=body.category,title=String(body.title||'').trim(),startsAt=body.startsAt;
    if(!CATEGORIES.includes(category)||!title||title.length>160)fail('Choose a category and enter a title up to 160 characters.');
    if(!Number.isFinite(Date.parse(startsAt)))fail('Choose an event date and time.');
    const symbol=String(body.symbol||'').trim().toUpperCase();if(symbol&&!directory.find(symbol)&&!(await pool.query('SELECT symbol FROM market_symbols WHERE symbol=$1 AND active=TRUE',[symbol])).rows.length)fail('Choose a stock from the stock search results.');
    return {metadata,category,title,symbol:symbol||null,startsAt:new Date(startsAt).toISOString(),sourceUrl:safeUrl(body.sourceUrl),details:String(body.details||'').slice(0,2000)};
  }
  app.get('/api/calendar',requireAuth,asyncRoute(async(req,res)=>{
    const from=new Date(req.query.from),to=new Date(req.query.to);if(!Number.isFinite(+from)||!Number.isFinite(+to)||to<=from||to-from>32*86400000)fail('Choose a calendar range up to 31 days.');
    const {rows}=await pool.query('SELECT * FROM calendar_events WHERE (user_id IS NULL OR user_id=$1) AND starts_at >= $2 AND starts_at < $3 ORDER BY starts_at,id',[req.session.user.id,from.toISOString(),to.toISOString()]);
    const reminders=(await pool.query('SELECT r.*,e.title,e.symbol,e.starts_at FROM calendar_reminders r JOIN calendar_events e ON e.id=r.event_id WHERE r.user_id=$1 ORDER BY r.due_at DESC LIMIT 100',[req.session.user.id])).rows;
    res.json({events:rows,reminders,sources:SOURCES,feedStatus:'Official source links available. No automatic calendar feed is connected. Shared events are source-attributed imports; personal events are entered by you.',timezone:'Asia/Kolkata'});
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
    const dueAt=new Date(Date.parse(e.starts_at)-lead*60000);if(+dueAt<=Date.now())fail('This reminder time has passed. Choose a later reminder.');
    const {rows}=await pool.query('INSERT INTO calendar_reminders(user_id,event_id,due_at,notification) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,event_id,due_at,notification) DO UPDATE SET enabled=TRUE WHERE calendar_reminders.fired_at IS NULL RETURNING *',[req.session.user.id,eventId,dueAt.toISOString(),notification]);if(!rows[0])fail('This reminder has already been sent.');res.status(201).json({reminder:rows[0]});
  }));
  app.patch('/api/calendar/reminders/:id',requireAuth,asyncRoute(async(req,res)=>{if(typeof req.body.enabled!=='boolean')fail('Enabled must be true or false.');const {rows}=await pool.query('UPDATE calendar_reminders SET enabled=$1 WHERE id=$2 AND user_id=$3 AND fired_at IS NULL AND due_at>NOW() RETURNING *',[req.body.enabled,req.params.id,req.session.user.id]);if(!rows.length)return res.status(400).json({error:'Only future, unsent reminders can be changed.'});res.json({reminder:rows[0]});}));
  async function scan(){await pool.transaction(async()=>{
    await runtime.assertLeadership();const {rows}=await pool.query(`SELECT r.*,e.title,e.symbol,e.starts_at,e.source_name,e.source_url,u.whatsapp_opt_in FROM calendar_reminders r JOIN calendar_events e ON e.id=r.event_id JOIN users u ON u.id=r.user_id WHERE r.enabled=TRUE AND r.fired_at IS NULL AND r.due_at<=NOW() AND u.active=TRUE AND u.role='customer' AND (r.user_id % $1)=$2 ORDER BY r.due_at LIMIT 100 FOR UPDATE OF r SKIP LOCKED`,[runtime.shards,runtime.shard]);
    for(const r of rows){await pool.query("INSERT INTO alerts(user_id,symbol,title,detail,source,status,event_key,email_requested) VALUES($1,$2,$3,$4,'calendar',$5,$6,$7) ON CONFLICT(event_key) DO NOTHING",[r.user_id,r.symbol||'CALENDAR','Event reminder · '+r.title,`${r.title}. Scheduled ${new Date(r.starts_at).toISOString()}. Source: ${r.source_name}${r.source_url?' · '+r.source_url:''}. Reminder scheduled ${new Date(r.due_at).toISOString()}.`,deliveryStatus(r.whatsapp_opt_in,r.notification),'calendar-reminder:'+r.id,['email','all'].includes(r.notification)]);await pool.query('UPDATE calendar_reminders SET fired_at=NOW(),enabled=FALSE WHERE id=$1',[r.id]);}
  });}
  return {setup,scan};
}
module.exports={installCalendar};
