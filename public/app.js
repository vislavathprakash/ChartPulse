const state = { user: null, meta: null, authMode: 'login', currentPage: 'overview', lastQuery: '', queryResults: [] };
const $ = (id) => document.getElementById(id);
const html = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (value, digits = 2) => Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { if(res.status===401 && state.user) {state.user=null;showAuth();} const err = new Error(data.error || `Request failed (${res.status})`); err.status = res.status; throw err; }
  return data;
}
function toast(message, error = false) {
  const el = $('toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), 3600);
}
function showAuth() { window.syncIntegrationPreferences?.(); liveMarket.stop(); history.replaceState(null,'','/app/login'); simulationChart.dispose(); tradingViewChart.dispose(); $('tvChart').replaceChildren(); document.querySelectorAll('.workspace-dialog').forEach(d=>{d.close();d.remove();}); document.body.classList.remove('chart-workspace-open'); $('authView').classList.remove('hidden'); $('appView').classList.add('hidden'); }
function showApp(user, meta) {
  if(simulationChart.accountId!==user.id) { simulationChart.dispose(); simulationChart.accountId=user.id; simulationChart.settings=chartDefaults(); simulationChart.symbol=null; simulationChart.drawings=[]; simulationChart.watchlists=[]; simulationChart.watchlistId=null; simulationChart.search=''; simulationChart.searchFocused=false; simulationChart.panel='watchlist'; }
  history.replaceState(null,'','/app'); state.user = user; state.meta = meta; $('authView').classList.add('hidden'); $('appView').classList.remove('hidden');
  const initial = (user.name || user.email || 'U').slice(0, 1).toUpperCase();
  $('userName').textContent = user.name || user.email; $('userRole').textContent = user.role; $('avatar').textContent = initial; $('topAvatar').textContent = initial;
  $('greetingName').textContent = (user.name || 'Trader').split(/\s+/)[0];
  $('marketMode').textContent = meta.marketReady ? `${meta.marketMode} · connected` : (meta.marketConfigured ? `${meta.marketMode} · disconnected` : 'Market feed not connected');
  $('settingsMarketMode').textContent = meta.marketConfigured ? `${meta.marketMode} · ${meta.marketConnected ? 'connected' : 'disconnected'}` : 'Not configured'; $('settingsMarketCoverage').textContent = meta.market || 'Select exchanges';
  $('whatsappBadge').textContent = meta.whatsappReady ? 'CONNECTED' : 'NOT CONFIGURED';
  $('channelStatus').textContent = meta.whatsappReady ? 'Connected' : 'Setup needed';
  $('channelHint').textContent = meta.whatsappReady ? 'WhatsApp API is configured' : 'WhatsApp Business credentials required';
  $('phoneInput').value = user.whatsappPhone || ''; $('consentInput').checked = user.whatsappOptIn || false;
  const webhook = `${location.origin}/api/webhooks/tradingview/${user.webhookToken}`;
  $('webhookUrl').textContent = webhook; $('settingsWebhookUrl').textContent = webhook; $('chartWebhookUrl').textContent = webhook;
  $('simulationBanner').classList.toggle('hidden', !meta.simulated);
  document.querySelector('.live-badge').textContent = meta.simulated ? 'SIMULATED' : 'PROVIDER';
  $('screenerMarketBadge').textContent = meta.simulated ? 'SIMULATED DATA' : 'LICENSED FEED';
  $('chartSource').value='tradingview'; $('chartSource').querySelector('[value=simulation]').disabled=!meta.simulated; $('chartProviderLabel').textContent='TradingView · exchange data availability varies'; $('chartSymbol').value=localStorage.getItem('chartpulse_tv_symbol')||'BSE:RELIANCE';
  if(meta.simulated) { $('whatsappBadge').textContent='SIMULATED'; $('channelStatus').textContent='Simulated'; $('channelHint').textContent='Test events only; no WhatsApp messages sent'; }
  refreshCounts(); loadQueries(); loadAlerts(); loadWatch(); liveMarket.start(); window.syncIntegrationPreferences?.();
}
function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.auth === mode));
  $('nameField').classList.toggle('hidden', mode !== 'register'); $('authSubmit').innerHTML = mode === 'register' ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
  $('authError').classList.add('hidden');
}
async function bootstrap() {
  try { const me = await api('/api/me'); state.meta = me; if (me.user) showApp(me.user, me); else showAuth(); }
  catch { showAuth(); }
}
document.querySelectorAll('.auth-tab').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
$('authForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = new FormData(e.currentTarget); const body = Object.fromEntries(form.entries());
  try {
    const result = await api(state.authMode === 'register' ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify(body) });
    const meta = await api('/api/me'); showApp(result.user, meta); navigate('overview');
  } catch (err) { $('authError').textContent = err.message; $('authError').classList.remove('hidden'); }
});
$('logoutBtn').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); state.user = null; showAuth(); });

