const state = { user: null, meta: null, authMode: 'login', currentPage: 'overview', lastQuery: '', queryResults: [] };
const privateDhanLink = new URLSearchParams(location.search).get('view') === 'private-dhan';
const privateDhanEntryTab = new URLSearchParams(location.search).get('tab');
function privateDhanPath(path) {
  const query = new URLSearchParams({view:'private-dhan'});
  if (['watch','commodities','research'].includes(privateDhanEntryTab)) query.set('tab',privateDhanEntryTab);
  return `${path}?${query}`;
}
const $ = (id) => document.getElementById(id);
const html = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (value, digits = 2) => Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
const terminalIcons = {
  overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  screener:'<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="19" r="2"/>',
  charts:'<path d="M5 2v5m0 8v5m7-16v8m0 6v4m7-20v3m0 8v5"/><rect x="3" y="7" width="4" height="8" rx="1"/><rect x="10" y="12" width="4" height="6" rx="1"/><rect x="17" y="5" width="4" height="8" rx="1"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/>',
  alerts:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  account:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
  arrow:'<path d="M6 18 18 6M7 6h11v11"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  fullscreen:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  list:'<path d="M8 5h12M8 12h12M8 19h12M4 5h.01M4 12h.01M4 19h.01"/>',
  commodity:'<path d="m4 15 4-7h8l4 7-1 2H5l-1-2Zm4-7 2 7h4l2-7"/>',
  research:'<path d="M4 19h16M6 15l4-4 4 2 5-7M16 6h3v3"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  trash:'<path d="M4 6h16m-14 0 1 14h10l1-14M9 6V3h6v3m-5 4v6m4-6v6"/>'
};
const terminalIcon = name => `<svg class="terminal-icon" aria-hidden="true" viewBox="0 0 24 24">${terminalIcons[name]||''}</svg>`;
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('#mainNav [data-page]').forEach(button=>{const icon=button.querySelector('.nav-icon');if(icon&&terminalIcons[button.dataset.page]){icon.setAttribute('aria-hidden','true');icon.innerHTML=terminalIcon(button.dataset.page);}if(button.classList.contains('active'))button.setAttribute('aria-current','page');});
  const notifications=document.querySelector('.notification-btn');if(notifications)notifications.innerHTML=terminalIcon('alerts')+'<i class="notification-dot"></i>';
  $('sidebarToggle').innerHTML=terminalIcon('menu');
});

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
function showAuth() { window.privateDhanView?.reset(); window.syncIntegrationPreferences?.(); liveMarket.stop(); history.replaceState(null,'',privateDhanLink?privateDhanPath('/app/login'):'/app/login'); simulationChart.dispose(); tradingViewChart.dispose(); window.stockWorkspace?.reset(); $('tvChart').replaceChildren(); document.querySelectorAll('.workspace-dialog').forEach(d=>{d.close();d.remove();}); document.body.classList.remove('chart-workspace-open','dhan-terminal-open'); $('authView').classList.remove('hidden'); $('appView').classList.add('hidden'); }
function showApp(user, meta) {
  if(simulationChart.accountId!==user.id) { simulationChart.dispose(); simulationChart.accountId=user.id; simulationChart.settings=chartDefaults(); simulationChart.symbol=null; simulationChart.drawings=[]; simulationChart.watchlists=[]; simulationChart.watchlistId=null; simulationChart.search=''; simulationChart.searchFocused=false; simulationChart.panel='watchlist'; }
  history.replaceState(null,'',privateDhanLink&&meta.privateDhan?privateDhanPath('/app'):'/app'); state.user = user; state.meta = meta; $('authView').classList.add('hidden'); $('appView').classList.remove('hidden');
  window.privateDhanView?.configure(meta.privateDhan);
  const initial = (user.name || user.email || 'U').slice(0, 1).toUpperCase();
  $('userName').textContent = user.name || user.email; $('userRole').textContent = user.role; $('avatar').textContent = initial; $('topAvatar').textContent = initial;
  $('greetingName').textContent = (user.name || 'Trader').split(/\s+/)[0];
  liveMarket.status(meta.marketReady ? `${meta.marketMode} · connected` : (meta.marketConfigured ? `${meta.marketMode} · disconnected` : 'Market feed not connected'),meta.marketReady?(meta.simulated?'simulated':'streaming'):'warning');
  $('terminalCoverage').textContent=meta.market?.split(',').map(s=>s.trim()).filter(Boolean).join(' / ')||'MARKET WORKSPACE';
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
  if (privateDhanLink && !meta.privateDhan) toast('Dhan terminal access is limited to the linked AlertPe account.', true);
}
function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.auth === mode));
  $('nameField').classList.toggle('hidden', mode !== 'register'); $('authSubmit').innerHTML = mode === 'register' ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
  $('authError').classList.add('hidden');
}
async function bootstrap() {
  try { const me = await api('/api/me'); state.meta = me; if (me.user) {showApp(me.user, me);if(privateDhanLink&&me.privateDhan)navigate('private-dhan');} else showAuth(); }
  catch { showAuth(); }
}
document.querySelectorAll('.auth-tab').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
$('authForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = new FormData(e.currentTarget); const body = Object.fromEntries(form.entries());
  try {
    const result = await api(state.authMode === 'register' ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify(body) });
    const meta = await api('/api/me'); showApp(result.user, meta); navigate(privateDhanLink&&meta.privateDhan?'private-dhan':'overview');
  } catch (err) { $('authError').textContent = err.message; $('authError').classList.remove('hidden'); }
});
$('logoutBtn').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); state.user = null; showAuth(); });

