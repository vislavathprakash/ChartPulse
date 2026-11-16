const { Readable } = require('node:stream');
const { createInterface } = require('node:readline');
const WebSocket = require('ws');

const MASTER = 'https://images.dhan.co/api-data/api-scrip-master.csv';
const COMMODITY_MASTER = 'https://api.dhan.co/v2/instrument/MCX_COMM';
const COMMODITIES = ['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'COPPER'];
const EXCHANGES = { NSE: { segment: 'NSE_EQ', code: 1 }, BSE: { segment: 'BSE_EQ', code: 4 } };
const INDEX_SYMBOLS = ['NSE:NIFTY', 'NSE:BANKNIFTY', 'BSE:SENSEX'];
const DEFAULT_SYMBOLS = 'NSE:RELIANCE,NSE:TCS,NSE:INFY,NSE:HDFCBANK,NSE:SBIN,NSE:ICICIBANK,BSE:RELIANCE,BSE:TCS,BSE:INFY,BSE:HDFCBANK,BSE:SBIN,BSE:ICICIBANK';

function credentials(env = process.env) {
  const token = env.DHAN_ACCESS_TOKEN?.trim(), clientId = env.DHAN_CLIENT_ID?.trim();
  return /^\d{4,32}$/.test(clientId || '') && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token || '') && token.length >= 32 ? { token, clientId } : null;
}

function csvFields(line) {
  const fields = [];
  let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { fields.push(value); value = ''; }
    else value += c;
  }
  fields.push(value);
  return fields;
}

function configuredSymbols(input = DEFAULT_SYMBOLS) {
  const symbols = [...new Set(input.toUpperCase().split(/[\s,]+/).filter(Boolean))];
  if (!symbols.length || symbols.length > 100 || symbols.some(s => !/^(NSE|BSE):[A-Z0-9&._-]{1,40}$/.test(s))) {
    throw new Error('Set DHAN_SYMBOLS to 1–100 NSE: or BSE: equity symbols.');
  }
  return symbols;
}

async function resolveInstruments(input = DEFAULT_SYMBOLS) {
  return readEquities(configuredSymbols(input));
}