function navigate(page) {
  if (!['overview','screener','charts','alerts','settings'].includes(page)) return;
  state.currentPage = page; document.body.classList.toggle('chart-workspace-open',page==='charts'); if(page!=='charts')simulationChart.dispose();
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', p.id !== `page-${page}`));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  $('crumb').textContent = ({ overview: 'Overview', screener: 'Screener', charts: 'Charts', alerts: 'Alerts', settings: 'Settings' })[page] || page;
  if (page === 'charts') mountTvChart(); if (page === 'screener') loadQueries(); if (page === 'alerts') loadAlerts(); if(page!=='charts')liveMarket.subscribe();
}
document.body.addEventListener('click', e => { const nav = e.target.closest('[data-page]'); if (nav) navigate(nav.dataset.page); });

async function refreshCounts() {
  try { const data = await api('/api/alerts'); const count = data.alerts.length; $('alertCount').textContent = count; $('overviewAlertCount').textContent = count; }
  catch { $('alertCount').textContent = '0'; }
}
function noProviderText(err) { return err.status === 503 ? err.message : 'Could not load market data. Check the configured provider.'; }
async function loadWatch() {
  try {
    const { data = [] } = await api('/api/stocks');
    liveMarket.seed(data);renderMarketOverview(data);
  } catch (err) {
    $('marketWatchCount').textContent = '—'; $('moveCount').textContent = '—';
    $('watchTable').classList.add('empty-state'); $('watchTable').textContent = noProviderText(err);
    $('movers').classList.add('empty-state'); $('movers').textContent = noProviderText(err);
  }
}
function renderMarketOverview(data) {
    $('marketWatchCount').textContent = data.length;
    $('watchTable').classList.remove('empty-state'); $('watchTable').innerHTML = stockTable(data.slice(0, 6));
    const declining = data.filter(s => Number(s.change_pct ?? s.change) < 0).sort((a,b) => Number(a.change_pct ?? a.change) - Number(b.change_pct ?? b.change)).slice(0, 4);
    $('movers').classList.remove('empty-state'); $('movers').innerHTML = declining.length ? declining.map(s => `<div class="mover"><b>${html(s.symbol)}</b><span>${fmt(s.change_pct ?? s.change)}%</span><small>${html(s.name || '')}</small></div>`).join('') : '<p class="muted">No declining symbols.</p>';
    $('moveCount').textContent = data.filter(s => Number(s.change_pct ?? s.change) <= -3).length;
}
function stockTable(data) {
  if (!data.length) return '<div class="empty-state">No matches for this scan.</div>';
  return `<table class="data-table"><thead><tr><th>SYMBOL</th><th>LAST PRICE</th><th>CHANGE</th><th>VOLUME</th></tr></thead><tbody>${data.map(s => `<tr><td><div class="symbol-cell"><span class="coin-dot">${html((s.exchange || '?').slice(0,2))}</span><span><b>${html(s.symbol)}</b><small>${html(s.name || '')}</small></span></div></td><td class="mono">₹ ${fmt(s.price ?? s.last_price)}</td><td class="mono ${Number(s.change_pct ?? s.change) < 0 ? 'negative' : 'positive'}">${fmt(s.change_pct ?? s.change)}%</td><td class="mono">${fmt(s.volume, 0)}</td></tr>`).join('')}</tbody></table>`;
}
async function runQuery() {
  const query = $('queryInput').value.trim(); if (!query) return toast('Enter a screener query first.', true);
  state.lastQuery = query; $('parsedQuery').textContent = 'Checking the live market data provider…';
  try {
    const result = await api('/api/screen', { method: 'POST', body: JSON.stringify({ query }) }); state.queryResults = result.data || [];
    $('resultCount').textContent = state.queryResults.length;
    $('parsedQuery').textContent = result.explanation || `Live scan · ${result.market || 'configured market'} · ${new Date().toLocaleTimeString()}`;
    $('scanTable').classList.remove('empty-state'); $('scanTable').innerHTML = stockTable(state.queryResults);
  } catch (err) { $('resultCount').textContent = '—'; $('parsedQuery').textContent = ''; $('scanTable').classList.add('empty-state'); $('scanTable').textContent = noProviderText(err); }
}
$('runQuery').addEventListener('click', runQuery);
document.querySelectorAll('[data-query]').forEach(b => b.addEventListener('click', () => { $('queryInput').value = b.dataset.query; runQuery(); }));
$('saveQuery').addEventListener('click', () => { if (!state.lastQuery) return toast('Run a scan before saving it.', true); $('queryName').value = ''; $('saveDialog').showModal(); });
$('confirmSave').addEventListener('click', async e => {
  e.preventDefault(); const name = $('queryName').value.trim(); if (!name) return;
  try { await api('/api/queries', { method: 'POST', body: JSON.stringify({ name, query: state.lastQuery }) }); $('saveDialog').close(); loadQueries(); toast('Scan saved to your account.'); }
  catch (err) { toast(err.message, true); }
});
async function loadQueries() {
  try {
    const { queries } = await api('/api/queries');
    $('savedQueries').innerHTML = queries.length ? queries.map(q => `<div class="saved-query"><div><b>${html(q.name)}</b><code>${html(q.query_text)}</code></div><button data-rerun="${html(q.query_text)}" title="Run this scan">▶</button></div>`).join('') : '<p class="muted">No saved scans yet.</p>';
    $('savedQueries').querySelectorAll('[data-rerun]').forEach(b => b.addEventListener('click', () => { $('queryInput').value = b.dataset.rerun; navigate('screener'); runQuery(); }));
  } catch { }
}

