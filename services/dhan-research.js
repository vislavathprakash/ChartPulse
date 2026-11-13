const company = {
  Overview: ['MARKET_CAP','INDUSTRY','SECTOR','DIVIDEND_YIELD','EPS','EBITDA','BOOK_VALUE','FIFTY_TWO_WEEK_HIGH','FIFTY_TWO_WEEK_LOW'],
  Valuation: ['PE_RATIO','PB_RATIO','DEBT_TO_EQUITY','PE_TO_SECTOR_PE','ROE','ROCE','INDUSTRY_EPS','INDUSTRY_DEBT_TO_EQUITY','INDUSTRY_PB_RATIO','INDUSTRY_CURRENT_RATIO','INDUSTRY_DIVIDEND_YIELD','INDUSTRY_OPERATING_MARGIN'],
  Shareholding: ['REPORTING_PERIOD','PROMOTER_HOLDING','DII_HOLDING','CHANGE_IN_DII_HOLDING','FII_HOLDING','CHANGE_IN_FII_HOLDING','PUBLIC_HOLDING']
};
const indicators = ['SMA_20','SMA_50','SMA_200','EMA_20','EMA_50','RSI_14','MACD_HIST','ATR_14','ADX_14','ROC'];
const keyOf = key => key.replace(/[^a-z0-9]/gi,'').toLowerCase();
const scalar = value => typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()?value.trim().slice(0,400):null;
const asNumber = value => scalar(value)===null||!Number.isFinite(Number(value))?null:Number(value);
const properties = obj => new Map(Object.entries(obj??{}).map(([k,v])=>[keyOf(k),v]));
const pick = (map,...keys) => keys.map(key=>scalar(map.get(keyOf(key)))).find(value=>value!==null)??null;

function metricGroups(raw, groups) {
  const values=new Map(), wanted=new Set(Object.values(groups).flat().map(keyOf));
  function visit(node, depth) {
    if(!node||typeof node!=='object'||depth>7)return;
    const props=properties(node), named=pick(props,'metric','indicator','key','name','code','parameter');
    const value=pick(props,'value','metricValue','indicatorValue');
    if(typeof named==='string'&&value!==null&&wanted.has(keyOf(named)))values.set(keyOf(named),value);
    for(const [k,v] of Object.entries(node).slice(0,150)) {
      if(wanted.has(keyOf(k))) {
        const direct=scalar(v)??pick(properties(v),'value','metricValue','indicatorValue');
        if(direct!==null)values.set(keyOf(k),direct);
      }
      visit(v,depth+1);
    }
  }
  visit(raw,0);
  return Object.fromEntries(Object.entries(groups).map(([group,keys])=>[group,keys.filter(k=>values.has(keyOf(k))).map(key=>({key,value:values.get(keyOf(key))}))]).filter(([,rows])=>rows.length));
}

function resultRows(raw, convert, limit) {
  const rows=[];
  function visit(node,depth) {
    if(!node||typeof node!=='object'||depth>7||rows.length>=limit)return;
    if(!Array.isArray(node)) { const row=convert(properties(node)); if(row){rows.push(row);return;} }
    for(const value of Object.values(node).slice(0,150))visit(value,depth+1);
  }
  visit(raw,0);return rows;
}

function quoteDepth(q, number) {
  function levels(side) {
    return (Array.isArray(side)?side:[]).slice(0,5).map(l=>({price:number(l?.price),quantity:number(l?.quantity),orders:number(l?.orders)})).filter(l=>l.price>0);
  }
  const positive = v => number(v)>0?number(v):null;
  return { bids:levels(q.depth?.buy), asks:levels(q.depth?.sell), retrievedAt:new Date().toISOString(),
    vwap:positive(q.average_price), lower:positive(q.lower_circuit_limit), upper:positive(q.upper_circuit_limit),
    buyQuantity:number(q.buy_quantity), sellQuantity:number(q.sell_quantity), lastQuantity:number(q.last_quantity) };
}

