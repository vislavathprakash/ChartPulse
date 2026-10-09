const T = require('./public/technical-analysis');
const D = require('./chart-domain');
function installWorkspace({app,pool,requireAuth,asyncRoute,simulation,isSimulated,deliveryStatus,requestEvaluation,shardMatches=()=>true,evaluationKey=()=>null,evaluationScope=()=>({})}) {
  async function setup() {
    await pool.query(`CREATE TABLE IF NOT EXISTS chart_preferences (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, settings JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS chart_layouts (id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,symbol TEXT NOT NULL,settings JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS indicator_templates (id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,indicators JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS watchlists (id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS watchlist_items (watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,symbol TEXT NOT NULL,PRIMARY KEY(watchlist_id,symbol));
      CREATE TABLE IF NOT EXISTS technical_alerts (id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,symbol TEXT,watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE,config JSONB NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,state JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
  }
  async function requireSymbol(symbol) {
    const {rows}=await pool.query('SELECT symbol FROM market_symbols WHERE symbol=$1 AND active=TRUE',[symbol]);
    if(!rows[0])throw Object.assign(new Error('Choose an active instrument.'),{status:400});
  }
  async function ownWatchlist(id,userId){const {rows}=await pool.query('SELECT id FROM watchlists WHERE id=$1 AND user_id=$2',[id,userId]);if(!rows[0])throw Object.assign(new Error('Watchlist not found.'),{status:404});}
  function settings(body) {
    const b=body||{};
    if(!D.INTERVALS.includes(b.interval)||!['candles','hollow','bars','line','area','baseline','heikin','columns'].includes(b.chartType))throw Object.assign(new Error('Invalid interval or chart type.'),{status:400});
    if(!Array.isArray(b.indicators)||b.indicators.length>12)throw Object.assign(new Error('Select up to 12 indicators.'),{status:400});
    const out={interval:b.interval,chartType:b.chartType,theme:b.theme==='light'?'light':'dark',scale:b.scale==='log'?'log':'linear',timezone:b.timezone==='UTC'?'UTC':'Asia/Kolkata',grid:b.grid!==false,crosshair:b.crosshair!==false,volume:b.volume!==false,lastPrice:b.lastPrice!==false,watermark:b.watermark!==false,precision:Number.isInteger(b.precision)?Math.max(0,Math.min(6,b.precision)):2,upColor:/^#[0-9a-f]{6}$/i.test(b.upColor||'')?b.upColor:'#26c6a0',downColor:/^#[0-9a-f]{6}$/i.test(b.downColor||'')?b.downColor:'#ef6b7c',background:/^#[0-9a-f]{6}$/i.test(b.background||'')?b.background:null,indicators:b.indicators.map(D.validateIndicator),hideDrawings:b.hideDrawings===true,lockDrawings:b.lockDrawings===true,magnet:b.magnet===true,keepDrawing:b.keepDrawing===true,split:b.split===true,compareSymbol:String(b.compareSymbol||'').slice(0,60)};
    return out;
  }
  app.get('/api/chart/preferences',requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT settings FROM chart_preferences WHERE user_id=$1',[req.session.user.id]);res.json({settings:rows[0]?.settings||null});}));
  app.put('/api/chart/preferences',requireAuth,asyncRoute(async(req,res)=>{const data=settings(req.body);await pool.query('INSERT INTO chart_preferences(user_id,settings) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=NOW()',[req.session.user.id,data]);res.json({settings:data});}));
  app.get('/api/chart/layouts',requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT * FROM chart_layouts WHERE user_id=$1 ORDER BY updated_at DESC',[req.session.user.id]);res.json({layouts:rows});}));
  app.post('/api/chart/layouts',requireAuth,asyncRoute(async(req,res)=>{if(!req.body.name?.trim())return res.status(400).json({error:'Layout name is required.'});await requireSymbol(req.body.symbol);const {rows}=await pool.query('INSERT INTO chart_layouts(user_id,name,symbol,settings) VALUES($1,$2,$3,$4) RETURNING *',[req.session.user.id,req.body.name.trim().slice(0,100),req.body.symbol,settings(req.body.settings)]);res.status(201).json({layout:rows[0]});}));
  app.delete('/api/chart/layouts/:id',requireAuth,asyncRoute(async(req,res)=>{const result=await pool.query('DELETE FROM chart_layouts WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);res.status(result.rowCount?200:404).json(result.rowCount?{ok:true}:{error:'Layout not found.'});}));
  app.get('/api/chart/templates',requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT * FROM indicator_templates WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]);res.json({templates:rows});}));
  app.post('/api/chart/templates',requireAuth,asyncRoute(async(req,res)=>{if(!req.body.name?.trim()||!Array.isArray(req.body.indicators)||req.body.indicators.length>12)return res.status(400).json({error:'Enter a name and up to 12 indicators.'});const {rows}=await pool.query('INSERT INTO indicator_templates(user_id,name,indicators) VALUES($1,$2,$3) RETURNING *',[req.session.user.id,req.body.name.trim().slice(0,100),JSON.stringify(req.body.indicators.map(D.validateIndicator))]);res.status(201).json({template:rows[0]});}));
  app.delete('/api/chart/templates/:id',requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query('DELETE FROM indicator_templates WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);res.status(r.rowCount?200:404).json(r.rowCount?{ok:true}:{error:'Template not found.'});}));
  app.get('/api/watchlists',requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query("SELECT w.id,w.name,COALESCE(array_agg(i.symbol ORDER BY i.symbol) FILTER(WHERE i.symbol IS NOT NULL),'{}') AS symbols FROM watchlists w LEFT JOIN watchlist_items i ON i.watchlist_id=w.id WHERE w.user_id=$1 GROUP BY w.id ORDER BY w.id",[req.session.user.id]);res.json({watchlists:rows});}));
  app.post('/api/watchlists',requireAuth,asyncRoute(async(req,res)=>{if(!req.body.name?.trim())return res.status(400).json({error:'Watchlist name is required.'});const {rows}=await pool.query('INSERT INTO watchlists(user_id,name) VALUES($1,$2) RETURNING *',[req.session.user.id,req.body.name.trim().slice(0,100)]);res.status(201).json({watchlist:rows[0]});}));
  app.delete('/api/watchlists/:id',requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query('DELETE FROM watchlists WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);res.status(r.rowCount?200:404).json(r.rowCount?{ok:true}:{error:'Watchlist not found.'});}));
  app.post('/api/watchlists/:id/items',requireAuth,asyncRoute(async(req,res)=>{await ownWatchlist(req.params.id,req.session.user.id);await requireSymbol(req.body.symbol);await pool.query('INSERT INTO watchlist_items(watchlist_id,symbol) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.params.id,req.body.symbol]);res.json({ok:true});}));
  app.delete('/api/watchlists/:id/items/:symbol',requireAuth,asyncRoute(async(req,res)=>{await ownWatchlist(req.params.id,req.session.user.id);await pool.query('DELETE FROM watchlist_items WHERE watchlist_id=$1 AND symbol=$2',[req.params.id,req.params.symbol]);res.json({ok:true});}));
  app.get('/api/technical-alerts',requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT * FROM technical_alerts WHERE user_id=$1 ORDER BY id DESC',[req.session.user.id]);res.json({alerts:rows});}));
  app.post('/api/technical-alerts',requireAuth,asyncRoute(async(req,res)=>{
    if(!isSimulated)return res.status(503).json({error:'Technical alerts require a licensed historical-candle adapter in live mode.'});
    const data=D.validateAlert(req.body);
    if(data.watchlistId)await ownWatchlist(data.watchlistId,req.session.user.id);else await requireSymbol(data.symbol);
    const {rows}=await pool.query("INSERT INTO technical_alerts(user_id,name,symbol,watchlist_id,config) VALUES($1,$2,$3,$4,$5) RETURNING *",[req.session.user.id,data.name,data.watchlistId?null:data.symbol,data.watchlistId,data.config]);
    await (requestEvaluation?requestEvaluation():scan());res.status(201).json({alert:rows[0]});
  }));
  app.patch('/api/technical-alerts/:id',requireAuth,asyncRoute(async(req,res)=>{if(typeof req.body.enabled!=='boolean')return res.status(400).json({error:'Enabled must be true or false.'});const {rows}=await pool.query("UPDATE technical_alerts SET enabled=$1,state='{}' WHERE id=$2 AND user_id=$3 RETURNING *",[req.body.enabled,req.params.id,req.session.user.id]);res.status(rows[0]?200:404).json(rows[0]?{alert:rows[0]}:{error:'Alert not found.'});}));
  app.delete('/api/technical-alerts/:id',requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query('DELETE FROM technical_alerts WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);res.status(r.rowCount?200:404).json(r.rowCount?{ok:true}:{error:'Alert not found.'});}));
  let busy=false;
  async function scan() {
    if(!isSimulated||busy)return;busy=true;
    try {
      const scope=evaluationScope();
      const {rows}=await pool.query(`SELECT a.*,u.whatsapp_opt_in FROM technical_alerts a JOIN users u ON u.id=a.user_id
        WHERE a.enabled=TRUE AND u.active=TRUE AND u.role='customer' AND (a.user_id % $1)=$2
        AND ($3::int[] IS NULL OR a.user_id=ANY($3)) AND ($4::text[] IS NULL OR a.symbol=ANY($4) OR EXISTS(SELECT 1 FROM watchlist_items i WHERE i.watchlist_id=a.watchlist_id AND i.symbol=ANY($4)))`,[scope.shards||1,scope.shard||0,scope.users||null,scope.symbols||null]);
      const calculations=new Map();
      for(const alert of rows) {
        if(!shardMatches(alert.user_id))continue;
        const c=alert.config;
        if(c.expiresAt && Date.parse(c.expiresAt)<=Date.now()){await pool.query('UPDATE technical_alerts SET enabled=FALSE WHERE id=$1',[alert.id]);continue;}
        const symbols=alert.watchlist_id?(await pool.query('SELECT symbol FROM watchlist_items WHERE watchlist_id=$1',[alert.watchlist_id])).rows.map(r=>r.symbol):[alert.symbol];
        const states=alert.state||{};let completed=false;
        for(const symbol of symbols) {
          let candles=simulation.history(symbol,c.interval);if(!candles?.length)continue;
          const period={ '1m':60,'2m':120,'3m':180,'5m':300,'10m':600,'15m':900,'30m':1800,'1h':3600,'2h':7200,'4h':14400,'1D':86400 }[c.interval];
          const clock=simulation.instruments.get(symbol).candles.at(-1).time+60;
          if(c.frequency==='bar_close')candles=candles.filter(bar=>bar.time+period<=clock);
          if(!candles.length)continue;
          const cacheKey=symbol+':'+c.interval+':'+c.frequency+':'+JSON.stringify(c.indicator)+':'+c.plot;
          if(!calculations.has(cacheKey))calculations.set(cacheKey,c.source==='price'?candles.map(bar=>bar.close):T.calculate(candles,c.indicator).find(s=>s.key===c.plot)?.data||[]);
          const history=calculations.get(cacheKey);
          const value=history.at(-1);if(!Number.isFinite(value))continue;
          const prior=states[symbol]||{},bar=candles.at(-1).time;
          // Initialise a baseline before detecting a crossing. Level conditions may trigger immediately.
          const previous=c.frequency==='bar_close'?history.at(-2):prior.value;
          const inside=value>=c.value&&value<=c.upper;
          const matched=D.matchesCondition(c,value,previous,history,c.frequency==='bar_close'&&Number.isFinite(previous)?previous>=c.value&&previous<=c.upper:prior.inside);
          const barOpen=prior.firedBar!==bar,minuteOpen=!prior.firedAt||Date.now()-prior.firedAt>=60000;
          const frequencyOpen=c.frequency==='once'||(c.frequency==='every_time'?(!prior.matched||['crossing','crossing_up','crossing_down','entering_channel','exiting_channel'].includes(c.condition)):c.frequency==='once_per_minute'?minuteOpen:barOpen);
          if(matched&&frequencyOpen) {
            const stamp=Date.now(),status=deliveryStatus(alert.whatsapp_opt_in,c.notification);
            const detail=symbol+' '+(c.source==='price'?'price':c.indicator.type+' '+c.plot)+' '+value.toFixed(4)+' matches '+c.condition+' '+c.value+(c.upper!=null?' to '+c.upper:'')+'. Interval '+c.interval+'. '+c.message;
            await pool.query("INSERT INTO alerts(user_id,symbol,title,detail,source,status,event_key,email_requested) VALUES($1,$2,$3,$4,'technical',$5,$6,$7) ON CONFLICT(event_key) DO NOTHING",[alert.user_id,symbol,'[SIMULATED] '+alert.name,detail,status,'technical:'+alert.id+':'+symbol+':'+bar+':'+(evaluationKey()||stamp),['email','all'].includes(c.notification)]);
            prior.firedAt=stamp;prior.firedBar=bar;if(c.frequency==='once')completed=true;
          }
          states[symbol]={...prior,value,inside,matched,bar};if(completed)break;
        }
        await pool.query('UPDATE technical_alerts SET state=$1,enabled=$2 WHERE id=$3',[states,!completed,alert.id]);
      }
    } finally {busy=false;}
  }
  return {setup,scan,settings,requireSymbol};
}
module.exports={installWorkspace};
