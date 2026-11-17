const STARTING_CASH=100000000; // paise
const ROUTE='/api/paper';
const LIVE_AGE=120000;
const EXCHANGE_END='T15:30:00+05:30';
const sign=side=>side==='buy'?1:-1;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const amount=value=>value===null||value===undefined?null:Number(value);
const rupees=value=>value==null?null:Number(value)/100;
const quotePrice=quote=>Number.isFinite(quote?.price)&&quote.price>0&&quote.price<=1e8?Math.round(quote.price*100):null;
const quoteAt=quote=>Date.parse(quote?.updated_at);
const fresh=quote=>quotePrice(quote)>0&&quoteAt(quote)>=Date.now()-LIVE_AGE&&quoteAt(quote)<=Date.now()+3000;
const expiryAt=item=>item.expiry?Date.parse(item.expiry+EXCHANGE_END):Infinity;
const intradayEnd=item=>new Date(Date.now()+19800000).toISOString().slice(0,10)+(item.practice?'T23:55:00+05:30':'T15:20:00+05:30');

function priceInput(value,label,required=false) {
  if(value===null||value===undefined||value===''){
    if(required)throw fail('Enter '+label+'.');
    return null;
  }
  if(typeof value!=='number'||!Number.isFinite(value)||value<.01||value>1e8||Math.abs(value*100-Math.round(value*100))>1e-5)throw fail('Use a positive '+label+' with up to two decimal places.');
  return Math.round(value*100);
}
function protection(body) {
  return {stop:priceInput(body.stopLoss,'stop loss'),target:priceInput(body.takeProfit,'take profit')};
}
function orderInput(body={}) {
  const {source,symbol,side,type,units,requestId,product='delivery'}=body;
  if(!['intraday','delivery'].includes(product))throw fail('Choose Intraday or Delivery.');
  if(!['workspace','dhan'].includes(source)||typeof symbol!=='string'||symbol.length>100||!symbol)throw fail('Choose an instrument.');
  if(!['buy','sell'].includes(side)||!['market','limit','stop'].includes(type))throw fail('Choose an order side and type.');
  if(!Number.isSafeInteger(units)||units<1||units>100000)throw fail('Enter a positive whole number of shares or lots.');
  return {source,symbol,side,type,units,requestId,product,level:type==='market'?null:priceInput(body.level,type==='limit'?'limit price':'trigger price',true),...protection(body)};
}
function bracketValid(direction,reference,stop,target) {
  if(stop!==null&&(stop-reference)*direction>=0)throw fail(direction>0?'Stop loss must be below the entry price.':'Stop loss must be above the entry price.');
  if(target!==null&&(target-reference)*direction<=0)throw fail(direction>0?'Take profit must be above the entry price.':'Take profit must be below the entry price.');
}
function allocation(kind,direction,price,quantity,underlying) {
  const notional=price*quantity;
  if(kind==='futures')return Math.ceil(notional/5);
  if(kind==='options'&&direction<0){
    if(!fresh(underlying))throw fail('A fresh underlying quote is needed to estimate short option margin.',409);
    return Math.ceil(quotePrice(underlying)*quantity/5)+notional;
  }
  return notional;
}
function executionPlan(item,order,position,price,underlying) {
  const quantity=order.quantity??order.units*item.lotSize;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||!Number.isSafeInteger(price*quantity))throw fail('This order is too large.');
  const direction=sign(order.side), existing=Number(position?.quantity??0);
  const closing=existing!==0&&Math.sign(existing)!==direction;
  if(closing&&quantity>Math.abs(existing))throw fail('Reduce the quantity to the open position. Place a separate order to reverse direction.');
  if(!closing&&item.kind==='equity'&&direction<0&&order.product!=='intraday')throw fail('Stock sells require shares already held in the paper wallet.');
  if(closing&&(order.stop!==null||order.target!==null))throw fail('Use Position protection to set a stop loss or target on existing holdings.');
  if(!closing)bracketValid(direction,price,order.stop,order.target);
  const entry=closing?Math.round(Number(position.entry_value)*quantity/Math.abs(existing)):0;
  const release=closing?Math.round(Number(position.capital)*quantity/Math.abs(existing)):0;
  const pnl=closing?(price*quantity-entry)*Math.sign(existing):0;
  return {quantity,closing,direction,entry,release,pnl,required:closing?0:allocation(item.kind,direction,price,quantity,underlying),notional:price*quantity};
}
function replay(order,input) {
  if(order.source!==input.source||order.symbol!==input.symbol||order.side!==input.side||order.type!==input.type||order.product!==input.product||
    order.quantity!==input.units*order.instrument.lotSize||amount(order.level)!==input.level||amount(order.stop_loss)!==input.stop||amount(order.take_profit)!==input.target){
    throw fail('A different order already used this ticket. Open a new order ticket to continue.',409);
  }
  return order;
}
function triggered(order,price) {
  if(order.type==='market')return true;
  return (price-Number(order.level))*sign(order.side)*(order.type==='limit'?1:-1)<=0;
}
function publicOrder(o) {
  return {id:o.id,source:o.source,symbol:o.symbol,name:o.instrument.name,kind:o.instrument.kind,product:o.product,side:o.side,type:o.type,quantity:o.quantity,lotSize:o.instrument.lotSize,
    level:rupees(o.level),stopLoss:rupees(o.stop_loss),takeProfit:rupees(o.take_profit),state:o.state,reason:o.reason,createdAt:o.created_at,fill:rupees(o.fill_price),filledAt:o.filled_at,reserved:rupees(o.reserved),pnl:rupees(o.pnl)};
}
function ticketQuote(item,quote) {
  return {symbol:item.symbol,name:item.name,kind:item.kind,lotSize:item.lotSize,expiry:item.expiry,
    last:rupees(quotePrice(quote)),changePct:Number.isFinite(quote?.change_pct)?quote.change_pct:null,
    quoteAt:quote?.updated_at??null,quoteSource:quote?.source??null,fresh:fresh(quote),expired:Date.now()>=expiryAt(item)};
}

