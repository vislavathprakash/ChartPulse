(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Technicals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const finite = Number.isFinite;
  function sma(values, period) {
    const result = Array(values.length).fill(null); let sum=0, count=0;
    for(let i=0;i<values.length;i++) {
      if(finite(values[i])) {sum+=values[i];count++;}
      if(i>=period && finite(values[i-period])) {sum-=values[i-period];count--;}
      if(i>=period-1 && count===period) result[i]=sum/period;
    }
    return result;
  }
  function smooth(values, period, alpha=2/(period+1)) {
    const result=Array(values.length).fill(null);let previous=null,seed=[];
    values.forEach((value,i)=>{
      if(!finite(value))return;
      if(previous===null) {seed.push(value);if(seed.length===period)previous=seed.reduce((a,b)=>a+b,0)/period;}
      else previous=alpha*value+(1-alpha)*previous;
      result[i]=previous;
    });return result;
  }
  function rsi(values,period) {
    const changes=values.map((v,i)=>i?v-values[i-1]:null);
    const gain=smooth(changes.map(v=>v===null?null:Math.max(v,0)),period,1/period);
    const loss=smooth(changes.map(v=>v===null?null:Math.max(-v,0)),period,1/period);
    return gain.map((g,i)=>g===null?null:loss[i]===0?(g===0?50:100):100-100/(1+g/loss[i]));
  }
  function calculate(candles, spec={}) {
    const type=spec.type||'sma',period=spec.period||({rsi:14,atr:14,stochastic:14,cci:20,roc:10}[type]||20);
    const values=candles.map(c=>c[spec.source||'close']);
    const series=(key,data,color)=>({key,data,color});
    const color=spec.color||'#e9b65b';
    if(type==='sma')return [series('sma',sma(values,period),color)];
    if(type==='ema')return [series('ema',smooth(values,period),spec.color||'#60a5fa')];
    if(type==='wma')return [series('wma',values.map((v,i)=>i<period-1?null:values.slice(i-period+1,i+1).reduce((a,n,j)=>a+n*(j+1),0)/(period*(period+1)/2)),color)];
    if(type==='rsi')return [series('rsi',rsi(values,period),spec.color||'#ab91f3')];
    if(type==='bollinger') {
      const middle=sma(values,period),dev=values.map((v,i)=>middle[i]===null?null:Math.sqrt(values.slice(i-period+1,i+1).reduce((a,n)=>a+(n-middle[i])**2,0)/period)*(spec.multiplier||2));
      return [series('basis',middle,color),series('upper',middle.map((v,i)=>v===null?null:v+dev[i]),'#5da9e9'),series('lower',middle.map((v,i)=>v===null?null:v-dev[i]),'#5da9e9')];
    }
    if(type==='macd') {
      const fast=smooth(values,spec.fast||12),slow=smooth(values,spec.slow||26),macd=fast.map((v,i)=>v===null||slow[i]===null?null:v-slow[i]);
      const signal=smooth(macd,spec.signal||9);
      return [series('macd',macd,spec.color||'#60a5fa'),series('signal',signal,'#fbbf24'),{...series('histogram',macd.map((v,i)=>v===null||signal[i]===null?null:v-signal[i]),'#2ec7a0'),histogram:true}];
    }
    if(type==='atr')return [series('atr',smooth(candles.map((c,i)=>i?Math.max(c.high-c.low,Math.abs(c.high-candles[i-1].close),Math.abs(c.low-candles[i-1].close)):c.high-c.low),period,1/period),color)];
    if(type==='stochastic') {
      const k=candles.map((c,i)=>{if(i<period-1)return null;const win=candles.slice(i-period+1,i+1),low=Math.min(...win.map(v=>v.low)),high=Math.max(...win.map(v=>v.high));return high===low?50:100*(c.close-low)/(high-low);});
      const smoothK=sma(k,spec.smoothing||3);return [series('k',smoothK,spec.color||'#60a5fa'),series('d',sma(smoothK,3),'#e9b65b')];
    }
    if(type==='cci') {
      const typical=candles.map(c=>(c.high+c.low+c.close)/3),mean=sma(typical,period);
      return [series('cci',typical.map((v,i)=>{if(mean[i]===null)return null;const deviation=typical.slice(i-period+1,i+1).reduce((a,n)=>a+Math.abs(n-mean[i]),0)/period;return deviation?(v-mean[i])/(.015*deviation):0;}),color)];
    }
    if(type==='obv') {let total=0;return [series('obv',candles.map((c,i)=>{if(i)total+=Math.sign(c.close-candles[i-1].close)*c.volume;return total;}),color)];}
    if(type==='roc')return [series('roc',values.map((v,i)=>i<period?null:100*(v/values[i-period]-1)),color)];
    if(type==='vwap') {
      let weighted=0,volume=0,day=null;
      return [series('vwap',candles.map(c=>{const date=Math.floor((c.time+19800)/86400);if(day!==date){weighted=0;volume=0;day=date;}weighted+=(c.high+c.low+c.close)/3*c.volume;volume+=c.volume;return volume?weighted/volume:null;}),spec.color||'#f59eaa')];
    }
    if(type==='volume')return [{...series('volume',candles.map(c=>c.volume),'#2ec7a0'),histogram:true}];
    return [];
  }
  const catalog=[
    {type:'sma',name:'Simple moving average',period:20,overlay:true},
    {type:'ema',name:'Exponential moving average',period:20,overlay:true},
    {type:'wma',name:'Weighted moving average',period:20,overlay:true},
    {type:'bollinger',name:'Bollinger Bands',period:20,multiplier:2,overlay:true},
    {type:'vwap',name:'VWAP · resets at midnight IST',overlay:true},
    {type:'rsi',name:'Relative Strength Index',period:14},
    {type:'macd',name:'MACD',fast:12,slow:26,signal:9},
    {type:'stochastic',name:'Stochastic',period:14,smoothing:3},
    {type:'atr',name:'Average True Range',period:14},
    {type:'cci',name:'Commodity Channel Index',period:20},
    {type:'obv',name:'On Balance Volume'},
    {type:'roc',name:'Rate of Change',period:10},
    {type:'volume',name:'Volume'}
  ];
  function snapshot(candles) {
    const specs={sma20:{type:'sma',period:20},sma50:{type:'sma',period:50},sma200:{type:'sma',period:200},ema20:{type:'ema',period:20},rsi14:{type:'rsi',period:14},atr14:{type:'atr',period:14},vwap:{type:'vwap'},macd:{type:'macd'},stochastic_k:{type:'stochastic'},cci20:{type:'cci',period:20},obv:{type:'obv'},roc10:{type:'roc',period:10}};
    const result={};for(const [key,spec] of Object.entries(specs))result[key]=calculate(candles,spec)[0]?.data.at(-1)??null;
    const bb=calculate(candles,{type:'bollinger',period:20});result.bb_upper=bb[1].data.at(-1);result.bb_lower=bb[2].data.at(-1);
    result.macd_signal=calculate(candles,{type:'macd'})[1].data.at(-1);
    return result;
  }
  function heikinAshi(candles) {
    const result=[];for(const c of candles){const previous=result.at(-1),open=previous?(previous.open+previous.close)/2:(c.open+c.close)/2,close=(c.open+c.high+c.low+c.close)/4;result.push({...c,open,close,high:Math.max(c.high,open,close),low:Math.min(c.low,open,close)});}return result;
  }
  return {sma,smooth,rsi,calculate,snapshot,catalog,heikinAshi};
});