function navigate(page) {
  if (!['overview','screener','charts','alerts','calendar','settings','account','private-dhan'].includes(page) || (page==='private-dhan'&&!state.meta?.privateDhan)) return;
  state.currentPage = page; document.body.classList.toggle('chart-workspace-open',page==='charts'); if(page!=='charts')simulationChart.dispose();
  document.body.classList.toggle('dhan-terminal-open',page==='private-dhan');
  $('simulationBanner').classList.toggle('hidden',page==='private-dhan'||!state.meta?.simulated);
  if(page!=='private-dhan'&&new URLSearchParams(location.search).get('view')==='private-dhan')history.replaceState(null,'','/app');
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', p.id !== `page-${page}`));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  $('crumb').textContent = ({ overview: 'Overview', screener: 'Screener', charts: 'Charts', alerts: 'Alerts', calendar: 'Calendar', settings: 'Settings', account: 'Account settings' })[page] || page;
  if(page==='private-dhan')$('crumb').textContent='Dhan terminal';
  window.privateDhanView?.navigate(page);
  if(page==='account')window.accountSettings?.load(); if(page==='calendar') { marketCalendar.renderPage(); marketCalendar.load(); } if (page === 'charts') mountTvChart(); if (page === 'screener') loadQueries(); if (page === 'alerts') loadAlerts(); if(page!=='charts')liveMarket.subscribe();
}
document.body.addEventListener('click', e => { const nav = e.target.closest('[data-page]'); if (nav) navigate(nav.dataset.page); const symbol=e.target.closest('[data-terminal-chart]')?.dataset.terminalChart;if(symbol&&state.user)window.stockWorkspace?.open({symbol}); });

