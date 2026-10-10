require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const http = require('http');
const { Runtime } = require('./services/runtime');
const { installGateway, allowedOrigin } = require('./services/gateway');
const { processNotifications } = require('./services/delivery');
const {emailReady,externalEmailEnabled,applicationOrigin,sendEmail,hashToken}=require('./services/email');
const {googleReady,installGoogleAuth}=require('./services/google-auth');
const metrics = require('./services/metrics');
const { createPool } = require('./database');
const { SimulatedMarket } = require('./simulated-market');
const isSimulated = (process.env.MARKET_DATA_PROVIDER || 'simulated') === 'simulated';
const simulation = isSimulated ? new SimulatedMarket() : null;
const dataLabel = isSimulated ? 'SIMULATED DATA — fictional instruments; not NSE/BSE quotes' : 'Licensed provider data';
const bcrypt = require('./services/passwords');
const crypto = require('crypto');
const path = require('path');
const { parseQuery, evaluateQuery } = require('./market-query');
const { installWorkspace } = require('./chart-workspace-api');
const { installCalendar } = require('./calendar-api');
const { validateDrawing, drawingBounds, matchesCondition } = require('./chart-domain');

const app = express();
const pool = createPool();
const PORT = process.env.PORT || 3000;
const marketRuntime = { connected: false, lastTickAt: null, error: null, client: null, symbols: new Map() };
const runtime = new Runtime({pool,simulation,isSimulated,marketRuntime});
const shardMatches = userId => Number(userId) % runtime.shards === runtime.shard;
const providerRecords = [];
const screenerCache = new Map(), parsedRules = new Map();
app.use(metrics.middleware);
app.use((req,res,next)=>{res.set('Referrer-Policy','no-referrer');next();});
app.use((req,res,next)=>{if(runtime.role==='gateway'&&req.path!=='/api/health')return res.status(404).json({error:'Gateway endpoint not found.'});next();});
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use((req,res,next)=>{
  if(req.path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&!allowedOrigin(req))return res.status(403).json({error:'Origin is not allowed.'});
  next();
});
app.use((req,res,next)=>{res.once('finish',()=>{
  if(res.statusCode<300&&req.method!=='GET'&&req.session?.user?.role==='customer'&&/^\/api\/(technical-alerts|drawings|alert-rules)/.test(req.path))runtime.requestEvaluation(req.session.user.id).catch(err=>runtime.error('baseline',err));
});next();});
function portalSession(portal) { return session({
  name: `chartpulse.${portal}.sid`,
  store: new PgSession({ pool, createTableIfMissing: true, disableTouch: true }),
  secret: crypto.createHmac('sha256', process.env.SESSION_SECRET || 'local-demo-secret-change-me').update(portal).digest('hex'),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: portal==='admin'?8*60*60*1000:7 * 24 * 60 * 60 * 1000 }
}); }
const customerSession = portalSession('customer'), adminSession = portalSession('admin');
app.use((req, res, next) => (req.path.toLowerCase().startsWith('/api/admin/') ? adminSession : customerSession)(req, res, next));
app.use(require('./services/request-limits').requestLimits(runtime));
app.get('/', (req, res) => res.redirect('/app'));
app.get(['/app', '/app/login', '/app/register'], (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get(['/admin', '/admin/login'], (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

async function setup() {
  if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || (['standalone','api'].includes(runtime.role)&&(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD)))) throw new Error('SESSION_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD must be configured in production.');
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer',
    active BOOLEAN NOT NULL DEFAULT TRUE, whatsapp_phone TEXT, whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    webhook_token TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_token TEXT UNIQUE');
  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS google_login_flows(state_hash TEXT PRIMARY KEY,session_id TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,link_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);
    CREATE INDEX IF NOT EXISTS google_flow_expiry_idx ON google_login_flows(expires_at);
    CREATE TABLE IF NOT EXISTS email_verifications(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT UNIQUE NOT NULL,email TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
  await pool.query(`CREATE TABLE IF NOT EXISTS saved_queries (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, query_text TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, query_text TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_seconds INTEGER NOT NULL DEFAULT 900, last_match_symbols TEXT[] NOT NULL DEFAULT '{}',
    last_event_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    symbol TEXT, title TEXT NOT NULL, detail TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'app',
    status TEXT NOT NULL DEFAULT 'logged', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ,
    event_key TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('ALTER TABLE alerts ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE alerts ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_requested BOOLEAN NOT NULL DEFAULT TRUE');
  await pool.query(`CREATE TABLE IF NOT EXISTS drawings (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL, kind TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS market_symbols (
    symbol TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', exchange TEXT NOT NULL,
    provider_symbol TEXT NOT NULL UNIQUE, provider_symbol_id TEXT, avg_volume DOUBLE PRECISION,
    active BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS market_quotes (
    symbol TEXT PRIMARY KEY REFERENCES market_symbols(symbol) ON DELETE CASCADE,
    price DOUBLE PRECISION NOT NULL, change_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
    volume DOUBLE PRECISION NOT NULL DEFAULT 0, open DOUBLE PRECISION, high DOUBLE PRECISION, low DOUBLE PRECISION,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query("ALTER TABLE market_symbols ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'licensed'");
  await workspace.setup();
  if (['api','standalone'].includes(runtime.role) && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await pool.query(`INSERT INTO users (email,name,password_hash,role) VALUES ($1,'Administrator',$2,'admin') ON CONFLICT (email) DO UPDATE SET role='admin',password_hash=EXCLUDED.password_hash,active=TRUE`, [process.env.ADMIN_EMAIL.toLowerCase(), hash]);
  }
  const { rows: noToken } = await pool.query('SELECT id FROM users WHERE webhook_token IS NULL');
  for (const user of noToken) await pool.query('UPDATE users SET webhook_token=$1 WHERE id=$2', [crypto.randomBytes(32).toString('hex'), user.id]);
  const { rows: symbols } = await pool.query('SELECT symbol,provider_symbol,provider_symbol_id FROM market_symbols WHERE active=TRUE');
  marketRuntime.symbols = new Map(); symbols.forEach(row => { marketRuntime.symbols.set(row.provider_symbol, row.symbol); if (row.provider_symbol_id) marketRuntime.symbols.set(String(row.provider_symbol_id), row.symbol); });
}

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
async function sessionUser(req, role) {
  if (!req.session.user || req.session.portal !== role) return null;
  const { rows } = await pool.query('SELECT * FROM users WHERE id=$1 AND active=TRUE AND role=$2', [req.session.user.id, role]);
  if (!rows[0]) { req.session.destroy(() => {}); return null; }
  req.session.user = publicUser(rows[0]); return req.session.user;
}
function requirePortal(role) { return asyncRoute(async (req, res, next) => {
  if (!await sessionUser(req, role)) return res.status(401).json({ error: `Please sign in to the ${role} portal. Your account must be active.` });
  next();
}); }
const requireAuth = requirePortal('customer'), requireAdminAuth = requirePortal('admin');
function publicUser(user) { return { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified:user.email_verified===true,emailOptIn:user.email_opt_in===true,googleLinked:Boolean(user.google_sub),whatsappPhone: user.whatsapp_phone || '', whatsappOptIn: user.whatsapp_opt_in || false, webhookToken: user.webhook_token || '' }; }
function regenerateSession(req) { return new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve())); }
function deliveryStatus(optIn,notification='whatsapp') { return isSimulated ? 'simulated' : ['whatsapp','all'].includes(notification) && optIn && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME ? 'queued' : 'logged'; }
const workspace = installWorkspace({app,pool,requireAuth,asyncRoute,simulation,isSimulated,deliveryStatus,requestEvaluation:()=>runtime.role==='standalone'?runtime.evaluateCurrent():Promise.resolve(),shardMatches,evaluationKey:()=>runtime.evaluationKey,evaluationScope:()=>({shards:runtime.shards,shard:runtime.shard,users:runtime.baselineUsers,symbols:runtime.changedSymbols})});
const calendar=installCalendar({app,pool,requireAuth,requireAdminAuth,asyncRoute,deliveryStatus,runtime});
function enrichQuote(row) { return row; }

app.get('/api/health', asyncRoute(async (req, res) => { await pool.query('SELECT 1'); res.json({ ok: true, marketReady: marketEntitled() && marketRuntime.connected }); }));
function marketEntitled() { return isSimulated || process.env.MARKET_DATA_PROVIDER === 'truedata' && process.env.MARKET_DATA_REDISPLAY_APPROVED === 'true' && (!['standalone','ingestion'].includes(runtime.role) || Boolean(process.env.TRUEDATA_USERNAME&&process.env.TRUEDATA_PASSWORD)); }
function portalMetadata() { return { simulated: isSimulated, dataLabel, whatsappMode: isSimulated ? 'simulated delivery' : 'WhatsApp Business', marketMode: process.env.MARKET_DATA_PROVIDER || 'simulated', market: process.env.MARKET_DATA_MARKET || null, marketReady: marketEntitled() && marketRuntime.connected, marketConfigured: Boolean(isSimulated || (process.env.TRUEDATA_USERNAME && process.env.TRUEDATA_PASSWORD)), marketRedistributionApproved: process.env.MARKET_DATA_REDISPLAY_APPROVED === 'true', marketConnected: marketRuntime.connected, whatsappReady: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME), chartMode: isSimulated ? 'Interactive simulated chart' : 'TradingView embedded chart' }; }
app.get('/api/me', asyncRoute(async (req,res) => res.json({user:await sessionUser(req,'customer'),...portalMetadata(),googleReady:googleReady(),emailReady:emailReady(),emailSimulated:!externalEmailEnabled()})));
app.get('/api/admin/me', asyncRoute(async (req,res) => res.json({user:await sessionUser(req,'admin'),...portalMetadata()})));

app.post('/api/register', asyncRoute(async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 10 || !name?.trim()) return res.status(400).json({ error: 'Enter your name, a valid email, and a password with at least 10 characters.' });
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query('INSERT INTO users(email,name,password_hash,webhook_token) VALUES($1,$2,$3,$4) RETURNING *', [email.toLowerCase().trim(), name.trim(), hash, crypto.randomBytes(32).toString('hex')]);
    await regenerateSession(req);
    req.session.portal = 'customer'; req.session.user = publicUser(rows[0]); res.status(201).json({ user: req.session.user });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' }); throw e; }
}));
function login(role) { return asyncRoute(async (req,res) => {
  const {email,password}=req.body || {};
  if(typeof email!=='string' || typeof password!=='string') return res.status(400).json({error:'Enter your email and password.'});
  const {rows}=await pool.query('SELECT * FROM users WHERE email=$1 AND active=TRUE',[email.toLowerCase().trim()]);
  if(!rows[0]?.password_hash || !await bcrypt.compare(password,rows[0].password_hash)) return res.status(401).json({error:'Email or password is incorrect. Google accounts should use Continue with Google.'});
  if(rows[0].role!==role) return res.status(403).json({error:'This account cannot access this portal. Use the '+rows[0].role+' login.'});
  await regenerateSession(req); req.session.portal=role; req.session.user=publicUser(rows[0]); res.json({user:req.session.user});
}); }
app.post('/api/login',login('customer'));
app.post('/api/admin/login',login('admin'));
installGoogleAuth({app,pool,asyncRoute,requireAuth,publicUser,regenerateSession});
function logout(portal) { return (req,res,next) => req.session.destroy(err => {
  if(err) return next(err); res.clearCookie('chartpulse.'+portal+'.sid',{path:'/'}); res.json({ok:true});
}); }
app.post('/api/logout',requireAuth,asyncRoute(async(req,res,next)=>{await runtime.notify(req.session.user.id,{type:'revoked',sessionId:req.sessionID});logout('customer')(req,res,next);}));
app.post('/api/admin/logout',logout('admin'));

app.get('/api/market/status', requireAuth, (req, res) => res.json({ configured: Boolean(isSimulated || (process.env.TRUEDATA_USERNAME && process.env.TRUEDATA_PASSWORD)), redistributionApproved: process.env.MARKET_DATA_REDISPLAY_APPROVED === 'true', connected: marketRuntime.connected, lastTickAt: marketRuntime.lastTickAt, symbolCount: marketRuntime.symbols.size, provider: process.env.MARKET_DATA_PROVIDER || null, market: process.env.MARKET_DATA_MARKET || null, simulated: isSimulated, dataLabel, message: isSimulated ? dataLabel : marketEntitled() ? (marketRuntime.connected ? 'Live feed connected.' : marketRuntime.error || 'Feed has not connected yet.') : 'TrueData account and explicit market-data redistribution approval are required before enabling the shared customer feed.' }));
app.get('/api/stocks', requireAuth, asyncRoute(async (req, res) => {
  if (!marketEntitled() || !marketRuntime.connected) return res.status(503).json({ error: 'Live NSE/BSE feed is not enabled. Complete TrueData account setup and obtain written exchange redistribution approval.' });
  const rows = runtime.getQuotes();
  res.json({ snapshot: runtime.sequence, data: rows.map(enrichQuote), technicalInterval: isSimulated ? '1m' : null, simulated: isSimulated, dataLabel, provider: isSimulated ? 'simulated' : 'TrueData', market: process.env.MARKET_DATA_MARKET, lastTickAt: marketRuntime.lastTickAt });
}));
app.post('/api/screen', requireAuth, asyncRoute(async (req, res) => {
  if (!marketEntitled() || !marketRuntime.connected) return res.status(503).json({ error: 'Live NSE/BSE feed is not enabled. Complete TrueData account setup and obtain written exchange redistribution approval.' });
  let ast; try { ast = parseQuery(req.body.query); } catch (err) { return res.status(400).json({ error: err.message }); }
  if(typeof req.body.query!=='string'||req.body.query.length>2000)return res.status(400).json({error:'Query must contain at most 2,000 characters.'});
  const key=runtime.sequence+':'+req.body.query.trim();
  let data=screenerCache.get(key);
  if(!data){data=runtime.getQuotes().filter(row=>evaluateQuery(ast,row));if(screenerCache.size>=128)screenerCache.delete(screenerCache.keys().next().value);screenerCache.set(key,data);}
  res.json({ snapshot: runtime.sequence, data, count: data.length, market: process.env.MARKET_DATA_MARKET, simulated: isSimulated, dataLabel, provider: isSimulated ? 'simulated' : 'TrueData', lastTickAt: marketRuntime.lastTickAt, explanation: `${data.length} matching instruments · ${process.env.MARKET_DATA_MARKET} · updated ${marketRuntime.lastTickAt ? new Date(marketRuntime.lastTickAt).toLocaleTimeString() : '—'}` });
}));
app.post('/api/queries', requireAuth, asyncRoute(async (req, res) => {
  const { name, query } = req.body || {};
  if (!name?.trim() || !query?.trim()) return res.status(400).json({ error: 'Name and query are required.' });
  try { parseQuery(query); } catch (err) { return res.status(400).json({error:err.message}); }
  const { rows } = await pool.query('INSERT INTO saved_queries(user_id,name,query_text) VALUES($1,$2,$3) RETURNING *', [req.session.user.id, name.trim(), query.trim()]); res.status(201).json({ query: rows[0] });
}));
app.get('/api/queries', requireAuth, asyncRoute(async (req, res) => { const { rows } = await pool.query('SELECT * FROM saved_queries WHERE user_id=$1 ORDER BY created_at DESC', [req.session.user.id]); res.json({ queries: rows }); }));
app.get('/api/alerts', requireAuth, asyncRoute(async (req, res) => { const { rows } = await pool.query(`SELECT a.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('channel',j.channel,'status',j.status,'attempts',j.attempts)) FROM notification_jobs j WHERE j.alert_id=a.id),'[]'::jsonb) AS deliveries FROM alerts a WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT 30`, [req.session.user.id]); res.json({ alerts: rows }); }));
app.get('/api/alert-rules', requireAuth, asyncRoute(async (req, res) => { const { rows } = await pool.query('SELECT * FROM alert_rules WHERE user_id=$1 ORDER BY created_at DESC', [req.session.user.id]); res.json({ rules: rows }); }));
app.post('/api/alert-rules', requireAuth, asyncRoute(async (req, res) => {
  const { name, query } = req.body || {};
  if (!name?.trim() || !query?.trim()) return res.status(400).json({ error: 'Alert name and screener query are required.' });
  try { parseQuery(query); } catch (err) { return res.status(400).json({ error: err.message }); }
  const { rows } = await pool.query('INSERT INTO alert_rules(user_id,name,query_text) VALUES($1,$2,$3) RETURNING *', [req.session.user.id, name.trim(), query.trim()]);
  res.status(201).json({ rule: rows[0] });
}));
app.patch('/api/alert-rules/:id', requireAuth, asyncRoute(async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Enabled must be true or false.' });
  const { rows } = await pool.query('UPDATE alert_rules SET enabled=$1 WHERE id=$2 AND user_id=$3 RETURNING *', [req.body.enabled, req.params.id, req.session.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Alert rule not found.' }); res.json({ rule: rows[0] });
}));
app.delete('/api/alert-rules/:id', requireAuth, asyncRoute(async (req, res) => { const result = await pool.query('DELETE FROM alert_rules WHERE id=$1 AND user_id=$2', [req.params.id, req.session.user.id]); if (!result.rowCount) return res.status(404).json({ error: 'Alert rule not found.' }); res.json({ ok: true }); }));
app.post('/api/drawings', requireAuth, asyncRoute(async (req, res) => {
  const { symbol, kind } = req.body || {};
  await workspace.requireSymbol(symbol);
  const raw = req.body.payload || {};
  const payload = validateDrawing(kind,{...raw,time:raw.time ?? simulation?.instruments.get(symbol)?.candles.at(-1).time ?? Date.now()/1000});
  const { rows } = await pool.query('INSERT INTO drawings(user_id,symbol,kind,payload) VALUES($1,$2,$3,$4) RETURNING *', [req.session.user.id, symbol, kind, payload]); res.status(201).json({ drawing: rows[0] });
}));
app.get('/api/drawings/:symbol', requireAuth, asyncRoute(async (req, res) => { const { rows } = await pool.query('SELECT * FROM drawings WHERE user_id=$1 AND symbol=$2 ORDER BY id', [req.session.user.id, req.params.symbol]); res.json({ drawings: rows }); }));
app.patch('/api/drawings/:id',requireAuth,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query('SELECT * FROM drawings WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);
  if(!rows[0])return res.status(404).json({error:'Drawing not found.'});
  const payload=validateDrawing(rows[0].kind,{...rows[0].payload,...req.body.payload});
  const result=await pool.query('UPDATE drawings SET payload=$1 WHERE id=$2 AND user_id=$3 RETURNING *',[payload,req.params.id,req.session.user.id]);res.json({drawing:result.rows[0]});
}));
app.patch('/api/preferences', requireAuth, asyncRoute(async (req, res) => {
  const phone = String(req.body.phone || '').replace(/[^+\d]/g, '').slice(0, 18);
  const consent = req.body.whatsappOptIn === true;
  const digits = phone.replace(/\D/g, '');
  if (consent && (digits.length < 8 || digits.length > 15)) return res.status(400).json({ error: 'Enter a valid international number before opting in to WhatsApp alerts.' });
  const { rows } = await pool.query('UPDATE users SET whatsapp_phone=$1, whatsapp_opt_in=$2 WHERE id=$3 RETURNING *', [phone, consent, req.session.user.id]);
  req.session.user = publicUser(rows[0]); res.json({ user: req.session.user });
}));

app.patch('/api/email/preferences',requireAuth,asyncRoute(async(req,res)=>{
  if(typeof req.body?.emailOptIn!=='boolean')return res.status(400).json({error:'Choose whether to receive email alerts.'});
  const {rows}=await pool.query('UPDATE users SET email_opt_in=$1 WHERE id=$2 AND (email_verified=TRUE OR $1=FALSE) RETURNING *',[req.body.emailOptIn,req.session.user.id]);
  if(!rows[0])return res.status(409).json({error:'Verify your email address before enabling email alerts.'});
  req.session.user=publicUser(rows[0]);res.json({user:req.session.user});
}));
app.post('/api/email/verification',requireAuth,asyncRoute(async(req,res)=>{
  if(!emailReady())return res.status(503).json({error:'Email delivery must be configured before verification emails can be sent.'});
  const {rows}=await pool.query('SELECT * FROM users WHERE id=$1',[req.session.user.id]);const user=rows[0];
  if(user.email_verified)return res.json({ok:true,alreadyVerified:true});
  const token=crypto.randomBytes(32).toString('base64url');
  const result=await pool.query(`INSERT INTO email_verifications(user_id,token_hash,email,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 minutes') ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,email=EXCLUDED.email,expires_at=EXCLUDED.expires_at,requested_at=NOW() WHERE email_verifications.requested_at<NOW()-INTERVAL '1 minute' RETURNING user_id`,[user.id,hashToken(token),user.email]);
  if(!result.rows.length)return res.status(429).json({error:'Wait one minute before requesting another verification email.'});
  await sendEmail({to:user.email,subject:'Verify your ChartPulse email',text:'Sign in to your ChartPulse account, then open this link to verify your email. The link expires in 30 minutes.\n\n'+applicationOrigin()+'/app?email_verify='+token+'\n\nIf you did not request this, ignore this email.',key:'chartpulse-verify-'+hashToken(token)});
  res.json({ok:true,message:'Verification email sent. Check your inbox.'});
}));
app.post('/api/email/verify',requireAuth,asyncRoute(async(req,res)=>{
  if(typeof req.body?.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(req.body.token))return res.status(400).json({error:'Invalid verification link.'});
  let user;
  await pool.transaction(async()=>{
    const {rows}=await pool.query('DELETE FROM email_verifications WHERE user_id=$1 AND token_hash=$2 AND expires_at>NOW() RETURNING email',[req.session.user.id,hashToken(req.body.token)]);
    if(!rows[0])return;
    user=(await pool.query("UPDATE users SET email_verified=TRUE WHERE id=$1 AND email=$2 AND active=TRUE AND role='customer' RETURNING *",[req.session.user.id,rows[0].email])).rows[0];
  });
  if(!user)return res.status(400).json({error:'This verification link expired or belongs to another account.'});
  req.session.user=publicUser(user);res.json({user:req.session.user});
}));

app.post('/api/admin/market-symbols', requireAdminAuth, asyncRoute(async (req, res) => {
  if (isSimulated) return res.status(409).json({error:'Switch to the licensed provider before importing real instruments.'});
  const items = req.body?.symbols;
  if (!Array.isArray(items) || !items.length || items.length > 10000) return res.status(400).json({ error: 'Provide 1 to 10,000 symbols from your licensed provider instrument master.' });
  const accepted = [];
  for (const item of items) {
    const exchange = String(item.exchange || '').toUpperCase();
    const rawSymbol = String(item.symbol || '').trim().toUpperCase();
    const providerSymbol = String(item.provider_symbol || '').trim();
    if (!['NSE', 'BSE'].includes(exchange) || !rawSymbol || !providerSymbol || rawSymbol.length > 60 || providerSymbol.length > 100) continue;
    const symbol = rawSymbol.includes(':') ? rawSymbol : `${exchange}:${rawSymbol}`;
    const avgVolume = item.avg_volume === '' || item.avg_volume == null ? null : Number(item.avg_volume);
    accepted.push({ symbol, name: String(item.name || rawSymbol).slice(0, 160), exchange, provider_symbol: providerSymbol, provider_symbol_id: item.provider_symbol_id ? String(item.provider_symbol_id) : null, avg_volume: Number.isFinite(avgVolume) && avgVolume >= 0 ? avgVolume : null });
  }
  if (!accepted.length) return res.status(400).json({ error: 'No valid NSE or BSE instrument rows were found.' });
  await pool.query(`INSERT INTO market_symbols(symbol,name,exchange,provider_symbol,provider_symbol_id,avg_volume)
    SELECT symbol,name,exchange,provider_symbol,provider_symbol_id,avg_volume FROM jsonb_to_recordset($1::jsonb)
    AS x(symbol text,name text,exchange text,provider_symbol text,provider_symbol_id text,avg_volume double precision)
    ON CONFLICT(symbol) DO UPDATE SET name=EXCLUDED.name,exchange=EXCLUDED.exchange,provider_symbol=EXCLUDED.provider_symbol,provider_symbol_id=EXCLUDED.provider_symbol_id,avg_volume=EXCLUDED.avg_volume,active=TRUE,updated_at=NOW()`, [JSON.stringify(accepted)]);
  if(marketEntitled())await runtime.command('feed_restart',{});
  res.json({ imported: accepted.length, requestedFeedStart: marketEntitled(), message: 'Instrument rows saved. Confirm the provider symbols/segment match your TrueData instrument master.' });
}));

app.post('/api/webhooks/tradingview/:token', asyncRoute(async (req, res) => {
  const { rows: owners } = await pool.query("SELECT id,whatsapp_opt_in FROM users WHERE webhook_token=$1 AND active=TRUE AND role='customer'", [req.params.token]);
  if (!owners[0]) return res.status(401).json({ error: 'Invalid webhook endpoint.' });
  const symbol = String(req.body?.symbol || req.body?.ticker || 'Market').slice(0, 40);
  const title = (isSimulated ? '[SIMULATED] ' : '') + String(req.body?.title || req.body?.alert || 'TradingView alert').slice(0, 120);
  const detail = String(req.body?.message || JSON.stringify(req.body)).slice(0, 1000);
  const receivedAt = new Date().toISOString();
  const eventIdentity = req.body?.event_id || req.body?.time || req.body?.timestamp || receivedAt;
  const key = crypto.createHash('sha256').update(`${owners[0].id}:${eventIdentity}:${JSON.stringify(req.body)}`).digest('hex');
  const status = isSimulated ? 'simulated' : owners[0].whatsapp_opt_in && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME ? 'queued' : 'logged';
  await pool.query('INSERT INTO alerts(user_id,symbol,title,detail,source,status,event_key) VALUES($1,$2,$3,$4,\'tradingview\',$5,$6) ON CONFLICT(event_key) DO NOTHING', [owners[0].id,symbol,title,detail,status,key]);
  res.json({ ok: true, received: true });
}));

async function deliverWhatsAppAlert(alert) {
  if (isSimulated) { await pool.query("UPDATE alerts SET status='simulated' WHERE id=$1", [alert.id]); return; }
  const { rows } = await pool.query('SELECT id,whatsapp_phone,whatsapp_opt_in FROM users WHERE id=$1 AND active=TRUE', [alert.user_id]);
  const user = rows[0];
  if (!user || !user.whatsapp_opt_in || !user.whatsapp_phone) {
    await pool.query("UPDATE alerts SET status='logged' WHERE id=$1", [alert.id]); return;
  }
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_TEMPLATE_NAME) {
    await pool.query("UPDATE alerts SET status='logged' WHERE id=$1", [alert.id]); return;
  }
  try {
    const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
    const response = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: user.whatsapp_phone.replace(/\D/g, ''), type: 'template', template: { name: process.env.WHATSAPP_TEMPLATE_NAME, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US' }, components: [{ type: 'body', parameters: [{ type: 'text', text: String(alert.symbol || 'Market').slice(0, 60) }, { type: 'text', text: String(alert.title).slice(0, 100) }, { type: 'text', text: String(alert.detail).slice(0, 500) }] }] } })
    });
    if (!response.ok) { const info = await response.text(); throw new Error(info.slice(0, 700)); }
    await pool.query("UPDATE alerts SET status='sent' WHERE id=$1", [alert.id]);
  } catch (err) {
    console.error('WhatsApp delivery failed:', err.message);
    const attempts = Number(alert.attempts || 0) + 1;
    if (attempts >= 5) await pool.query("UPDATE alerts SET status='failed', attempts=$2 WHERE id=$1", [alert.id, attempts]);
    else await pool.query("UPDATE alerts SET status='queued', attempts=$2, next_attempt_at=NOW() + ($3 * INTERVAL '1 minute') WHERE id=$1", [alert.id, attempts, Math.min(2 ** attempts, 30)]);
  }
}
async function scanActiveAlertRules() {
  if (!marketEntitled() || !marketRuntime.connected) return;
  try {
    const rules = await pool.query("SELECT a.* FROM alert_rules a JOIN users u ON u.id=a.user_id WHERE a.enabled=TRUE AND u.active=TRUE AND u.role='customer' AND (a.user_id % $1)=$2 AND ($3::int[] IS NULL OR a.user_id=ANY($3))",[runtime.shards,runtime.shard,runtime.baselineUsers||null]);
    const quotes = {rows:runtime.getQuotes()};
    for (const rule of rules.rows) {
      let ast; try { ast = parsedRules.get(rule.query_text); if(!ast){ast=parseQuery(rule.query_text);if(parsedRules.size>=1000)parsedRules.delete(parsedRules.keys().next().value);parsedRules.set(rule.query_text,ast);} } catch (err) { console.error(`Invalid alert rule ${rule.id}:`, err.message); continue; }
      const touched=runtime.changedSymbols?quotes.rows.filter(q=>runtime.changedSymbols.includes(q.symbol)):quotes.rows;
      const touchedMatches=touched.filter(row=>evaluateQuery(ast,row));
      const matchSet=new Set(rule.last_match_symbols||[]);for(const q of touched)matchSet.delete(q.symbol);for(const q of touchedMatches)matchSet.add(q.symbol);
      const matches=quotes.rows.filter(q=>matchSet.has(q.symbol));
      const prior = new Set(rule.last_match_symbols || []); const entered = matches.filter(row => !prior.has(row.symbol));
      const cooldownOpen = !rule.last_event_at || Date.now() - new Date(rule.last_event_at).getTime() >= rule.cooldown_seconds * 1000;
      if (cooldownOpen) for (const quote of entered) {
        const { rows: ownerRows } = await pool.query('SELECT whatsapp_opt_in FROM users WHERE id=$1 AND active=TRUE', [rule.user_id]);
        if (!ownerRows[0]) continue;
        const shouldQueue = ownerRows[0]?.whatsapp_opt_in && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME;
        const detail = `${quote.name} (${quote.symbol}) matches: ${rule.query_text}. Last ${quote.price}; change ${Number(quote.change_pct).toFixed(2)}%; volume ${Math.round(quote.volume)}.`;
        const eventKey = crypto.createHash('sha256').update(`rule:${rule.id}:${quote.symbol}:${runtime.evaluationKey||new Date().toISOString().slice(0,16)}`).digest('hex');
        await pool.query(`INSERT INTO alerts(user_id,symbol,title,detail,source,status,event_key) VALUES($1,$2,$3,$4,'screener',$5,$6) ON CONFLICT(event_key) DO NOTHING`, [rule.user_id,quote.symbol,(isSimulated ? '[SIMULATED] ' : '') + rule.name,detail,isSimulated ? 'simulated' : shouldQueue ? 'queued' : 'logged',eventKey]);
      }
      await pool.query('UPDATE alert_rules SET last_match_symbols=$1,last_event_at=CASE WHEN $2 THEN NOW() ELSE last_event_at END WHERE id=$3', [matches.map(row => row.symbol), cooldownOpen && entered.length > 0, rule.id]);
    }
  } catch (err) { throw err; }
}

