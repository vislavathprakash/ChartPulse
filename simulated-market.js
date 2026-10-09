// Fictional instruments only. This provider never represents exchange quotes.
const T = require('./public/technical-analysis');
class SimulatedMarket {
  constructor() { this.paused = false; this.reset(); }
  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  reset() {
    this.seed = 20261010; this.instruments = new Map(); this.indicatorCache = new Map();
    const end = Math.floor(Date.now() / 60000) * 60;
    for (let i = 0; i < 60; i++) {
      const symbol = `${i < 40 ? 'NSE' : 'BSE'}:SIM${String(i + 1).padStart(3, '0')}`;
      const base = 60 + i * 17; const candles = []; let price = base;
      for (let j = 0; j < 600; j++) {
        const open = price; price = Math.max(1, price * (1 + (this.random() - .5) * .004));
        candles.push({ time: end - (599 - j) * 60, open, close: price, high: Math.max(open, price) * (1 + this.random() * .002), low: Math.min(open, price) * (1 - this.random() * .002), volume: Math.round(1000 + this.random() * 10000) });
      }
      this.instruments.set(symbol, { symbol, name: `Simulated Company ${i + 1}`, exchange: symbol.split(':')[0], provider_symbol: symbol, avg_volume: 2000000, previousClose: price / (1 + ((i % 11) - 5) / 100), candles, volume: 1000000 + i * 100000 });
    }
  }
  step() {
    if (this.paused) return;
    for (const instrument of this.instruments.values()) this.move(instrument, instrument.candles.at(-1).close * (1 + (this.random() - .5) * .0015));
  }
  move(instrument, price, volume = 5000) {
    const last = instrument.candles.at(-1);
    instrument.candles.push({ time: last.time + 60, open: last.close, close: price, high: Math.max(price, last.close) * 1.0005, low: Math.min(price, last.close) * .9995, volume });
    if (instrument.candles.length > 1500) instrument.candles.shift();
    instrument.volume += volume;
    this.indicatorCache.delete(instrument.symbol);
  }
  scenario(symbol, scenario) {
    const instrument = this.instruments.get(symbol);
    if (!instrument) throw new Error('Choose a simulated symbol.');
    const factors = { drop: .955, breakout: 1.05, recovery: 1.005, volume: 1.01 };
    if (!factors[scenario]) throw new Error('Unknown scenario.');
    this.move(instrument, instrument.previousClose * factors[scenario], scenario === 'volume' ? 8000000 : 100000);
  }
  quotes() {
    return [...this.instruments.values()].map(i => {
      const last = i.candles.at(-1);
      return { symbol: i.symbol, price: last.close, change_pct: (last.close / i.previousClose - 1) * 100, volume: i.volume, open: i.previousClose, high: Math.max(i.previousClose, ...i.candles.slice(-60).map(c => c.high)), low: Math.min(i.previousClose, ...i.candles.slice(-60).map(c => c.low)), updated_at: new Date().toISOString() };
    });
  }
  history(symbol, interval) {
    const instrument = this.instruments.get(symbol); if (!instrument) return null;
    const seconds = { '1m':60,'2m':120,'3m':180,'5m':300,'10m':600,'15m':900,'30m':1800,'1h':3600,'2h':7200,'4h':14400,'1D':86400 }[interval];
    if (!seconds) throw new Error('Unsupported candle interval.');
    const groups = new Map();
    for (const c of instrument.candles) {
      const time = Math.floor(c.time / seconds) * seconds; const group = groups.get(time);
      if (!group) groups.set(time, { ...c, time });
      else { group.close = c.close; group.high = Math.max(group.high, c.high); group.low = Math.min(group.low, c.low); group.volume += c.volume; }
    }
    return [...groups.values()];
  }
  technicals(symbol) {
    const instrument=this.instruments.get(symbol);if(!instrument)return {};
    if(!this.indicatorCache.has(symbol))this.indicatorCache.set(symbol,T.snapshot(instrument.candles));
    return this.indicatorCache.get(symbol);
  }
}
module.exports = { SimulatedMarket };
