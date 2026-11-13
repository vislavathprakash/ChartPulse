const dhan = require('./dhan-feed');
const { parseQuery, evaluateQuery } = require('../market-query');

function installPrivateDhan({ app, pool, requireAuth, asyncRoute, enabled }) {
  const ownerId = process.env.DHAN_PRIVATE_OWNER_ID?.trim();
  const ownerEmail = process.env.DHAN_PRIVATE_OWNER_EMAIL?.trim().toLowerCase();
  const configured = enabled && /^[1-9]\d*$/.test(ownerId || '') && Boolean(ownerEmail);
  const allows = user => Boolean(configured && user?.role === 'customer' && String(user.id) === ownerId && user.email?.toLowerCase() === ownerEmail);
  const quotes = new Map();
  let client, starting = false, stopped = false, status = 'Waiting for the Dhan feed to start.';

  async function start() {
    if (!configured || starting || stopped || client) return;
    const auth = dhan.credentials();
    if (!auth) { status = 'Set a valid Dhan Client ID and access token in Render.'; return; }
    starting = true;
    try {
      const { rows } = await pool.query("SELECT id,email,role FROM users WHERE id=$1 AND active=TRUE AND role='customer'", [ownerId]);
      if (!allows(rows[0])) return;
      const instruments = await dhan.resolveInstruments(process.env.DHAN_SYMBOLS);
      if (stopped) return;
      client = dhan.connectFeed({ auth, instruments,
        onStatus: message => { status = message; },
        onQuote: quote => { if (!stopped) quotes.set(quote.symbol, quote); }
      });
    } catch { status = 'Dhan instrument setup failed. The server will retry.'; }
    finally { starting = false; }
  }

  app.use('/api/private-dhan', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  function ownerOnly(req, res, next) {
    if (!allows(req.session.user)) return res.status(404).json({ error: 'Not found.' });
    next();
  }
  app.get('/api/private-dhan/quotes', requireAuth, ownerOnly, asyncRoute(async (req, res) => {
    const query = req.query.query;
    let rows = [...quotes.values()];
    if (query !== undefined && query !== '') {
      if (typeof query !== 'string' || query.length > 2000) return res.status(400).json({ error: 'Use a query of up to 2,000 characters.' });
      try { const rule = parseQuery(query); rows = rows.filter(quote => evaluateQuery(rule, quote)); }
      catch (err) { return res.status(400).json({ error: err.message }); }
    }
    const connected = Boolean(client?.isReady());
    res.json({ quotes: rows, connected, status: connected ? 'Dhan connected. Check trade timestamps for quote freshness.' : status });
  }));

  return { allows, start, stop() { stopped = true; client?.stop(); quotes.clear(); } };
}

module.exports = { installPrivateDhan };