function valueFrom(record, names, index) {
  if (Array.isArray(record)) return record[index];
  for (const name of names) if (record?.[name] !== undefined && record[name] !== null) return record[name];
  return undefined;
}
function normalizeTrueData(record) {
  if (Array.isArray(record) && Array.isArray(record[0])) return record.flatMap(normalizeTrueData);
  const providerIdOrSymbol = String(valueFrom(record, ['symbol', 'symbol_name', 'name', 'symbolId', 'symbol_id', 'symbolid'], 0) ?? '');
  const symbol = marketRuntime.symbols.get(providerIdOrSymbol) || marketRuntime.symbols.get(providerIdOrSymbol.toUpperCase());
  if (!symbol) return [];
  const price = Number(valueFrom(record, ['ltp', 'LTP', 'last_price', 'last', 'close'], 2));
  const previousClose = Number(valueFrom(record, ['prev_close', 'prevClose', 'previous_close', 'prev_close_price'], 9));
  if (!Number.isFinite(price) || price <= 0) return [];
  const change = Number(valueFrom(record, ['change_pct', 'changePercent', 'percent_change'], -1));
  const volume = Number(valueFrom(record, ['ttq', 'TTQ', 'volume', 'total_traded_qty'], 5)) || 0;
  return [{ symbol, name:runtime.symbolMeta.get(symbol)?.name||symbol,exchange:symbol.split(':')[0],avg_volume:runtime.symbolMeta.get(symbol)?.avg_volume||null,price, change_pct: Number.isFinite(change) ? change : Number.isFinite(previousClose) && previousClose ? ((price - previousClose) / previousClose) * 100 : 0,
    volume, open: Number(valueFrom(record, ['open', 'Open'], 6)) || null, high: Number(valueFrom(record, ['high', 'High'], 7)) || null,
    low: Number(valueFrom(record, ['low', 'Low'], 8)) || null, updated_at: new Date().toISOString() }];
}
function onTrueDataRecord(record) {
  const normalized = normalizeTrueData(record);
  if (!normalized.length) return;
  if(providerRecords.length+normalized.length>Number(process.env.MAX_PENDING_TICKS||10000)) {marketRuntime.connected=false;marketRuntime.error='Ingestion queue exceeded its bounded capacity; provider resynchronization required.';throw new Error(marketRuntime.error);}
  providerRecords.push(...normalized);
}
async function flushMarketQuotes() {
  while(providerRecords.length){const quote=providerRecords[0];await runtime.publish([quote]);providerRecords.shift();}
}
async function startMarketFeed() {
  await pool.query('UPDATE market_symbols SET active=FALSE WHERE data_source <> $1', [isSimulated ? 'simulated' : 'licensed']);
  if (isSimulated) {
    for (const i of simulation.instruments.values()) await pool.query("INSERT INTO market_symbols(symbol,name,exchange,provider_symbol,avg_volume,active,data_source) VALUES($1,$2,$3,$4,$5,TRUE,'simulated') ON CONFLICT(symbol) DO UPDATE SET active=TRUE,data_source='simulated'", [i.symbol,i.name,i.exchange,i.provider_symbol,i.avg_volume]);
    marketRuntime.symbols = new Map([...simulation.instruments.keys()].map(symbol => [symbol,symbol]));
    await persistSimulation({bootstrap:true});
    runtime.every(3000,simulationTick);
    return;
  }
  if (!marketEntitled()) { marketRuntime.connected = false; marketRuntime.error = 'Awaiting an approved market-data display/redistribution license.'; return; }
  const rows = await pool.query('SELECT * FROM market_symbols WHERE active=TRUE');
  runtime.symbolMeta=new Map(rows.rows.map(s=>[s.symbol,s]));
  if (!rows.rows.length) { marketRuntime.error = 'Import the provider instrument master in Admin before connecting the feed.'; return; }
  try {
    if(marketRuntime.client){try{marketRuntime.client.rtDisconnect?.();}catch{}}
    const client = require('truedata-nodejs'); marketRuntime.client = client;
    marketRuntime.symbols.clear(); rows.rows.forEach(row => { marketRuntime.symbols.set(row.provider_symbol, row.symbol); if (row.provider_symbol_id) marketRuntime.symbols.set(String(row.provider_symbol_id), row.symbol); });
    client.rtFeed.removeAllListeners('tick'); client.rtFeed.removeAllListeners('touchline'); client.rtFeed.removeAllListeners('heartbeat');
    client.rtFeed.on('tick', onTrueDataRecord); client.rtFeed.on('touchline', onTrueDataRecord);
    client.rtFeed.on('heartbeat', status => {
      const text = typeof status === 'string' ? status : JSON.stringify(status);
      if (/disconnect|error|invalid|fail/i.test(text)) { marketRuntime.connected = false; marketRuntime.error = 'Provider reported a connection problem.'; }
    });
    client.rtConnect(process.env.TRUEDATA_USERNAME, process.env.TRUEDATA_PASSWORD, rows.rows.map(row => row.provider_symbol), Number(process.env.TRUEDATA_PORT || 8082), 0, 0, 0);
    marketRuntime.error = 'Connecting to TrueData…';
  } catch (err) { marketRuntime.connected = false; marketRuntime.error = `TrueData connection could not start: ${err.message}`; }
}

