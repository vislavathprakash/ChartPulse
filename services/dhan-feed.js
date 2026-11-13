const { Readable } = require('node:stream');
const { createInterface } = require('node:readline');
const WebSocket = require('ws');

const MASTER = 'https://images.dhan.co/api-data/api-scrip-master.csv';
const EXCHANGES = { NSE: { segment: 'NSE_EQ', code: 1 }, BSE: { segment: 'BSE_EQ', code: 4 } };
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

async function resolveInstruments(input = DEFAULT_SYMBOLS) {
  const symbols = [...new Set(input.toUpperCase().split(/[\s,]+/).filter(Boolean))];
  if (!symbols.length || symbols.length > 100 || symbols.some(s => !/^(NSE|BSE):[A-Z0-9&._-]{1,40}$/.test(s))) {
    throw new Error('Set DHAN_SYMBOLS to 1–100 NSE: or BSE: equity symbols.');
  }
  const wanted = new Set(symbols), found = new Map();
  const response = await fetch(MASTER, { signal: AbortSignal.timeout(25000), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('Could not download the Dhan instrument directory.');
  const stream = Readable.fromWeb(response.body);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let columns;
  try {
    for await (const line of lines) {
      if (!columns) {
        const headers = csvFields(line.replace(/^\uFEFF/, ''));
        columns = ['SEM_EXM_EXCH_ID','SEM_SEGMENT','SEM_SMST_SECURITY_ID','SEM_INSTRUMENT_NAME','SEM_TRADING_SYMBOL','SEM_CUSTOM_SYMBOL','SEM_SERIES'].map(name => headers.indexOf(name));
        if (columns.some(index => index < 0)) throw new Error('Dhan changed the instrument directory format.');
        continue;
      }
      if (!/^(NSE|BSE),E,/.test(line)) continue;
      const fields = csvFields(line);
      const [exchange, segment, id, instrument, ticker, name, series] = columns.map(i => fields[i]?.trim());
      const symbol = `${exchange}:${ticker}`;
      if (segment !== 'E' || instrument !== 'EQUITY' || !wanted.has(symbol) || !/^\d+$/.test(id || '')) continue;
      if (exchange === 'NSE' && series !== 'EQ') continue;
      const { segment: feedSegment, code } = EXCHANGES[exchange];
      if (!found.has(symbol)) found.set(symbol, { symbol, name: (name || ticker).slice(0, 160), exchange, id, segment: feedSegment, code });
      if (found.size === wanted.size) break;
    }
  } finally { lines.close(); stream.destroy(); }
  const missing = symbols.filter(s => !found.has(s));
  if (missing.length) throw new Error(`Dhan equity symbols not found: ${missing.join(', ')}.`);
  return symbols.map(s => found.get(s));
}

const positive = n => Number.isFinite(n) && n > 0 ? n : null;
function decodePacket(buffer) {
  if (buffer.length < 8) return null;
  const code = buffer.readUInt8(0), segment = buffer.readUInt8(3), id = buffer.readInt32LE(4);
  if (code === 50 && buffer.length >= 10) return { code, reason: buffer.readInt16LE(8) };
  if (code === 6 && buffer.length >= 16) return { code, segment, id, previousClose: positive(buffer.readFloatLE(8)) };
  if (!((code === 4 && buffer.length >= 50) || (code === 8 && buffer.length >= 62))) return null;
  const price = positive(buffer.readFloatLE(8)), tradeTime = buffer.readUInt32LE(14);
  if (!price || !tradeTime || tradeTime * 1000 > Date.now() + 60000) return null;
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
      current.send(JSON.stringify({ RequestCode: 17, InstrumentCount: instruments.length, InstrumentList: instruments.map(i => ({ ExchangeSegment: i.segment, SecurityId: i.id })) }));
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
    current.on('message', (raw, binary) => {
      if (!active()) return;
      lastSignal = Date.now();
      if (!binary) { frames.text++; return; }
      frames.binary++;
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
  return { diagnostics: () => ({open:socket?.readyState===WebSocket.OPEN,...frames}), isReady: () => ready && !stopped && socket?.readyState === WebSocket.OPEN, stop() {
    stopped = true; ready = false; clearTimeout(reconnect); clearInterval(liveness); socket?.terminate();
  } };
}

module.exports = { credentials, resolveInstruments, decodePacket, connectFeed };
