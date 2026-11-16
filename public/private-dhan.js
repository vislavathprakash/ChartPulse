(() => {
  const nav = document.createElement('button');
  nav.type = 'button'; nav.className = 'nav-item hidden'; nav.dataset.page = 'private-dhan';
  nav.innerHTML = `<span class="nav-icon" aria-hidden="true">${terminalIcon('charts')}</span> Dhan terminal`;
  $('mainNav').append(nav);
  const page = document.createElement('section');
  page.id = 'page-private-dhan'; page.className = 'page hidden';
  page.innerHTML = `<div class="page-heading"><div><div class="eyebrow">PRIVATE WORKSPACE · DHANHQ</div><h1>Live market terminal</h1><p class="muted">NSE and BSE equities, MCX futures, charts, and research.</p></div><span class="tag" id="privateDhanBadge">WAITING FOR QUOTES</span></div>
    <section class="panel private-dhan-chart"><div class="panel-heading"><div><h2>Price history</h2><p class="muted" id="privateHistoryStatus" role="status">Loading the Dhan symbol list…</p></div><div class="terminal-actions"><select id="privateHistorySymbol" aria-label="Dhan symbol" disabled></select><select id="privateHistoryInterval" aria-label="Candle interval"><option value="1">1 min</option><option value="5">5 min</option><option value="15">15 min</option><option value="25">25 min</option><option value="60">1 hour</option><option value="day" selected>Daily</option></select><button id="privateHistoryRefresh" type="button" class="button secondary">Refresh chart</button></div></div><div id="privateDhanStats" class="private-dhan-stats"></div><div id="privateDhanPlot" class="empty-state">Waiting for a symbol.</div></section>
    <section class="panel dhan-research" aria-labelledby="dhanResearchHeading"><div class="panel-heading"><div><div class="eyebrow">DHANHQ DATA</div><h2 id="dhanResearchHeading">Market intelligence</h2><p id="dhanResearchContext" class="muted"></p></div><button class="button secondary" type="button" id="dhanResearchRefresh">Refresh data</button></div><div class="dhan-research-nav" role="group" aria-label="Market intelligence views">${[['depth','Market depth'],['company','Fundamentals'],['technicals','Technicals'],['movers','Market movers'],['news','Stock news']].map(([value,label])=>`<button type="button" data-dhan-research="${value}" aria-pressed="${value==='depth'}">${label}</button>`).join('')}</div><div class="dhan-research-filters hidden" id="dhanMoversFilters"><label>Exchange <select id="dhanMoversExchange"><option value="NSE_EQ">NSE</option><option value="BSE_EQ">BSE</option></select></label><label>Ranking <select id="dhanMoversRanking"><option value="PRICE_GAINERS">Gainers</option><option value="PRICE_LOSERS">Losers</option></select></label></div><p class="muted dhan-research-status" id="dhanResearchStatus" role="status">Choose a symbol to start.</p><div id="dhanResearchBody"></div></section>
    <form class="panel query-panel" id="privateDhanFilter"><label for="privateDhanQuery">Filter configured live quotes</label><div class="query-box"><input id="privateDhanQuery" maxlength="2000" placeholder="change_pct &lt;= -3" autocomplete="off"><button class="button primary" type="submit">Apply filter</button><button class="button secondary" type="reset">Clear</button></div></form>
    <section class="panel terminal-watch"><div class="panel-heading"><div><h2>Market watch</h2><p class="muted" id="privateDhanStatus" role="status">Waiting for Dhan.</p></div></div><div id="privateDhanTable" class="table-wrap empty-state">Waiting for quotes.</div></section>`;
  const views = [
    ['dashboard', 'Chart', 'charts'],
    ['watch', 'Market watch', 'list'],
    ['commodities', 'Commodities', 'commodity'],
    ['research', 'Research', 'research']
  ];
  const chartPanel = page.querySelector('.private-dhan-chart');
  const quoteStats=chartPanel.querySelector('#privateDhanStats');
  const chartStatus=chartPanel.querySelector('#privateHistoryStatus').parentElement;
  chartStatus.className='dhan-chart-status';
  const tradeStatus = document.createElement('p');
  tradeStatus.className = 'muted dhan-last-trade';
  chartPanel.querySelector('#privateHistoryStatus').after(tradeStatus);
  const watchPanel = page.querySelector('.terminal-watch');
  const researchPanel = page.querySelector('.dhan-research');
  const controls = chartPanel.querySelector('.terminal-actions');
  const shell = document.createElement('div');
  shell.className = 'dhan-terminal-shell';
  shell.innerHTML = `
    <div class="dhan-terminal-bar">
      <div class="dhan-workspace-tabs" role="tablist" aria-label="Dhan terminal">
        ${views.map(([id,label,icon])=>`<button type="button" role="tab" id="dhan-tab-${id}" aria-controls="dhan-pane-${id}" aria-label="${label}" title="${label}" aria-selected="false" tabindex="-1">${terminalIcon(icon)}<span>${label}</span></button>`).join('')}
      </div>
      <div class="dhan-symbol-control"><label for="privateHistorySymbol">Symbol</label></div>
      <div class="dhan-feed-slot"></div>
    </div>
    <div class="dhan-terminal-content">
      ${views.map(([id])=>`<section class="dhan-pane hidden" id="dhan-pane-${id}" role="tabpanel" aria-labelledby="dhan-tab-${id}" tabindex="0"></section>`).join('')}
    </div>`;
  shell.querySelector('.dhan-symbol-control').append(controls.querySelector('#privateHistorySymbol'));
  shell.querySelector('.dhan-feed-slot').append(page.querySelector('#privateDhanBadge'));
  shell.querySelector('#dhan-pane-dashboard').append(chartPanel);
  watchPanel.querySelector('.panel-heading').after(page.querySelector('#privateDhanFilter'));
  shell.querySelector('#dhan-pane-watch').append(watchPanel);
  shell.querySelector('#dhan-pane-research').append(researchPanel);
  const technicalInterval = document.createElement('label');
  technicalInterval.className = 'dhan-technical-interval hidden';
  technicalInterval.textContent = 'Interval';
  technicalInterval.insertAdjacentHTML('beforeend', '<select aria-label="Technical indicator interval"></select>');
  const researchInterval = technicalInterval.querySelector('select');
  researchInterval.append(...Array.from(controls.querySelector('select').options, option=>option.cloneNode(true)));
  researchInterval.value=$('privateHistoryInterval')?.value || controls.querySelector('select').value;
  researchPanel.querySelector('.dhan-research-nav').after(technicalInterval);
  page.append(shell);
  document.querySelector('.content-wrap').append(page);
  const desk = createDhanChartDesk($('privateDhanPlot'), controls, (symbol,item)=>{
    const select=$('privateHistorySymbol');
    if(!Array.from(select.options).some(option=>option.value===symbol)){
      const option=new Option(item?.expiry?`${symbol} · ${item.expiry}`:symbol,symbol);
      if(item?.expiry)option.dataset.expiry=item.expiry;
      select.add(option);
    }
    select.value=symbol;
    if(terminalView!=='dashboard')selectTerminalView('dashboard');
    select.dispatchEvent(new Event('change'));
  },()=>void refresh(),quoteStats);
  let timer, query = '', generation = 0, controller, historyController, symbolList = '';
  let researchView = 'depth', researchController, chartHistory;
  let terminalView = 'dashboard';
  const isWatch = ()=>terminalView==='watch'||terminalView==='commodities';
  function selectTerminalView(requested, {load = true, syncUrl = true} = {}) {
    terminalView = views.some(([id])=>id===requested) ? requested : 'dashboard';
    page.classList.toggle('dhan-chart-view',terminalView==='dashboard');
    for (const [id] of views) {
      const selected = id === terminalView;
      const tab = $(`dhan-tab-${id}`);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(`dhan-pane-${id}`).classList.toggle('hidden', !selected);
    }
    if (isWatch()) {
      $(`dhan-pane-${terminalView}`).append(watchPanel);
      watchPanel.querySelector('h2').textContent = terminalView==='commodities' ? 'MCX futures' : 'Market watch';
    }
    if (syncUrl && state.currentPage === 'private-dhan') {
      const url = new URL(location.href);
      url.searchParams.set('view', 'private-dhan');
      if (terminalView === 'dashboard') url.searchParams.delete('tab');
      else url.searchParams.set('tab', terminalView);
      history.replaceState(null, '', url);
    }
    if (!load || !active()) return;
    if (terminalView === 'research') {
      void loadResearch();
      if (researchView === 'technicals') void ensureHistory();
    } else {
      researchController?.abort();
      if (terminalView === 'dashboard') void ensureHistory();
    }
  }
  const tabList = shell.querySelector('[role="tablist"]');
  tabList.addEventListener('click', event=>{
    const tab = event.target.closest('[role="tab"]');
    if (tab && tab.getAttribute('aria-selected')!=='true') {
      selectTerminalView(tab.id.slice('dhan-tab-'.length));
      void refresh();
    }
  });
  tabList.addEventListener('keydown', event=>{
    const index = views.findIndex(([id])=>event.target.id===`dhan-tab-${id}`);
    const next = {ArrowLeft:(index+views.length-1)%views.length, ArrowRight:(index+1)%views.length, Home:0, End:views.length-1}[event.key];
    if (index < 0 || next === undefined) return;
    event.preventDefault();
    const [id] = views[next];
    selectTerminalView(id);
    $(`dhan-tab-${id}`).focus();
    void refresh();
  });
  selectTerminalView('dashboard', {load:false, syncUrl:false});
  function ensureHistory() {
    if (chartHistory?.symbol !== $('privateHistorySymbol').value || chartHistory?.interval !== $('privateHistoryInterval').value) return loadHistory();
  }
  function pause() { clearTimeout(timer); controller?.abort(); generation++; }
  function active() { return state.currentPage === 'private-dhan' && state.meta?.privateDhan && state.user && !document.hidden; }
  async function refresh() {
    pause(); if (!active()) return;
    const token = generation, owner = state.user.id;
    const filter = isWatch() ? query : '';
    controller = new AbortController();
    const current = () => token === generation && owner === state.user?.id && active();
    try {
      const data = await api('/api/private-dhan/quotes?' + new URLSearchParams({ query:filter, symbol:$('privateHistorySymbol').value, watch:desk.watchSymbols().join(',') }), { signal: controller.signal, cache: 'no-store' });
      if (!current()) return;
      const shown = data.quotes.filter(q=>terminalView==='commodities'?q.exchange==='MCX':q.exchange!=='MCX');
      const latest = Math.max(0,...shown.map(quote => Date.parse(quote.updated_at) || 0));
      const badge = $('privateDhanBadge');
      const activeRows = isWatch()?shown:data.selected?[data.selected]:data.quotes;
      const live = isWatch() ? data.connected && activeRows.some(q=>q.source==='stream'&&Date.now()-Date.parse(q.updated_at)<120000) : data.selected ? data.selectedLive : data.connected;
      badge.textContent = live ? 'Live · DhanHQ' : data.feedIssue==='authentication' ? 'Dhan token needs renewal' : data.feedIssue ? 'Feed unavailable' : activeRows.some(q=>q.source==='snapshot') ? 'Quote snapshot' : activeRows.length ? 'Last known quotes' : 'Waiting for quotes';
      badge.classList.toggle('dhan-live', live);
      badge.classList.toggle('dhan-feed-issue',Boolean(data.feedIssue));
      const status = terminalView==='commodities'&&!data.feedIssue?(data.commodityStatus||'Nearest expiry contracts · MCX'):data.status;
      const statusText = status + (latest ? ` Latest shown trade: ${quoteTime.format(latest)} IST.` : '');
      if ($('privateDhanStatus').textContent !== statusText) $('privateDhanStatus').textContent = statusText;
      updateMarketWatch($('privateDhanTable'),shown);
      $('privateDhanTable').querySelectorAll('[data-terminal-chart]').forEach((button,i)=>{const q=shown[i];button.setAttribute('aria-label',`Show Dhan price history for ${q.symbol}`);button.title=q.updated_at?`${q.source==='stream'?'WebSocket':'Snapshot'} · ${quoteTime.format(Date.parse(q.updated_at))} IST`:'Dhan quote · trade timestamp unavailable';});
      if (!shown.length && filter) $('privateDhanTable').textContent = 'No quotes match this filter.';
      const select=$('privateHistorySymbol'), list=JSON.stringify(data.symbols||[]);
      if(list!==symbolList){
        const old=select.value, previousContract=select.selectedOptions[0]?.dataset.expiry;
        symbolList=list;
        select.replaceChildren(...(data.symbols||[]).map(s=>{
          const option=new Option(s.expiry?`${s.symbol} · ${s.expiry}`:s.symbol,s.symbol);
          if(s.expiry)option.dataset.expiry=s.expiry;
          return option;
        }));
        select.disabled=!select.options.length;
        if([...select.options].some(o=>o.value===old))select.value=old;
        if(previousContract!==select.selectedOptions[0]?.dataset.expiry)chartHistory=null;
        if(select.value)selectTerminalView(terminalView,{syncUrl:false});
      }
      const chosen=data.selected?.symbol===select.value?data.selected:data.quotes.find(q=>q.symbol===select.value);
      if(terminalView==='dashboard')desk.updateQuotes(data.symbols||[],data.quotes,select.value,data.selectedLive===true);
      const expiry=select.selectedOptions[0]?.dataset.expiry;
      const trade=Date.parse(chosen?.updated_at);
      tradeStatus.textContent=[expiry?`Expires ${expiry}`:null,Number.isFinite(trade)?`Last trade ${quoteTime.format(trade)} IST`:null].filter(Boolean).join(' · ');
      $('privateDhanStats').innerHTML=chosen?Object.entries({'Last price':chosen.price,'Previous close':chosen.previous_close,'Day open':chosen.open,'Day high':chosen.high,'Day low':chosen.low,'Volume':chosen.volume}).map(([label,v])=>`<div><span>${label}</span><strong>${v==null?'—':label==='Volume'?fmt(v,0):quotePrice.format(v)}</strong></div>`).join(''):'';
    } catch (err) {
      if (!current()) return;
      if (err.status !== 400) {
        $('privateDhanBadge').textContent = 'Quotes unavailable';
        $('privateDhanBadge').classList.remove('dhan-live');
        $('privateDhanBadge').classList.add('dhan-feed-issue');
      }
      $('privateDhanStatus').textContent = err.message;
      updateMarketWatch($('privateDhanTable'),[]);
      if (err.status === 400 || err.status === 404) return;
    }
    if (current()) {
      if (terminalView==='dashboard' && chartHistory && Date.now()-chartHistory.loadedAt>60000 && !historyController?.pending) void loadHistory(true);
      timer = setTimeout(refresh, 5000);
    }
  }
  function drawHistory(candles,message) {
    const select=$('privateHistorySymbol');
    desk.show(select.value,$('privateHistoryInterval').value,select.selectedOptions[0]?.dataset.expiry,candles,message);
  }
  async function loadHistory(quiet=false){
    historyController?.abort();const symbol=$('privateHistorySymbol').value;if(!symbol||!active())return;
    const request=new AbortController();historyController=request;request.pending=true;
    const current=()=>!request.signal.aborted&&active()&&historyController===request;
    const interval=$('privateHistoryInterval').value;
    const previous=chartHistory?.symbol===symbol&&chartHistory?.interval===interval?chartHistory:null;
    if(!quiet){
      $('privateHistoryStatus').textContent=`Loading Dhan candles for ${symbol}…`;
      if(!previous)drawHistory([],'Loading candles…');
    }
    try{const {candles}=await api('/api/private-dhan/history?'+new URLSearchParams({symbol,interval}),{signal:request.signal,cache:'no-store'});if(!current())return;chartHistory={symbol,interval,candles,loadedAt:Date.now()};drawHistory(candles);$('privateHistoryStatus').textContent=`${symbol} · Dhan historical data · ${candles.length} candles available · IST`;if(researchView==='technicals')void loadResearch({quiet:true});}
    catch(err){
      if(current()){
        $('privateHistoryStatus').textContent=previous?`Showing last loaded candles · ${err.message}`:err.message;
        if(!previous)drawHistory([],err.message);
      }
    }
    finally { request.pending=false;if(quiet&&current()&&chartHistory)chartHistory.loadedAt=Date.now(); }
  }
  const researchNumber=(n,digits=2)=>n==null?'—':fmt(n,digits);
  const researchTime=value=>{const ms=typeof value==='number'?(value<1e12?value*1000:value):Date.parse(value);return Number.isFinite(ms)&&Math.abs(ms)<=864e13?`${quoteTime.format(ms)} IST`:'';};
  const metricNames={MARKET_CAP:'Market cap (₹ cr)',EBITDA:'EBITDA (₹ cr)',EPS:'EPS (₹)',BOOK_VALUE:'Book value (₹)',FIFTY_TWO_WEEK_HIGH:'52-week high (₹)',FIFTY_TWO_WEEK_LOW:'52-week low (₹)',PE_RATIO:'P/E',PB_RATIO:'P/B',PE_TO_SECTOR_PE:'P/E vs. sector',ROE:'ROE (%)',ROCE:'ROCE (%)',RSI_14:'RSI (14)',ATR_14:'ATR (14)',ADX_14:'ADX (14)',MACD_HIST:'MACD histogram'};
  function metricGrid(entries) {
    return `<dl class="dhan-metrics">${entries.map(([label,value])=>`<div><dt>${html(label)}</dt><dd>${html(value??'—')}</dd></div>`).join('')}</dl>`;
  }
  function table(headers,rows){return `<div class="table-wrap" tabindex="0" aria-label="Scrollable data table"><table class="data-table dhan-data-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  function safeNewsLink(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
  function localTechnicals(symbol,interval) {
    if(chartHistory?.symbol!==symbol||chartHistory.interval!==interval)return null;
    const now=Date.now()/1000, today=Math.floor((now+19800)/86400);
    const closedHour=symbol.startsWith('MCX:')?24:16;
    const candles=chartHistory.candles.filter(c=>interval==='day'?(Math.floor((c.time+19800)/86400)<today||((now+19800)%86400>=closedHour*3600&&c.time<=now)):c.time+Number(interval)*60<=now);
    const specs=[['SMA_20','sma',20],['SMA_50','sma',50],['SMA_200','sma',200],['EMA_20','ema',20],['EMA_50','ema',50],['RSI_14','rsi',14],['MACD_HIST','macd'],['ATR_14','atr',14],['ROC_10','roc',10]];
    const values=specs.map(([key,type,period])=>({key,value:Technicals.calculate(candles,{type,period})[type==='macd'?2:0]?.data.at(-1)})).filter(row=>Number.isFinite(row.value));
    return values.length?{Indicators:values}:null;
  }
  function renderResearch(data) {
    if(researchView==='depth') {
      const rows=Array.from({length:Math.max(data.bids.length,data.asks.length)},(_,i)=>{const b=data.bids[i],a=data.asks[i];return [researchNumber(b?.quantity,0),researchNumber(b?.orders,0),`<strong class="dhan-bid">${researchNumber(b?.price)}</strong>`,`<strong class="dhan-ask">${researchNumber(a?.price)}</strong>`,researchNumber(a?.orders,0),researchNumber(a?.quantity,0)];});
      return metricGrid([['Day VWAP (₹)',researchNumber(data.vwap)],['Lower circuit (₹)',researchNumber(data.lower)],['Upper circuit (₹)',researchNumber(data.upper)],['Pending buy qty',researchNumber(data.buyQuantity,0)],['Pending sell qty',researchNumber(data.sellQuantity,0)],['Last trade qty',researchNumber(data.lastQuantity,0)]])+(rows.length?table(['Buy qty','Orders','Bid (₹)','Ask (₹)','Orders','Sell qty'],rows):'<p class="muted dhan-no-data">No active bid or ask levels were returned.</p>');
    }
    if(researchView==='company'||researchView==='technicals')return Object.entries(data).map(([label,rows])=>`<section class="dhan-metric-section"><h3>${html(label)}</h3>${metricGrid(rows.map(({key,value})=>[metricNames[key]??key.replaceAll('_',' ').replace(/\b(?:SMA|EMA|DII|FII|EPS|ROC|PB)\b|\b[A-Z]+\b/g,s=>/^(SMA|EMA|DII|FII|EPS|ROC|PB)$/.test(s)?s:s[0]+s.slice(1).toLowerCase()),typeof value==='number'?researchNumber(value,4):value]))}</section>`).join('');
    if(researchView==='movers')return data.length?table(['Symbol','Last (₹)','Change %','Volume'],data.map(r=>[`${html(String(r.symbol))}${r.name?`<small>${html(String(r.name))}</small>`:''}`,researchNumber(r.price),r.change==null?'—':`<strong class="${r.change<0?'dhan-ask':r.change>0?'dhan-bid':''}">${r.change>0?'+':''}${researchNumber(r.change)}%</strong>`,researchNumber(r.volume,0)])):'';
    return data.length?`<ul class="dhan-headlines">${data.map(item=>{const link=safeNewsLink(item.link);return `<li>${link?`<a href="${html(link)}" target="_blank" rel="noopener noreferrer">${html(String(item.title))}</a>`:`<strong>${html(String(item.title))}</strong>`}<small>${[item.source,researchTime(item.published)].filter(Boolean).map(v=>html(String(v))).join(' · ')}</small></li>`;}).join('')}</ul>`:'';
  }
  async function loadResearch({quiet=false}={}) {
    researchController?.abort();
    const symbol=$('privateHistorySymbol').value, interval=$('privateHistoryInterval').value;
    if(!active()||terminalView!=='research'||(!symbol&&researchView!=='movers'))return;
    const request=new AbortController();researchController=request;
    const status=$('dhanResearchStatus'),body=$('dhanResearchBody'),button=$('dhanResearchRefresh');
    const current=()=>researchController===request&&!request.signal.aborted&&active();
    $('dhanMoversFilters').classList.toggle('hidden',researchView!=='movers');
    technicalInterval.classList.toggle('hidden',researchView!=='technicals');
    $('dhanResearchContext').textContent=researchView==='movers'?'Exchange ranking · DhanHQ':`${symbol} · ${researchView==='technicals'?$('privateHistoryInterval').selectedOptions[0].text+' · latest closed candle':'DhanHQ'}`;
    if(!quiet){status.textContent='Loading Dhan data…';body.replaceChildren();}
    button.disabled=true;
    try {
      const result=await api('/api/private-dhan/research?'+new URLSearchParams({view:researchView,symbol,interval,segment:$('dhanMoversExchange').value,category:$('dhanMoversRanking').value}),{signal:request.signal,cache:'no-store'});
      if(!current())return;
      if(researchView==='technicals'&&(result.error||!Object.keys(result.data??{}).length)) {
        const data=localTechnicals(symbol,interval);
        if(data){body.innerHTML=renderResearch(data);status.textContent='Calculated by AlertPe from completed Dhan candles. Dhan’s indicator endpoint did not return values.';return;}
      }
      if(result.error){status.textContent=result.error;body.replaceChildren();return;}
      const content=renderResearch(result.data);
      if(body.innerHTML!==content)body.innerHTML=content;
      const retrieved=researchTime(result.data.retrievedAt??result.retrievedAt);
      status.textContent=[result.warning,content&&researchView==='depth'?'Up to five levels · snapshot':null,content&&retrieved?`Retrieved ${retrieved}`:null,!content?(result.fallback?'No matching movers.':'Dhan returned no usable data for this selection.'):null].filter(Boolean).join(' · ');
    } catch(error){if(current()){status.textContent=error.message;body.replaceChildren();}}
    finally{if(researchController===request)button.disabled=false;}
  }
  $('privateHistorySymbol').addEventListener('change',()=>{selectTerminalView(terminalView,{syncUrl:false});void refresh();});
  $('privateHistoryInterval').addEventListener('change',()=>{researchInterval.value=$('privateHistoryInterval').value;void loadHistory();});
  researchInterval.addEventListener('change',()=>{
    $('privateHistoryInterval').value=researchInterval.value;
    void ensureHistory();
    void loadResearch();
  });
  $('privateHistoryRefresh').addEventListener('click',()=>void loadHistory());
  $('privateDhanTable').addEventListener('click',event=>{
    const symbol=event.target.closest('[data-terminal-chart]')?.dataset.terminalChart;
    if(!symbol)return;
    event.stopPropagation();
    $('privateHistorySymbol').value=symbol;
    selectTerminalView('dashboard');
    $('dhan-tab-dashboard').focus();
    void refresh();
  });
  $('privateDhanFilter').addEventListener('submit',event=>{event.preventDefault();query=$('privateDhanQuery').value.trim();void refresh();});
  $('privateDhanFilter').addEventListener('reset',()=>{query='';void refresh();});
  const browse=document.createElement('button');
  browse.type='button';
  browse.className='button secondary';
  browse.textContent='Browse all symbols';
  browse.onclick=()=>desk.searchSymbols();
  watchPanel.querySelector('.panel-heading').append(browse);
  page.querySelector('.dhan-research-nav').addEventListener('click',event=>{const target=event.target.closest('[data-dhan-research]');if(!target||target.dataset.dhanResearch===researchView)return;researchView=target.dataset.dhanResearch;page.querySelectorAll('[data-dhan-research]').forEach(btn=>btn.setAttribute('aria-pressed',btn===target));void loadResearch();if(researchView==='technicals')void ensureHistory();});
  for(const id of ['dhanMoversExchange','dhanMoversRanking'])$(id).addEventListener('change',()=>void loadResearch());
  $('dhanResearchRefresh').addEventListener('click',()=>void loadResearch({quiet:true}));
  document.addEventListener('visibilitychange',()=>{if(active()){void refresh();if(terminalView==='dashboard')void ensureHistory();void loadResearch({quiet:true});}else {pause();researchController?.abort();}});
  function reset() { pause(); historyController?.abort();researchController?.abort();chartHistory=null;$('dhanResearchBody').replaceChildren();$('dhanResearchContext').textContent='';$('dhanResearchStatus').textContent='Choose a symbol to start.'; symbolList=''; query=''; nav.classList.add('hidden'); page.classList.add('hidden'); $('privateHistorySymbol').replaceChildren(); $('privateHistorySymbol').disabled=true; $('privateHistoryStatus').textContent='Loading the Dhan symbol list…'; $('privateDhanStats').replaceChildren();desk.reset(); $('privateDhanQuery').value=''; $('privateDhanBadge').textContent='WAITING FOR QUOTES'; $('privateDhanStatus').textContent='Waiting for Dhan.'; updateMarketWatch($('privateDhanTable'),[]); }
  window.privateDhanView = {
    reset,
    configure(allowed) {
      reset();
      nav.classList.toggle('hidden',!allowed);
      selectTerminalView('dashboard',{load:false,syncUrl:false});
    },
    navigate(target) {
      if(target==='private-dhan'){
        desk.loadLists();
        selectTerminalView(new URLSearchParams(location.search).get('tab'));
        void refresh();
      } else {
        pause();
        historyController?.abort();
        researchController?.abort();
      }
    }
  };
})();