function installPaperTrading({app,pool,requireAuth,asyncRoute,market,practice,practiceChart}) {
  async function setup() {
    await pool.query("CREATE TABLE IF NOT EXISTS paper_accounts (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cash BIGINT NOT NULL, realized BIGINT NOT NULL DEFAULT 0)");
    await pool.query("CREATE TABLE IF NOT EXISTS paper_positions (user_id INTEGER NOT NULL REFERENCES paper_accounts(user_id) ON DELETE CASCADE, source TEXT NOT NULL, symbol TEXT NOT NULL, instrument JSONB NOT NULL, quantity INTEGER NOT NULL, entry_value BIGINT NOT NULL, capital BIGINT NOT NULL, stop_loss BIGINT, take_profit BIGINT, protected_at TIMESTAMPTZ, mark BIGINT, mark_at TIMESTAMPTZ, PRIMARY KEY(user_id,source,symbol))");
    await pool.query("CREATE TABLE IF NOT EXISTS paper_orders (id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES paper_accounts(user_id) ON DELETE CASCADE,request_key TEXT,source TEXT NOT NULL,symbol TEXT NOT NULL,instrument JSONB NOT NULL,side TEXT NOT NULL,type TEXT NOT NULL,quantity INTEGER NOT NULL,level BIGINT,stop_loss BIGINT,take_profit BIGINT,state TEXT NOT NULL DEFAULT 'pending',reason TEXT,reserved BIGINT NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),fill_price BIGINT,filled_at TIMESTAMPTZ,pnl BIGINT,UNIQUE(user_id,request_key))");
    const {rows:existing}=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='paper_positions' AND column_name='product'");
    if(!existing.length)await pool.transaction(async()=>{
      await pool.query("ALTER TABLE paper_positions ADD COLUMN product TEXT NOT NULL DEFAULT 'delivery', ADD COLUMN session_end TIMESTAMPTZ");
      await pool.query('ALTER TABLE paper_positions DROP CONSTRAINT paper_positions_pkey');
      await pool.query('ALTER TABLE paper_positions ADD PRIMARY KEY(user_id,source,symbol,product)');
    });
    await pool.query('ALTER TABLE paper_positions ADD COLUMN IF NOT EXISTS mark_chart_time BIGINT');
    await pool.query("ALTER TABLE paper_orders ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'delivery', ADD COLUMN IF NOT EXISTS session_end TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS chart_time BIGINT");
    await pool.query("CREATE INDEX IF NOT EXISTS paper_pending_user ON paper_orders(user_id) WHERE state='pending'");
    await pool.query("CREATE INDEX IF NOT EXISTS paper_order_history ON paper_orders(user_id,id DESC)");
  }
  const query=(...args)=>pool.query(...args);
  async function account(userId) {
    await query('INSERT INTO paper_accounts(user_id,cash) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,STARTING_CASH]);
    const {rows:[row]}=await query('SELECT * FROM paper_accounts WHERE user_id=$1 FOR UPDATE',[userId]);
    return row;
  }
  async function position(userId,source,symbol,product) {
    const {rows:[row]}=await query('SELECT * FROM paper_positions WHERE user_id=$1 AND source=$2 AND symbol=$3 AND product=$4',[userId,source,symbol,product]);
    return row;
  }
  async function lockedFunds(userId,exclude=null) {
    const {rows:[row]}=await query("SELECT COALESCE(SUM(reserved),0) AS total FROM paper_orders WHERE user_id=$1 AND state='pending' AND ($2::integer IS NULL OR id<>$2)",[userId,exclude]);
    return Number(row.total);
  }
  async function getMarket(user,source,symbol,ensure=false) {
    const result=await market(user,source,symbol,ensure);
    if(!result?.item)return null;
    const {item}=result;
    return {...result,item:{symbol:item.symbol,name:item.name,kind:item.kind,lotSize:item.lotSize,expiry:item.expiry??null,practice:item.practice===true}};
  }
  async function needMarket(user,input,ensure=false) {
    const data=await getMarket(user,input.source,input.symbol,ensure);
    if(!data)throw fail('Paper trading is unavailable for this instrument.',404);
    if(Date.now()>=expiryAt(data.item))throw fail('This contract has expired.',409);
    return data;
  }
  async function insertOrder(userId,input,item,quantity,reserved=0,reason=null) {
    const {rows:[row]}=await query("INSERT INTO paper_orders(user_id,request_key,source,symbol,instrument,side,type,quantity,level,stop_loss,take_profit,reserved,reason,product,session_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *",
      [userId,input.requestId??null,input.source,input.symbol,JSON.stringify(item),input.side,input.type,quantity,input.level,input.stop??null,input.target??null,reserved,reason,input.product??'delivery',input.sessionEnd??null]);
    return row;
  }
  async function fill(userId,order,p,current,price,plan,markAt,chartTime) {
    const keep=Number(p?.quantity??0)+plan.quantity*plan.direction;
    const oldCap=Number(p?.capital??0), oldEntry=Number(p?.entry_value??0);
    const capital=plan.closing?oldCap-plan.release:oldCap+plan.required;
    const entryValue=plan.closing?oldEntry-plan.entry:oldEntry+price*plan.quantity;
    if(keep===0)await query('DELETE FROM paper_positions WHERE user_id=$1 AND source=$2 AND symbol=$3 AND product=$4',[userId,order.source,order.symbol,order.product]);
    else {
      const stop=amount(order.stop_loss)??amount(p?.stop_loss),target=amount(order.take_profit)??amount(p?.take_profit);
      await query("INSERT INTO paper_positions(user_id,source,symbol,instrument,quantity,entry_value,capital,stop_loss,take_profit,mark,mark_at,protected_at,product,session_end,mark_chart_time) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(user_id,source,symbol,product) DO UPDATE SET quantity=EXCLUDED.quantity,entry_value=EXCLUDED.entry_value,capital=EXCLUDED.capital,stop_loss=EXCLUDED.stop_loss,take_profit=EXCLUDED.take_profit,mark=EXCLUDED.mark,mark_at=EXCLUDED.mark_at,mark_chart_time=EXCLUDED.mark_chart_time,protected_at=EXCLUDED.protected_at",
        [userId,order.source,order.symbol,JSON.stringify(order.instrument),keep,entryValue,capital,stop,target,price,markAt,plan.closing?p.protected_at:new Date(),order.product,order.session_end,chartTime??null]);
    }
    const cashChange=plan.closing?plan.release+plan.pnl:-plan.required;
    await query('UPDATE paper_accounts SET cash=cash+$2,realized=realized+$3 WHERE user_id=$1',[userId,cashChange,plan.pnl]);
    current.cash=Number(current.cash)+cashChange;
    const {rows:[filled]}=await query("UPDATE paper_orders SET state='filled',fill_price=$2,filled_at=NOW(),pnl=$3,chart_time=$4,reserved=0 WHERE id=$1 RETURNING *",[order.id,price,plan.closing?plan.pnl:null,chartTime??(order.instrument.practice?null:Math.floor(Date.parse(markAt)/1000)||null)]);
    if(keep===0)await query("UPDATE paper_orders SET state='cancelled',reason='Position closed',reserved=0 WHERE user_id=$1 AND source=$2 AND symbol=$3 AND product=$4 AND state='pending'",[userId,order.source,order.symbol,order.product]);
    return filled;
  }
  function sessionDeadline(item,t){
    if(t.product!=='intraday')return null;
    const deadline=intradayEnd(item);
    if(Date.now()>=Date.parse(deadline))throw fail('The Intraday cutoff has passed for this session.',409);
    return deadline;
  }
  function validateOrder(t,quote) {
    if(t.type==='market'&&!fresh(quote))throw fail('Waiting for a fresh price. Market orders use the latest eligible quote.',409);
    const price=t.level??quotePrice(quote);
    if(!price)throw fail('Price is unavailable for this instrument.',409);
    return price;
  }

  app.use(ROUTE,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  app.get(ROUTE+'/instruments',requireAuth,asyncRoute(async(req,res)=>{
    if(!practice)throw fail('Practice derivatives are unavailable for this feed.',404);
    const {kind}=req.query;
    if(!['equity','futures','options'].includes(kind))throw fail('Choose an instrument group.');
    const term=typeof req.query.q==='string'?req.query.q.slice(0,80):'';
    const rows=practice(kind,term);
    res.json({items:rows.slice(0,50),total:rows.length});
  }));
  app.get(ROUTE+'/chart',requireAuth,asyncRoute(async(req,res)=>{
    const {source,symbol,interval}=req.query, user=req.session.user;
    const data=await getMarket(user,source,symbol,'chart');
    if(!data)throw fail('Waiting for this paper instrument. If the Dhan terminal is starting, retry shortly.',404);
    const {item,quote}=data;
    if(!['1m','5m','15m','1h','1D'].includes(interval))throw fail('Choose a supported chart interval.');
    const from=Math.max(0,Number.parseInt(req.query.since,10)||0);
    const candles=item.practice?practiceChart?.(symbol,interval,from):undefined;
    const {rows}=await query("SELECT id,side,fill_price,filled_at,chart_time FROM paper_orders WHERE user_id=$1 AND source=$2 AND symbol=$3 AND state='filled' ORDER BY filled_at DESC,id DESC LIMIT 200",[user.id,source,symbol]);
    const fills=rows.map(row=>({id:row.id,side:row.side,price:rupees(row.fill_price),filledAt:row.filled_at,
      chartTime:amount(row.chart_time)??(item.practice?null:Math.floor(Date.parse(row.filled_at)/1000))}));
    res.json({instrument:{...ticketQuote(item,quote),streaming:data.streaming??false,feedIssue:data.feedIssue??null},candles,fills});
  }));
  app.get(ROUTE+'/instrument',requireAuth,asyncRoute(async(req,res)=>{
    const {source,symbol}=req.query;
    const data=await getMarket(req.session.user,source,symbol,true);
    if(!data)throw fail('Choose a supported stock or NSE/BSE derivative.',404);
    const underlying=data.underlying;
    res.json({...ticketQuote(data.item,data.quote),underlyingLast:fresh(underlying)?underlying.price:null});
  }));
  app.post(ROUTE+'/preview',requireAuth,asyncRoute(async(req,res)=>{
    const user=req.session.user,t=orderInput(req.body),data=await needMarket(user,t,true);
    sessionDeadline(data.item,t);
    const reference=validateOrder(t,data.quote);
    const price=fresh(data.quote)&&triggered(t,quotePrice(data.quote))?quotePrice(data.quote):reference;
    const result=await pool.transaction(async()=>{
      const wallet=await account(user.id);
      const p=await position(user.id,t.source,t.symbol,t.product);
      const plan=executionPlan(data.item,t,p,price,data.underlying);
      return {price:rupees(price),quantity:plan.quantity,available:rupees(Number(wallet.cash)-await lockedFunds(user.id)),required:rupees(plan.required),releases:rupees(plan.release),pnl:plan.closing?rupees(plan.pnl):null,notional:rupees(plan.notional),closing:plan.closing};
    });
    res.json(result);
  }));
  app.post(ROUTE+'/orders',requireAuth,asyncRoute(async(req,res)=>{
    const user=req.session.user,t=orderInput(req.body);
    if(typeof t.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(t.requestId))throw fail('Refresh the order ticket.');
    const {rows:[existing]}=await query('SELECT * FROM paper_orders WHERE user_id=$1 AND request_key=$2',[user.id,t.requestId]);
    if(existing)return res.json({order:publicOrder(replay(existing,t))});
    const data=await needMarket(user,t,true);
    const result=await pool.transaction(async()=>{
      const wallet=await account(user.id);
      const {rows:[duplicate]}=await query('SELECT * FROM paper_orders WHERE user_id=$1 AND request_key=$2',[user.id,t.requestId]);
      if(duplicate)return replay(duplicate,t);
      if(Date.now()>=expiryAt(data.item))throw fail('This contract has expired.',409);
      t.sessionEnd=sessionDeadline(data.item,t);
      const price=validateOrder(t,data.quote);
      const p=await position(user.id,t.source,t.symbol,t.product);
      const {rows:pending}=await query("SELECT source,symbol,product FROM paper_orders WHERE user_id=$1 AND state='pending'",[user.id]);
      if(pending.some(row=>row.source===t.source&&row.symbol===t.symbol&&row.product===t.product))throw fail('Cancel the existing pending order for this instrument first.',409);
      const canFill=fresh(data.quote)&&triggered(t,quotePrice(data.quote));
      const fillPrice=canFill?quotePrice(data.quote):price;
      const plan=executionPlan(data.item,t,p,fillPrice,data.underlying);
      if(!p&&!plan.closing){
        const {rows:[open]}=await query('SELECT COUNT(*) AS total FROM paper_positions WHERE user_id=$1',[user.id]);
        if(Number(open.total)+pending.length>=50)throw fail('Close a position or cancel a pending order before opening another.',409);
      }
      if(!canFill&&pending.length>=50)throw fail('Cancel a pending order before placing another.',409);
      const available=Number(wallet.cash)-await lockedFunds(user.id);
      if(plan.required>0&&plan.required>available)throw fail('Insufficient virtual funds for this order.',409);
      const order=await insertOrder(user.id,t,data.item,plan.quantity,canFill?0:plan.required);
      return canFill?fill(user.id,order,p,wallet,fillPrice,plan,data.quote.updated_at,data.quote.chart_time):order;
    });
    res.status(201).json({order:publicOrder(result)});
  }));
  app.delete(ROUTE+'/orders/:id',requireAuth,asyncRoute(async(req,res)=>{
    const id=Number(req.params.id),userId=req.session.user.id;
    if(!Number.isSafeInteger(id)||id<1||id>2147483647)throw fail('Choose a valid order.');
    const result=await pool.transaction(async()=>{
      await account(userId);
      return query("UPDATE paper_orders SET state='cancelled',reason='Cancelled by you',reserved=0 WHERE user_id=$1 AND id=$2 AND state='pending'",[userId,id]);
    });
    if(!result.rowCount)throw fail('This order is no longer pending.',409);
    res.json({ok:true});
  }));
  app.patch(ROUTE+'/protection',requireAuth,asyncRoute(async(req,res)=>{
    const user=req.session.user,{source,symbol,product='delivery'}=req.body??{};
    if(!['intraday','delivery'].includes(product)||!['workspace','dhan'].includes(source)||typeof symbol!=='string'||!symbol||symbol.length>100)throw fail('Choose a position.');
    const hasStop=Object.hasOwn(req.body,'stopLoss'),hasTarget=Object.hasOwn(req.body,'takeProfit');
    if(!hasStop&&!hasTarget)throw fail('Choose a stop loss or take profit to update.');
    const requested=protection(req.body);
    const data=requested.stop!==null||requested.target!==null?await needMarket(user,{source,symbol},true):null;
    const result=await pool.transaction(async()=>{
      await account(user.id);
      const p=await position(user.id,source,symbol,product);
      if(!p)throw fail('This position is already closed.',409);
      if(p.session_end&&Date.now()>=Date.parse(p.session_end))throw fail('The Intraday session ended for this position.',409);
      const priorStop=amount(p.stop_loss),priorTarget=amount(p.take_profit);
      const expected=req.body.expected;
      if(expected&&((hasStop&&priceInput(expected.stopLoss,'previous stop loss')!==priorStop)||(hasTarget&&priceInput(expected.takeProfit,'previous take profit')!==priorTarget)))throw fail('This protection changed. Refresh the position and try again.',409);
      const stop=hasStop?requested.stop:priorStop,target=hasTarget?requested.target:priorTarget;
      if(data){
        if(!fresh(data.quote))throw fail('Wait for a fresh quote before changing protection.',409);
        bracketValid(Math.sign(p.quantity),quotePrice(data.quote),stop,target);
      }
      await query('UPDATE paper_positions SET stop_loss=$4,take_profit=$5,protected_at=NOW() WHERE user_id=$1 AND source=$2 AND symbol=$3 AND product=$6',[user.id,source,symbol,stop,target,product]);
      return {stopLoss:rupees(stop),takeProfit:rupees(target)};
    });
    res.json({ok:true,...result});
  }));
  app.get(ROUTE,requireAuth,asyncRoute(async(req,res)=>{
    const user=req.session.user;
    const offset=Math.max(0,Math.min(100000,Number.parseInt(req.query.offset,10)||0));
    const snapshot=await pool.transaction(async()=>{
      const wallet=await account(user.id);
      const {rows:positions}=await query('SELECT * FROM paper_positions WHERE user_id=$1 ORDER BY symbol',[user.id]);
      const {rows:pending}=await query("SELECT * FROM paper_orders WHERE user_id=$1 AND state='pending' ORDER BY id DESC",[user.id]);
      const {rows:history}=await query("SELECT * FROM paper_orders WHERE user_id=$1 AND state<>'pending' ORDER BY id DESC LIMIT 26 OFFSET $2",[user.id,offset]);
      const {rows:trades}=await query("SELECT * FROM paper_orders WHERE user_id=$1 AND state='filled' ORDER BY filled_at DESC,id DESC LIMIT 26 OFFSET $2",[user.id,offset]);
      return {wallet,positions,pending,history,trades};
    });
    let openPnl=0,capital=0,marked=0;
    const positions=await Promise.all(snapshot.positions.map(async p=>{
      const data=await getMarket(user,p.source,p.symbol);
      const quote=data?.quote;
      const current=quotePrice(quote)??amount(p.mark);
      const cost=Number(p.entry_value),q=Math.abs(p.quantity);
      const pnl=current==null?null:(current*q-cost)*Math.sign(p.quantity);
      capital+=Number(p.capital);
      if(pnl!==null){openPnl+=pnl;marked++;}
      return {...ticketQuote(p.instrument,quote),source:p.source,product:p.product,quantity:p.quantity,average:cost/q/100,last:rupees(current),pnl:rupees(pnl),capital:rupees(p.capital),stopLoss:rupees(p.stop_loss),takeProfit:rupees(p.take_profit)};
    }));
    const cash=Number(snapshot.wallet.cash),reserved=snapshot.pending.reduce((sum,o)=>sum+Number(o.reserved),0);
    res.json({startingCash:rupees(STARTING_CASH),cash:rupees(cash),available:rupees(cash-reserved),reserved:rupees(reserved),capital:rupees(capital),equity:rupees(cash+capital+openPnl),unrealized:rupees(openPnl),realized:rupees(snapshot.wallet.realized),marked,
      positions,pending:snapshot.pending.map(publicOrder),history:snapshot.history.slice(0,25).map(publicOrder),trades:snapshot.trades.slice(0,25).map(publicOrder),hasMoreHistory:snapshot.history.length>25,hasMoreTrades:snapshot.trades.length>25});
  }));

  let scanning=false,cursor=0;
  async function scan() {
    if(scanning)return;
    scanning=true;
    try {
      const {rows:users}=await query("SELECT u.id,u.email,u.role FROM users u WHERE u.active AND u.role='customer' AND u.id>$1 AND (EXISTS(SELECT 1 FROM paper_orders o WHERE o.user_id=u.id AND o.state='pending') OR EXISTS(SELECT 1 FROM paper_positions p WHERE p.user_id=u.id AND (p.stop_loss IS NOT NULL OR p.take_profit IS NOT NULL OR p.session_end IS NOT NULL OR p.instrument->>'expiry' IS NOT NULL))) ORDER BY u.id LIMIT 30",[cursor]);
      for(const user of users){
        cursor=user.id;
        try{await evaluate(user);}catch(error){console.error('Paper trading scan failed:',error.code??error.name);}
      }
      if(users.length<30)cursor=0;
    }finally{scanning=false;}
  }

  async function evaluate(user) {
    const id=user.id;
    const {rows:open}=await query("SELECT * FROM paper_positions WHERE user_id=$1 AND (stop_loss IS NOT NULL OR take_profit IS NOT NULL OR session_end IS NOT NULL OR instrument->>'expiry' IS NOT NULL)",[id]);
    const {rows:pending}=await query("SELECT * FROM paper_orders WHERE user_id=$1 AND state='pending'",[id]);
    const keyed=new Map();
    const key=row=>row.source+'|'+row.symbol;
    for(const row of [...open,...pending])if(!keyed.has(key(row)))keyed.set(key(row),await getMarket(user,row.source,row.symbol));
    await pool.transaction(async()=>{
      const wallet=await account(id);
      for(const original of open){
        const p=await position(id,original.source,original.symbol,original.product);
        if(!p)continue;
        const expiry=expiryAt(p.instrument);
        const {quote}=keyed.get(key(p))??{};
        const at=quoteAt(quote),price=quotePrice(quote);
        const end=Date.parse(p.session_end);
        if(Number.isFinite(end)&&Date.now()>=end&&end<=expiry){
          const saved=Date.parse(p.mark_at), near=ms=>ms<=end&&ms>end-900000;
          const mark=(price&&near(at))?{price,at,chartTime:quote.chart_time}:near(saved)?{price:Number(p.mark),at:saved,chartTime:amount(p.mark_chart_time)}:fresh(quote)?{price,at,chartTime:quote.chart_time}:null;
          if(mark?.price)await autoExit(id,p,wallet,mark.price,mark.at>end?'Intraday square-off (next eligible quote)':'Intraday square-off',new Date(mark.at),mark.chartTime);
          continue;
        }
        if(Date.now()>=expiry){
          const valid=ms=>ms<=expiry&&ms>expiry-900000;
          const mark=price&&valid(at)?price:valid(Date.parse(p.mark_at))?Number(p.mark):null;
          if(mark)await autoExit(id,p,wallet,mark,'Expiry settlement (last eligible quote)',new Date(price&&valid(at)?at:Date.parse(p.mark_at)),price&&valid(at)?quote.chart_time:amount(p.mark_chart_time));
          continue;
        }
        if(!fresh(quote))continue;
        if((p.instrument.expiry||p.session_end)&&at>Date.parse(p.mark_at)&&price!==Number(p.mark))await query('UPDATE paper_positions SET mark=$4,mark_at=$5,mark_chart_time=$7 WHERE user_id=$1 AND source=$2 AND symbol=$3 AND product=$6',[id,p.source,p.symbol,price,quote.updated_at,p.product,quote.chart_time??null]);
        if(at<=Date.parse(p.protected_at))continue;
        const direction=Math.sign(p.quantity);
        const stop=p.stop_loss!=null&&(price-Number(p.stop_loss))*direction<=0;
        const target=p.take_profit!=null&&(price-Number(p.take_profit))*direction>=0;
        if(stop||target)await autoExit(id,p,wallet,price,stop?'Stop loss':'Take profit',quote.updated_at,quote.chart_time);
      }
      for(const original of pending){
        const {rows:[order]}=await query("SELECT * FROM paper_orders WHERE user_id=$1 AND id=$2 AND state='pending'",[id,original.id]);
        if(!order)continue;
        const data=keyed.get(key(order)),quote=data?.quote,price=quotePrice(quote);
        if(order.session_end&&Date.now()>=Date.parse(order.session_end)){
          await updatePending(order.id,'expired','Intraday cutoff reached');
          continue;
        }
        if(Date.now()>=expiryAt(order.instrument)){
          await updatePending(order.id,'expired','Contract expired');
          continue;
        }
        if(!fresh(quote)||quoteAt(quote)<=Date.parse(order.created_at)||!triggered(order,price))continue;
        const p=await position(id,order.source,order.symbol,order.product);
        const t={product:order.product,side:order.side,quantity:order.quantity,stop:amount(order.stop_loss),target:amount(order.take_profit)};
        let plan;
        try{
          plan=executionPlan(order.instrument,t,p,price,data.underlying);
          if(plan.required>0&&plan.required>Number(wallet.cash)-await lockedFunds(id,order.id))throw fail('Insufficient virtual funds at execution.');
        }catch(error){
          if(!error.status)throw error;
          if(error.status!==409)await updatePending(order.id,'rejected',error.message);
          continue;
        }
        await fill(id,order,p,wallet,price,plan,quote.updated_at,quote.chart_time);
      }
    });
  }
  async function updatePending(id,state,reason) {
    await query('UPDATE paper_orders SET state=$2,reason=$3,reserved=0 WHERE id=$1',[id,state,reason]);
  }
  async function autoExit(id,p,wallet,price,reason,markAt,chartTime) {
    const t={product:p.product,source:p.source,symbol:p.symbol,side:p.quantity>0?'sell':'buy',type:'market',quantity:Math.abs(p.quantity),level:null,stop:null,target:null};
    const order=await insertOrder(id,t,p.instrument,t.quantity,0,reason);
    await fill(id,order,p,wallet,price,executionPlan(p.instrument,t,p,price),markAt,chartTime);
  }
  return {setup,scan};
}
module.exports={installPaperTrading};