async function readEquities(symbols) {
  const wanted = symbols && new Set(symbols), found = new Map(), priorities = new Map();
  const response = await fetch(MASTER, { signal: AbortSignal.timeout(25000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Could not download the Dhan instrument directory.');
  const stream = Readable.fromWeb(response.body);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  let columns;
  try {
    for await (const line of lines) {
      if (!columns) {
        const headers = csvFields(line.replace(/^\uFEFF/, ''));
        columns = ['SEM_EXM_EXCH_ID','SEM_SEGMENT','SEM_SMST_SECURITY_ID','SEM_INSTRUMENT_NAME','SEM_TRADING_SYMBOL','SEM_CUSTOM_SYMBOL','SEM_SERIES','SEM_EXCH_INSTRUMENT_TYPE','SEM_EXPIRY_DATE'].map(name => headers.indexOf(name));
        if (columns.some(index => index < 0)) throw new Error('Dhan changed the instrument directory format.');
        continue;
      }
      if (!(wanted ? /^(NSE|BSE),E,/ : /^(NSE|BSE),[EID],/).test(line)) continue;
      const fields = csvFields(line);
      const [exchange, segment, id, instrument, ticker, name, series, type, expiryValue] = columns.map(i => fields[i]?.trim());
      const symbol = `${exchange}:${ticker}`;
      if (!/^\d+$/.test(id || '') || !ticker) continue;
      const item = { symbol, name: (name || ticker).slice(0, 160), exchange, id, instrument };
      if (segment === 'I' && instrument === 'INDEX') {
        found.set(symbol, { ...item, segment: 'IDX_I', code: 0, kind: 'index' });
        continue;
      }
      if (segment === 'D' && ['FUTIDX','FUTSTK','OPTIDX','OPTSTK'].includes(instrument)) {
        const expiry = expiryValue?.slice(0,10);
        if (!expiry || expiry < today) continue;
        const underlying = ticker.split(/-(?:\d{1,2})?[A-Z]{3}\d{4}-/i)[0];
        const contractSymbol = (instrument.startsWith('OPT') ? `${symbol}_${expiry}` : symbol).toUpperCase();
        found.set(contractSymbol, { ...item, symbol:contractSymbol, expiry, underlying, segment: exchange + '_FNO', code: exchange === 'NSE' ? 2 : 8, kind: instrument.startsWith('FUT') ? 'futures' : 'options' });
        continue;
      }
      if (segment !== 'E' || instrument !== 'EQUITY') continue;
      if (wanted ? !wanted.has(symbol) || (exchange==='NSE'&&series!=='EQ') : type!=='ES'&&!['ETF','REIT','InvITU'].includes(type)) continue;
      const { segment: feedSegment, code } = EXCHANGES[exchange];
      const priority = series==='EQ'?3:['A','B'].includes(series)?2:1;
      if (priority>(priorities.get(symbol)||0)) {
        found.set(symbol, { ...item, kind: 'equity', segment: feedSegment, code });
        priorities.set(symbol,priority);
      }
      if (wanted && found.size === wanted.size) break;
    }
  } finally { lines.close(); stream.destroy(); }
  if (!wanted) return found;
  const missing = symbols.filter(s => !found.has(s));
  if (missing.length) throw new Error(`Dhan equity symbols not found: ${missing.join(', ')}.`);
  return symbols.map(s => found.get(s));
}

async function resolveCommodityFutures(now = Date.now()) {
  const signal = AbortSignal.timeout(10000);
  let response = await fetch(COMMODITY_MASTER, { signal, redirect: 'manual' });
  if (response.status===302) {
    const download = new URL(response.headers.get('location') ?? COMMODITY_MASTER);
    if (download.origin!=='https://s3.ap-south-1.amazonaws.com' || download.pathname!=='/dhan-prod-images/api-data/scrip-master_MCX_COMM.csv') {
      throw new Error('Dhan returned an unexpected MCX directory location.');
    }
    response = await fetch(download, { signal, redirect:'error' });
  }
  if (!response.ok || !response.body) throw new Error('Dhan MCX contract directory unavailable.');
  const stream = Readable.fromWeb(response.body);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const today = new Date(now + 19800000).toISOString().slice(0, 10);
  const contracts = new Map();
  let columns;
  try {
    for await (const line of lines) {
      if (!columns) {
        const header = csvFields(line.replace(/^\uFEFF/, ''));
        columns = ['SECURITY_ID','INSTRUMENT','SYMBOL_NAME','DISPLAY_NAME','SM_EXPIRY_DATE'].map(key=>header.indexOf(key));
        if (columns.includes(-1)) throw new Error('Dhan MCX contract directory format changed.');
        continue;
      }
      const fields = csvFields(line);
      const [id,instrument,ticker,name,expiry] = columns.map(index=>fields[index]?.trim());
      if (instrument!=='FUTCOM' || !COMMODITIES.includes(ticker) || !/^\d+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry<today) continue;
      if (contracts.has(ticker) && contracts.get(ticker).expiry<=expiry) continue;
      contracts.set(ticker,{id,instrument,kind:'futures',symbol:`MCX:${ticker}`,name,expiry,exchange:'MCX',segment:'MCX_COMM',code:5});
    }
  } finally { lines.close(); stream.destroy(); }
  if (!contracts.size) throw new Error('No active MCX contracts were listed by Dhan.');
  return COMMODITIES.map(ticker=>contracts.get(ticker)).filter(Boolean);
}

const positive = n => Number.isFinite(n) && n > 0 ? n : null;
function decodePacket(buffer) {
  if (buffer.length < 8) return null;
  const code = buffer.readUInt8(0), segment = buffer.readUInt8(3), id = buffer.readInt32LE(4);
  if (code === 50 && buffer.length >= 10) return { code, reason: buffer.readInt16LE(8) };
  if (code === 6 && buffer.length >= 16) return { code, segment, id, previousClose: positive(buffer.readFloatLE(8)) };
  if (!((code === 2 && buffer.length >= 16) || (code === 4 && buffer.length >= 50) || (code === 8 && buffer.length >= 62))) return null;
  const price = positive(buffer.readFloatLE(8));
  let tradeTime = buffer.readUInt32LE(code === 2 ? 12 : 14);
  const now = Math.floor(Date.now()/1000), offset = tradeTime-now;
  // The live feed can encode IST wall time as an epoch. Only correct the
  // observed IST offset; arbitrary future timestamps are still rejected.
  if (offset>=19800-120&&offset<=19800+60) tradeTime-=19800;
  if (!price || !tradeTime || tradeTime > now+60) return null;
  if (code === 2) return { code, segment, id, price, tradeTime, volume:null, open:null, high:null, low:null };
  const depthOffset = code === 8 ? 12 : 0;
  return { code, segment, id, price, tradeTime, volume: buffer.readUInt32LE(22), open: positive(buffer.readFloatLE(34+depthOffset)), high: positive(buffer.readFloatLE(42+depthOffset)), low: positive(buffer.readFloatLE(46+depthOffset)) };
}

const disconnectMessages = {
  804: 'Dhan rejected the instrument count.', 805: 'Dhan reported a connection limit. Close unused Dhan feed connections.',
  806: 'Dhan Data API access is not active.', 807: 'Dhan access token expired.',
  808: 'Dhan rejected the client ID or access token.', 809: 'Dhan access token is invalid.', 810: 'Dhan client ID is invalid.',
  813: 'Dhan rejected a security ID.', 814: 'Dhan rejected the subscription request.'
};
const stopReasons = new Set([804, 806, 807, 808, 809, 810, 813, 814]);

function connectFeed({ auth, instruments, onQuote, onStatus }) {
  const instrumentByKey = new Map(instruments.map(item => [`${item.code}:${Number(item.id)}`, item]));
  let socket, reconnect, liveness, stopped = false, blocked = false, attempts = 0, message = '', ready = false;
  const counters = () => ({binary:0,text:0,quote:0,previousClose:0,unmatched:0,unparsed:0,shapes:{},futureOffsetSeconds:null});
  let frames = counters();
  const keyOf=i=>`${i.code}:${Number(i.id)}`;
  function send(requestCode,items) {
    if(socket?.readyState!==WebSocket.OPEN)return;
    for(let offset=0;offset<items.length;offset+=100){
      const batch=items.slice(offset,offset+100);
      socket.send(JSON.stringify({RequestCode:requestCode,InstrumentCount:batch.length,InstrumentList:batch.map(i=>({ExchangeSegment:i.segment,SecurityId:i.id}))}));
    }
  }

  function subscriptions(items, subscribe) {
    send(subscribe ? 15 : 16, items.filter(i => i.kind === 'index'));
    send(subscribe ? 17 : 18, items.filter(i => i.kind !== 'index'));
  }

  function open() {
    if (stopped || blocked) return;
    const url = new URL('wss://api-feed.dhan.co/');
    url.search = new URLSearchParams({ version: '2', token: auth.token, clientId: auth.clientId, authType: '2' });
    const closes = new Map(), latest = new Map();
    ready = false; message = ''; frames = counters();
    onStatus('Connecting to DhanHQ.', false);
    const current = new WebSocket(url, { handshakeTimeout: 10000, maxPayload: 64 * 1024, followRedirects: false, perMessageDeflate: false });
    socket = current;
    let lastSignal = Date.now();
    const active = () => !stopped && current === socket;
    current.on('open', () => {
      if (!active()) return;
      lastSignal = Date.now();
      onStatus('Subscribed to DhanHQ. Waiting for quotes.', false);
      subscriptions([...instrumentByKey.values()], true);
      liveness = setInterval(() => { if (active() && Date.now() - lastSignal > 45000) current.terminate(); }, 10000);
      liveness.unref();
    });
    current.on('ping', () => { lastSignal = Date.now(); });
    current.on('unexpected-response', (_request, response) => {
      if (!active()) { response.resume(); return; }
      if (response.statusCode === 401 || response.statusCode === 403) {
        blocked = true;
        message = 'Dhan rejected the feed connection. Check the access token, Data API access, and account settings.';
      } else if (response.statusCode === 429) {
        attempts = Math.max(attempts, 6);
        message = 'Dhan rate limited the feed connection. Retrying with a delay.';
      }
      response.resume(); current.terminate();
    });
    function consume(raw) {
      const packet = decodePacket(raw);
      if (!packet) {
        frames.unparsed++;
        const type=raw[0], shape=`${type}:${raw.length}`;
        if (Object.hasOwn(frames.shapes,shape)||Object.keys(frames.shapes).length<16) frames.shapes[shape]=(frames.shapes[shape]||0)+1;
        if ((type===4||type===8)&&raw.length>=18) {
          const offset=raw.readUInt32LE(14)-Math.floor(Date.now()/1000);
          if (offset>60) frames.futureOffsetSeconds=offset;
        }
        return;
      }
      if (packet.code === 50) {
        message = disconnectMessages[packet.reason] || `Dhan disconnected the market feed (${packet.reason}).`;
        blocked = stopReasons.has(packet.reason);
        if (packet.reason === 805) attempts = Math.max(attempts, 6);
        current.close();
        return;
      }
      const key = `${packet.segment}:${packet.id}`, instrument = instrumentByKey.get(key);
      if (!instrument) { frames.unmatched++; return; }
      if(packet.code===6)frames.previousClose++;else frames.quote++;
      if (packet.code === 6) {
        if (!packet.previousClose || closes.get(key) === packet.previousClose) return;
        closes.set(key, packet.previousClose);
      } else {
        if ((latest.get(key)?.tradeTime || 0) > packet.tradeTime) return;
        latest.set(key, packet);
      }
      const quote = latest.get(key);
      if (!quote) return;
      const close = closes.get(key) ?? null;
      ready = true; attempts = 0;
      onQuote({ symbol: instrument.symbol, exchange: instrument.exchange, name: instrument.name, price: quote.price, previous_close: close,
        change_pct: close ? (quote.price - close) / close * 100 : null, volume: quote.volume, avg_volume: null,
        open: quote.open, high: quote.high, low: quote.low, updated_at: new Date(quote.tradeTime * 1000).toISOString() });
    }
    current.on('message', (raw, binary) => {
      if (!active()) return;
      lastSignal = Date.now();
      if (!binary) { frames.text++; return; }
      frames.binary++;
      // A WebSocket message can carry multiple Dhan response packets.
      const lengths = {2:16,4:50,5:12,6:16,8:162,50:10};
      for(let at=0;at+8<=raw.length&&active()&&current.readyState===WebSocket.OPEN;){
        const size=lengths[raw[at]]||raw.readUInt16LE(at+1);
        if(size<8||at+size>raw.length){consume(raw.subarray(at));break;}
        consume(raw.subarray(at,at+size));at+=size;
      }
    });
    current.on('error', () => { if (active() && !message) message = 'Could not open the DhanHQ market feed. Check credentials and Data API access.'; });
    current.on('close', () => {
      if (!active()) return;
      ready = false; clearInterval(liveness);
      onStatus(message || 'DhanHQ feed disconnected. Reconnecting.', false);
      if (!blocked) {
        reconnect = setTimeout(open, Math.min(60000, 1500 * 2 ** Math.min(attempts++, 6)) + Math.random() * 700);
        reconnect.unref();
      }
    });
  }
  open();
  return { replace(added,removed){
    for(const i of removed)instrumentByKey.delete(keyOf(i));
    for(const i of added)instrumentByKey.set(keyOf(i),i);
    subscriptions(removed, false);
    subscriptions(added, true);
  }, diagnostics: () => ({open:socket?.readyState===WebSocket.OPEN,...frames}), isReady: () => ready && !stopped && socket?.readyState === WebSocket.OPEN, stop() {
    stopped = true; ready = false; clearTimeout(reconnect); clearInterval(liveness); socket?.terminate();
  } };
}

module.exports = { INDEX_SYMBOLS, credentials, configuredSymbols, readEquities, resolveInstruments, resolveCommodityFutures, decodePacket, connectFeed };
