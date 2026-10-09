const { EventEmitter } = require('events');
const crypto = require('crypto');
const { exportState, restoreState, pack, unpack, applyEvent } = require('./market-state');
const metrics = require('./metrics');
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
class Runtime extends EventEmitter {
  constructor({pool,simulation,isSimulated,marketRuntime}) {
    super(); this.setMaxListeners(0); Object.assign(this,{pool,simulation,isSimulated,marketRuntime});
    this.role=process.env.SERVICE_ROLE||'standalone';this.id=process.env.INSTANCE_ID||crypto.randomUUID();
    this.shards=Number(process.env.ALERT_SHARDS||1);this.shard=Number(process.env.ALERT_SHARD||0);
    if(!Number.isInteger(this.shards)||this.shards<1||!Number.isInteger(this.shard)||this.shard<0||this.shard>=this.shards)throw new Error('Invalid alert shard configuration.');
    if(!['standalone','api','gateway','ingestion','evaluator','delivery','relay'].includes(this.role))throw new Error('Invalid SERVICE_ROLE.');
    if(this.role!=='standalone'&&!pool.distributed)throw new Error('Separate services require DATABASE_URL. PGlite supports one standalone process only.');
    if(process.env.NODE_ENV==='production'&&this.role!=='standalone'&&this.role!=='relay'&&!process.env.REDIS_URL)throw new Error('REDIS_URL is required for distributed push delivery.');
    this.namespace='chartpulse:'+(process.env.MARKET_DATA_PROVIDER||'simulated');this.quotes=new Map();this.sequence=0;this.timers=[];this.stopping=false;
    this.evaluationKey=null;this.sourceEpoch=crypto.randomUUID();
  }
  async setup(){
    await this.pool.query(`CREATE TABLE IF NOT EXISTS market_events(id BIGSERIAL PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS service_leases(name TEXT PRIMARY KEY,epoch TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS market_snapshot(name TEXT PRIMARY KEY,sequence BIGINT NOT NULL,payload JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS consumer_checkpoints(name TEXT PRIMARY KEY,sequence BIGINT NOT NULL DEFAULT 0,payload JSONB,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS evaluation_requests(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,sequence BIGINT NOT NULL,requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS service_commands(id BIGSERIAL PRIMARY KEY,kind TEXT NOT NULL,payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'ready',result JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),completed_at TIMESTAMPTZ);
      CREATE TABLE IF NOT EXISTS notification_jobs(id BIGSERIAL PRIMARY KEY,alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,channel TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ready',attempts INTEGER NOT NULL DEFAULT 0,available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),lease_until TIMESTAMPTZ,claim_token TEXT,last_error TEXT,UNIQUE(alert_id,channel));
      ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
      ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS delivery_key TEXT NOT NULL DEFAULT gen_random_uuid()::text;
      CREATE TABLE IF NOT EXISTS socket_tickets(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,session_id TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
      CREATE TABLE IF NOT EXISTS service_heartbeats(id TEXT PRIMARY KEY,role TEXT NOT NULL,details JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS service_topology(name TEXT PRIMARY KEY,alert_shards INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS alerts_owner_time_idx ON alerts(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS queries_owner_idx ON saved_queries(user_id);
      CREATE INDEX IF NOT EXISTS drawings_owner_symbol_idx ON drawings(user_id,symbol);
      CREATE INDEX IF NOT EXISTS jobs_ready_idx ON notification_jobs(status,available_at);
      CREATE INDEX IF NOT EXISTS market_event_time_idx ON market_events(created_at);
      CREATE INDEX IF NOT EXISTS ticket_expiry_idx ON socket_tickets(expires_at);
      CREATE INDEX IF NOT EXISTS customers_id_idx ON users(role,id DESC);
      CREATE INDEX IF NOT EXISTS customers_email_prefix_idx ON users(lower(email) text_pattern_ops);
      CREATE INDEX IF NOT EXISTS customers_name_prefix_idx ON users(lower(name) text_pattern_ops);
      CREATE INDEX IF NOT EXISTS rules_owner_enabled_idx ON alert_rules(user_id,enabled);
      CREATE INDEX IF NOT EXISTS technical_owner_enabled_idx ON technical_alerts(user_id,enabled);`);
    await this.pool.query('INSERT INTO service_topology(name,alert_shards) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',[this.namespace,this.shards]);
    const topology=await this.pool.query('SELECT alert_shards FROM service_topology WHERE name=$1',[this.namespace]);
    if(topology.rows[0].alert_shards!==this.shards)throw new Error('ALERT_SHARDS differs from persisted topology. Quiesce and migrate checkpoints before changing it.');
    await this.pool.query(`CREATE OR REPLACE FUNCTION chartpulse_alert_outbox() RETURNS trigger AS $$ BEGIN
      INSERT INTO notification_jobs(alert_id,channel) VALUES(NEW.id,'in_app') ON CONFLICT(alert_id,channel) DO NOTHING;
      IF NEW.status='queued' THEN INSERT INTO notification_jobs(alert_id,channel) VALUES(NEW.id,'whatsapp') ON CONFLICT(alert_id,channel) DO NOTHING; END IF;
      IF NEW.email_requested AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND active=TRUE AND role='customer' AND email_opt_in=TRUE AND email_verified=TRUE) THEN
        INSERT INTO notification_jobs(alert_id,channel) VALUES(NEW.id,'email') ON CONFLICT(alert_id,channel) DO NOTHING;
      END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await this.pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='chartpulse_alert_outbox_trigger') THEN
      CREATE TRIGGER chartpulse_alert_outbox_trigger AFTER INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION chartpulse_alert_outbox();
      END IF; END $$`);
    await this.pool.query("INSERT INTO notification_jobs(alert_id,channel) SELECT id,'whatsapp' FROM alerts WHERE status='queued' ON CONFLICT(alert_id,channel) DO NOTHING");
    if(process.env.REDIS_URL){
      const {createClient}=require('redis');const options={url:process.env.REDIS_URL,disableOfflineQueue:true,socket:{connectTimeout:5000,reconnectStrategy:retries=>Math.min(2000,100+retries*100)}};
      this.redis=createClient(options);this.subscriber=this.redis.duplicate();
      for(const client of [this.redis,this.subscriber])client.on('error',()=>metrics.count('redis_errors'));
      await this.redis.connect();await this.subscriber.connect();
      if(['api','gateway','standalone'].includes(this.role)){
        await this.subscriber.subscribe(this.namespace+':market',message=>{try{const event=JSON.parse(message);this.receive(event).catch(err=>this.error('receive',err));}catch(err){this.error('decode',err);}});
        await this.subscriber.pSubscribe(this.namespace+':private:*',(message,channel)=>{try{this.emit('private',Number(channel.split(':').at(-1)),JSON.parse(message));}catch(err){this.error('private',err);}});
      }
    }
    this.symbolMeta=new Map((await this.pool.query('SELECT * FROM market_symbols WHERE active=TRUE')).rows.map(s=>[s.symbol,s]));
    await this.loadSnapshot();
  }
  async loadSnapshot(){const {rows}=await this.pool.query('SELECT * FROM market_snapshot WHERE name=$1',[this.namespace]);if(!rows[0])return;
    const snapshot=rows[0].payload;this.sequence=Number(rows[0].sequence);this.quotes=new Map(snapshot.quotes.map(q=>[q.symbol,q]));
    if(this.simulation&&snapshot.simulation)restoreState(this.simulation,unpack(snapshot.simulation));
    this.marketRuntime.connected=snapshot.connected!==false;this.marketRuntime.lastTickAt=snapshot.lastTickAt;
    this.sourceEpoch=snapshot.epoch;this.refreshSymbols();
  }
  refreshSymbols(){this.marketRuntime.symbols=new Map([...this.quotes.keys()].map(symbol=>[symbol,symbol]));for(const s of this.symbolMeta?.values()||[]){this.marketRuntime.symbols.set(s.provider_symbol,s.symbol);if(s.provider_symbol_id)this.marketRuntime.symbols.set(String(s.provider_symbol_id),s.symbol);}}
  getQuotes(){return [...this.quotes.values()];}
  buildEvent(quotes,{bootstrap=false}={}){
    const enriched=quotes.map(q=>({...q,...(this.simulation?this.simulation.technicals(q.symbol):{})}));
    return {namespace:this.namespace,epoch:this.sourceEpoch,quotes:enriched,simulated:this.isSimulated,receivedAt:new Date().toISOString(),seed:this.simulation?.seed,paused:this.simulation?.paused,
      ...(this.simulation?{candles:enriched.map(q=>{const i=this.simulation.instruments.get(q.symbol);return {symbol:q.symbol,candle:i.candles.at(-1),volume:i.volume,previousClose:i.previousClose};})}:{}),
      ...(bootstrap&&this.simulation?{bootstrap:pack(exportState(this.simulation))}:{})};
  }
  async publish(quotes,options={}){
    const started=performance.now();
    const event=this.buildEvent(quotes,options);const key=options.key||crypto.randomUUID();
    const previousQuotes=new Map(this.quotes), previousSequence=this.sequence;
    try { await this.pool.transaction(async()=>{
      await this.assertLeadership();
      const {rows}=await this.pool.query('INSERT INTO market_events(event_key,payload) VALUES($1,$2) ON CONFLICT(event_key) DO NOTHING RETURNING id',[key,event]);
      if(!rows[0])throw new Error('Market event key already committed.');event.sequence=Number(rows[0].id);
      for(const q of event.quotes)this.quotes.set(q.symbol,q);
      const snapshot={quotes:this.getQuotes(),simulation:this.simulation?pack(exportState(this.simulation)):null,lastTickAt:event.receivedAt,connected:true,epoch:event.epoch};
      await this.pool.query('INSERT INTO market_snapshot(name,sequence,payload) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET sequence=EXCLUDED.sequence,payload=EXCLUDED.payload,updated_at=NOW()',[this.namespace,event.sequence,snapshot]);
      await this.pool.query(`INSERT INTO market_quotes(symbol,price,change_pct,volume,open,high,low,updated_at)
        SELECT symbol,price,change_pct,volume,open,high,low,updated_at FROM jsonb_to_recordset($1::jsonb) AS x(symbol text,price double precision,change_pct double precision,volume double precision,open double precision,high double precision,low double precision,updated_at timestamptz)
        ON CONFLICT(symbol) DO UPDATE SET price=EXCLUDED.price,change_pct=EXCLUDED.change_pct,volume=EXCLUDED.volume,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,updated_at=EXCLUDED.updated_at`,[JSON.stringify([...new Map(event.quotes.map(q=>[q.symbol,q])).values()])]);
    }); } catch(err){this.quotes=previousQuotes;this.sequence=previousSequence;throw err;}
    this.sequence=event.sequence;this.marketRuntime.connected=true;this.marketRuntime.lastTickAt=event.receivedAt;this.refreshSymbols();metrics.count('market_events');metrics.observe('market_commit_ms',performance.now()-started);
    this.emit('market',event);
    if(this.redis?.isReady){try{await this.redis.set(this.namespace+':quotes',JSON.stringify({sequence:this.sequence,quotes:this.getQuotes(),receivedAt:event.receivedAt}));await this.redis.publish(this.namespace+':market',JSON.stringify(event));}catch(err){this.error('broadcast',err);}}
    if(this.role==='standalone'&&this.evaluate){if(!this.isSimulated&&event.quotes.length>1){for(let i=0;i<event.quotes.length;i++){this.quotes.set(event.quotes[i].symbol,event.quotes[i]);await this.evaluateCurrent('event:'+event.sequence+':'+i);}}else await this.evaluateCurrent('event:'+event.sequence);}
    return event;
  }
  async receive(event){if(event.sequence<=this.sequence)return;
    if(event.sequence!==this.sequence+1){await this.sync();return;}
    this.apply(event);this.emit('market',event);
  }
  apply(event){applyEvent(this.simulation,event);for(const q of event.quotes||[])this.quotes.set(q.symbol,q);this.sequence=event.sequence;
    this.sourceEpoch=event.epoch;this.marketRuntime.connected=true;this.marketRuntime.lastTickAt=event.receivedAt;this.refreshSymbols();}
  async sync(){if(this.syncing)return;this.syncing=true;try{
    const {rows}=await this.pool.query("SELECT id,payload FROM market_events WHERE id>$1 AND payload->>'namespace'=$2 ORDER BY id LIMIT 100",[this.sequence,this.namespace]);
    for(const row of rows){if(Number(row.id)<=this.sequence)continue;const event={...row.payload,sequence:Number(row.id)};this.apply(event);this.emit('market',event);}
  }finally{this.syncing=false;}}
  every(ms,fn){let running=false;const timer=setInterval(async()=>{if(running||this.stopping)return;running=true;try{await fn();}catch(err){this.error('worker',err);}finally{running=false;}},ms);this.timers.push(timer);return timer;}
  error(component,err){metrics.count(component+'_errors');console.error(component+': '+err.message);}
  async evaluateCurrent(key='baseline:'+crypto.randomUUID()){
    if(!this.evaluate)return;await this.pool.transaction(async()=>{this.evaluationKey=key;try{await this.assertLeadership();await this.evaluate();}finally{this.evaluationKey=null;}});
  }
  async requestEvaluation(userId){if(!userId)return;if(this.role==='standalone')return this.evaluateCurrent();await this.pool.query('INSERT INTO evaluation_requests(user_id,sequence) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET sequence=GREATEST(evaluation_requests.sequence,EXCLUDED.sequence),requested_at=NOW()',[userId,this.sequence]);}
  async evaluateRequests(){
    const {rows}=await this.pool.query('SELECT * FROM evaluation_requests WHERE (user_id % $1)=$2 AND sequence<=$3 ORDER BY requested_at LIMIT 100',[this.shards,this.shard,this.evaluated||this.sequence]);
    if(!rows.length)return;this.baselineUsers=rows.map(r=>r.user_id);
    try{await this.pool.transaction(async()=>{await this.assertLeadership();await this.evaluate();for(const request of rows)await this.pool.query('DELETE FROM evaluation_requests WHERE user_id=$1 AND requested_at=$2',[request.user_id,request.requested_at]);});}
    finally{this.baselineUsers=null;}
  }
  async evaluateEvents(){
    const name=this.namespace+':alerts:'+this.shard+':'+this.shards;
    if(!this.checkpointLoaded){
      const {rows}=await this.pool.query('SELECT * FROM consumer_checkpoints WHERE name=$1',[name]);
      this.evaluated=Number(rows[0]?.sequence||0);if(rows[0]?.payload){this.quotes=new Map(rows[0].payload.quotes.map(q=>[q.symbol,q]));if(this.simulation)restoreState(this.simulation,unpack(rows[0].payload.simulation));}
      else {this.quotes.clear();this.evaluated=0;}
      this.checkpointLoaded=true;
    }
    const {rows}=await this.pool.query("SELECT id,payload FROM market_events WHERE id>$1 AND payload->>'namespace'=$2 ORDER BY id LIMIT 20",[this.evaluated,this.namespace]);
    for(const row of rows){const event={...row.payload,sequence:Number(row.id)},backup=this.simulation?pack(exportState(this.simulation)):null,oldQuotes=new Map(this.quotes),oldSeq=this.sequence;
      try{await this.pool.transaction(async()=>{await this.assertLeadership();this.apply(event);this.changedSymbols=[...new Set(event.quotes.map(q=>q.symbol))];this.evaluationKey='event:'+event.sequence;await this.evaluate();
        await this.pool.query('INSERT INTO consumer_checkpoints(name,sequence,payload) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET sequence=EXCLUDED.sequence,payload=EXCLUDED.payload,updated_at=NOW()', [name,event.sequence,{quotes:this.getQuotes(),simulation:this.simulation?pack(exportState(this.simulation)):null}]);
      });this.evaluated=event.sequence;metrics.count('evaluated_events');metrics.observe('alert_input_age_ms',Date.now()-Date.parse(event.receivedAt));}
      catch(err){this.quotes=oldQuotes;this.sequence=oldSeq;if(backup)restoreState(this.simulation,unpack(backup));throw err;}finally{this.evaluationKey=null;this.changedSymbols=null;}
    }
    // Only accounts with changed rules need an idle-feed baseline.
    if(this.quotes.size)await this.evaluateRequests();
  }
  async command(kind,payload){
    if(this.role==='standalone')return this.commandHandler(kind,payload);
    const {rows}=await this.pool.query('INSERT INTO service_commands(kind,payload) VALUES($1,$2) RETURNING id',[kind,payload]);const id=rows[0].id;
    for(let i=0;i<40;i++){await pause(125);const r=await this.pool.query('SELECT status,result FROM service_commands WHERE id=$1',[id]);if(r.rows[0].status==='done')return {...r.rows[0].result,commandId:id};if(r.rows[0].status==='failed')throw Object.assign(new Error(r.rows[0].result.error),{status:400});}
    return {ok:true,queued:true,commandId:id};
  }
  async processCommands(){
    const {rows}=await this.pool.query("SELECT * FROM service_commands WHERE status='ready' ORDER BY id LIMIT 10");
    for(const command of rows){try{
      const existing=await this.pool.query('SELECT id FROM market_events WHERE event_key=$1',['command:'+command.id]);
      const result=existing.rows[0]?{ok:true,recovered:true}:await this.commandHandler(command.kind,command.payload,'command:'+command.id);
      await this.pool.query("UPDATE service_commands SET status='done',result=$1,completed_at=NOW() WHERE id=$2",[result,command.id]);
    }catch(err){await this.pool.query("UPDATE service_commands SET status='failed',result=$1,completed_at=NOW() WHERE id=$2",[{error:err.message},command.id]);}}
  }
  async notify(userId,event){this.emit('private',userId,event);if(this.redis?.isReady)await this.redis.publish(this.namespace+':private:'+userId,JSON.stringify(event));}
  async claimLeadership(key){this.ownerKey=String(key);this.ownerEpoch=crypto.randomUUID();await this.pool.query('INSERT INTO service_leases(name,epoch) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET epoch=EXCLUDED.epoch',[this.ownerKey,this.ownerEpoch]);if(['standalone','ingestion'].includes(this.role))this.sourceEpoch=this.ownerEpoch;}
  async assertLeadership(){if(!this.ownerKey)return;const {rows}=await this.pool.query('SELECT epoch FROM service_leases WHERE name=$1 FOR UPDATE',[this.ownerKey]);if(rows[0]?.epoch!==this.ownerEpoch)throw new Error('Worker ownership changed; rejecting stale commit.');}
  async heartbeat(){await this.pool.query('INSERT INTO service_heartbeats(id,role,details) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET details=EXCLUDED.details,updated_at=NOW()', [this.id,this.role,{sequence:this.sequence,evaluated:this.evaluated||0,shard:this.shard,shards:this.shards,redisReady:Boolean(this.redis?.isReady),...metrics.snapshot()}]);}
  async stop(){this.stopping=true;this.timers.forEach(clearInterval);await this.pool.query('DELETE FROM service_heartbeats WHERE id=$1',[this.id]);if(this.kafkaProducer)await this.kafkaProducer.disconnect();if(this.subscriber?.isOpen)this.subscriber.destroy();if(this.redis?.isOpen)this.redis.destroy();if(this.releaseLeader)await this.releaseLeader();}
}
module.exports={Runtime};
