const crypto=require('crypto');
const model=require('../public/option-strategy-model');
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const root=s=>String(s).split(':').at(-1).replace(/[^A-Z0-9]/gi,'').toUpperCase().replace(/^NIFTY50$/,'NIFTY').replace(/^NIFTYBANK$/,'BANKNIFTY');
function input(body={}){
  const {name,index,expiry,product='delivery',legs}=body;
  if(typeof name!=='string'||!name.trim()||name.length>100||typeof index!=='string'||!/^(NSE|BSE):.{1,70}$/.test(index)||!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!['delivery','intraday'].includes(product)||!Array.isArray(legs)||legs.length<1||legs.length>8)throw error('Choose a strategy name, index, expiry and 1–8 option legs.');
  const seen=new Set();const cleaned=legs.map(l=>{if(!l||typeof l.symbol!=='string'||l.symbol.length>100||!['buy','sell'].includes(l.side)||!Number.isSafeInteger(l.units)||l.units<1||l.units>1000||seen.has(l.symbol))throw error('Use distinct contracts and 1–1,000 whole lots for each leg.');seen.add(l.symbol);return {symbol:l.symbol,side:l.side,units:l.units};});
  return {name:name.trim(),index,expiry,product,legs:cleaned};
}
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function installPaperStrategies({app,pool,requireAuth,asyncRoute,account,position,lockedFunds,needMarket,getMarket,executionPlan,insertOrder,fill,sessionDeadline,validateOrder,fresh,quotePrice,rupees}){
  const q=(...args)=>pool.query(...args);
  async function setup(){await q(`CREATE TABLE IF NOT EXISTS paper_strategies(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_key TEXT NOT NULL,input_hash TEXT NOT NULL,name TEXT NOT NULL,index_symbol TEXT NOT NULL,expiry DATE NOT NULL,product TEXT NOT NULL,legs JSONB NOT NULL,state TEXT NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),closed_at TIMESTAMPTZ,UNIQUE(user_id,request_key));ALTER TABLE paper_orders ADD COLUMN IF NOT EXISTS strategy_id INTEGER;ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS strategy_id INTEGER;CREATE INDEX IF NOT EXISTS paper_strategy_owner ON paper_strategies(user_id,id DESC);CREATE INDEX IF NOT EXISTS paper_order_strategy ON paper_orders(strategy_id);`);}
  async function prepare(user,t){
    const data=[];for(const l of t.legs){const market=await needMarket(user,{source:'dhan',symbol:l.symbol},true),i=market.item;
      if(i.kind!=='options'||i.contractType!=='OPTIDX'||!i.strike||!['CE','PE'].includes(i.right)||!i.underlying||root(i.underlying)!==root(t.index)||i.exchange!==t.index.split(':')[0]||i.expiry!==t.expiry||!Number.isSafeInteger(i.lotSize)||i.lotSize<1)throw error('Every leg must be a listed option on the selected index and expiry.',409);
      sessionDeadline(i,{product:t.product});validateOrder({type:'market',level:null},market.quote);
      data.push({...l,market,price:quotePrice(market.quote)});
    }return data;
  }
  function legsOf(data){return data.map(l=>({symbol:l.symbol,name:l.market.item.name,side:l.side,right:l.market.item.right,strike:l.market.item.strike,quantity:l.units*l.market.item.lotSize,lots:l.units,lotSize:l.market.item.lotSize,premium:rupees(l.price),quoteAt:l.market.quote.updated_at}));}
  async function check(user,t,data,wallet){
    const {rows:[n]}=await q('SELECT (SELECT COUNT(*) FROM paper_positions WHERE user_id=$1)+(SELECT COUNT(*) FROM paper_orders WHERE user_id=$1 AND state=\'pending\') AS total',[user.id]);
    if(Number(n.total)+t.legs.length>50)throw error('Close existing positions before adding more strategy legs.',409);
    let required=0;for(const l of data){
      if(!fresh(l.market.quote))throw error('A strategy quote became stale. Refresh prices and review again.',409);
      if(await position(user.id,'dhan',l.symbol,t.product))throw error('This contract already has an open position. Choose different contracts or close that position first.',409);
      const {rows}=await q("SELECT 1 FROM paper_orders WHERE user_id=$1 AND source='dhan' AND symbol=$2 AND product=$3 AND state='pending'",[user.id,l.symbol,t.product]);if(rows.length)throw error('Cancel the pending order for this contract first.',409);
      l.plan=executionPlan(l.market.item,{side:l.side,product:t.product,units:l.units,stop:null,target:null},null,l.price,l.market.underlying);required+=l.plan.required;
    }
    const available=Number(wallet.cash)-await lockedFunds(user.id),legs=legsOf(data);
    return {legs,analysis:model.analyse(legs),required:rupees(required),available:rupees(available),canPlace:required<=available,fingerprint:hash({input:t,premiums:legs.map(l=>l.premium)}),quotedAt:new Date().toISOString(),marginNote:'Conservative paper reserve: long premiums plus 20% of underlying notional and premium for each short leg. Hedge margin offsets, fees and slippage are not modelled.'};
  }
  app.post('/api/paper/strategies/preview',requireAuth,asyncRoute(async(req,res)=>{const t=input(req.body),data=await prepare(req.session.user,t);res.json(await pool.transaction(async()=>check(req.session.user,t,data,await account(req.session.user.id))));}));
  app.post('/api/paper/strategies',requireAuth,asyncRoute(async(req,res)=>{
    const t=input(req.body),user=req.session.user,key=req.body.requestId;
    if(typeof key!=='string'||!/^[a-f0-9-]{36}$/i.test(key))throw error('Refresh the strategy ticket.');
    const digest=hash(t);const existing=(await q('SELECT * FROM paper_strategies WHERE user_id=$1 AND request_key=$2',[user.id,key])).rows[0];
    if(existing){if(existing.input_hash!==digest)throw error('This strategy ticket was already used. Review a new ticket.',409);return res.json({id:existing.id,replayed:true});}
    const data=await prepare(user,t);
    const result=await pool.transaction(async()=>{
      const wallet=await account(user.id),duplicate=(await q('SELECT * FROM paper_strategies WHERE user_id=$1 AND request_key=$2',[user.id,key])).rows[0];
      if(duplicate){if(duplicate.input_hash!==digest)throw error('This ticket was already used.',409);return {id:duplicate.id,replayed:true};}
      const review=await check(user,t,data,wallet);const expected=req.body.expectedPremiums;
      if(!Array.isArray(expected)||expected.length!==data.length||expected.some(p=>!Number.isFinite(p)||p<=0||p>1e8)||hash({input:t,premiums:expected})!==req.body.fingerprint||data.some((l,i)=>Math.abs(l.price-Math.round(expected[i]*100))>Math.max(5,Math.ceil(expected[i]*100*.005))))throw error('Prices or strategy details changed beyond the review tolerance. Review the updated basket before placing it.',409);
      if(!review.canPlace)throw error('Insufficient virtual funds for the complete strategy.',409);
      const {rows:[group]}=await q('INSERT INTO paper_strategies(user_id,request_key,input_hash,name,index_symbol,expiry,product,legs) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[user.id,key,digest,t.name,t.index,t.expiry,t.product,JSON.stringify(review.legs)]);
      for(const l of data){const order=await insertOrder(user.id,{source:'dhan',symbol:l.symbol,side:l.side,type:'market',units:l.units,level:null,stop:null,target:null,product:t.product,sessionEnd:sessionDeadline(l.market.item,t)},l.market.item,l.plan.quantity);await q('UPDATE paper_orders SET strategy_id=$2 WHERE id=$1',[order.id,group.id]);order.strategy_id=group.id;await fill(user.id,order,null,wallet,l.price,l.plan,l.market.quote.updated_at,l.market.quote.chart_time);await q("UPDATE paper_positions SET strategy_id=$5 WHERE user_id=$1 AND source='dhan' AND symbol=$2 AND product=$3 AND quantity=$4",[user.id,l.symbol,t.product,l.plan.quantity*l.plan.direction,group.id]);}
      return {id:group.id,legs:review.legs,analysis:review.analysis};
    });res.status(201).json(result);
  }));
  app.get('/api/paper/strategies',requireAuth,asyncRoute(async(req,res)=>{
    const user=req.session.user,{rows:groups}=await q('SELECT *,expiry::text FROM paper_strategies WHERE user_id=$1 ORDER BY id DESC LIMIT 50',[user.id]);
    const out=[];for(const g of groups){const {rows:positions}=await q('SELECT * FROM paper_positions WHERE user_id=$1 AND strategy_id=$2',[user.id,g.id]);const {rows:[totals]}=await q("SELECT COALESCE(SUM(pnl),0) AS realized,MAX(filled_at) AS last_fill FROM paper_orders WHERE user_id=$1 AND strategy_id=$2 AND state='filled'",[user.id,g.id]);let unrealized=0,complete=true,allFresh=true;
      const legs=[];for(const l of g.legs){const p=positions.find(p=>p.symbol===l.symbol);if(!p){legs.push({...l,openQuantity:0,last:null,pnl:0});continue;}const market=await getMarket(user,'dhan',l.symbol);const price=quotePrice(market?.quote)??(p.mark==null?null:Number(p.mark));const pnl=price==null?null:(price*Math.abs(p.quantity)-Number(p.entry_value))*Math.sign(p.quantity)/100;if(pnl==null)complete=false;else unrealized+=pnl;allFresh=allFresh&&fresh(market?.quote);legs.push({...l,openQuantity:p.quantity,last:rupees(price),pnl,quoteAt:market?.quote?.updated_at??p.mark_at,fresh:fresh(market?.quote)});}
      out.push({id:g.id,name:g.name,index:g.index_symbol,expiry:g.expiry,product:g.product,createdAt:g.created_at,closedAt:g.closed_at??(!positions.length?totals.last_fill:null),state:positions.length?'open':'closed',legs,analysis:model.analyse(g.legs),unrealized:complete?Math.round(unrealized*100)/100:null,realized:rupees(totals.realized),pnl:complete?Math.round((unrealized+rupees(totals.realized))*100)/100:null,fresh:positions.length?allFresh:false});
    }res.json({strategies:out});
  }));
  app.post('/api/paper/strategies/:id/close',requireAuth,asyncRoute(async(req,res)=>{
    const user=req.session.user,id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw error('Choose a strategy.');
    const group=(await q('SELECT * FROM paper_strategies WHERE id=$1 AND user_id=$2',[id,user.id])).rows[0];if(!group)throw error('Strategy not found.',404);
    const markets=new Map();for(const l of group.legs)markets.set(l.symbol,await getMarket(user,'dhan',l.symbol,true));
    await pool.transaction(async()=>{const wallet=await account(user.id);const {rows:positions}=await q('SELECT * FROM paper_positions WHERE user_id=$1 AND strategy_id=$2',[user.id,id]);
      for(const p of positions){const m=markets.get(p.symbol);if(!fresh(m?.quote))throw error('Fresh prices are needed for every remaining leg. No legs were closed.',409);}
      for(const p of positions){const m=markets.get(p.symbol),t={source:'dhan',symbol:p.symbol,side:p.quantity>0?'sell':'buy',type:'market',quantity:Math.abs(p.quantity),product:p.product,level:null,stop:null,target:null};const price=quotePrice(m.quote),plan=executionPlan(p.instrument,t,p,price,m.underlying);const order=await insertOrder(user.id,t,p.instrument,plan.quantity,0,'Strategy exit');await q('UPDATE paper_orders SET strategy_id=$2 WHERE id=$1',[order.id,id]);await fill(user.id,order,p,wallet,price,plan,m.quote.updated_at,m.quote.chart_time);}
      await q("UPDATE paper_strategies SET state='closed',closed_at=COALESCE(closed_at,NOW()) WHERE user_id=$1 AND id=$2",[user.id,id]);
    });res.json({ok:true});
  }));
  return {setup};
}
module.exports={installPaperStrategies,input};