async function loadAlerts() {
  loadTechnicalAlerts();
  loadAlertRules();
  try {
    const { alerts } = await api('/api/alerts'); $('alertCount').textContent = alerts.length; $('overviewAlertCount').textContent = alerts.length;
    $('alertList').innerHTML = alerts.length ? alerts.map(a => `<div class="alert-row"><span class="alert-type-icon">${a.source === 'tradingview' ? '⌁' : '♧'}</span><div><b>${html(a.title)} · ${html(a.symbol || 'Market')}</b><p>${html(a.detail)}</p></div><div><span class="status-chip ${html(a.status)}">${html(a.status)}</span>${(a.deliveries||[]).filter(d=>d.channel!=='in_app').map(d=>`<br><span class="tiny muted">${html(d.channel)}: ${html(d.status)}</span>`).join('')}<br><time>${new Date(a.created_at).toLocaleString()}</time></div></div>`).join('') : '<p class="muted">No alert events yet. Create a TradingView alert and send it to your private webhook endpoint.</p>';
  } catch { $('alertList').innerHTML = '<p class="muted">Sign in to view account alerts.</p>'; }
}
async function loadAlertRules() {
  try {
    const { rules } = await api('/api/alert-rules');
    $('alertRules').innerHTML = rules.length ? rules.map(r => `<div class="saved-query alert-rule-row"><div><b>${html(r.name)} ${r.enabled ? '' : '<span class="muted">· paused</span>'}</b><code>${html(r.query_text)}</code></div><div class="rule-actions"><button data-rule-toggle="${r.id}" data-enabled="${!r.enabled}">${r.enabled ? 'Pause' : 'Resume'}</button><button data-rule-delete="${r.id}" aria-label="Delete rule">×</button></div></div>`).join('') : '<p class="muted">No market alert rules yet.</p>';
    $('alertRules').querySelectorAll('[data-rule-toggle]').forEach(b => b.addEventListener('click', async () => { try { await api(`/api/alert-rules/${b.dataset.ruleToggle}`, { method: 'PATCH', body: JSON.stringify({ enabled: b.dataset.enabled === 'true' }) }); loadAlertRules(); } catch (err) { toast(err.message, true); } }));
    $('alertRules').querySelectorAll('[data-rule-delete]').forEach(b => b.addEventListener('click', async () => { try { await api(`/api/alert-rules/${b.dataset.ruleDelete}`, { method: 'DELETE' }); loadAlertRules(); toast('Alert deleted.'); } catch (err) { toast(err.message, true); } }));
  } catch { }
}
$('createAlertRule').addEventListener('click', async () => {
  const name = $('alertRuleName').value.trim(), query = $('alertRuleQuery').value.trim();
  try { await api('/api/alert-rules', { method: 'POST', body: JSON.stringify({ name, query }) }); $('alertRuleName').value = ''; $('alertRuleQuery').value = ''; loadAlertRules(); toast('Screener alert created.'); }
  catch (err) { toast(err.message, true); }
});

