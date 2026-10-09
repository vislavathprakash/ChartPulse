const { gzipSync, gunzipSync } = require('zlib');
function exportState(market) { return { seed: market.seed, paused: market.paused, instruments: [...market.instruments.values()] }; }
function restoreState(market, state) {
  if (!market || !state) return;
  market.seed = state.seed; market.paused = state.paused;
  market.instruments = new Map(state.instruments.map(i => [i.symbol, i])); market.indicatorCache.clear();
}
const pack = value => gzipSync(Buffer.from(JSON.stringify(value))).toString('base64');
const unpack = value => JSON.parse(gunzipSync(Buffer.from(value, 'base64')).toString());
function applyEvent(market, event) {
  if (!market) return;
  if (event.bootstrap) { restoreState(market, unpack(event.bootstrap)); return; }
  market.seed = event.seed; market.paused = event.paused;
  for (const update of event.candles || []) {
    const instrument = market.instruments.get(update.symbol); if (!instrument) continue;
    const last = instrument.candles.at(-1);
    if (update.candle.time > last.time) instrument.candles.push(update.candle);
    else if (update.candle.time === last.time) instrument.candles[instrument.candles.length - 1] = update.candle;
    if (instrument.candles.length > 1500) instrument.candles.shift();
    instrument.volume = update.volume; instrument.previousClose = update.previousClose; market.indicatorCache.delete(update.symbol);
  }
}
module.exports = { exportState, restoreState, pack, unpack, applyEvent };