app.get('/api/admin/customers',requireAdminAuth,asyncRoute(async(req,res)=>{
  const search=String(req.query.search||'').trim().toLowerCase().slice(0,100);const cursor=req.query.cursor?Number(req.query.cursor):null;
  if(cursor!==null&&(!Number.isInteger(cursor)||cursor<1))return res.status(400).json({error:'Invalid customer cursor.'});
  const {rows}=await pool.query("SELECT id,email,name,role,active,whatsapp_opt_in,created_at FROM users WHERE role='customer' AND ($1::text='' OR lower(email) LIKE $1||'%' OR lower(name) LIKE $1||'%') AND ($2::int IS NULL OR id<$2) ORDER BY id DESC LIMIT 101",[search,cursor]);
  const users=rows.slice(0,100);res.json({users,nextCursor:rows.length>100?users.at(-1).id:null});
}));
app.get('/api/admin/overview', requireAdminAuth, asyncRoute(async (req, res) => {
  const [users, events, failures] = await Promise.all([
    pool.query("SELECT id,email,name,role,active,whatsapp_opt_in,created_at,COUNT(*) OVER()::int AS customer_count FROM users WHERE role='customer' ORDER BY created_at DESC LIMIT 100"),
    pool.query('SELECT COUNT(*)::int AS count FROM alerts'),
    pool.query("SELECT * FROM alerts WHERE status='failed' ORDER BY created_at DESC LIMIT 20")
  ]);
  res.json({ users: users.rows, customerCount: users.rows[0]?.customer_count || 0, eventCount: events.rows[0].count, failed: failures.rows, whatsappReady: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME), marketReady: marketEntitled() && marketRuntime.connected, marketConfigured: Boolean(isSimulated || (process.env.TRUEDATA_USERNAME && process.env.TRUEDATA_PASSWORD)), redistributionApproved: process.env.MARKET_DATA_REDISPLAY_APPROVED === 'true', marketConnected: marketRuntime.connected, marketSymbolCount: marketRuntime.symbols.size, marketMode: process.env.MARKET_DATA_PROVIDER || 'simulated', simulated: isSimulated, dataLabel, simulationPaused: simulation?.paused });
}));
app.patch('/api/admin/users/:id', requireAdminAuth, asyncRoute(async (req, res) => {
  const { active } = req.body || {};
  if (typeof active !== 'boolean' || Number(req.params.id) === req.session.user.id) return res.status(400).json({ error: 'Invalid account update.' });
  const { rows } = await pool.query("UPDATE users SET active=$1 WHERE id=$2 AND role='customer' RETURNING id,email,name,role,active", [active, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Customer not found.' }); if(!active)await runtime.notify(rows[0].id,{type:'revoked'}); res.json({ user: rows[0] });
}));


let simulationBusy = false;
async function persistSimulation(options={}) {
  const instruments=simulation.instruments;
  const quotes=simulation.quotes().map(q=>({...q,name:instruments.get(q.symbol).name,exchange:instruments.get(q.symbol).exchange,avg_volume:instruments.get(q.symbol).avg_volume,relative_volume:q.volume/instruments.get(q.symbol).avg_volume}));
  await runtime.publish(quotes,options);
}
async function simulationTick() {
  if(simulationBusy||simulation.paused)return;simulationBusy=true;
  try{simulation.step();await persistSimulation();}finally{simulationBusy=false;}
}
async function applySimulationAction(body,key){
  if(!isSimulated)throw Object.assign(new Error('Simulation is disabled in licensed mode.'),{status:409});
  if(simulationBusy)throw Object.assign(new Error('Feed is updating. Try again.'),{status:409});
  simulationBusy=true;
  try{
    if(body.action==='pause')simulation.paused=true;
    else if(body.action==='resume')simulation.paused=false;
    else if(body.action==='reset'){simulation.reset();runtime.sourceEpoch=crypto.randomUUID();await pool.query("UPDATE alert_rules SET last_match_symbols='{}',last_event_at=NULL");}
    else if(body.action==='scenario')simulation.scenario(body.symbol,body.scenario);
    else throw Object.assign(new Error('Unknown action.'),{status:400});
    await persistSimulation({bootstrap:body.action==='reset',key});return {ok:true,paused:simulation.paused,simulated:true,dataLabel};
  }finally{simulationBusy=false;}
}
app.get('/api/candles', requireAuth, asyncRoute(async (req,res) => {
  if (!isSimulated) return res.status(503).json({error:'Licensed historical data adapter has not been configured.'});
  let candles; try { candles = simulation.history(req.query.symbol, req.query.interval || '1m'); } catch(err) { return res.status(400).json({error:err.message}); }
  if (!candles) return res.status(404).json({error:'Simulated instrument not found.'});
  res.json({candles, simulated:true, dataLabel, symbol:req.query.symbol, accelerated:true});
}));
app.post('/api/admin/simulation',requireAdminAuth,asyncRoute(async(req,res)=>{
  if(!isSimulated)return res.status(409).json({error:'Simulation is disabled in licensed mode.'});
  if(!['pause','resume','reset','scenario'].includes(req.body?.action))return res.status(400).json({error:'Unknown action.'});
  res.json(await runtime.command('simulation',req.body));
}));
app.delete('/api/drawings/:id', requireAuth, asyncRoute(async (req,res) => {
  const result = await pool.query('DELETE FROM drawings WHERE id=$1 AND user_id=$2',[req.params.id,req.session.user.id]);
  if (!result.rowCount) return res.status(404).json({error:'Drawing not found.'}); res.json({ok:true});
}));
async function scanDrawingAlerts() {
  const {rows} = await pool.query("SELECT d.*,q.price,u.whatsapp_opt_in FROM drawings d JOIN users u ON u.id=d.user_id JOIN market_quotes q ON q.symbol=d.symbol JOIN market_symbols s ON s.symbol=d.symbol WHERE u.active=TRUE AND u.role='customer' AND s.active=TRUE AND (d.user_id % $1)=$2 AND ($3::int[] IS NULL OR d.user_id=ANY($3)) AND ($4::text[] IS NULL OR d.symbol=ANY($4))",[runtime.shards,runtime.shard,runtime.baselineUsers||null,runtime.changedSymbols||null]);
  for (const drawing of rows) {
    if(!shardMatches(drawing.user_id))continue;const current=runtime.quotes.get(drawing.symbol);if(!current)continue;drawing.price=current.price;
    const p = drawing.payload; if (!p.alertEnabled) continue;
    const time = isSimulated ? simulation.instruments.get(drawing.symbol)?.candles.at(-1).time : Date.now()/1000;
    const bounds = drawingBounds(drawing.kind,p,time); if(!bounds)continue;
    let condition=p.condition||'crossing';const channel=['rectangle','channel'].includes(drawing.kind);
    if(channel && ['crossing','crossing_up','crossing_down'].includes(condition))condition='entering_channel';
    const inside=channel && drawing.price>=bounds[0] && drawing.price<=bounds[1];
    const deltas=bounds.map(level=>drawing.price-level);
    const matched=channel?matchesCondition({condition,value:bounds[0],upper:bounds[1]},drawing.price,p.lastPrice,[],p.lastInside):deltas.some((delta,index)=>matchesCondition({condition,value:0},delta,p.lastDeltas?.[index],[],false));
    if (matched && (!p.triggeredAt || Date.now()-p.triggeredAt >= 60000)) {
      p.triggeredAt = Date.now();
      const status = deliveryStatus(drawing.whatsapp_opt_in);
      await pool.query("INSERT INTO alerts(user_id,symbol,title,detail,source,status,event_key) VALUES($1,$2,$3,$4,'drawing',$5,$6)",[drawing.user_id,drawing.symbol,(isSimulated?'[SIMULATED] ':'')+'Drawing '+condition,'Price '+drawing.price.toFixed(2)+' matched '+drawing.kind+' '+condition+' at '+bounds.map(v=>v.toFixed(2)).join(' / '),status,'drawing:'+drawing.id+':'+(runtime.evaluationKey||p.triggeredAt)]);
    }
    p.lastDeltas=deltas;p.lastPrice=drawing.price;p.lastInside=inside;
    await pool.query('UPDATE drawings SET payload=$1 WHERE id=$2',[p,drawing.id]);
  }
}

const errorHandler=(err, req, res, next) => { if(err.status)return res.status(err.status).json({error:err.message}); console.error(err.message); res.status(500).json({ error: 'The request could not be completed.' }); };
runtime.evaluate=async()=>{await scanActiveAlertRules();await scanDrawingAlerts();await workspace.scan();};
runtime.commandHandler=async(kind,payload,key)=>{
  if(kind==='simulation')return applySimulationAction(payload,key);
  if(kind==='feed_restart'){if(!isSimulated)await startMarketFeed();return {ok:true};}
  throw new Error('Unknown command.');
};
app.get('/api/admin/runtime',requireAdminAuth,asyncRoute(async(req,res)=>{
  const [services,jobs]=await Promise.all([pool.query("SELECT * FROM service_heartbeats WHERE updated_at>NOW()-INTERVAL '1 minute'"),pool.query('SELECT status,channel,COUNT(*)::int AS count FROM notification_jobs GROUP BY status,channel')]);
  res.json({role:runtime.role,sequence:runtime.sequence,metrics:metrics.snapshot(),services:services.rows,jobs:jobs.rows,capacityCertified:false});
}));
app.get('/api/admin/delivery-jobs',requireAdminAuth,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query("SELECT j.id,j.channel,j.status,j.attempts,j.last_error,a.title,a.symbol FROM notification_jobs j JOIN alerts a ON a.id=j.alert_id WHERE j.status='failed' ORDER BY j.id DESC LIMIT 100");
  res.json({jobs:rows,emailReady:emailReady(),emailSimulated:!externalEmailEnabled(),googleReady:googleReady()});
}));
let server,gateway;
async function start(){
  let release;while(!release){release=await pool.leadership(730010);if(!release)await new Promise(resolve=>setTimeout(resolve,500));}
  try{await setup();await runtime.setup();await calendar.setup();}finally{await release();}
  if(['standalone','api','gateway'].includes(runtime.role)){
    server=http.createServer(app);gateway=installGateway({server,app,runtime,pool,requireAuth,asyncRoute,entitled:marketEntitled});app.use(errorHandler);
    await new Promise(resolve=>server.listen(PORT,resolve));console.log('ChartPulse '+runtime.role+' listening on '+PORT);
    if(runtime.role!=='standalone')runtime.every(1000,()=>runtime.sync());
  }
  // Render probes the replacement before retiring the previous instance.
  // Serve the persisted snapshot while waiting for exclusive worker ownership.
  const shutdown=async()=>{if(runtime.stopping)return;runtime.stopping=true;const timeout=setTimeout(()=>process.exit(1),12000);timeout.unref();try{if(gateway)await gateway.close();if(server)await new Promise(resolve=>server.close(resolve));await runtime.stop();await pool.end();clearTimeout(timeout);process.exit(0);}catch(err){console.error(err.message);process.exit(1);}};
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  if(['standalone','ingestion','evaluator','relay'].includes(runtime.role)){
    const syncTimer=runtime.role==='standalone'?runtime.every(1000,()=>runtime.sync()):null;
    const key=runtime.role==='evaluator'?731000+runtime.shard:runtime.role==='relay'?732000:730020;
    while(!runtime.releaseLeader&&!runtime.stopping){runtime.releaseLeader=await pool.leadership(key);if(!runtime.releaseLeader)await new Promise(resolve=>setTimeout(resolve,1000));}
    if(syncTimer)clearInterval(syncTimer);if(runtime.stopping)return;
    // A snapshot sync already in flight must finish before taking ownership.
    while(runtime.syncing)await new Promise(resolve=>setTimeout(resolve,25));
    await runtime.loadSnapshot();await runtime.claimLeadership(key);
  }
  if(['standalone','ingestion'].includes(runtime.role)){await startMarketFeed();runtime.every(100,flushMarketQuotes);runtime.every(125,()=>runtime.processCommands());}
  if(runtime.role==='evaluator')runtime.every(125,()=>runtime.evaluateEvents());
  if(['standalone','delivery'].includes(runtime.role))runtime.every(250,()=>processNotifications({pool,runtime,deliver:deliverWhatsAppAlert}));
  if(['standalone','evaluator'].includes(runtime.role)){await calendar.scan();runtime.every(15000,()=>calendar.scan());}
  if(runtime.role==='relay')await require('./services/kafka-relay').startKafkaRelay(runtime);
  await runtime.heartbeat();runtime.every(5000,()=>runtime.heartbeat());
}
start().catch(err=>{console.error('Startup failed:',err.message);process.exit(1);});
