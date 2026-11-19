const crypto=require('node:crypto');
const Technicals=require('../public/technical-analysis');
const {metricGroups,company}=require('./dhan-research');
const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const positive=value=>number(value)>0?number(value):null;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const fields={price:'Last price ₹',change_pct:'Change %',volume:'Volume',gap_pct:'Opening gap %',from_open_pct:'Move from open %',high_distance:'Below day high %',low_distance:'Above day low %',vwap:'VWAP',sma20:'SMA 20',sma50:'SMA 50',sma200:'SMA 200',ema20:'EMA 20',rsi14:'RSI 14',relative_volume:'Relative volume',pe:'P/E',pb:'Price / book',roe:'ROE %',roce:'ROCE %',debt_equity:'Debt / equity',dividend_yield:'Dividend yield %',market_cap:'Market cap ₹ crore',eps:'EPS',promoter:'Promoter holding %',fii_change:'FII holding change points',dii_change:'DII holding change points',high52_distance:'Below 52-week high %',low52_distance:'Above 52-week low %',oi:'Open interest',oi_change_pct:'OI change %',iv:'Implied volatility %',spread_pct:'Bid / ask spread %',strike_distance:'Distance from spot %',delta:'Delta',strike:'Strike',bid:'Best bid',ask:'Best ask'};
const rule=(field,op,value)=>({field,op,value});
const presets=[
  ['gainers','intraday','Day gainers','Stocks gaining at least 1%.',[rule('change_pct','>=',1)],'change_pct','desc'],
  ['decliners','intraday','Day decliners','Stocks down at least 1%.',[rule('change_pct','<=',-1)],'change_pct','asc'],
  ['gap-up','intraday','Gap up','Opening at least 1% above previous close.',[rule('gap_pct','>=',1)],'gap_pct','desc'],
  ['gap-down','intraday','Gap down','Opening at least 1% below previous close.',[rule('gap_pct','<=',-1)],'gap_pct','asc'],
  ['near-high','intraday','Near day high','Trading within 0.5% of the session high.',[rule('high_distance','<=',0.5),rule('change_pct','>',0)],'high_distance','asc'],
  ['near-low','intraday','Near day low','Trading within 0.5% of the session low.',[rule('low_distance','<=',0.5),rule('change_pct','<',0)],'low_distance','asc'],
  ['above-vwap','intraday','Above VWAP','Positive stocks above average traded price.',[rule('price','>','vwap'),rule('change_pct','>',0)],'volume','desc'],
  ['volume-leaders','intraday','Volume leaders','At least 100,000 units traded.',[rule('volume','>=',100000)],'volume','desc'],
  ['intraday-rsi','intraday','RSI oversold · 5m','RSI below 30 on completed 5-minute candles.',[rule('rsi14','<',30)],'rsi14','asc','technical'],
  ['intraday-trend','intraday','Above EMA 20 · 5m','Latest price above EMA 20 on 5-minute candles.',[rule('price','>','ema20')],'change_pct','desc','technical'],
  ['uptrend','investing','Daily uptrend','Price above SMA 50, with SMA 50 above SMA 200.',[rule('price','>','sma50'),rule('sma50','>','sma200')],'change_pct','desc','technical'],
  ['daily-oversold','investing','Daily RSI oversold','Completed daily RSI below 30.',[rule('rsi14','<',30)],'rsi14','asc','technical'],
  ['daily-strength','investing','Daily RSI strength','Daily RSI between 55 and 70.',[rule('rsi14','>=',55),rule('rsi14','<=',70)],'rsi14','desc','technical'],
  ['high52','investing','Near 52-week high','Within 5% of provider-reported yearly high.',[rule('high52_distance','<=',5)],'high52_distance','asc','fundamental'],
  ['low52','investing','Near 52-week low','Within 10% above provider-reported yearly low.',[rule('low52_distance','<=',10)],'low52_distance','asc','fundamental'],
  ['value','fundamental','Value candidates','Positive P/E below 20, and price/book below 3.',[rule('pe','>',0),rule('pe','<=',20),rule('pb','<=',3)],'pe','asc','fundamental'],
  ['quality','fundamental','Quality companies','ROCE at least 15%, debt/equity at most 0.5.',[rule('roce','>=',15),rule('debt_equity','<=',0.5)],'roce','desc','fundamental'],
  ['dividend','fundamental','Dividend yield','Dividend yield of at least 2%.',[rule('dividend_yield','>=',2)],'dividend_yield','desc','fundamental'],
  ['low-debt','fundamental','Low debt','Debt/equity at most 0.25 and positive earnings.',[rule('debt_equity','<=',0.25),rule('eps','>',0)],'debt_equity','asc','fundamental'],
  ['large-cap','fundamental','Large cap','Market cap of at least ₹20,000 crore.',[rule('market_cap','>=',20000)],'market_cap','desc','fundamental'],
  ['institutions','fundamental','Institutional buying','FII holding increased since the previous report.',[rule('fii_change','>',0)],'fii_change','desc','fundamental'],
  ['liquid-options','options','Liquid options','Positive OI, volume and two-sided quotes.',[rule('oi','>',0),rule('volume','>',0),rule('bid','>',0),rule('ask','>',0)],'volume','desc'],
  ['near-atm','options','Near the money','Strikes within 2% of underlying spot.',[rule('strike_distance','<=',2),rule('oi','>',0)],'strike_distance','asc'],
  ['budget-options','options','Premium below ₹200','Positive option premium of at most ₹200.',[rule('price','>',0),rule('price','<=',200),rule('oi','>',0)],'volume','desc'],
  ['tight-spread','options','Tight bid / ask','Spread below 1% with positive bid and ask.',[rule('spread_pct','<=',1),rule('bid','>',0),rule('ask','>',0)],'spread_pct','asc'],
  ['oi-growth','options','Rising open interest','OI increased by at least 5% versus previous OI.',[rule('oi_change_pct','>=',5)],'oi_change_pct','desc'],
  ['high-iv','options','Higher implied volatility','Implied volatility of at least 20%.',[rule('iv','>=',20)],'iv','desc'],
  ['futures-gainers','futures','Futures gainers','Futures up at least 0.5%.',[rule('change_pct','>=',0.5)],'change_pct','desc'],
  ['futures-decliners','futures','Futures decliners','Futures down at least 0.5%.',[rule('change_pct','<=',-0.5)],'change_pct','asc'],
  ['futures-volume','futures','Active futures','Futures with positive traded volume.',[rule('volume','>',0)],'volume','desc'],
  ['futures-oi','futures','Highest open interest','Contracts with reported open interest.',[rule('oi','>',0)],'oi','desc'],
  ['mcx-gainers','commodities','MCX gainers','Commodity futures up at least 0.5%.',[rule('change_pct','>=',0.5)],'change_pct','desc'],
  ['mcx-decliners','commodities','MCX decliners','Commodity futures down at least 0.5%.',[rule('change_pct','<=',-0.5)],'change_pct','asc'],
  ['mcx-active','commodities','Active commodity futures','Positive traded volume across dated MCX contracts.',[rule('volume','>',0)],'volume','desc']
].map(([id,group,name,description,rules,sort,direction,requires])=>({id,group,name,description,rules,sort,direction,requires}));
const fundamentalKeys=new Set(['pe','pb','roe','roce','debt_equity','dividend_yield','market_cap','eps','promoter','fii_change','dii_change','high52_distance','low52_distance']);
const technicalKeys=new Set(['sma20','sma50','sma200','ema20','rsi14','relative_volume']);
function matches(row,rules){return rules.every(({field,op,value})=>{
  const a=number(row[field]),b=typeof value==='number'?value:number(row[value]);
  if(a===null||b===null)return false;
  return {'>':a>b,'>=':a>=b,'<':a<b,'<=':a<=b,'=':a===b,'!=':a!==b}[op];
});}
function validate(body){
  const preset=presets.find(p=>p.id===body.preset);
  if(!preset)throw fail('Choose a screener preset.');
  const rules=body.rules??preset.rules;
  if(!Array.isArray(rules)||rules.length>10||!rules.length)throw fail('Use between 1 and 10 filter conditions.');
  for(const r of rules)if(!r||!Object.hasOwn(fields,r.field)||!['>','>=','<','<=','=','!='].includes(r.op)||!(typeof r.value==='number'&&Number.isFinite(r.value)||typeof r.value==='string'&&Object.hasOwn(fields,r.value)))throw fail('Use a supported field, comparison, and numeric value or field.');
  if(!Object.hasOwn(fields,body.sort??preset.sort)||!['asc','desc'].includes(body.direction??preset.direction))throw fail('Choose a valid sort order.');
  const symbols=body.symbols;
  if(!Array.isArray(symbols)||symbols.length>100||symbols.some(s=>typeof s!=='string'||s.length>100))throw fail('Choose a universe containing up to 100 stocks.');
  const used=rules.flatMap(r=>[r.field,...(typeof r.value==='string'?[r.value]:[])]).concat(body.sort??preset.sort);
  const group=preset.group;
  if(['options','futures','commodities'].includes(group)&&used.some(k=>fundamentalKeys.has(k)||technicalKeys.has(k)))throw fail('Use quote and derivative fields for this screener.');
  return {preset:preset.id,group,rules,sort:body.sort??preset.sort,direction:body.direction??preset.direction,symbols:[...new Set(symbols)],underlying:typeof body.underlying==='string'?body.underlying.slice(0,100):'NSE:NIFTY',expiry:typeof body.expiry==='string'?body.expiry:'',side:['CE','PE'].includes(body.side)?body.side:'',technical:used.some(k=>technicalKeys.has(k)),fundamental:used.some(k=>fundamentalKeys.has(k)),interval:group==='intraday'?'5':'day'};
}
function installLiveScreeners({app,pool,requireAuth,ownerOnly,asyncRoute,fetchData,instruments,lookup,tradeDate}){
  const jobs=new Map(),cache=new Map(),pending=new Map();
  let nextData=0,nextChain=0;
  async function cached(key,ttl,read){
    const prior=cache.get(key);if(prior?.until>Date.now())return prior.data;
    if(pending.has(key))return pending.get(key);
    const promise=(async()=>{const data=await read();if(cache.size>=1200)cache.delete(cache.keys().next().value);cache.set(key,{data,until:Date.now()+ttl});return data;})().finally(()=>pending.delete(key));
    pending.set(key,promise);return promise;
  }
  async function dataCall(path,body){
    const time=Math.max(Date.now(),nextData);nextData=time+400;
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,time-Date.now())));
    return fetchData(path,body);
  }
  function quoteRow(item,q,at){
    const price=positive(q.last_price),previous=positive(q.ohlc?.close),open=positive(q.ohlc?.open),high=positive(q.ohlc?.high),low=positive(q.ohlc?.low);
    const bid=positive(q.depth?.buy?.[0]?.price),ask=positive(q.depth?.sell?.[0]?.price);
    return {symbol:item.symbol,name:item.name,kind:item.kind,exchange:item.exchange,expiry:item.expiry,lotSize:item.lotSize,optionChainAvailable:item.optionChainAvailable===true,price,volume:number(q.volume),vwap:positive(q.average_price),oi:number(q.oi),bid,ask,spread_pct:bid&&ask&&price?(ask-bid)/price*100:null,change_pct:price&&previous?(price/previous-1)*100:null,gap_pct:open&&previous?(open/previous-1)*100:null,from_open_pct:price&&open?(price/open-1)*100:null,high_distance:price&&high?(high-price)/high*100:null,low_distance:price&&low?(price-low)/low*100:null,quoteAt:tradeDate(q.last_trade_time),retrievedAt:at};
  }
  async function fundamentals(item){
    return cached('fund:'+item.symbol,6*3600000,async()=>{
      const data=await dataCall('data/companyinfo',{securityId:item.id,exchangeSegment:item.segment,instrument:'EQUITY',metrics:['CO','RATIOS','SHP']});
      const groups=metricGroups(data,company),flat=Object.fromEntries(Object.values(groups).flat().map(x=>[x.key,number(x.value)]));
      const map={pe:'PE_RATIO',pb:'PB_RATIO',roe:'ROE',roce:'ROCE',debt_equity:'DEBT_TO_EQUITY',dividend_yield:'DIVIDEND_YIELD',market_cap:'MARKET_CAP',eps:'EPS',promoter:'PROMOTER_HOLDING',fii_change:'CHANGE_IN_FII_HOLDING',dii_change:'CHANGE_IN_DII_HOLDING'};
      return {...Object.fromEntries(Object.entries(map).map(([k,v])=>[k,flat[v]??null])),high52:flat.FIFTY_TWO_WEEK_HIGH,low52:flat.FIFTY_TWO_WEEK_LOW,fundamentalAt:new Date().toISOString()};
    });
  }
  async function technicals(item,interval){
    return cached('tech:'+item.symbol+':'+interval,interval==='day'?300000:60000,async()=>{
      const now=Date.now(),day=t=>new Date(t+19800000).toISOString().slice(0,10);
      const raw=await dataCall(interval==='day'?'charts/historical':'charts/intraday',{securityId:item.id,exchangeSegment:item.segment,instrument:item.instrument??'EQUITY',oi:false,fromDate:interval==='day'?day(now-420*86400000):day(now-7*86400000)+' 09:15:00',toDate:interval==='day'?day(now+86400000):day(now)+' 15:30:00',...(interval==='day'?{expiryCode:0}:{interval:Number(interval)})});
      const candles=(raw.timestamp||[]).map((time,i)=>({time:number(time),open:positive(raw.open?.[i]),high:positive(raw.high?.[i]),low:positive(raw.low?.[i]),close:positive(raw.close?.[i]),volume:number(raw.volume?.[i])})).filter(c=>c.time&&c.open&&c.high&&c.low&&c.close&&c.time*1000+(interval==='day'?15.5*3600000-19800000:Number(interval)*60000)<=now).sort((a,b)=>a.time-b.time);
      const values=Technicals.snapshot(candles);
      const volumes=candles.slice(-21,-1).map(c=>c.volume).filter(Number.isFinite);
      const avg=volumes.length===20?volumes.reduce((a,b)=>a+b,0)/20:null;
      return {sma20:values.sma20??null,sma50:values.sma50??null,sma200:values.sma200??null,ema20:values.ema20??null,rsi14:values.rsi14??null,relative_volume:avg>0?candles.at(-1).volume/avg:null,technicalAt:candles.at(-1)?.time?new Date(candles.at(-1).time*1000).toISOString():null};
    });
  }
  async function optionRows(config){
    const base=lookup(config.underlying);if(!base||!['index','equity'].includes(base.kind))throw fail('Choose a listed equity or index underlying.');
    const dates=await cached('expiry:'+base.symbol,300000,async()=>{const x=await fetchData('optionchain/expirylist',{UnderlyingScrip:Number(base.id),UnderlyingSeg:base.segment});return (x.data||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();});
    const expiry=config.expiry||dates[0];if(!dates.includes(expiry))throw fail('No listed option expiry matches this selection.');
    const result=await cached('chain:'+base.symbol+':'+expiry,15000,async()=>{
      const time=Math.max(Date.now(),nextChain);nextChain=time+3100;await new Promise(resolve=>setTimeout(resolve,Math.max(0,time-Date.now())));
      return {raw:await fetchData('optionchain',{UnderlyingScrip:Number(base.id),UnderlyingSeg:base.segment,Expiry:expiry}),at:new Date().toISOString()};
    });
    const directory=new Map([...instruments().values()].filter(i=>i.kind==='options'&&i.exchange===base.exchange).map(i=>[String(i.id),i]));
    const rows=[];
    for(const [strike,legs]of Object.entries(result.raw.data?.oc||{}))for(const side of ['CE','PE']){
      if(config.side&&config.side!==side)continue;
      const q=legs[side.toLowerCase()],item=q&&directory.get(String(q.security_id));if(!q)continue;
      const price=positive(q.last_price),previous=positive(q.previous_close_price),previousOI=positive(q.previous_oi),oi=number(q.oi),bid=positive(q.top_bid_price),ask=positive(q.top_ask_price),spot=positive(result.raw.data?.last_price);
      rows.push({symbol:item?.symbol??null,name:item?.name??`${base.name} ${strike} ${side}`,exchange:base.exchange,kind:'options',optionChainAvailable:true,expiry,side,strike:number(strike),price,change_pct:price&&previous?(price/previous-1)*100:null,volume:number(q.volume),oi,oi_change_pct:previousOI&&oi!==null?(oi/previousOI-1)*100:null,iv:number(q.implied_volatility),bid,ask,spread_pct:bid&&ask&&price?(ask-bid)/price*100:null,strike_distance:spot?Math.abs(Number(strike)-spot)/spot*100:null,delta:number(q.greeks?.delta),lotSize:item?.lotSize,retrievedAt:result.at,quoteAt:null});
    }
    return {rows,expiries:dates,expiry,universe:base.name+' options'};
  }
  async function execute(job){
    const config=job.config;
    try{
      let rows,items;
      if(config.group==='options'){
        const chain=await optionRows(config);rows=chain.rows;job.expiries=chain.expiries;job.expiry=chain.expiry;job.universe=chain.universe;job.total=rows.length;job.completed=rows.length;
      }else{
        const directory=instruments(),today=new Date(Date.now()+19800000).toISOString().slice(0,10);
        if(config.group==='futures'||config.group==='commodities'){
          const roots=new Set(config.symbols.map(s=>s.split(':')[1]));
          items=[...directory.values()].filter(i=>i.kind==='futures'&&i.expiry>=today&&(config.group==='commodities'?i.exchange==='MCX'&&(config.underlying==='MCX:ALL'||i.underlying===config.underlying.split(':')[1]):i.exchange!=='MCX'&&(roots.has(i.underlying)||i.underlying===config.underlying.split(':')[1])));
          if(config.expiry)items=items.filter(i=>i.expiry===config.expiry);
          items.sort((a,b)=>a.expiry.localeCompare(b.expiry)||a.symbol.localeCompare(b.symbol));
        }else items=config.symbols.map(s=>directory.get(s)).filter(i=>i?.kind==='equity');
        if(config.group==='commodities')job.universe=config.underlying==='MCX:ALL'?'MCX futures':config.underlying.split(':')[1]+' futures';
        job.available=items.length;items=items.slice(0,100);job.total=items.length;
        if(!items.length)throw fail('No contracts or stocks are available in this universe. Choose another universe.');
        const key=items.map(i=>i.id+':'+i.segment).join(',');
        const batch=await cached('quotes:'+key,12000,async()=>{
          const body={};for(const i of items)(body[i.segment]??=[]).push(Number(i.id));
          return {raw:await fetchData('marketfeed/quote',body),at:new Date().toISOString()};
        });
        rows=[];let cursor=0;
        async function worker(){while(cursor<items.length&&!job.cancelled){
          const item=items[cursor++],q=batch.raw.data?.[item.segment]?.[item.id];
          if(!q){job.completed++;job.unavailable++;continue;}
          const row=quoteRow(item,q,batch.at);
          try{
            if(config.fundamental)Object.assign(row,await fundamentals(item));
            if(config.technical)Object.assign(row,await technicals(item,config.interval));
            row.high52_distance=row.price&&row.high52?(row.high52-row.price)/row.high52*100:null;
            row.low52_distance=row.price&&row.low52?(row.price-row.low52)/row.low52*100:null;
          }catch(error){job.warnings.add(error.message);}
          const needed=config.rules.flatMap(r=>[r.field,...(typeof r.value==='string'?[r.value]:[])]);
          if(!row.price||needed.some(k=>row[k]==null))job.unavailable++;
          else if(matches(row,config.rules))rows.push(row);
          job.completed++;
        }}
        await Promise.all([worker(),worker()]);
      }
      if(job.cancelled){job.status='cancelled';return;}
      if(config.group==='options'){
        job.unavailable=rows.filter(r=>config.rules.some(f=>r[f.field]==null||typeof f.value==='string'&&r[f.value]==null)).length;
        rows=rows.filter(r=>matches(r,config.rules));
      }
      rows.sort((a,b)=>{const av=number(a[config.sort]),bv=number(b[config.sort]);if(av===null)return bv===null?0:1;if(bv===null)return -1;return (av-bv)*(config.direction==='asc'?1:-1);});
      job.rows=rows;job.status='complete';job.finishedAt=new Date().toISOString();
    }catch(error){job.status='error';job.error=error.message;}
  }
  function output(job){return {id:job.id,status:job.status,total:job.total,completed:job.completed,unavailable:job.unavailable,available:job.available,rows:job.status==='complete'?job.rows:[],error:job.error,warnings:[...job.warnings].slice(0,3),finishedAt:job.finishedAt,expiries:job.expiries,expiry:job.expiry,universe:job.universe,interval:job.config.technical?(job.config.interval==='day'?'Daily · completed candles':'5-minute · completed candles'):null,fundamentals:job.config.fundamental};}
  app.get('/api/private-dhan/screeners',requireAuth,ownerOnly,(_req,res)=>res.json({presets,fields}));
  app.post('/api/private-dhan/scans',requireAuth,ownerOnly,asyncRoute(async(req,res)=>{
    const config=validate(req.body||{}),owner=req.session.user.id,now=Date.now();
    for(const [id,j]of jobs)if(now-j.created>15*60000&&j.status!=='running')jobs.delete(id);
    if([...jobs.values()].filter(j=>j.owner===owner&&j.status==='running').length>=2)throw fail('Two scans are still running. Cancel one or wait for it to finish.',429);
    if(jobs.size>=30){const done=[...jobs].find(([,j])=>j.status!=='running');if(done)jobs.delete(done[0]);else throw fail('Scans are busy. Try again shortly.',429);}
    const job={id:crypto.randomUUID(),owner,created:now,config,status:'running',completed:0,total:0,unavailable:0,warnings:new Set()};jobs.set(job.id,job);void execute(job);res.status(202).json(output(job));
  }));
  app.get('/api/private-dhan/scans/:id',requireAuth,ownerOnly,(req,res)=>{const job=jobs.get(req.params.id);if(!job||job.owner!==req.session.user.id)return res.status(404).json({error:'Scan expired. Run it again.'});res.json(output(job));});
  app.delete('/api/private-dhan/scans/:id',requireAuth,ownerOnly,(req,res)=>{const job=jobs.get(req.params.id);if(!job||job.owner!==req.session.user.id)return res.status(404).json({error:'Scan not found.'});job.cancelled=true;job.status='cancelled';res.json({ok:true});});
}
module.exports={installLiveScreeners,matches,validate,presets};
