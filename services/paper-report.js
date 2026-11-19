// Account-owned filled-order reports. Filters and totals cover all matching rows.
function reportFilter(input={},userId){
  const values=[userId],where=["user_id=$1","state='filled'"];
  const add=(sql,value)=>{values.push(value);where.push(sql.replace('?', '$'+values.length));};
  const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
  const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value.slice(0,4)>='1900'&&value.slice(0,4)<='2100'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  for(const key of ['from','to'])if(input[key]&&!day(input[key]))invalid('Choose a valid '+key+' date.');
  if(input.from&&input.to&&input.from>input.to)invalid('Start date must be on or before end date.');
  if(input.from)add('filled_at>=?::timestamptz',input.from+'T00:00:00+05:30');
  if(input.to){const next=new Date(Date.parse(input.to+'T00:00:00Z')+86400000).toISOString().slice(0,10);add('filled_at<?::timestamptz',next+'T00:00:00+05:30');}
  for(const [key,allowed,column] of [['product',['intraday','delivery'],'product'],['kind',['equity','futures','options'],"instrument->>'kind'"],['side',['buy','sell'],'side'],['source',['dhan','workspace'],'source']]){
    if(!input[key])continue;
    if(!allowed.includes(input[key]))invalid('Choose a valid '+key+'.');
    add(column+'=?',input[key]);
  }
  if(input.q){if(typeof input.q!=='string'||input.q.length>100)invalid('Search must be 100 characters or fewer.');values.push('%'+input.q.trim().replace(/[\\%_]/g,'\\$&')+'%');const p='$'+values.length;where.push(`(symbol ILIKE ${p} OR instrument->>'name' ILIKE ${p})`);}
  const offset=input.offset==null?0:Number(input.offset);
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000000)invalid('Choose a valid report page.');
  return {where:where.join(' AND '),values,offset};
}
function installPaperReport({app,pool,requireAuth,asyncRoute,publicOrder}){
  app.get('/api/paper/report',requireAuth,asyncRoute(async(req,res)=>{
    const filter=reportFilter(req.query,req.session.user.id);
    const result=await pool.transaction(async()=>{
      const summary=await pool.query(`SELECT COUNT(*)::int AS fills, COUNT(pnl)::int AS exits,
        COUNT(*) FILTER (WHERE pnl>0)::int AS wins, COUNT(*) FILTER (WHERE pnl<0)::int AS losses,
        COALESCE(SUM(pnl),0)::text AS realized,
        COALESCE(SUM(fill_price::numeric*quantity) FILTER (WHERE side='buy'),0)::text AS bought,
        COALESCE(SUM(fill_price::numeric*quantity) FILTER (WHERE side='sell'),0)::text AS sold
        FROM paper_orders WHERE ${filter.where}`,filter.values);
      const rows=await pool.query(`SELECT * FROM paper_orders WHERE ${filter.where} ORDER BY filled_at DESC,id DESC LIMIT 25 OFFSET $${filter.values.length+1}`,[...filter.values,filter.offset]);
      return {summary:summary.rows[0],rows:rows.rows};
    });
    const s=result.summary;
    res.json({trades:result.rows.map(publicOrder),offset:filter.offset,pageSize:25,total:s.fills,
      summary:{fills:s.fills,exits:s.exits,wins:s.wins,losses:s.losses,realized:Number(s.realized)/100,bought:Number(s.bought)/100,sold:Number(s.sold)/100},
      hasMore:filter.offset+result.rows.length<s.fills,timeZone:'Asia/Kolkata'});
  }));
}
module.exports={installPaperReport,reportFilter};