async function loadTvChart() {
  const symbol=$('chartSymbol').value.trim().toUpperCase();
  if(!/^[A-Z0-9_.!:/-]{1,48}$/.test(symbol))return toast('Enter a symbol such as BSE:RELIANCE.',true);
  if($('chartSource').value==='tradingview'&&/^(NSE|BSE):SIM\d+$/.test(symbol))return toast('Fictional symbols are available in Simulation workspace. Use a real symbol for TradingView.',true);
  $('chartSymbol').value=symbol;localStorage.setItem($('chartSource').value==='tradingview'?'chartpulse_tv_symbol':'chartpulse_symbol',symbol);mountTvChart();
}
function mountTvChart() {
  if(state.currentPage!=='charts')return;
  const useTv=$('chartSource').value==='tradingview';$('page-charts').classList.toggle('tradingview-mode',useTv);
  const footer=$('page-charts').querySelector('.chart-footer');
  $('openTradingView').classList.toggle('hidden',!useTv);$('reloadTvChart').classList.toggle('hidden',!useTv);
  if(!useTv){tradingViewChart.dispose();$('chartProviderLabel').textContent='SIMULATED · fictional instruments';footer.innerHTML='<span>Simulation drawings are saved to your ChartPulse account.</span><span>Fictional prices and simulated alert delivery.</span>';simulationChart.mount($('chartSymbol').value.trim()||'NSE:SIM001').catch(err=>toast(err.message,true));return;}
  simulationChart.dispose();liveMarket.subscribe();$('chartProviderLabel').textContent='TradingView · exchange data availability varies';
  footer.innerHTML='<span>Indian stocks: BSE end-of-day charts are available. NSE symbols may be restricted to tradingview.com.</span><span>Embedded drawings are not linked to ChartPulse alerts or account storage. Configure TradingView webhooks in Settings.</span>';
  const candidate=$('chartSymbol').value.trim().toUpperCase();const symbol=/^[A-Z0-9_.!:/-]{1,48}$/.test(candidate)&&! /^(NSE|BSE):SIM\d+$/.test(candidate)?candidate:'BSE:RELIANCE';
  $('chartSymbol').value=symbol;$('openTradingView').href='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(symbol);tradingViewChart.mount(symbol);
}
$('chartSource').onchange=()=>{$('chartSymbol').value=$('chartSource').value==='tradingview'?localStorage.getItem('chartpulse_tv_symbol')||'BSE:RELIANCE':localStorage.getItem('chartpulse_symbol')||'NSE:SIM001';mountTvChart();};
$('reloadTvChart').onclick=()=>{tradingViewChart.dispose();mountTvChart();};
$('loadTvChart').addEventListener('click', loadTvChart);
$('chartSymbol').addEventListener('keydown', e => { if (e.key === 'Enter') loadTvChart(); });

$('prefsForm').addEventListener('submit', async e => {
  e.preventDefault();
  try { const { user } = await api('/api/preferences', { method: 'PATCH', body: JSON.stringify({ phone: $('phoneInput').value, whatsappOptIn: $('consentInput').checked }) }); state.user = user; toast('WhatsApp preferences saved.'); }
  catch (err) { toast(err.message, true); }
});
async function copyText(value) { try { await navigator.clipboard.writeText(value); toast('Copied.'); } catch { toast('Copy is unavailable in this browser.', true); } }
$('copyWebhook').addEventListener('click', () => copyText($('settingsWebhookUrl').textContent));
$('copyChartWebhook').addEventListener('click', () => copyText($('chartWebhookUrl').textContent));
$('newTechnicalAlert').addEventListener('click',()=>simulationChart.alertDialog().catch(err=>toast(err.message,true)));
if(location.pathname==='/app/register')setAuthMode('register');
bootstrap();
