const { matchesCondition } = require('../chart-domain');
const conditions = new Set(['crossing','crossing_up','crossing_down','greater_than','less_than']);
const channels = new Set(['in_app','email','whatsapp','all']);
const freshTrade = quote => {
  const age = Date.now()-Date.parse(quote?.updated_at);
  return Number.isFinite(quote?.price) && quote.price>0 && age>=-60000 && age<120000;
};

function installDhanAlerts({app,pool,requireAuth,ownerOnly,asyncRoute,ownerId,instrument,quotes,connected}) {
  async function setup() {
    await pool.query(`CREATE TABLE IF NOT EXISTS private_dhan_alerts (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL, contract_id TEXT NOT NULL, expiry DATE, name TEXT NOT NULL,
      condition TEXT NOT NULL, target DOUBLE PRECISION NOT NULL, repeat BOOLEAN NOT NULL DEFAULT FALSE,
      channel TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', expires_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'active', last_side SMALLINT, triggered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), armed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE private_dhan_alerts ADD COLUMN IF NOT EXISTS armed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS private_dhan_active_idx ON private_dhan_alerts(user_id) WHERE status='active';`);
  }
  const route='/api/private-dhan/alerts';
  const owned=[requireAuth,ownerOnly];
  app.get(route,...owned,asyncRoute(async(req,res)=>{
    const {rows}=await pool.query(`SELECT id,symbol,expiry::text,name,condition,target,repeat,channel,message,expires_at,triggered_at,
      CASE WHEN status IN ('active','paused') AND (expires_at<=NOW() OR expiry<(NOW() AT TIME ZONE 'Asia/Kolkata')::date) THEN 'expired' ELSE status END AS status
      FROM private_dhan_alerts WHERE user_id=$1 ORDER BY id DESC LIMIT 100`,[req.session.user.id]);
    res.json({alerts:rows});
  }));
  app.post(route,...owned,asyncRoute(async(req,res)=>{
    const {symbol,condition,target,repeat,channel,expiresAt,message,name}=req.body??{};
    const contract=typeof symbol==='string'?instrument(symbol):null;
    const expiry=expiresAt==null||expiresAt===''?null:typeof expiresAt==='string'?new Date(expiresAt):new Date(NaN);
    if(!contract||!conditions.has(condition)||!Number.isFinite(target)||target<=0||target>1e9||typeof repeat!=='boolean'||!channels.has(channel)||typeof name!=='string'||!name.trim()||name.length>100||typeof message!=='string'||message.length>500||expiry&&!(expiry.getTime()>Date.now())){
      return res.status(400).json({error:'Choose a symbol, condition, positive target, and a future expiration if supplied.'});
    }
    const id=await pool.transaction(async()=>{
      await pool.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.session.user.id]);
      const {rows}=await pool.query("SELECT count(*)::int AS total FROM private_dhan_alerts WHERE user_id=$1 AND status IN ('active','paused') AND (expires_at IS NULL OR expires_at>NOW()) AND (expiry IS NULL OR expiry>=(NOW() AT TIME ZONE 'Asia/Kolkata')::date)",[req.session.user.id]);
      if(rows[0].total>=50)throw Object.assign(new Error('You can keep up to 50 active or paused Dhan alerts.'),{status:409});
      const saved=await pool.query(`INSERT INTO private_dhan_alerts(user_id,symbol,contract_id,expiry,name,condition,target,repeat,channel,message,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[req.session.user.id,symbol,contract.id,contract.expiry??null,name.trim(),condition,target,repeat,channel,message.trim(),expiry]);
      return saved.rows[0].id;
    });
    res.status(201).json({id});
  }));
  app.patch(route+'/:id',...owned,asyncRoute(async(req,res)=>{
    const {enabled}=req.body??{};
    if(!/^\d{1,9}$/.test(req.params.id)||typeof enabled!=='boolean')return res.status(400).json({error:'Choose an alert and an action.'});
    const result=await pool.query(`UPDATE private_dhan_alerts SET status=$1,last_side=NULL,armed_at=NOW()
      WHERE id=$2 AND user_id=$3 AND status IN ('active','paused') AND (expires_at IS NULL OR expires_at>NOW())
      AND (expiry IS NULL OR expiry>=(NOW() AT TIME ZONE 'Asia/Kolkata')::date)`,[enabled?'active':'paused',req.params.id,req.session.user.id]);
    res.status(result.rowCount?200:404).json(result.rowCount?{ok:true}:{error:'This alert is no longer active or paused.'});
  }));
  const seen=new Map();
  let scanning=false;
  async function scan() {
    if(scanning||!connected())return;
    const pending=[...quotes.values()].filter(q=>freshTrade(q)&&seen.get(q.symbol)!==q);
    if(!pending.length)return;
    scanning=true;
    try{
      await pool.transaction(async()=>{
        const {rows}=await pool.query(`SELECT a.*,a.expiry::text AS contract_expiry,u.whatsapp_opt_in FROM private_dhan_alerts a JOIN users u ON u.id=a.user_id
          WHERE a.user_id=$1 AND u.active=TRUE AND a.status='active' AND a.symbol=ANY($2::text[])
          AND (a.expires_at IS NULL OR a.expires_at>NOW()) AND (a.expiry IS NULL OR a.expiry>=(NOW() AT TIME ZONE 'Asia/Kolkata')::date)
          FOR UPDATE OF a`,[ownerId,[...new Set(pending.map(q=>q.symbol))]]);
        const latest=new Map(pending.map(q=>[q.symbol,q]));
        for(const rule of rows){
          const q=latest.get(rule.symbol);
          if(instrument(rule.symbol)?.id!==rule.contract_id||Date.parse(q.updated_at)<Math.floor(new Date(rule.armed_at).getTime()/1000)*1000)continue;
          const side=Math.sign(q.price-rule.target);
          const before=rule.last_side==null?null:rule.target*(1+rule.last_side/2);
          const config={condition:rule.condition,value:rule.target};
          const match=matchesCondition(config,q.price,before,[],null);
          const previousMatch=matchesCondition(config,before,null,[],null);
          const fired=match&&!previousMatch;
          if(fired){
            const whatsapp=['whatsapp','all'].includes(rule.channel)&&rule.whatsapp_opt_in&&process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_TEMPLATE_NAME;
            const detail=[`Dhan trade ₹${q.price.toFixed(2)} · target ₹${rule.target.toFixed(2)}`,rule.contract_expiry?`Contract ${rule.contract_expiry}`:null,rule.message].filter(Boolean).join(' · ');
            await pool.query(`INSERT INTO alerts(user_id,symbol,title,detail,source,status,event_key,email_requested)
              VALUES($1,$2,$3,$4,'dhan',$5,$6,$7) ON CONFLICT(event_key) DO NOTHING`,[rule.user_id,rule.symbol,rule.name,detail,whatsapp?'queued':'logged',`dhan:${rule.id}:${q.updated_at}:${q.price}`,['email','all'].includes(rule.channel)]);
          }
          if(fired||side!==rule.last_side)await pool.query('UPDATE private_dhan_alerts SET last_side=$1,status=$2,triggered_at=CASE WHEN $3 THEN NOW() ELSE triggered_at END WHERE id=$4',[side,fired&&!rule.repeat?'triggered':'active',fired,rule.id]);
        }
      });
      for(const q of pending)seen.set(q.symbol,q);
    }finally{scanning=false;}
  }
  return {setup,scan};
}

module.exports={installDhanAlerts};