async function refreshCounts() {
  try { const data = await api('/api/alerts'); const count = data.alerts.length; $('alertCount').textContent = count; $('overviewAlertCount').textContent = count; }
  catch { $('alertCount').textContent = '0'; }
}
function noProviderText(err) { return err.status === 503 ? err.message : 'Could not load market data. Check the configured provider.'; }
async function loadWatch() {
  try {
    const { data = [],lastTickAt } = await api('/api/stocks');
    liveMarket.seed(data);renderMarketOverview(data,null,lastTickAt);
  } catch (err) {
    $('marketWatchCount').textContent = '—'; $('moveCount').textContent = '—'; $('marketQuoteTime').textContent='Quotes unavailable';
    $('watchTable').classList.add('empty-state'); $('watchTable').textContent = noProviderText(err);
    $('movers').classList.add('empty-state'); $('movers').textContent = noProviderText(err);
  }
}
const changeValue = s => Number(s.change_pct ?? s.change ?? NaN);
const changeText = n => Number.isFinite(n)?`${n>0?'+':''}${fmt(n)}%`:'—';
const changeTone = n => n<0?'negative':n>0?'positive':'muted';
const quotePrice = new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2});
const quoteTime = new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function quoteCells(s){const price=Number(s.price??s.last_price??NaN),volume=Number(s.volume??NaN),change=changeValue(s);return [Number.isFinite(price)?quotePrice.format(price):'—',changeText(change),Number.isFinite(volume)?fmt(volume,0):'—',changeTone(change)];}
function updateMarketWatch(host,data){
  host.classList.toggle('empty-state',!data.length);
  if(!data.length){host.textContent='Waiting for market quotes.';return;}
  const rows=[...host.querySelectorAll('tbody tr')];
  if(rows.length!==data.length||rows.some((row,i)=>row.querySelector('[data-terminal-chart]')?.dataset.terminalChart!==data[i].symbol)){host.innerHTML=stockTable(data);return;}
  rows.forEach((row,i)=>{const [price,change,volume,tone]=quoteCells(data[i]);[price,change,volume].forEach((value,j)=>{if(row.cells[j+1].textContent!==value)row.cells[j+1].textContent=value;});row.cells[2].className=`mono ${tone}`;});
}
function renderMarketOverview(data,summary,asOf) {
  const watch=$('watchTable'),movers=$('movers');
  const focus=document.activeElement;
  const region=watch.contains(focus)?watch:movers.contains(focus)?movers:null;
  const selected=region&&focus?.dataset.terminalChart;
  $('marketWatchCount').textContent = summary?.symbolCount ?? data.length;
  $('moveCount').textContent = summary?.decliningCount ?? data.filter(s=>changeValue(s)<=-3).length;
  const time=Date.parse(asOf);
  $('marketQuoteTime').textContent=Number.isFinite(time)&&data.length?`As of ${quoteTime.format(time)} IST`:'Awaiting quotes';
  updateMarketWatch(watch,data.slice(0,6));
  const declining=(summary?.movers??data.filter(s=>changeValue(s)<0).sort((a,b)=>changeValue(a)-changeValue(b))).filter(s=>Number.isFinite(changeValue(s))&&changeValue(s)<0).slice(0,4);
  const max=Math.max(1,...declining.map(s=>Math.abs(changeValue(s))));
  movers.classList.toggle('empty-state',!declining.length);
  movers.innerHTML=declining.length?`<div class="terminal-move-list">${declining.map(s=>`<button class="terminal-move" type="button" data-terminal-chart="${html(s.symbol)}" title="Open ${html(s.symbol)} chart"><span><b>${html(s.symbol)}</b><small>${html(s.name||'')}</small></span><span class="mono negative">${changeText(changeValue(s))}</span><progress aria-hidden="true" max="${max}" value="${Math.abs(changeValue(s))}"></progress></button>`).join('')}</div>`:data.length?'No declining symbols.':'Waiting for market quotes.';
  if(selected&&!focus.isConnected)region.querySelector(`[data-terminal-chart="${CSS.escape(selected)}"]`)?.focus({preventScroll:true});
}
function stockTable(data) {
  if (!data.length) return '<div class="empty-state">No stocks match these conditions. Adjust your query or choose another Scan Example, then run again.</div>';
  return `<table class="data-table"><thead><tr><th scope="col">SYMBOL</th><th scope="col">LAST PRICE</th><th scope="col">CHANGE</th><th scope="col">VOLUME</th></tr></thead><tbody>${data.map(s => {const [price,change,volume,tone]=quoteCells(s);return `<tr><td><button class="symbol-cell terminal-symbol" type="button" data-terminal-chart="${html(s.symbol)}" aria-label="Open ${html(s.symbol)} chart" title="${html(s.name||s.symbol)}"><span class="coin-dot" aria-hidden="true">${html((s.exchange || '?').slice(0,2))}</span><span class="symbol-label"><b>${html(s.symbol)}</b><small>${html(s.name || '')}</small></span>${terminalIcon('arrow')}</button></td><td class="mono">${price}</td><td class="mono ${tone}">${change}</td><td class="mono">${volume}</td></tr>`;}).join('')}</tbody></table>`;
}
async function runQuery() {
  if(state.scanPending)return;
  const query = $('queryInput').value.trim();
  $('queryError').classList.add('hidden');$('queryInput').removeAttribute('aria-invalid');
  if (!query) { $('queryError').textContent='Enter a query or choose a Scan Example before running a scan.';$('queryError').classList.remove('hidden');$('queryInput').setAttribute('aria-invalid','true');$('queryInput').focus();return; }
  const owner=state.user?.id;
  state.scanPending=true;$('runQuery').disabled=true;$('saveQuery').disabled=true;
  $('runQuery').setAttribute('aria-busy','true');$('scanTable').setAttribute('aria-busy','true');
  $('runQuery').querySelector('.scan-spinner').classList.remove('hidden');$('runQuery').querySelector('.scan-button-icon').classList.add('hidden');$('runQuery').querySelector('.scan-button-label').textContent='Scanning…';
  $('parsedQuery').textContent = 'Scanning the configured market universe…';
  try {
    const result = await api('/api/screen', { method: 'POST', body: JSON.stringify({ query }) });
    if(state.user?.id!==owner)return;
    state.lastQuery=query;state.queryResults = result.data || [];
    $('resultCount').textContent = state.queryResults.length;
    $('parsedQuery').textContent = result.explanation && !result.explanation.includes('undefined') ? result.explanation : `${state.queryResults.length} matching instruments · ${result.market || result.provider || 'configured market'} · ${new Date().toLocaleTimeString()}`;
    $('scanTable').classList.remove('empty-state'); $('scanTable').innerHTML = stockTable(state.queryResults);
  } catch (err) {
    if(state.user?.id!==owner)return;
    state.lastQuery='';state.queryResults=[];
    $('resultCount').textContent = '—'; $('parsedQuery').textContent = 'Scan could not be completed.';
    $('queryError').textContent=err.message;$('queryError').classList.remove('hidden');
    if(err.status===400){$('queryInput').setAttribute('aria-invalid','true');$('queryInput').focus();}
    $('scanTable').classList.add('empty-state');$('scanTable').textContent=err.status===400?'Check the query above, or choose a valid example and run it again.':noProviderText(err);
  } finally {
    state.scanPending=false;$('runQuery').disabled=false;$('saveQuery').disabled=!state.lastQuery;
    $('runQuery').removeAttribute('aria-busy');$('scanTable').removeAttribute('aria-busy');
    $('runQuery').querySelector('.scan-spinner').classList.add('hidden');$('runQuery').querySelector('.scan-button-icon').classList.remove('hidden');$('runQuery').querySelector('.scan-button-label').textContent='Run Scan';
  }
}
$('runQuery').addEventListener('click', runQuery);
function syncQueryExamples(){document.querySelectorAll('[data-query]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.query===$('queryInput').value.trim())));}
document.querySelectorAll('[data-query]').forEach(b => {b.setAttribute('aria-pressed','false');b.addEventListener('click', () => { $('queryInput').value = b.dataset.query;syncQueryExamples();$('queryInput').removeAttribute('aria-invalid');$('queryError').classList.add('hidden');$('queryInput').focus(); });});
$('queryInput').addEventListener('input',()=>{syncQueryExamples();$('queryInput').removeAttribute('aria-invalid');$('queryError').classList.add('hidden');});
$('saveQuery').addEventListener('click', () => { if (!state.lastQuery) return toast('Run a scan before saving it.', true); $('queryName').value = ''; $('saveDialog').showModal(); });
$('confirmSave').addEventListener('click', async e => {
  e.preventDefault(); if(e.currentTarget.disabled)return;const name = $('queryName').value.trim(); if (!name) {$('queryName').reportValidity();return;}
  e.currentTarget.disabled=true;
  try { await api('/api/queries', { method: 'POST', body: JSON.stringify({ name, query: state.lastQuery }) }); $('saveDialog').close(); loadQueries(); toast('Scan saved to your account.'); }
  catch (err) { toast(err.message, true); }
  finally {$('confirmSave').disabled=false;}
});
async function loadQueries() {
  try {
    const { queries } = await api('/api/queries');
    $('savedQueries').innerHTML = queries.length ? queries.map(q => `<div class="saved-query"><div><b>${html(q.name)}</b><code>${html(q.query_text)}</code></div><button data-rerun="${html(q.query_text)}" title="Run this scan">▶</button></div>`).join('') : '<p class="muted">No saved scans yet.</p>';
    $('savedQueries').querySelectorAll('[data-rerun]').forEach(b => {b.setAttribute('aria-label','Run saved scan '+b.closest('.saved-query').querySelector('b').textContent);b.addEventListener('click', () => { $('queryInput').value = b.dataset.rerun;syncQueryExamples();navigate('screener');runQuery(); });});
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

function mountTvChart() {
  if(state.currentPage!=='charts')return;
  const useTv=$('chartSource').value==='tradingview';$('page-charts').classList.toggle('tradingview-mode',useTv);
  const footer=$('page-charts').querySelector('.chart-footer');
  $('page-charts').querySelector('.page-heading p').textContent=useTv?'TradingView charts with drawing tools, indicators, and symbol search.':'Practice with simulated prices, drawing tools, indicators, and chart alerts.';
  $('page-charts').querySelector('.data-pill').textContent=useTv?'Market data availability varies by exchange':'SIMULATED DATA';
  $('openTradingView').classList.toggle('hidden',!useTv);window.stockWorkspace?.mount();
  if(!useTv){tradingViewChart.dispose();$('chartProviderLabel').textContent='SIMULATED · fictional instruments';footer.innerHTML='<span>Simulation drawings are saved to your AlertPe account.</span><span>Fictional prices and simulated alert delivery.</span>';return simulationChart.mount($('chartSymbol').value.trim()||'NSE:SIM001').then(()=>window.chartWidgets?.sync()).catch(err=>{toast(err.message,true);throw err;});}
  simulationChart.dispose();liveMarket.subscribe();$('chartProviderLabel').textContent='TradingView · exchange data availability varies';
  footer.innerHTML='<span>Indian stocks: BSE end-of-day charts are available. NSE symbols may be restricted to tradingview.com.</span><span>Embedded drawings are not linked to AlertPe alerts or account storage. Configure TradingView webhooks in Settings.</span>';
  const candidate=$('chartSymbol').value.trim().toUpperCase();const symbol=/^[A-Z0-9&_.!:/-]{1,48}$/.test(candidate)&&! /^(NSE|BSE):SIM\d+$/.test(candidate)?candidate:'BSE:RELIANCE';
  $('chartSymbol').value=symbol;$('openTradingView').href='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(symbol);tradingViewChart.mount(symbol);
}
$('chartSource').onchange=()=>{if(window.stockWorkspace){stockWorkspace.request++;stockWorkspace.controller?.abort();clearTimeout(stockWorkspace.searchTimer);stockWorkspace.closeSearch();}$('chartSymbol').value=$('chartSource').value==='tradingview'?localStorage.getItem('chartpulse_tv_symbol')||'BSE:RELIANCE':localStorage.getItem('chartpulse_symbol')||'NSE:SIM001';mountTvChart();};


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
