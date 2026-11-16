const { csvFields } = require('./dhan-feed');

const nseCsv = file => 'https://www.niftyindices.com/IndexConstituent/' + file;
const sensexPage = 'https://www.bseindices.com/constituents/code/16';
const indices = new Map([
  ['NSE:NIFTY', { name:'Nifty 50', url:nseCsv('ind_nifty50list.csv') }],
  ['NSE:BANKNIFTY', { name:'Bank Nifty', url:nseCsv('ind_niftybanklist.csv') }],
  ['BSE:SENSEX', { name:'Sensex', url:'https://www.bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=16', link:sensexPage }],
  ['NSE:NIFTYNXT50', { name:'Nifty Next 50', url:nseCsv('ind_niftynext50list.csv') }],
  ['NSE:NIFTYIT', { name:'Nifty IT', url:nseCsv('ind_niftyitlist.csv') }]
]);

async function readConstituents(index) {
  const response=await fetch(index.url,{signal:AbortSignal.timeout(7000),redirect:'error'});
  if(!response.ok)throw new Error('Index publisher unavailable.');
  if(index.link){
    const {Table}=await response.json();
    return Table.map(row=>({id:String(row.SCRIP_CODE),name:row.SCRIPNAME,industry:row.Industry_name,asOf:row.TransDate?.slice(0,10)}));
  }
  const [header,...lines]=(await response.text()).trim().split(/\r?\n/).map(csvFields);
  const columns=['Company Name','Industry','Symbol'].map(name=>header.findIndex(value=>value.replace(/^\uFEFF/,'').trim()===name));
  if(columns.includes(-1))throw new Error('Index constituent format changed.');
  return lines.map(row=>{
    const [name,industry,ticker]=columns.map(column=>row[column]?.trim());
    return {symbol:'NSE:'+ticker,name,industry};
  });
}

function installDhanConstituents({app,requireAuth,ownerOnly,asyncRoute,getEquities}) {
  const cache=new Map(), pending=new Map();
  const available=[...indices].map(([symbol,{name}])=>({symbol,name}));
  app.get('/api/private-dhan/constituents',requireAuth,ownerOnly,asyncRoute(async(req,res)=>{
    const symbol=req.query.index??available[0].symbol;
    const index=indices.get(symbol);
    if(!index)return res.status(400).json({error:'Choose a supported stock index.'});
    if(!getEquities().size)return res.status(503).json({error:'Dhan’s instrument directory is still loading.'});
    const earlier=cache.get(symbol);
    if(!earlier||Date.now()-earlier.checkedAt>=86400000){
      if(!pending.has(symbol)){
        pending.set(symbol,readConstituents(index).then(rows=>{
          const unique=new Map(rows.filter(row=>row.name&&(row.symbol||/^\d+$/.test(row.id))).map(row=>[row.id??row.symbol,row]));
          if(!unique.size||unique.size>200)throw new Error('Unexpected index constituent count.');
          const record={rows:[...unique.values()],checkedAt:Date.now()};
          cache.set(symbol,record);
          return record;
        }).finally(()=>pending.delete(symbol)));
      }
      try{await pending.get(symbol);}catch{
        if(!earlier)return res.status(502).json({error:'The index publisher did not return constituents. Try again shortly.'});
      }
    }
    const record=cache.get(symbol);
    const equities=getEquities();
    const bse=index.link?new Map([...equities.values()].filter(i=>i.kind==='equity'&&i.exchange==='BSE').map(i=>[i.id,i])):null;
    const items=record.rows.map(row=>{
      const i=row.symbol?equities.get(row.symbol):bse.get(row.id);
      return {symbol:i?.symbol??null,displaySymbol:i?.symbol??row.symbol??row.id,name:row.name,industry:row.industry};
    });
    res.json({symbol,indices:available,items,asOf:record.rows[0].asOf,stale:Date.now()-record.checkedAt>=86400000,source:index.link??index.url});
  }));
}
module.exports={installDhanConstituents};
