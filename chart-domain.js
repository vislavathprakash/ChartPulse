const T = require('./public/technical-analysis');
const INTERVALS = ['1m','2m','3m','5m','10m','15m','30m','1h','2h','4h','1D'];
const CONDITIONS = ['crossing','crossing_up','crossing_down','greater_than','less_than','entering_channel','exiting_channel','inside_channel','outside_channel','moving_up','moving_down','moving_up_pct','moving_down_pct'];
const FREQUENCIES = ['once','every_time','once_per_bar','bar_close','once_per_minute'];
const DRAWINGS = ['horizontal','trend','ray','extended','vertical','rectangle','fib','text','arrow','channel','measure'];
function bad(message) {const error=new Error(message);error.status=400;throw error;}
function validateIndicator(spec) {
  if(!spec || !T.catalog.some(s=>s.type===spec.type))bad('Unsupported indicator.');
  const allowed=['type','period','fast','slow','signal','multiplier','smoothing','color','source','visible','id'];const out={};
  for(const key of allowed)if(spec[key]!==undefined)out[key]=spec[key];
  for(const key of ['period','fast','slow','signal','smoothing'])if(out[key]!==undefined && (!Number.isInteger(out[key])||out[key]<1||out[key]>500))bad('Indicator lengths must be integers from 1 to 500.');
  if(out.multiplier!==undefined && (!Number.isFinite(out.multiplier)||out.multiplier<=0||out.multiplier>10))bad('Band multiplier must be greater than zero and at most 10.');
  if(out.source && !['close','open','high','low'].includes(out.source))bad('Invalid indicator source.');
  if(out.color && !/^#[0-9a-f]{6}$/i.test(out.color))bad('Invalid indicator colour.');
  return out;
}
function validateDrawing(kind,payload) {
  if(!DRAWINGS.includes(kind)||!payload||!Number.isFinite(payload.price)||payload.price<=0)bad('Invalid drawing.');
  const two=['trend','ray','extended','rectangle','fib','arrow','channel','measure'].includes(kind);
  if(!Number.isFinite(payload.time))bad('Drawing time is required.');
  if(two && (!Number.isFinite(payload.time2)||payload.time===payload.time2||!Number.isFinite(payload.price2)||payload.price2<=0))bad('Choose two different chart times with positive prices.');
  const out={price:payload.price,time:payload.time,alertEnabled:payload.alertEnabled===true};
  if(two){out.time2=payload.time2;out.price2=payload.price2;}
  if(kind==='channel'){if(!Number.isFinite(payload.width)||payload.width<=0)bad('Channel width must be positive.');out.width=payload.width;}
  out.color=/^#[0-9a-f]{6}$/i.test(payload.color||'')?payload.color:'#a78bfa';out.lineWidth=Math.min(5,Math.max(1,Number(payload.lineWidth)||1));
  out.text=String(payload.text||'').slice(0,160);out.hidden=payload.hidden===true;out.locked=payload.locked===true;
  out.condition=['crossing','crossing_up','crossing_down','greater_than','less_than','entering_channel','exiting_channel','inside_channel','outside_channel'].includes(payload.condition)?payload.condition:'crossing';
  if(['vertical','text','arrow','measure'].includes(kind))out.alertEnabled=false;
  if(out.alertEnabled) {
    const isChannel=['rectangle','channel'].includes(kind);
    const conditions=isChannel?['crossing','entering_channel','exiting_channel','inside_channel','outside_channel']:['crossing','crossing_up','crossing_down','greater_than','less_than'];
    if(!conditions.includes(out.condition))bad('This alert condition is not supported by the selected drawing type.');
  }
  return out;
}
function validateAlert(body) {
  if(!body || typeof body.name!=='string'||!body.name.trim())bad('Alert name is required.');
  const c=body.config||{};
  if(!CONDITIONS.includes(c.condition))bad('Invalid alert condition.');
  if(!FREQUENCIES.includes(c.frequency)||!INTERVALS.includes(c.interval))bad('Invalid trigger frequency or interval.');
  if(!Number.isFinite(c.value))bad('A numeric threshold is required.');
  if(c.condition.includes('channel') && (!Number.isFinite(c.upper)||c.upper<=c.value))bad('Upper boundary must be greater than lower boundary.');
  if(c.condition.startsWith('moving') && (c.value<0||!Number.isInteger(c.bars)||c.bars<1||c.bars>500))bad('Movement must be non-negative with 1 to 500 bars.');
  if(c.expiresAt && (!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.expiresAt)<=Date.now()))bad('Choose a future expiration.');
  if(c.source!=='price'&&c.source!=='indicator')bad('Invalid alert source.');
  const config={source:c.source,condition:c.condition,frequency:c.frequency,interval:c.interval,value:c.value,upper:c.upper??null,bars:c.bars||1,expiresAt:c.expiresAt||null,message:String(c.message||'').slice(0,500),notification:c.notification==='in_app'?'in_app':'whatsapp'};
  if(c.source==='indicator'){config.indicator=validateIndicator(c.indicator);const keys=T.calculate([{time:1,open:1,high:1,low:1,close:1,volume:1}],config.indicator).map(s=>s.key);config.plot=c.plot||keys[0];if(!keys.includes(config.plot))bad('Unsupported indicator plot.');}
  return {name:body.name.trim().slice(0,100),symbol:String(body.symbol||'').slice(0,60),watchlistId:body.watchlistId?Number(body.watchlistId):null,config};
}
function matchesCondition(c,current,previous,history,previousInside) {
  if(!Number.isFinite(current))return false;
  const crossedUp=Number.isFinite(previous)&&previous<c.value&&current>=c.value;
  const crossedDown=Number.isFinite(previous)&&previous>c.value&&current<=c.value;
  const inside=current>=c.value&&current<=c.upper;
  switch(c.condition){
    case 'crossing':return crossedUp||crossedDown;
    case 'crossing_up':return crossedUp;
    case 'crossing_down':return crossedDown;
    case 'greater_than':return current>c.value;
    case 'less_than':return current<c.value;
    case 'inside_channel':return inside;
    case 'outside_channel':return !inside;
    case 'entering_channel':return previousInside===false&&inside;
    case 'exiting_channel':return previousInside===true&&!inside;
    default:{const base=history.at(-1-c.bars);if(!Number.isFinite(base))return false;const delta=c.condition.endsWith('_pct')?(base===0?NaN:(current-base)/Math.abs(base)*100):current-base;return c.condition.startsWith('moving_up')?delta>=c.value:delta<=-c.value;}
  }
}
function drawingBounds(kind,p,time) {
  if(kind==='vertical'||kind==='text'||kind==='arrow'||kind==='measure')return null;
  if(kind==='rectangle' && (time<Math.min(p.time,p.time2)||time>Math.max(p.time,p.time2)))return null;
  if(kind==='rectangle')return [Math.min(p.price,p.price2),Math.max(p.price,p.price2)];
  if(kind==='fib')return [0,.236,.382,.5,.618,.786,1].map(level=>p.price+(p.price2-p.price)*level);
  const level=kind==='horizontal'?p.price:p.price+(time-p.time)*(p.price2-p.price)/(p.time2-p.time);
  if(kind==='channel')return [level-p.width/2,level+p.width/2];return [level];
}
module.exports={INTERVALS,CONDITIONS,FREQUENCIES,DRAWINGS,validateIndicator,validateDrawing,validateAlert,matchesCondition,drawingBounds};
