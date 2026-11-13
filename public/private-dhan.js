(() => {
  const nav = document.createElement('button');
  nav.type = 'button'; nav.className = 'nav-item hidden'; nav.dataset.page = 'private-dhan';
  nav.innerHTML = `<span class="nav-icon" aria-hidden="true">${terminalIcon('charts')}</span> Private live quotes`;
  $('mainNav').append(nav);
  const page = document.createElement('section');
  page.id = 'page-private-dhan'; page.className = 'page hidden';
  page.innerHTML = `<div class="page-heading"><div><div class="eyebrow">PRIVATE WORKSPACE · DHANHQ</div><h1>Live equity quotes</h1><p class="muted">Quotes for your account only. Select a symbol to open its separate TradingView chart.</p></div><span class="tag" id="privateDhanBadge">WAITING FOR QUOTES</span></div>
    <form class="panel query-panel" id="privateDhanFilter"><label for="privateDhanQuery">Filter live quotes</label><div class="query-box"><input id="privateDhanQuery" maxlength="2000" placeholder="change_pct &lt;= -3" autocomplete="off"><button class="button primary" type="submit">Apply filter</button><button class="button secondary" type="reset">Clear</button></div></form>
    <section class="panel terminal-watch"><div class="panel-heading"><div><h2>Market watch</h2><p class="muted" id="privateDhanStatus" role="status">Waiting for Dhan.</p></div></div><div id="privateDhanTable" class="table-wrap empty-state">Waiting for quotes.</div></section>`;
  document.querySelector('.content-wrap').append(page);
  let timer, query = '', generation = 0, controller;
  function pause() { clearTimeout(timer); controller?.abort(); generation++; }
  function active() { return state.currentPage === 'private-dhan' && state.meta?.privateDhan && state.user && !document.hidden; }
  async function refresh() {
    pause(); if (!active()) return;
    const token = generation, owner = state.user.id;
    controller = new AbortController();
    const current = () => token === generation && owner === state.user?.id && active();
    try {
      const data = await api('/api/private-dhan/quotes?' + new URLSearchParams({ query }), { signal: controller.signal, cache: 'no-store' });
      if (!current()) return;
      const latest = Math.max(0,...data.quotes.map(quote => Date.parse(quote.updated_at) || 0));
      const fresh = data.connected && latest && Date.now() - latest < 120000;
      $('privateDhanBadge').textContent = fresh ? 'LIVE · DHANHQ' : latest ? 'LAST KNOWN QUOTES' : 'WAITING FOR QUOTES';
      const status = data.status + (latest ? ` Latest shown trade: ${quoteTime.format(latest)} IST.` : '');
      if ($('privateDhanStatus').textContent !== status) $('privateDhanStatus').textContent = status;
      updateMarketWatch($('privateDhanTable'),data.quotes);
      if (!data.quotes.length && query) $('privateDhanTable').textContent = 'No quotes match this filter.';
    } catch (err) {
      if (!current()) return;
      $('privateDhanBadge').textContent = 'UNAVAILABLE'; $('privateDhanStatus').textContent = err.message;
      updateMarketWatch($('privateDhanTable'),[]);
      if (err.status === 400 || err.status === 404) return;
    }
    if (current()) timer = setTimeout(refresh, 5000);
  }
  $('privateDhanFilter').addEventListener('submit',event=>{event.preventDefault();query=$('privateDhanQuery').value.trim();void refresh();});
  $('privateDhanFilter').addEventListener('reset',()=>{query='';void refresh();});
  document.addEventListener('visibilitychange',()=>{if(active())void refresh();else pause();});
  function reset() { pause(); query=''; nav.classList.add('hidden'); page.classList.add('hidden'); $('privateDhanQuery').value=''; $('privateDhanBadge').textContent='WAITING FOR QUOTES'; $('privateDhanStatus').textContent='Waiting for Dhan.'; updateMarketWatch($('privateDhanTable'),[]); }
  window.privateDhanView = { reset, configure(allowed) { reset(); nav.classList.toggle('hidden',!allowed); if(state.currentPage==='private-dhan')navigate('overview'); }, navigate(target) { if(target==='private-dhan')void refresh();else pause(); } };
})();