function installDhanResearch({app,requireAuth,ownerOnly,asyncRoute,fetchData,credentials,instrument,refreshSnapshot,mergedQuotes,snapshot,snapshotMessage}) {
  const cache=new Map(), pending=new Map();
  async function cached(key,ttl,read) {
    const entry=cache.get(key);
    if(entry?.until>Date.now())return entry.result;
    if(pending.has(key))return pending.get(key);
    if(pending.size>=4)return {error:'Other Dhan requests are running. Refresh shortly.'};
    const request=(async()=>{
      let result;
      try { result={data:await read(),retrievedAt:new Date().toISOString()}; }
      catch(error){result={error:error.message.startsWith('Dhan ')?error.message:'Dhan could not be reached. Refresh shortly.'};}
      if(cache.size>=128&&!cache.has(key))cache.delete(cache.keys().next().value);
      cache.set(key,{until:Date.now()+(result.error?60000:ttl),result});return result;
    })().finally(()=>pending.delete(key));
    pending.set(key,request);return request;
  }
  app.get('/api/private-dhan/research',requireAuth,ownerOnly,asyncRoute(async(req,res)=>{
    const { view, symbol, interval, segment, category }=req.query;
    if(!['depth','company','technicals','movers','news'].includes(view))return res.status(400).json({error:'Choose a research view.'});
    if(view==='movers') {
      if(!['NSE_EQ','BSE_EQ'].includes(segment)||!['PRICE_GAINERS','PRICE_LOSERS'].includes(category))return res.status(400).json({error:'Choose an exchange and ranking.'});
      const result=await cached(`movers:${segment}:${category}`,60000,async()=>resultRows(await fetchData('data/marketmovers',{exchangeSegment:segment,instrument:['EQUITY'],category,universe:'ALL',limit:15}),row=>{
        const symbol=pick(row,'symbol','tradingSymbol','displaySymbol','customSymbol','ticker','semTradingSymbol','scripName','securityId');
        if(symbol===null)return null;
        return {symbol,name:pick(row,'name','companyName','company','displayName'),price:asNumber(pick(row,'lastPrice','lastTradedPrice','ltp','price','close')),change:asNumber(pick(row,'changePct','changePercent','percentageChange','priceChangePercent','pChange','percentChange','changePercentage','perChange','priceChangePct')),volume:asNumber(pick(row,'volume','tradedVolume','totalTradedVolume','totalVolume'))};
      },15));
      if(result.data?.length)return res.json(result);
      await refreshSnapshot();
      const gains=category==='PRICE_GAINERS';
      const matching=[...mergedQuotes().values()].filter(q=>q.symbol.startsWith(`${segment.slice(0,3)}:`)&&Number.isFinite(q.change_pct));
      const data=matching.filter(q=>gains?q.change_pct>0:q.change_pct<0).sort((a,b)=>gains?b.change_pct-a.change_pct:a.change_pct-b.change_pct).slice(0,15).map(q=>({symbol:q.symbol,price:q.price,change:q.change_pct,volume:q.volume,name:q.name}));
      return res.json({data, fallback:true, warning:matching.length?`Exchange ranking unavailable. Ranked ${matching.length} configured ${segment.slice(0,3)} listings with a reported previous close.`:'Exchange ranking unavailable, and no configured quotes have a previous close.'});
    }
    const i=typeof symbol==='string'?instrument(symbol):null;
    if(!i)return res.status(400).json({error:'Choose a configured Dhan symbol.'});
    const equity={securityId:i.id,exchangeSegment:i.segment,instrument:'EQUITY'};
    if(view==='depth') {
      await refreshSnapshot();
      const depth=snapshot(symbol);
      return res.json(depth?{data:depth,...(snapshotMessage().startsWith('Dhan quote snapshot.')?{}:{warning:snapshotMessage()})}:{error:snapshotMessage()||'No depth snapshot is available for this symbol.'});
    }
    if(view==='company')return res.json(await cached(`company:${symbol}`,3600000,async()=>metricGroups(await fetchData('data/companyinfo',{...equity,metrics:['CO','RATIOS','SHP']}),company)));
    if(view==='technicals') {
      if(i.segment!=='NSE_EQ')return res.json({error:'Dhan’s technical indicator API supports NSE equities, but not BSE equities.'});
      if(!['day','5','15'].includes(interval))return res.json({error:'Dhan provides technical indicators for the 5 min, 15 min and Daily intervals shown here.'});
      return res.json(await cached(`technicals:${symbol}:${interval}`,interval==='day'?300000:60000,async()=>metricGroups(await fetchData('data/technical',{...equity,timeframe:interval==='day'?'D':interval,indicators}),{Indicators:indicators})));
    }
    return res.json(await cached(`news:${symbol}`,180000,async()=>resultRows(await fetchData('data/newsheadline',{dhanClientId:credentials()?.clientId,categories:['ALL'],limit:10,stockList:[i.id]}),row=>{
      const title=pick(row,'title','headline','newsTitle','newsHeadline','heading','subject');
      if(!title)return null;
      const link=pick(row,'url','newsUrl','link','articleUrl','articleLink','sourceUrl','webUrl');
      return {title,source:pick(row,'source','publisher','sourceName','agency'),published:pick(row,'publishedAt','publishedDate','publishedTime','newsDate','date','timestamp','pubDate','createdAt'),link:typeof link==='string'&&/^https:\/\//i.test(link)?link:null};
    },10)));
  }));
}

module.exports={installDhanResearch,quoteDepth};
