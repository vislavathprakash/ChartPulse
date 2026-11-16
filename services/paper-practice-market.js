const DAY=86400000;
const INDIA_OFFSET=19800000;
const LOT_SIZE=25;
const dateString=time=>new Date(time).toISOString().slice(0,10);
const expires=day=>Date.parse(day+'T15:30:00+05:30');

function expiries(now) {
  const day=new Date(now+INDIA_OFFSET);
  const friday=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate()+(5-day.getUTCDay()+7)%7);
  const first=now<expires(dateString(friday))?friday:friday+7*DAY;
  return [dateString(first),dateString(first+7*DAY)];
}

function contract(stock,kind,expiry,strike=null,right=null) {
  const leg=right==='CE'?'Call':'Put';
  return {
    symbol:kind==='futures'?['PAPERFUT',stock.symbol,expiry].join(':'):['PAPEROPT',stock.symbol,expiry,strike,right].join(':'),
    name:kind==='futures'?stock.name+' Future':stock.name+' '+strike+' '+leg,
    kind,lotSize:LOT_SIZE,expiry,practice:true
  };
}

function practiceDirectory(simulation,kind,term,now=Date.now()) {
  const q=term.trim().toUpperCase();
  const rows=[];
  const dates=expiries(now);
  for(const stock of simulation.instruments.values()){
    if(kind==='equity'){
      rows.push({symbol:stock.symbol,name:stock.name,kind,lotSize:1});
      continue;
    }
    const centre=Math.max(5,Math.round(stock.previousClose/5)*5);
    for(const expiry of dates){
      if(kind==='futures'){
        rows.push(contract(stock,kind,expiry));
        continue;
      }
      for(let strike=Math.max(5,centre-10);strike<=centre+10;strike+=5){
        rows.push(contract(stock,kind,expiry,strike,'CE'),contract(stock,kind,expiry,strike,'PE'));
      }
    }
  }
  return rows.filter(item=>[item.symbol,item.name,item.expiry].some(value=>value?.toUpperCase().includes(q)));
}

function practiceContract(simulation,symbol,now) {
  const match=/^(PAPERFUT|PAPEROPT):((?:NSE|BSE):SIM\d{3}):(\d{4}-\d{2}-\d{2})(?::(\d{1,5}):(CE|PE))?$/.exec(symbol);
  if(!match)return null;
  const [,type,base,expiry,strikeValue,right]=match;
  const stock=simulation.instruments.get(base);
  if(!stock||!expiries(now).includes(expiry)||(type==='PAPEROPT')!==Boolean(right))return null;
  const strike=Number(strikeValue),centre=Math.max(5,Math.round(stock.previousClose/5)*5);
  if(right&&(strike<Math.max(5,centre-10)||strike>centre+10||strike%5!==0))return null;
  const kind=type==='PAPEROPT'?'options':'futures';
  const item=contract(stock,kind,expiry,strike,right);
  if(item.symbol!==symbol)return null;
  return {item,base,expiry,strike,right};
}

function practicePrice({expiry,strike,right},price,asOf) {
  const remaining=Math.max(0,(expires(expiry)-asOf)/DAY);
  const intrinsic=right?Math.max(0,(price-strike)*(right==='CE'?1:-1)):0;
  const timeValue=price*.025*Math.sqrt(Math.min(14,remaining)/14);
  const mark=right?intrinsic+timeValue:price*(1+remaining*.00015);
  return Math.max(.01,Math.round(mark*100)/100);
}
function practiceMarket(simulation,quotes,symbol,now=Date.now()) {
  const contract=practiceContract(simulation,symbol,now);
  if(!contract)return null;
  const {item,base}=contract;
  const underlying=quotes?.get(base);
  if(!underlying?.price)return {item,quote:null,underlying:null};
  const chartTime=simulation.instruments.get(base).candles.at(-1)?.time;
  return {item,quote:{price:practicePrice(contract,underlying.price,Date.parse(underlying.updated_at)),updated_at:underlying.updated_at,chart_time:chartTime},underlying};
}

function practiceCandles(simulation,symbol,interval,since,now=Date.now()) {
  const contract=practiceContract(simulation,symbol,now);
  const base=simulation.instruments.get(contract?.base??symbol);
  if(!base)return null;
  const seconds={'1m':60,'5m':300,'15m':900,'1h':3600,'1D':86400}[interval];
  const bars=new Map();
  for(const bar of base.candles){
    const time=Math.floor(bar.time/seconds)*seconds;
    if(time<since)continue;
    const prices=contract?[bar.open,bar.high,bar.low,bar.close].map(price=>practicePrice(contract,price,now)):[bar.open,bar.high,bar.low,bar.close];
    const [open,,,close]=prices;
    const low=Math.min(...prices), high=Math.max(...prices);
    const existing=bars.get(time);
    if(existing){
      existing.high=Math.max(existing.high,high);
      existing.low=Math.min(existing.low,low);
      existing.close=close;
      if(!contract)existing.volume+=bar.volume;
    }else bars.set(time,{time,open,high,low,close,volume:contract?0:bar.volume});
  }
  return [...bars.values()].slice(-600);
}
module.exports={practiceDirectory,practiceMarket,practiceCandles};
