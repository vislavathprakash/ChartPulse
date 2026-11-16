const dhan = require('./dhan-feed');
const { parseQuery, evaluateQuery } = require('../market-query');
const { installDhanResearch, quoteDepth } = require('./dhan-research');
const { installDhanAlerts } = require('./dhan-alerts');
const istDate = time => new Date(time + 19800000).toISOString().slice(0, 10);
const positive = value => Number.isFinite(value) && value > 0 ? value : null;
const number = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
function tradeDate(value) {
  if (typeof value !== 'string') return null;
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(value);
  const india = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(value);
  const time = Date.parse(local ? `${local[1]}T${local[2]}+05:30` : india ? `${india[3]}-${india[2]}-${india[1]}T${india[4]}+05:30` : value);
  return Number.isFinite(time) && time > 0 && time <= Date.now() + 60000 ? new Date(time).toISOString() : null;
}
async function fetchData(route, body) {
  const auth = dhan.credentials();
  if (!auth) throw new Error('Dhan credentials are missing or invalid in Render.');
  const response = await fetch(`https://api.dhan.co/v2/${route}`, {method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','access-token':auth.token,'client-id':auth.clientId},body:JSON.stringify(body)});
  const data = await response.json().catch(()=>null);
  const code = String(data?.errorCode ?? data?.data?.errorCode ?? '');
  if (!response.ok || !data || data.status === 'failure' || /^DH-\d{3}$/.test(code)) {
    if (code==='DH-901'||response.status===401) throw Object.assign(new Error('Dhan rejected the access token. Renew it in Render to reconnect.'),{code:'DHAN_AUTH'});
    if (code==='DH-902'||response.status===403) throw new Error('Dhan denied Data API access. Check the subscription and account access.');
    throw new Error(`Dhan data request failed (${/^DH-\d{3}$/.test(code)?code:response.status}).`);
  }
  return data;
}

function installPrivateDhan({ app, pool, requireAuth, asyncRoute, enabled }) {
  const ownerId = process.env.DHAN_PRIVATE_OWNER_ID?.trim();
  const ownerEmail = process.env.DHAN_PRIVATE_OWNER_EMAIL?.trim().toLowerCase();
  const configured = enabled && /^[1-9]\d*$/.test(ownerId || '') && Boolean(ownerEmail);
  const allows = user => Boolean(configured && user?.role === 'customer' && String(user.id) === ownerId && user.email?.toLowerCase() === ownerEmail);
  const quotes = new Map();
  const snapshots = new Map(), history = new Map(), requests = new Map();
  let directory = new Map(), snapshotStatus = '', snapshotError = null, nextSnapshot = 0, snapshotRequest;
  let client, starting = false, stopped = false, status = 'Waiting for the Dhan feed to start.';
  let commodityStatus = '', nextContractCheck = 0;
  let catalog = new Map(), catalogLoadedAt=0;
  let defaults=new Set(), pinned=new Set();
  const recent=new Map();
  const publicInstrument=({symbol,name,exchange,expiry})=>({symbol,name,exchange,expiry});
  const lookup=symbol=>directory.get(symbol)??catalog.get(symbol);

  function track(symbols, pin=false) {
    if(!client)return;
    const added=[],removed=[];
    for(const symbol of symbols){
      const item=lookup(symbol);
      if(!item)continue;
      if(pin)pinned.add(item.symbol);
      if(defaults.has(item.symbol))continue;
      recent.delete(item.symbol);
      recent.set(item.symbol,item);
      if(!directory.has(item.symbol)){directory.set(item.symbol,item);added.push(item);}
    }
    while(recent.size>650){
      const victim=[...recent.keys()].find(symbol=>!pinned.has(symbol));
      if(!victim)break;
      removed.push(recent.get(victim));
      recent.delete(victim);
      directory.delete(victim);
      quotes.delete(victim);
      snapshots.delete(victim);
    }
    if(added.length||removed.length){
      client.replace(added.filter(item=>directory.has(item.symbol)),removed);
      nextSnapshot=Math.min(nextSnapshot,lastSnapshotStarted+1100);
    }
  }
  let lastSnapshotStarted=0;

  async function start() {
    if (!configured || starting || stopped || (client && Date.now()<nextContractCheck)) return;
    const auth = dhan.credentials();
    if (!auth) { status = 'Set a valid Dhan Client ID and access token in Render.'; return; }
    starting = true;
    try {
      const { rows } = await pool.query("SELECT id,email,role FROM users WHERE id=$1 AND active=TRUE AND role='customer'", [ownerId]);
      if (!allows(rows[0])) return;
      const [updatedCatalog, commodities] = await Promise.all([
        Date.now()-catalogLoadedAt<86400000 ? null : dhan.readEquities().catch(()=>null),
        dhan.resolveCommodityFutures().catch(()=>null)
      ]);
      if (stopped) return;
      if(updatedCatalog?.size){catalog=updatedCatalog;catalogLoadedAt=Date.now();}
      const equitySymbols=dhan.configuredSymbols(process.env.DHAN_SYMBOLS);
      const equities=catalog.size?equitySymbols.map(symbol=>catalog.get(symbol)).filter(Boolean):
        client?[...directory.values()].filter(i=>i.exchange!=='MCX'&&defaults.has(i.symbol)):await dhan.resolveInstruments(process.env.DHAN_SYMBOLS);
      const today = istDate(Date.now());
      const current = [...directory.values()].filter(i=>i.exchange==='MCX'&&i.expiry>=today);
      const contracts = commodities ?? current;
      commodityStatus = commodities ? '' : 'MCX contract directory unavailable. The server will retry.';
      nextContractCheck = Date.now() + (commodities&&catalog.size ? 3600000 : 60000);
      const saved=await pool.query("SELECT DISTINCT symbol FROM private_dhan_alerts WHERE user_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>NOW()) AND (expiry IS NULL OR expiry>=(NOW() AT TIME ZONE 'Asia/Kolkata')::date)",[ownerId]);
      pinned=new Set(saved.rows.map(row=>row.symbol));
      const nextDefaults=new Set([...equities,...contracts].map(i=>i.symbol));
      if (client && contracts.length===current.length && contracts.every((i,n)=>i.id===current[n].id) &&
        nextDefaults.size===defaults.size && equities.every(i=>i.id===directory.get(i.symbol)?.id)) {
        track(pinned,true);
        return;
      }
      for (const i of directory.values()) {
        if (i.exchange!=='MCX'||contracts.some(c=>c.id===i.id)) continue;
        quotes.delete(i.symbol);
        snapshots.delete(i.symbol);
      }
      const instruments = [...equities,...contracts,...recent.values()];
      defaults=nextDefaults;
      client?.stop();
      nextSnapshot=0;
      directory = new Map(instruments.map(i=>[i.symbol,i]));
      client = dhan.connectFeed({ auth, instruments,
        onStatus: message => { status = message; },
        onQuote: quote => { if (!stopped) quotes.set(quote.symbol, quote); }
      });
      track(pinned,true);
    } catch { status = 'Dhan instrument setup failed. The server will retry.'; }
    finally { starting = false; }
  }

  async function refreshSnapshot() {
    if (!directory.size) return;
    if (snapshotRequest) return snapshotRequest;
    if (Date.now()<nextSnapshot) return;
    lastSnapshotStarted=Date.now();
    nextSnapshot=lastSnapshotStarted+30000;
    const requested = new Map(directory);
    const body={}; for(const i of requested.values())(body[i.segment]??=[]).push(Number(i.id));
    snapshotRequest=(async()=>{
      try {
        const {data}=await fetchData('marketfeed/quote',body);
        if(stopped)return;
        snapshotError=null;
        for(const i of requested.values()) {
          if(directory.get(i.symbol)?.id!==i.id)continue;
          const q=data?.[i.segment]?.[i.id], price=positive(number(q?.last_price)); if(!price)continue;
          const change=number(q.net_change);
          const previous=change!==null&&change!==0?positive(price-change):positive(number(q.ohlc?.close));
          snapshots.set(i.symbol,{quote:{symbol:i.symbol,name:i.name,exchange:i.exchange,price,previous_close:previous,change_pct:previous?(price/previous-1)*100:null,volume:number(q.volume),open:positive(number(q.ohlc?.open)),high:positive(number(q.ohlc?.high)),low:positive(number(q.ohlc?.low)),updated_at:tradeDate(q.last_trade_time),source:'snapshot'}, depth:quoteDepth(q,number)});
        }
        snapshotStatus=snapshots.size?'Dhan quote snapshot. Exchange timestamps are shown when available.':'Dhan returned no quotes for the configured symbols.';
      }catch(err){snapshotError=err.code==='DHAN_AUTH'?'authentication':'unavailable';snapshotStatus=err.message.startsWith('Dhan ')?err.message:'Dhan quote snapshot could not be reached.';nextSnapshot=Date.now()+60000;}
    })();
    try {await snapshotRequest;} finally{snapshotRequest=null;}
  }

  app.use('/api/private-dhan', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  function ownerOnly(req, res, next) {
    if (!allows(req.session.user)) return res.status(404).json({ error: 'Not found.' });
    next();
  }
  app.get('/api/private-dhan/symbols',requireAuth,ownerOnly,asyncRoute(async(req,res)=>{
    const term=typeof req.query.q==='string'?req.query.q.trim().slice(0,80).toUpperCase():'';
    const exchange=typeof req.query.exchange==='string'?req.query.exchange:'';
    const offset=Math.max(0,Math.min(50000,Number.parseInt(req.query.offset,10)||0));
    if(!['','NSE','BSE','MCX'].includes(exchange))return res.status(400).json({error:'Choose NSE, BSE or MCX.'});
    const entries=new Map(catalog);
    for(const item of directory.values())entries.set(item.symbol,item);
    const matches=[];
    for(const item of entries.values()){
      if(exchange&&item.exchange!==exchange)continue;
      const ticker=item.symbol.split(':')[1];
      const rank=!term?0:item.symbol===term||ticker===term?0:ticker.startsWith(term)||item.symbol.startsWith(term)?1:item.name.toUpperCase().startsWith(term)?2:item.name.toUpperCase().includes(term)||item.symbol.includes(term)?3:-1;
      if(rank>=0)matches.push({item,rank});
    }
    matches.sort((a,b)=>a.rank-b.rank||a.item.symbol.localeCompare(b.item.symbol));
    res.json({items:matches.slice(offset,offset+50).map(({item})=>publicInstrument(item)),total:matches.length,ready:catalog.size>0});
  }));
  const alerts=installDhanAlerts({app,pool,requireAuth,ownerOnly,asyncRoute,ownerId,quotes,
    instrument:lookup,onTrack:symbol=>track([symbol],true),connected:()=>Boolean(configured&&client?.isReady())});
  function mergedQuotes() {
    const merged=new Map([...snapshots].map(([symbol,snapshot])=>[symbol,snapshot.quote]));
    for(const q of quotes.values()) {
      const fallback=merged.get(q.symbol);
      if(!fallback||Date.parse(q.updated_at)>=(Date.parse(fallback.updated_at)||0)) {
        const previous=q.previous_close??fallback?.previous_close;
        merged.set(q.symbol,{...q,previous_close:previous??null,change_pct:previous?(q.price/previous-1)*100:null,source:'stream'});
      }
    }
    return merged;
  }
  installDhanResearch({app,requireAuth,ownerOnly,asyncRoute,fetchData,credentials:dhan.credentials,
    instrument:symbol=>{track([symbol]);return lookup(symbol);}, refreshSnapshot, mergedQuotes, snapshot:symbol=>snapshots.get(symbol)?.depth, snapshotMessage:()=>snapshotStatus});
  app.get('/api/private-dhan/quotes', requireAuth, ownerOnly, asyncRoute(async (req, res) => {
    const query = req.query.query;
    const selectedSymbol=typeof req.query.symbol==='string'?req.query.symbol:'';
    const extra=typeof req.query.watch==='string'?req.query.watch.split(',').slice(0,200):[];
    const requested=[...new Set([...defaults,selectedSymbol,...extra])].filter(symbol=>lookup(symbol));
    track([selectedSymbol,...extra]);
    const fresh = q => Boolean(client?.isReady() && q && Date.now()-Date.parse(q.updated_at)<120000);
    const hasFreshStream = [...quotes.values()].some(fresh);
    if (!hasFreshStream||!snapshots.size||requested.some(symbol=>!snapshots.has(symbol)&&!quotes.has(symbol))) await refreshSnapshot();
    const merged=mergedQuotes();
    let rows = requested.map(symbol=>merged.get(symbol)).filter(Boolean);
    if (query !== undefined && query !== '') {
      if (typeof query !== 'string' || query.length > 2000) return res.status(400).json({ error: 'Use a query of up to 2,000 characters.' });
      try { const rule = parseQuery(query); rows = rows.filter(quote => evaluateQuery(rule, quote)); }
      catch (err) { return res.status(400).json({ error: err.message }); }
    }
    const selected=typeof req.query.symbol==='string'?merged.get(req.query.symbol):undefined;
    res.json({
      quotes: rows, selected, connected:hasFreshStream, selectedLive:fresh(quotes.get(req.query.symbol)),
      symbols:requested.map(symbol=>publicInstrument(lookup(symbol))),
      commodityStatus, feedIssue:hasFreshStream?null:snapshotError, stream:client?.diagnostics(),
      status:hasFreshStream?'Dhan WebSocket is streaming.':[snapshotStatus,status].filter(Boolean).join(' ')
    });
  }));

  app.get('/api/private-dhan/history', requireAuth, ownerOnly, asyncRoute(async(req,res)=>{
    const symbol=typeof req.query.symbol==='string'?req.query.symbol:'';
    const i=lookup(symbol), interval=req.query.interval??'day';
    if(!i||!['day','1','5','15','25','60'].includes(interval))return res.status(400).json({error:'Choose a configured symbol and interval.'});
    track([symbol]);
    const key=`${symbol}:${i.id}:${interval}`, now=Date.now(), cached=history.get(key);
    if(cached?.until>now)return res.json(cached.data);
    if(!requests.has(key)){
      if(requests.size>=3)return res.status(429).json({error:'Wait for the current history requests to finish.'});
      const daily=interval==='day', fromDate=istDate(now-(daily?180:5)*86400000), toDate=istDate(now+86400000);
      requests.set(key,(async()=>{
        const commodity = i.instrument==='FUTCOM';
        const raw=await fetchData(daily?'charts/historical':'charts/intraday',{
          securityId:i.id,exchangeSegment:i.segment,instrument:i.instrument??'EQUITY',oi:false,
          fromDate:daily?fromDate:`${fromDate} ${commodity?'09:00:00':'09:15:00'}`,
          toDate:daily?toDate:`${istDate(now)} ${commodity?'23:59:59':'15:30:00'}`,
          ...(daily?{expiryCode:0}:{interval:Number(interval)})
        });
        const candles=(Array.isArray(raw.timestamp)?raw.timestamp:[]).slice(-800).map((time,index,array)=>{const n=raw.timestamp.length-array.length+index;return {time:number(time),open:number(raw.open?.[n]),high:number(raw.high?.[n]),low:number(raw.low?.[n]),close:number(raw.close?.[n]),volume:Math.max(0,number(raw.volume?.[n])??0)};}).filter(c=>c.time>0&&c.time*1000<=Date.now()+86400000&&[c.open,c.high,c.low,c.close].every(x=>positive(x))&&c.high>=Math.max(c.open,c.close,c.low)&&c.low<=Math.min(c.open,c.close)).sort((a,b)=>a.time-b.time);
        const data={symbol,interval,candles};if(history.size>=64&&!history.has(key))history.delete(history.keys().next().value);
        history.set(key,{until:Date.now()+(daily?300000:60000),data});return data;
      })().finally(()=>requests.delete(key)));
    }
    try{res.json(await requests.get(key));}catch(err){res.status(502).json({error:err.message.startsWith('Dhan ')?err.message:'Dhan historical data could not be reached.'});}
  }));

  return { allows, hasSymbol: (user, symbol) => allows(user) && Boolean(lookup(symbol)), alerts, start, stop() { stopped = true; client?.stop(); quotes.clear(); } };
}

module.exports = { installPrivateDhan };
