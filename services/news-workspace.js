const crypto=require('crypto');
const equities=require('../data/bse-equities.json').equities;
const FEEDS=[
  {id:'nse-announcements',name:'NSE company announcements',url:'https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml'},
  {id:'nse-board',name:'NSE board meetings',url:'https://nsearchives.nseindia.com/content/RSS/Board_Meetings.xml'},
  {id:'nse-actions',name:'NSE corporate actions',url:'https://nsearchives.nseindia.com/content/RSS/Corporate_action.xml'},
  {id:'rbi',name:'RBI market & policy releases',url:'https://www.rbi.org.in/pressreleases_rss.xml'}
];
const CATEGORIES={market:'Market & policy',earnings:'Results & earnings',dividends:'Dividends',board:'Board meetings',ipo:'IPO',actions:'Corporate actions',announcements:'Announcements'};
const normalize=s=>String(s).toUpperCase().replace(/\b(LIMITED|LTD|PRIVATE|PVT)\b/g,'').replace(/[^A-Z0-9]/g,'');
const companies=new Map();for(const row of equities){const n=normalize(row.name),symbol=row.symbol.replace(/^BSE:/,'');companies.set(n,companies.has(n)&&companies.get(n)!==symbol?null:symbol);}
const tickers=new Set(equities.map(row=>row.symbol.replace(/^BSE:/,'')));
function plain(value){return String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(all,key)=>{if(key[0]==='#'){const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key.toLowerCase()]||'';}).replace(/\s+/g,' ').trim();}
const months={jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
function published(value){const s=plain(value),m=s.match(/^(\d{1,2})-([a-z]{3})-(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/i);const date=new Date(m?`${m[3]}-${months[m[2].toLowerCase()]}-${m[1].padStart(2,'0')}T${m[4]||'00:00:00'}+05:30`:s);return s&&Number.isFinite(+date)?date.toISOString():null;}
function safeLink(value){try{const u=new URL(plain(value));return u.protocol==='https:'&&['nsearchives.nseindia.com','archives.nseindia.com','www.nseindia.com','www.nseindia.in','www.rbi.org.in','rbi.org.in','rbidocs.rbi.org.in'].includes(u.hostname)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function parseFeed(xml,feed){
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<rss\b/i.test(xml)||!/<\/rss>/i.test(xml))throw new Error('Source did not return a complete RSS feed.');
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,500).flatMap(match=>{
    const tag=name=>plain(match[1].match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'))?.[1]);
    const title=tag('title').slice(0,240),description=tag('description'),url=safeLink(tag('link'));
    if(!title||!url)return [];
    const text=title+' '+description,categories=[];
    if(/financial results|quarterly results|earnings|unaudited|audited/i.test(text))categories.push('earnings');
    if(/dividend/i.test(text))categories.push('dividends');
    if(feed.id==='nse-board'||/board meeting/i.test(text))categories.push('board');
    if(/\bIPO\b|initial public offer|offer document/i.test(text))categories.push('ipo');
    if(feed.id==='nse-actions'||/split|bonus|buyback|rights issue|corporate action/i.test(text))categories.push('actions');
    if(!categories.length)categories.push(feed.id==='rbi'?'market':'announcements');
    const company=title.split(/\s+-\s+Ex-Date:/i)[0];
    const stock=companies.get(normalize(company))||null;
    const eventMatch=(description.match(/Meeting Date:\s*(\d{1,2}-[a-z]{3}-\d{4})/i)||title.match(/Ex-Date:\s*(\d{1,2}-[a-z]{3}-\d{4})/i))?.[1];
    const eventDay=eventMatch?published(eventMatch)?.slice(0,10):null;
    const subject=description.match(/\|SUBJECT:\s*(.+)$/i)?.[1]||null;
    return [{key:crypto.createHash('sha256').update(url+'|'+title).digest('hex'),title,summary:description.slice(0,500),url,source:feed.name,feedId:feed.id,categories,stock,company,publishedAt:published(tag('pubDate')),eventDay:eventMatch?(()=>{const m=eventMatch.match(/(\d+)-([a-z]+)-(\d+)/i);return m&&months[m[2].toLowerCase()]?`${m[3]}-${months[m[2].toLowerCase()]}-${m[1].padStart(2,'0')}`:null;})():eventDay,subject}];
  });
}
function readRule(body={}){
  const name=String(body.name||'').trim(),stock=String(body.stock||'').trim().toUpperCase().replace(/^(NSE|BSE):/,''),keyword=String(body.keyword||'').trim();
  const category=body.category||'',channel=body.channel||'in_app';
  if(!name||name.length>100||keyword.length>100||stock&&(!/^[A-Z0-9&_.-]{1,40}$/.test(stock)||!tickers.has(stock))||category&&!CATEGORIES[category]||!['in_app','email','whatsapp','all'].includes(channel)||!stock&&!keyword&&!category)throw Object.assign(new Error('Enter an alert name and choose a stock, keyword, or event type. Use a stock from search suggestions.'),{status:400});
  return {name,stock,keyword,category,channel};
}
function matches(rule,item){return (!rule.stock||rule.stock===item.stock)&&(!rule.category||item.categories.includes(rule.category))&&(!rule.keyword||(item.title+' '+item.summary).toLowerCase().includes(rule.keyword.toLowerCase()));}
function installNews({app,pool,requireAuth,asyncRoute,runtime}){
  let refreshing=null;
  async function setup(){await pool.query(`CREATE TABLE IF NOT EXISTS news_articles(id BIGSERIAL PRIMARY KEY,external_key TEXT UNIQUE NOT NULL,title TEXT NOT NULL,summary TEXT NOT NULL,source_url TEXT NOT NULL,source_name TEXT NOT NULL,feed_id TEXT NOT NULL,categories TEXT[] NOT NULL,stock TEXT,company TEXT,published_at TIMESTAMPTZ,event_day DATE,subject TEXT,observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS news_time_idx ON news_articles(published_at DESC,id DESC);CREATE INDEX IF NOT EXISTS news_stock_idx ON news_articles(stock,published_at DESC);CREATE INDEX IF NOT EXISTS news_categories_idx ON news_articles USING GIN(categories);
    CREATE TABLE IF NOT EXISTS news_feed_status(feed_id TEXT PRIMARY KEY,last_attempt TIMESTAMPTZ,last_success TIMESTAMPTZ,status TEXT NOT NULL DEFAULT 'waiting',error TEXT NOT NULL DEFAULT '',item_count INTEGER NOT NULL DEFAULT 0,content_hash TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS news_rules(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,stock TEXT NOT NULL DEFAULT '',keyword TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '',channel TEXT NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,cursor BIGINT NOT NULL DEFAULT 0,armed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),checked_at TIMESTAMPTZ,last_triggered_at TIMESTAMPTZ,trigger_count INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS news_rules_owner_idx ON news_rules(user_id,id);CREATE INDEX IF NOT EXISTS news_rules_scan_idx ON news_rules(checked_at) WHERE enabled=TRUE;`);
    for(const feed of FEEDS)await pool.query('INSERT INTO news_feed_status(feed_id) VALUES($1) ON CONFLICT DO NOTHING',[feed.id]);
  }
  async function refresh(){if(refreshing)return refreshing;refreshing=(async()=>{
    const release=await pool.leadership(730019);if(!release)return;
    try{for(const feed of FEEDS){
      const {rows:[last]}=await pool.query('SELECT * FROM news_feed_status WHERE feed_id=$1',[feed.id]);
      if(last?.last_attempt&&Date.now()-Date.parse(last.last_attempt)<120000)continue;
      await pool.query("UPDATE news_feed_status SET last_attempt=NOW(),status='refreshing' WHERE feed_id=$1",[feed.id]);
      try{
        const response=await fetch(feed.url,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{Accept:'application/rss+xml, application/xml, text/xml','User-Agent':'AlertPe-News/1.0 (public RSS headlines)'}});
        if(!response.ok)throw new Error('Source responded HTTP '+response.status);
        const reader=response.body.getReader(),parts=[];let size=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw new Error('Source exceeds feed size limit.');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
        const xml=Buffer.concat(parts).toString(),hash=crypto.createHash('sha256').update(xml).digest('hex');
        if(hash===last.content_hash){await pool.query("UPDATE news_feed_status SET last_success=NOW(),status='ready',error='' WHERE feed_id=$1",[feed.id]);continue;}
        const items=parseFeed(xml,feed);
        await pool.transaction(async()=>{for(const item of items)await pool.query(`INSERT INTO news_articles(external_key,title,summary,source_url,source_name,feed_id,categories,stock,company,published_at,event_day,subject) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(external_key) DO NOTHING`,[item.key,item.title,item.summary,item.url,item.source,item.feedId,item.categories,item.stock,item.company,item.publishedAt,item.eventDay,item.subject]);await pool.query("UPDATE news_feed_status SET last_success=NOW(),status='ready',error='',item_count=$2,content_hash=$3 WHERE feed_id=$1",[feed.id,items.length,hash]);});
      }catch(error){await pool.query("UPDATE news_feed_status SET status='unavailable',error=$2 WHERE feed_id=$1",[feed.id,String(error.message).slice(0,160)]);}
    }await pool.query("DELETE FROM news_articles WHERE observed_at<NOW()-INTERVAL '90 days'");}finally{await release();}
  })().finally(()=>refreshing=null);return refreshing;}
  async function scan(){await pool.transaction(async()=>{
    await runtime.assertLeadership();
    const {rows:rules}=await pool.query(`SELECT r.*,u.whatsapp_opt_in FROM news_rules r JOIN users u ON u.id=r.user_id WHERE r.enabled=TRUE AND u.active=TRUE AND u.role='customer' AND (r.user_id % $1)=$2 ORDER BY r.checked_at NULLS FIRST,r.id LIMIT 50 FOR UPDATE OF r SKIP LOCKED`,[runtime.shards,runtime.shard]);
    for(const rule of rules){const {rows:items}=await pool.query('SELECT * FROM news_articles WHERE id>$1 ORDER BY id LIMIT 200',[rule.cursor]);let cursor=rule.cursor,count=0;
      for(const item of items){cursor=item.id;if(!item.published_at||Date.parse(item.published_at)<Date.parse(rule.armed_at)||!matches(rule,item))continue;
        const whatsapp=['whatsapp','all'].includes(rule.channel)&&rule.whatsapp_opt_in&&process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_TEMPLATE_NAME;
        const {rows:created}=await pool.query(`INSERT INTO alerts(user_id,symbol,title,detail,source,status,event_key,email_requested) VALUES($1,$2,$3,$4,'news',$5,$6,$7) ON CONFLICT(event_key) DO NOTHING RETURNING id`,[rule.user_id,item.stock||'MARKET',rule.name+' · '+item.title,`${item.summary.slice(0,260)} · Source: ${item.source_name} · ${item.source_url}`,whatsapp?'queued':'logged',`news:${rule.id}:${item.id}`,['email','all'].includes(rule.channel)]);
        count+=created.length;if(count>=20)break;
      }
      await pool.query('UPDATE news_rules SET cursor=$2,checked_at=NOW(),trigger_count=trigger_count+$3,last_triggered_at=CASE WHEN $3>0 THEN NOW() ELSE last_triggered_at END WHERE id=$1',[rule.id,cursor,count]);
    }
  });}
  const owned=[requireAuth];
  app.get('/api/news',...owned,asyncRoute(async(req,res)=>{
    const q=String(req.query.q||'').trim().slice(0,100),category=String(req.query.category||''),feed=String(req.query.feed||''),offset=Number(req.query.offset||0);
    if(category&&!CATEGORIES[category]||feed&&!FEEDS.some(f=>f.id===feed)||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Object.assign(new Error('Choose valid news filters.'),{status:400});
    const values=[],where=[];const add=(sql,value)=>{values.push(value);where.push(sql.replaceAll('?', '$'+values.length));};
    if(q){const term=q.replace(/^(NSE|BSE):/i,'');add("(title ILIKE ? OR summary ILIKE ? OR stock ILIKE ? OR company ILIKE ?)",'%'+term.replace(/[\\%_]/g,'\\$&')+'%');}
    if(category)add('?=ANY(categories)',category);if(feed)add('feed_id=?',feed);
    const clause=where.length?' WHERE '+where.join(' AND '):'';
    const {rows}=await pool.query(`SELECT *,event_day::text FROM news_articles${clause} ORDER BY published_at DESC NULLS LAST,id DESC LIMIT 31 OFFSET $${values.length+1}`,[...values,offset]);
    const total=(await pool.query('SELECT COUNT(*)::int AS count FROM news_articles'+clause,values)).rows[0].count;
    const statuses=(await pool.query('SELECT * FROM news_feed_status')).rows;
    res.json({articles:rows.slice(0,30),hasMore:rows.length>30,total,offset,sources:FEEDS.map(f=>({...f,...statuses.find(s=>s.feed_id===f.id)})),categories:CATEGORIES,cadenceSeconds:120});
  }));
  app.get('/api/news/stocks',...owned,asyncRoute(async(req,res)=>{const q=String(req.query.q||'').trim().toUpperCase().replace(/^(NSE|BSE):/,'').slice(0,80);res.json({stocks:q?equities.filter(r=>r.symbol.includes(q)||r.name.toUpperCase().includes(q)).slice(0,12).map(r=>({symbol:r.symbol.replace(/^BSE:/,''),name:r.name})):[]});}));
  app.get('/api/news/rules',...owned,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT * FROM news_rules WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[req.session.user.id]);res.json({rules:rows});}));
  async function channels(userId,channel){const {rows:[u]}=await pool.query('SELECT email_verified,email_opt_in,whatsapp_opt_in,whatsapp_phone FROM users WHERE id=$1',[userId]);if(['email','all'].includes(channel)&&(!u?.email_verified||!u.email_opt_in||!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM))throw Object.assign(new Error('Verify your email and enable email alerts in Workspace settings first.'),{status:400});if(['whatsapp','all'].includes(channel)&&(!u?.whatsapp_opt_in||!u.whatsapp_phone||!process.env.WHATSAPP_ACCESS_TOKEN||!process.env.WHATSAPP_PHONE_NUMBER_ID||!process.env.WHATSAPP_TEMPLATE_NAME))throw Object.assign(new Error('Configure WhatsApp and enable consent in Workspace settings first.'),{status:400});}
  app.post('/api/news/rules',...owned,asyncRoute(async(req,res)=>{const rule=readRule(req.body),userId=req.session.user.id;await channels(userId,rule.channel);const saved=await pool.transaction(async()=>{await pool.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);if((await pool.query('SELECT COUNT(*)::int AS count FROM news_rules WHERE user_id=$1',[userId])).rows[0].count>=50)throw Object.assign(new Error('You can keep up to 50 news alert rules.'),{status:409});return (await pool.query(`INSERT INTO news_rules(user_id,name,stock,keyword,category,channel,cursor) VALUES($1,$2,$3,$4,$5,$6,(SELECT COALESCE(MAX(id),0) FROM news_articles)) RETURNING *`,[userId,rule.name,rule.stock,rule.keyword,rule.category,rule.channel])).rows[0];});res.status(201).json({rule:saved});}));
  app.patch('/api/news/rules/:id',...owned,asyncRoute(async(req,res)=>{const userId=req.session.user.id;const prior=(await pool.query('SELECT * FROM news_rules WHERE id=$1 AND user_id=$2',[req.params.id,userId])).rows[0];if(!prior)throw Object.assign(new Error('News alert not found.'),{status:404});const rule=readRule({...prior,...req.body});const enabled=req.body.enabled===undefined?prior.enabled:req.body.enabled;if(typeof enabled!=='boolean')throw Object.assign(new Error('Choose pause or resume.'),{status:400});if(enabled)await channels(userId,rule.channel);await pool.query(`UPDATE news_rules SET name=$3,stock=$4,keyword=$5,category=$6,channel=$7,enabled=$8,armed_at=NOW(),cursor=(SELECT COALESCE(MAX(id),0) FROM news_articles) WHERE id=$1 AND user_id=$2`,[prior.id,userId,rule.name,rule.stock,rule.keyword,rule.category,rule.channel,enabled]);res.json({ok:true});}));
  app.get('/api/news/logs',...owned,asyncRoute(async(req,res)=>{const {rows}=await pool.query(`SELECT a.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('channel',j.channel,'status',j.status,'attempts',j.attempts)) FROM notification_jobs j WHERE j.alert_id=a.id),'[]'::jsonb) AS deliveries FROM alerts a WHERE a.user_id=$1 AND a.source='news' ORDER BY a.id DESC LIMIT 100`,[req.session.user.id]);res.json({logs:rows});}));
  return {setup,refresh,scan};
}
module.exports={installNews,parseFeed,readRule,matches,plain,published,FEEDS};
