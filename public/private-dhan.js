(() => {
  const nav = document.createElement('button');
  nav.type = 'button'; nav.className = 'nav-item hidden'; nav.dataset.page = 'private-dhan';
  nav.innerHTML = `<span class="nav-icon" aria-hidden="true">${terminalIcon('charts')}</span> Private live quotes`;
  $('mainNav').append(nav);
  const page = document.createElement('section');
  page.id = 'page-private-dhan'; page.className = 'page hidden';
  page.innerHTML = `<div class="page-heading"><div><div class="eyebrow">PRIVATE WORKSPACE · DHANHQ</div><h1>Live equity quotes</h1><p class="muted">NSE and BSE quotes and historical candles for your account.</p></div><span class="tag" id="privateDhanBadge">WAITING FOR QUOTES</span></div>
    <section class="panel private-dhan-chart"><div class="panel-heading"><div><h2>Price history</h2><p class="muted" id="privateHistoryStatus" role="status">Loading the Dhan symbol list…</p></div><div class="terminal-actions"><select id="privateHistorySymbol" aria-label="Dhan symbol" disabled></select><select id="privateHistoryInterval" aria-label="Candle interval"><option value="day">Daily</option><option value="5">5 min</option><option value="15">15 min</option><option value="60">1 hour</option></select><button id="privateHistoryRefresh" type="button" class="button secondary">Refresh chart</button></div></div><div id="privateDhanStats" class="private-dhan-stats"></div><div id="privateDhanPlot" class="empty-state">Waiting for a symbol.</div></section>
    <form class="panel query-panel" id="privateDhanFilter"><label for="privateDhanQuery">Filter live quotes</label><div class="query-box"><input id="privateDhanQuery" maxlength="2000" placeholder="change_pct &lt;= -3" autocomplete="off"><button class="button primary" type="submit">Apply filter</button><button class="button secondary" type="reset">Clear</button></div></form>
    <section class="panel terminal-watch"><div class="panel-heading"><div><h2>Market watch</h2><p class="muted" id="privateDhanStatus" role="status">Waiting for Dhan.</p></div></div><div id="privateDhanTable" class="table-wrap empty-state">Waiting for quotes.</div></section>`;
  document.querySelector('.content-wrap').append(page);
  let timer, query = '', generation = 0, controller, historyController, symbolList = '';
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
      const fresh = data.connected && data.quotes.some(q=>q.source==='stream'&&Date.now()-Date.parse(q.updated_at)<120000);
      $('privateDhanBadge').textContent = fresh ? 'LIVE · DHANHQ' : data.quotes.some(q=>q.source==='snapshot') ? 'QUOTE SNAPSHOT' : latest ? 'LAST KNOWN QUOTES' : 'WAITING FOR QUOTES';
      const status = data.status + (latest ? ` Latest shown trade: ${quoteTime.format(latest)} IST.` : '');
      if ($('privateDhanStatus').textContent !== status) $('privateDhanStatus').textContent = status;
      updateMarketWatch($('privateDhanTable'),data.quotes);
      $('privateDhanTable').querySelectorAll('[data-terminal-chart]').forEach((button,i)=>{const q=data.quotes[i];button.setAttribute('aria-label',`Show Dhan price history for ${q.symbol}`);button.title=q.updated_at?`${q.source==='stream'?'WebSocket':'Snapshot'} · ${quoteTime.format(Date.parse(q.updated_at))} IST`:'Dhan quote · trade timestamp unavailable';});
      if (!data.quotes.length && query) $('privateDhanTable').textContent = 'No quotes match this filter.';
      const select=$('privateHistorySymbol'), list=JSON.stringify(data.symbols||[]);
      if(list!==symbolList){const old=select.value;symbolList=list;select.replaceChildren(...(data.symbols||[]).map(s=>new Option(s.symbol,s.symbol)));select.disabled=!select.options.length;if([...select.options].some(o=>o.value===old))select.value=old;if(select.value)void loadHistory();}
      const chosen=data.quotes.find(q=>q.symbol===select.value);
      $('privateDhanStats').innerHTML=chosen?Object.entries({'Last price':chosen.price,'Previous close':chosen.previous_close,'Day open':chosen.open,'Day high':chosen.high,'Day low':chosen.low,'Volume':chosen.volume}).map(([label,v])=>`<div><span>${label}</span><strong>${v==null?'—':label==='Volume'?fmt(v,0):quotePrice.format(v)}</strong></div>`).join(''):'';
    } catch (err) {
      if (!current()) return;
      $('privateDhanBadge').textContent = 'UNAVAILABLE'; $('privateDhanStatus').textContent = err.message;
      updateMarketWatch($('privateDhanTable'),[]);
      if (err.status === 400 || err.status === 404) return;
    }
    if (current()) timer = setTimeout(refresh, 5000);
  }
  function drawHistory(candles) {
    const chart=$('privateDhanPlot'), bars=candles.slice(-100);
    chart.classList.toggle('empty-state',!bars.length);
    if(!bars.length){chart.textContent='No candles returned for this interval.';return;}
    const high=Math.max(...bars.map(c=>c.high)),low=Math.min(...bars.map(c=>c.low)),span=Math.max(high-low,high*.001), y=value=>14+(high-value)*190/span;
    const step=700/bars.length, volume=Math.max(1,...bars.map(c=>c.volume??0));
    chart.innerHTML=`<svg class="private-dhan-svg" viewBox="0 0 790 268" role="img" aria-label="Dhan historical candlesticks and volume">${[0,1,2,3,4].map(i=>`<path d="M12 ${14+i*47.5}H720" class="private-grid"/><text x="726" y="${18+i*47.5}">${fmt(high-span*i/4)}</text>`).join('')}${bars.map((c,i)=>{const x=14+(i+.5)*step,w=Math.max(1,step*.64),color=c.close>=c.open?'up':'down',v=32*(c.volume||0)/volume;return `<g class="${color}"><title>${html(new Date(c.time*1000).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))} IST · O ${fmt(c.open)} H ${fmt(c.high)} L ${fmt(c.low)} C ${fmt(c.close)} · Volume ${fmt(c.volume||0,0)}</title><path d="M${x} ${y(c.high)}V${y(c.low)}"/><rect x="${x-w/2}" y="${Math.min(y(c.open),y(c.close))}" width="${w}" height="${Math.max(1,Math.abs(y(c.open)-y(c.close)))}"/><rect class="private-volume" x="${x-w/2}" y="${244-v}" width="${w}" height="${v}"/></g>`;}).join('')}<text x="14" y="261">${html(new Date(bars[0].time*1000).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}))}</text><text x="720" y="261" text-anchor="end">${html(new Date(bars.at(-1).time*1000).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}))} IST</text></svg>`;
  }
  async function loadHistory(){
    historyController?.abort();const symbol=$('privateHistorySymbol').value;if(!symbol||!active())return;
    const request=new AbortController();historyController=request;
    const current=()=>!request.signal.aborted&&active()&&historyController===request;
    $('privateHistoryStatus').textContent=`Loading Dhan candles for ${symbol}…`;drawHistory([]);$('privateDhanPlot').textContent='Loading candles…';
    try{const {candles}=await api('/api/private-dhan/history?'+new URLSearchParams({symbol,interval:$('privateHistoryInterval').value}),{signal:request.signal,cache:'no-store'});if(!current())return;drawHistory(candles);$('privateHistoryStatus').textContent=`${symbol} · Dhan historical data · ${Math.min(100,candles.length)} candles shown · IST`;}
    catch(err){if(current()){$('privateHistoryStatus').textContent=err.message;$('privateDhanPlot').textContent='Historical candles unavailable.';}}
  }
  for(const id of ['privateHistorySymbol','privateHistoryInterval'])$(id).addEventListener('change',()=>void loadHistory());
  $('privateHistoryRefresh').addEventListener('click',()=>void loadHistory());
  $('privateDhanTable').addEventListener('click',event=>{const symbol=event.target.closest('[data-terminal-chart]')?.dataset.terminalChart;if(!symbol)return;event.stopPropagation();$('privateHistorySymbol').value=symbol;void loadHistory();});
  $('privateDhanFilter').addEventListener('submit',event=>{event.preventDefault();query=$('privateDhanQuery').value.trim();void refresh();});
  $('privateDhanFilter').addEventListener('reset',()=>{query='';void refresh();});
  document.addEventListener('visibilitychange',()=>{if(active())void refresh();else pause();});
  function reset() { pause(); historyController?.abort(); symbolList=''; query=''; nav.classList.add('hidden'); page.classList.add('hidden'); $('privateHistorySymbol').replaceChildren(); $('privateHistorySymbol').disabled=true; $('privateHistoryStatus').textContent='Loading the Dhan symbol list…'; $('privateDhanStats').replaceChildren();drawHistory([]); $('privateDhanPlot').textContent='Waiting for a symbol.'; $('privateDhanQuery').value=''; $('privateDhanBadge').textContent='WAITING FOR QUOTES'; $('privateDhanStatus').textContent='Waiting for Dhan.'; updateMarketWatch($('privateDhanTable'),[]); }
  window.privateDhanView = { reset, configure(allowed) { reset(); nav.classList.toggle('hidden',!allowed); if(state.currentPage==='private-dhan')navigate('overview'); }, navigate(target) { if(target==='private-dhan'){void refresh();if($('privateHistorySymbol').value)void loadHistory();}else {pause();historyController?.abort();} } };
})();
