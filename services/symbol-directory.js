// Instrument metadata only. This directory does not supply prices or confer
// market-data entitlements on the TradingView hosted widget.
const bundled=require('../data/bse-equities.json');
let equities=bundled.equities,updatedAt=bundled.updatedAt,refreshing=null,nextRefresh=0;
const groups=new Set(['A','B','T','X','XT','M','MT','Z','ZP','P','TS']);
function refresh(){
  if(refreshing||Date.now()<nextRefresh)return;nextRefresh=Date.now()+24*60*60*1000;
  refreshing=(async()=>{const response=await fetch(bundled.source,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Instrument directory unavailable.');const rows=JSON.parse(require('zlib').gunzipSync(Buffer.from(await response.arrayBuffer())).toString());
    const next=[...new Map(rows.filter(r=>r.segment==='BSE_EQ'&&groups.has(r.instrument_type)&&/^INE/.test(r.isin||'')&&/^[A-Z0-9&_.-]{1,40}$/.test(r.trading_symbol||'')).map(r=>['BSE:'+r.trading_symbol,{symbol:'BSE:'+r.trading_symbol,name:r.name,exchange:'BSE',isin:r.isin}])).values()];
    if(next.length<1000)throw new Error('Incomplete instrument directory.');equities=next;updatedAt=new Date().toISOString();
  })().catch(()=>{nextRefresh=Date.now()+60*60*1000;}).finally(()=>{refreshing=null;});
}
function search(query){
  refresh();const q=String(query||'').trim().toUpperCase().slice(0,80),tokens=q.replace(/^BSE:/,'').split(/\s+/).filter(Boolean);
  const popular=['BSE:RELIANCE','BSE:TATASTEEL','BSE:TCS','BSE:HDFCBANK','BSE:INFY','BSE:SBIN'];
  const rank=row=>row.symbol===q||row.symbol.slice(4)===q?0:row.symbol.slice(4).startsWith(q.replace(/^BSE:/,''))?1:row.name.startsWith(q)?2:3;
  const results=q?equities.filter(row=>tokens.every(t=>(row.symbol+' '+row.name).toUpperCase().includes(t))).sort((a,b)=>rank(a)-rank(b)||a.symbol.localeCompare(b.symbol)).slice(0,12):popular.map(s=>equities.find(r=>r.symbol===s)).filter(Boolean);
  return {results,updatedAt,exchange:'BSE',dataLevel:'end_of_day',source:'Upstox instrument directory'};
}
function find(symbol){return equities.find(r=>r.symbol===symbol);}
module.exports={search,find};
