(() => {
  const nav = document.createElement('button');
  nav.type = 'button'; nav.className = 'nav-item hidden'; nav.dataset.page = 'private-dhan';
  nav.innerHTML = `<span class="nav-icon" aria-hidden="true">${terminalIcon('charts')}</span> Dhan terminal`;
  $('mainNav').append(nav);
  const page = document.createElement('section');
  page.id = 'page-private-dhan'; page.className = 'page hidden';
  page.innerHTML = `<div class="page-heading"><div><div class="eyebrow">PRIVATE WORKSPACE · DHANHQ</div><h1>Live market terminal</h1><p class="muted">NSE and BSE stocks, indices, futures and options, plus MCX futures and options.</p></div><span class="tag" id="privateDhanBadge">WAITING FOR QUOTES</span></div>
    <section class="panel private-dhan-chart"><div class="panel-heading"><div><h2>Price history</h2><p class="muted" id="privateHistoryStatus" role="status">Loading the Dhan symbol list…</p></div><div class="terminal-actions"><select id="privateHistorySymbol" aria-label="Dhan symbol" disabled></select><select id="privateHistoryInterval" aria-label="Candle interval"><option value="1">1 min</option><option value="5">5 min</option><option value="15">15 min</option><option value="25">25 min</option><option value="60">1 hour</option><option value="day" selected>Daily</option></select><button id="privateHistoryRefresh" type="button" class="button secondary">Refresh chart</button></div></div><div id="privateDhanStats" class="private-dhan-stats"></div><div id="privateDhanPlot" class="empty-state">Waiting for a symbol.</div></section>
    <section class="panel dhan-research" aria-labelledby="dhanResearchHeading"><div class="panel-heading"><div><div class="eyebrow">DHANHQ DATA</div><h2 id="dhanResearchHeading">Market intelligence</h2><p id="dhanResearchContext" class="muted"></p></div><button class="button secondary" type="button" id="dhanResearchRefresh">Refresh data</button></div><div class="dhan-research-nav" role="group" aria-label="Market intelligence views">${[['stock','Stock overview'],['depth','Market depth'],['chain','Option chain'],['company','Fundamentals'],['technicals','Technicals'],['movers','Market movers'],['news','Stock news']].map(([value,label])=>`<button type="button" data-dhan-research="${value}" aria-pressed="${value==='stock'}">${label}</button>`).join('')}</div><div class="dhan-research-filters hidden" id="dhanMoversFilters"><label>Exchange <select id="dhanMoversExchange"><option value="NSE_EQ">NSE</option><option value="BSE_EQ">BSE</option></select></label><label>Ranking <select id="dhanMoversRanking"><option value="PRICE_GAINERS">Gainers</option><option value="PRICE_LOSERS">Losers</option></select></label></div><p class="muted dhan-research-status" id="dhanResearchStatus" role="status">Choose a symbol to start.</p><div id="dhanResearchBody"></div></section>
    <form class="panel query-panel" id="privateDhanFilter"><label for="privateDhanQuery">Filter configured live quotes</label><div class="query-box"><input id="privateDhanQuery" maxlength="2000" placeholder="change_pct &lt;= -3" autocomplete="off"><button class="button primary" type="submit">Apply filter</button><button class="button secondary" type="reset">Clear</button></div></form>
    <section class="panel terminal-watch"><div class="panel-heading"><div><h2>Market watch</h2><p class="muted" id="privateDhanStatus" role="status">Waiting for Dhan.</p></div></div><div id="privateDhanTable" class="table-wrap empty-state">Waiting for quotes.</div></section>`;
  const views = [
    ['overview', 'Market overview', 'overview'],
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
  const feedSlot = shell.querySelector('.dhan-feed-slot');
  const feedBadge = page.querySelector('#privateDhanBadge');
  feedSlot.append(feedBadge);
  shell.querySelector('#dhan-pane-dashboard').append(chartPanel);
  watchPanel.querySelector('.panel-heading').after(page.querySelector('#privateDhanFilter'));
  shell.querySelector('#dhan-pane-watch').append(watchPanel);
  const commodityPanel=createCommodityPanel();
  shell.querySelector('#dhan-pane-commodities').append(commodityPanel);
  shell.querySelector('#dhan-pane-research').append(researchPanel);
  const overview = shell.querySelector('#dhan-pane-overview');
  overview.innerHTML = `<section class="panel dhan-live-overview">
    <div class="panel-heading"><div><h2>Live market overview</h2><p class="muted">DhanHQ quotes for benchmark indices and tracked stocks</p></div>
      <div class="dhan-overview-actions"><div class="dhan-overview-feed"></div>${[['index','Browse indices'],['futures','Futures'],['options','Options']].map(([kind,label])=>`<button type="button" class="button secondary" data-dhan-catalog="${kind}">${label}</button>`).join('')}</div>
    </div>
    <div class="dhan-overview-browser">
      <div class="dhan-research-nav" role="group" aria-label="Overview views">
        <button type="button" data-market-view="indices" aria-pressed="true">Indices</button>
        <button type="button" data-market-view="stocks" aria-pressed="false">Stocks</button>
      </div>
      <div id="dhanIndexFilters"><label>Index <select id="dhanOverviewIndex" disabled><option value="NSE:NIFTY">Nifty 50</option></select></label></div>
      <div id="dhanStockFilters" class="hidden"><label>Find a stock <input id="dhanOverviewSearch" type="search" placeholder="Symbol or company" autocomplete="off" maxlength="80"></label><label>Exchange <select id="dhanOverviewExchange"><option value="">NSE and BSE</option><option>NSE</option><option>BSE</option></select></label></div>
      <div class="dhan-overview-feedback"><p id="dhanUniverseStatus" class="muted" role="status"></p><button type="button" id="dhanUniverseRetry" class="button secondary hidden">Retry</button></div>
    </div>
    <div id="dhanOverviewData" aria-label="Market insights"></div>
    <div id="dhanOverviewPager" class="dhan-overview-pager hidden"><button type="button" class="button secondary" data-market-page="-50">Previous</button><button type="button" class="button secondary" data-market-page="50">Next</button></div>
  </section>`;
  const overviewPanel = overview.firstElementChild;
  const workspaceOverview = $('page-overview');
  const overviewHeading = workspaceOverview.querySelector('.terminal-overview-heading');
  const overviewFeed = overviewPanel.querySelector('.dhan-overview-feed');
  const simulatedHeading = document.createElement('h2');
  simulatedHeading.className = 'dhan-simulated-heading hidden';
  simulatedHeading.textContent = 'Simulated workspace';
  overviewHeading.after(simulatedHeading);

  function placeOverview(inWorkspace) {
    if(inWorkspace){
      overviewHeading.after(overviewPanel);
      overviewFeed.append(feedBadge);
    }else{
      overview.append(overviewPanel);
      feedSlot.append(feedBadge);
    }
  }
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
  function setSymbol(symbol,item) {
    const select=$('privateHistorySymbol');
    if(!Array.from(select.options).some(option=>option.value===symbol)){
      const expiry=item?.expiry??/_(\d{4}-\d{2}-\d{2})$/.exec(symbol)?.[1];
      const label=item?.name??symbol.replace(/_\d{4}-\d{2}-\d{2}$/,'');
      const option=new Option(expiry?label+' · '+expiry:label,symbol);
      if(expiry)option.dataset.expiry=expiry;
      select.add(option);
    }
    select.value=symbol;
  }
  function openChart(symbol,item) {
    setSymbol(symbol,item);
    if(state.currentPage==='overview'){navigate('private-dhan');return;}
    selectTerminalView('dashboard');
    void refresh();
  }
  const desk = createDhanChartDesk($('privateDhanPlot'), controls, openChart, ()=>void refresh(),quoteStats,(item,action)=>{
    setSymbol(item.symbol,item);
    chooseResearch(action);
    if(state.currentPage==='overview'){
      history.replaceState(null,'','/app?view=private-dhan&tab=research');
      navigate('private-dhan');
    }else{
      selectTerminalView('research');
      void refresh();
    }
    $('dhan-tab-research').focus();
  });
  let timer, query = '', generation = 0, controller, historyController, symbolList = '';
  let researchView = 'stock', researchController, chartHistory, chainExpiry='';
  function chooseResearch(view) {
    researchView=view;
    chainExpiry='';
    page.querySelectorAll('[data-dhan-research]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dhanResearch===view)));
  }
  let terminalView = 'dashboard';
  const isWatch = ()=>terminalView==='watch';
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
    if (syncUrl && state.currentPage === 'private-dhan') {
      const url = new URL(location.href);
      url.searchParams.set('view', 'private-dhan');
      if (terminalView === 'dashboard') url.searchParams.delete('tab');
      else url.searchParams.set('tab', terminalView);
      if(terminalView!=='commodities')url.searchParams.delete('commodity');
      history.replaceState(null, '', url);
    }
    if (!load || !active()) return;
    if(terminalView==='commodities'){if(!commodityData&&!commodityRequest)void loadCommodities();}
    else stopCommodityRequest();
    if(terminalView==='overview'){
      if(!universe&&!universeRequest)void loadUniverse();
    }else stopUniverse();
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
  const overviewActive=()=>workspaceActive() || active()&&terminalView==='overview';
  function active() { return state.currentPage === 'private-dhan' && state.meta?.privateDhan && state.user && !document.hidden; }
  const workspaceActive = () => state.currentPage==='overview' && state.meta?.privateDhan && state.user && !document.hidden;
  const quotesActive = () => active() || workspaceActive();
  async function refresh() {
    pause(); if (!quotesActive()) return;
    const token = generation, owner = state.user.id;
    const embedded = workspaceActive();
    const marketOverview = embedded || terminalView==='overview';
    const watchView = !embedded && isWatch();
    const commodities = !embedded&&terminalView==='commodities';
    if(commodities&&commodityWaiting&&!commodityRequest&&!commodityTimer)void loadCommodities();
    const filter = watchView ? query : '';
    if(marketOverview&&universeError===503&&!universeRequest)void loadUniverse();
    const watch=new Set(desk.watchSymbols());
    if(commodities)for(const item of commodityData?.items??[])watch.add(item.symbol);
    if(marketOverview){
      for(const item of universe?.items??[]){if(item.symbol)watch.add(item.symbol);}
      if(marketView==='indices')watch.add($('dhanOverviewIndex').value);
    }
    let retry = true;
    controller = new AbortController();
    const current = () => token === generation && owner === state.user?.id && quotesActive();
    try {
      const data = await api('/api/private-dhan/quotes?' + new URLSearchParams({ query:filter, symbol:$('privateHistorySymbol').value, watch:[...watch].slice(-200).join(',') }), { signal: controller.signal, cache: 'no-store' });
      if (!current()) return;
      const shown = data.quotes.filter(q=>terminalView==='commodities'?q.exchange==='MCX':q.exchange!=='MCX');
      const latest = Math.max(0,...shown.map(quote => Date.parse(quote.updated_at) || 0));
      const badge = $('privateDhanBadge');
      const activeRows = marketOverview?data.quotes:watchView||commodities?shown:data.selected?[data.selected]:data.quotes;
      const live = watchView||marketOverview||commodities ? data.connected && activeRows.some(q=>q.source==='stream'&&Date.now()-Date.parse(q.updated_at)<120000) : data.selected ? data.selectedLive : data.connected;
      badge.textContent = live ? 'Live · DhanHQ' : data.feedIssue==='authentication' ? 'Dhan token needs renewal' : data.feedIssue ? 'Feed unavailable' : activeRows.some(q=>q.source==='snapshot') ? 'Quote snapshot' : activeRows.length ? 'Last known quotes' : 'Waiting for quotes';
      badge.classList.toggle('dhan-live', live);
      badge.classList.toggle('dhan-feed-issue',Boolean(data.feedIssue));
      if(marketOverview){overviewQuotes=data.quotes;renderOverview();}
      if(embedded)return;
      if(commodities)renderCommodities(shown,data.commodityStatus||statusLabel(latest));
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
          const option=new Option(s.expiry?`${s.name} · ${s.expiry}`:s.symbol,s.symbol);
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
      if(marketOverview){
        overviewQuotes=[];
        renderOverview();
        $('dhanUniverseStatus').textContent='Dhan quotes unavailable. '+err.message;
      }
      updateMarketWatch($('privateDhanTable'),[]);
      retry = err.status !== 400 && err.status !== 404;
    } finally {
      if(retry && current()){
        if (!embedded && terminalView==='dashboard' && chartHistory && Date.now()-chartHistory.loadedAt>60000 && !historyController?.pending) void loadHistory(true);
        timer = setTimeout(refresh, 5000);
      }
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
  function changeMarkup(value) {
    if(!Number.isFinite(value))return '—';
    return `<span class="${value>0?'dhan-bid':value<0?'dhan-ask':''}">${value>0?'+':''}${researchNumber(value)}%</span>`;
  }
  function quoteMetrics(q={}) {
    return metricGrid([['Last price',researchNumber(q.price)],['Previous close',researchNumber(q.previous_close)],['Day open',researchNumber(q.open)],['Day high',researchNumber(q.high)],['Day low',researchNumber(q.low)],['Volume',researchNumber(q.volume,0)]]);
  }
  function chartButton(symbol,label) {
    return `<button type="button" class="dhan-inline-chart" data-dhan-open-chart="${html(symbol)}" title="Fullscreen chart">${html(label)} ${terminalIcon('fullscreen')}</button>`;
  }
  let marketView='indices', stockOffset=0, universe, universeRequest, universeError, universeTimer, overviewQuotes=[];
  function stopUniverse() {
    clearTimeout(universeTimer);
    universeRequest?.abort();
    universeRequest=null;
  }
  async function loadUniverse() {
    if(!overviewActive())return;
    stopUniverse();
    const status=$('dhanUniverseStatus');
    const retry=$('dhanUniverseRetry');
    const isIndex=marketView==='indices';
    const request=new AbortController();
    universeRequest=request;
    universeError=null;
    status.textContent=isIndex?'Loading index constituents…':'Loading stock listings…';
    retry.classList.add('hidden');
    const index=$('dhanOverviewIndex');
    try{
      const path=isIndex?'constituents?'+new URLSearchParams({index:index.value}):'symbols?'+new URLSearchParams({kind:'equity',q:$('dhanOverviewSearch').value,exchange:$('dhanOverviewExchange').value,offset:stockOffset});
      const data=await api('/api/private-dhan/'+path,{signal:request.signal,cache:'no-store'});
      if(request.signal.aborted)return;
      if(data.ready===false)throw Object.assign(new Error('Dhan’s instrument directory is still loading.'),{status:503});
      universe=data;
      if(isIndex){
        index.replaceChildren(...data.indices.map(item=>new Option(item.name,item.symbol,item.symbol===data.symbol,item.symbol===data.symbol)));
        index.disabled=false;
        status.textContent='';
      }else{
        status.textContent=data.total?`Showing ${fmt(stockOffset+1,0)}–${fmt(stockOffset+data.items.length,0)} of ${fmt(data.total,0)} Dhan stock listings`:'No matching stocks.';
      }
      renderOverview();
      void refresh();
    }catch(error){
      if(request.signal.aborted)return;
      universeError=error.status??500;
      status.textContent=error.message;
      retry.classList.toggle('hidden',universeError===503);
    }finally{
      if(universeRequest===request)universeRequest=null;
    }
  }

  function switchUniverse(view,offset=0,delay=0,load=true) {
    stopUniverse();
    marketView=view;
    stockOffset=offset;
    universe=null;
    universeError=null;
    overviewPanel.querySelectorAll('[data-market-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.marketView===view)));
    $('dhanIndexFilters').classList.toggle('hidden',view!=='indices');
    $('dhanStockFilters').classList.toggle('hidden',view!=='stocks');
    renderOverview();
    if(!load)return;
    if(delay)universeTimer=setTimeout(()=>void loadUniverse(),delay);
    else void loadUniverse();
  }

  function renderOverview() {
    const quotes=overviewQuotes;
    const host=$('dhanOverviewData');
    const indexView=marketView==='indices';
    const items=universe?.items??[];
    const bySymbol=new Map(quotes.map(quote=>[quote.symbol,quote]));
    const list=items.length?table(indexView?['Stock','Industry','Last (₹)','Change','Volume','Paper trade']:['Stock','Last (₹)','Change','Volume','Paper trade'],items.map(item=>{
      const q=bySymbol.get(item.symbol);
      const label=item.displaySymbol??item.symbol;
      const stock=(item.symbol?chartButton(item.symbol,label):html(label))+`<small>${html(item.name)}</small>`;
      return [stock,...(indexView?[html(item.industry||'—')]:[]),researchNumber(q?.price),changeMarkup(q?.change_pct),researchNumber(q?.volume,0),item.symbol?paperButtons('dhan',item.symbol):'—'];
    })):'';
    const pager=$('dhanOverviewPager');
    pager.classList.toggle('hidden',indexView||!items.length);
    pager.querySelector('[data-market-page="-50"]').disabled=stockOffset===0;
    pager.querySelector('[data-market-page="50"]').disabled=stockOffset+items.length>=(universe?.total??0);
    const benchmarks=new Map([['NSE:NIFTY','Nifty 50'],['NSE:BANKNIFTY','Bank Nifty'],['BSE:SENSEX','Sensex']]);
    const ranked=items.map(item=>bySymbol.get(item.symbol)).filter(q=>Number.isFinite(q?.change_pct)).sort((a,b)=>b.change_pct-a.change_pct);
    const advances=ranked.filter(q=>q.change_pct>0);
    const declines=ranked.filter(q=>q.change_pct<0).reverse();
    const movers=(rows,empty)=>rows.length?table(['Stock','Last (₹)','Change'],rows.slice(0,5).map(q=>[chartButton(q.symbol,q.symbol),researchNumber(q.price),changeMarkup(q.change_pct)])):`<p class="muted">${empty}</p>`;
    const chosenIndex=universe?.indices?.find(item=>item.symbol===universe.symbol);
    const markup=!indexView?list:`<div class="dhan-index-grid">${[...benchmarks].map(([symbol,name])=>{
      const q=bySymbol.get(symbol);
      const hasPrice=Number.isFinite(q?.price)&&q.price>0;
      const previous=Number.isFinite(q?.previous_close)&&q.previous_close>0?q.previous_close:null;
      const points=hasPrice&&previous!==null?q.price-previous:null;
      const percent=points!==null?points/previous*100:Number.isFinite(q?.change_pct)?q.change_pct:null;
      const signed=value=>(value>0?'+':value<0?'−':'')+researchNumber(Math.abs(value));
      const change=points===null?'—':signed(points);
      const percentText=percent===null?'—':signed(percent)+'%';
      const tone=(points??percent??0)>0?'positive':(points??percent??0)<0?'negative':'muted';
      return `<article><header><button type="button" class="dhan-index-select" data-market-index="${html(symbol)}" ${universe?'':'disabled'} aria-pressed="${universe?.symbol===symbol}">${html(name)}</button><button type="button" class="dhan-index-chart" data-dhan-open-chart="${html(symbol)}" aria-label="Open ${html(name)} chart" title="Open ${html(name)} chart">${terminalIcon('charts')}</button></header><strong>${researchNumber(q?.price)}</strong><div class="dhan-index-change ${tone}" aria-label="Change from previous close">${change} <span>(${percentText})</span></div><small class="muted">${q?.updated_at?html(researchTime(q.updated_at)):q?'Quote snapshot':'Waiting for quote'}</small></article>`;
    }).join('')}</div>
    ${chosenIndex?`<section class="dhan-overview-breadth">
      <div class="dhan-stock-summary"><div><h3>${html(chosenIndex.name)} insights</h3><p class="muted">${ranked.length} of ${items.length} constituents with a reported daily move${universe.asOf?' · Membership as of '+html(universe.asOf):''}${universe.stale?' · Cached membership':''}</p></div>${chartButton(chosenIndex.symbol,'Index chart')}</div>
      ${metricGrid([['Constituents',items.length],['Advancing',ranked.length?advances.length:'—'],['Declining',ranked.length?declines.length:'—'],['Unchanged',ranked.length?ranked.length-advances.length-declines.length:'—']])}
    </section>
    <div class="dhan-mover-grid"><section><h3>Top gainers</h3>${movers(advances,ranked.length?'No advancing constituents.':'Waiting for constituent quotes.')}</section><section><h3>Top losers</h3>${movers(declines,ranked.length?'No declining constituents.':'Waiting for constituent quotes.')}</section></div>
    <section class="dhan-overview-breadth"><div class="dhan-stock-summary"><h3>All ${items.length} constituents</h3><a href="${html(universe.source)}" target="_blank" rel="noopener noreferrer">Constituent source</a></div>${list}</section>`:''}`;
    if(!host.contains(document.activeElement)&&host.innerHTML!==markup)host.innerHTML=markup;
  }
  function createCommodityPanel(){
    const panel=document.createElement('section');
    panel.className='panel mcx-panel';
    panel.innerHTML=`<div class="panel-heading"><div><div class="eyebrow">MULTI COMMODITY EXCHANGE</div><h2>MCX Futures &amp; Options</h2><p id="mcxFeedStatus" class="muted"></p></div></div>
      <div id="mcxFront" class="dhan-index-grid mcx-front"></div>
      <div class="mcx-controls">
        <div class="mcx-kind" role="group" aria-label="Contract type"><button class="button secondary" type="button" data-mcx-kind="futures" aria-pressed="true">Futures</button><button class="button secondary" type="button" data-mcx-kind="options" aria-pressed="false">Options</button></div>
        <label>Commodity <select id="mcxRoot"><option value="">All commodities</option></select></label>
        <label>Find contract <input type="search" id="mcxSearch" placeholder="Gold fut, Silver, or a strike" maxlength="80" autocomplete="off"></label>
        <button class="button secondary" type="button" id="mcxClear">Clear filters</button>
      </div>
      <p class="muted" id="mcxStatus" role="status">Loading MCX contracts…</p><div id="mcxContracts"></div>
      <div id="mcxPager" class="dhan-overview-pager hidden"><button type="button" class="button secondary" data-mcx-offset="-50">Previous</button><button type="button" class="button secondary" data-mcx-offset="50">Next</button></div>`;
    return panel;
  }
  let commodityRoot='', commodityKind='futures', commodityOffset=0, commodityData, commodityRequest, commodityTimer, commodityWaiting=false, commodityQuotes=[];
  function stopCommodityRequest(){
    clearTimeout(commodityTimer);
    commodityTimer=null;
    commodityRequest?.abort();
    commodityRequest=null;
  }
  async function loadCommodities(){
    if(!active()||terminalView!=='commodities')return;
    stopCommodityRequest();
    const request=new AbortController();
    commodityRequest=request;
    const root=$('mcxRoot'), status=$('mcxStatus');
    status.textContent='Loading MCX contracts…';
    try{
      const data=await api('/api/private-dhan/symbols?'+new URLSearchParams({exchange:'MCX',kind:commodityKind,root:commodityRoot,q:$('mcxSearch').value,offset:commodityOffset}),{signal:request.signal});
      if(request.signal.aborted)return;
      commodityWaiting=!data.ready;
      commodityData=data;
      const options=[...new Set(['',commodityRoot,...(data.roots??[])])];
      if([...root.options].map(option=>option.value).join(',')!==options.join(',')){
        root.replaceChildren(...options.map(value=>new Option(value||'All commodities',value,value===commodityRoot,value===commodityRoot)));
      }
      root.value=commodityRoot;
      status.textContent=!data.ready?'Waiting for Dhan’s MCX directory…':data.total?`Showing ${fmt(commodityOffset+1,0)}–${fmt(commodityOffset+data.items.length,0)} of ${fmt(data.total,0)} contracts`:'No contracts match these filters.';
      renderCommodities(commodityQuotes);
      if(data.ready)void refresh();
    }catch(error){
      if(!request.signal.aborted){commodityWaiting=true;status.textContent=error.message;}
    }finally{if(commodityRequest===request)commodityRequest=null;}
  }
  function statusLabel(latest){
    return latest?`DhanHQ · latest shown trade ${quoteTime.format(latest)} IST`:'DhanHQ · waiting for MCX quotes';
  }
  function renderCommodities(quotes,message){
    commodityQuotes=quotes;
    if(message)$('mcxFeedStatus').textContent=message;
    const bySymbol=new Map(quotes.map(q=>[q.symbol,q]));
    const front=$('mcxFront');
    const names={GOLD:'Gold',SILVER:'Silver',CRUDEOIL:'Crude Oil',NATURALGAS:'Natural Gas',COPPER:'Copper'};
    const frontHtml=Object.entries(names).map(([name,label])=>{
      const q=bySymbol.get('MCX:'+name);
      return `<article><button type="button" class="dhan-inline-chart" data-mcx-root="${name}" aria-pressed="${commodityKind==='futures'&&commodityRoot===name}">${label} futures</button><strong>${researchNumber(q?.price)}</strong><small>${changeMarkup(q?.change_pct)}</small> ${chartButton('MCX:'+name,'Chart')}</article>`;
    }).join('');
    if(!front.contains(document.activeElement)&&front.innerHTML!==frontHtml)front.innerHTML=frontHtml;
    const host=$('mcxContracts'), items=commodityData?.items??[];
    const markup=items.length?table(['Contract','Expiry','Last (₹)','Change','Volume','View','Paper trade'],items.map(item=>{
      const q=bySymbol.get(item.symbol);
      return [`<strong>${html(item.name)}</strong><small>${html(item.underlying)}</small>`,html(item.expiry),researchNumber(q?.price),changeMarkup(q?.change_pct),researchNumber(q?.volume,0),
        chartButton(item.symbol,'Chart')+` <button class="dhan-inline-chart" type="button" data-mcx-chain="${html(item.symbol)}">Option chain</button>`,item.lotSize?paperButtons('dhan',item.symbol):'—'];
    })):'';
    if(!host.contains(document.activeElement)&&host.innerHTML!==markup)host.innerHTML=markup;
    const pager=$('mcxPager');
    pager.classList.toggle('hidden',!items.length);
    pager.querySelector('[data-mcx-offset="-50"]').disabled=!commodityOffset;
    pager.querySelector('[data-mcx-offset="50"]').disabled=commodityOffset+items.length>=(commodityData?.total??0);
  }
  function setCommodityFilters(root,kind='futures'){
    commodityRoot=root;
    commodityKind=kind;
    const select=$('mcxRoot');
    if(root&&![...select.options].some(option=>option.value===root))select.add(new Option(root,root));
    select.value=root;
    commodityPanel.querySelectorAll('[data-mcx-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mcxKind===kind)));
  }
  function changeCommodities(offset=0,delay=0){
    const url=new URL(location.href);
    if(commodityRoot&&commodityKind==='futures')url.searchParams.set('commodity',commodityRoot);
    else url.searchParams.delete('commodity');
    history.replaceState(null,'',url);
    stopCommodityRequest();
    commodityOffset=offset;
    commodityData=null;
    renderCommodities(commodityQuotes);
    if(delay)commodityTimer=setTimeout(()=>void loadCommodities(),delay);
    else void loadCommodities();
  }
  function renderResearch(data) {
    if(researchView==='stock'){
      const q=data.quote;
      return `<div class="dhan-stock-summary"><div><h3>${html(data.name)}</h3><span class="muted">${html(data.symbol)}${data.expiry?' · Expires '+html(data.expiry):''}</span></div>${chartButton(data.symbol,'Open chart')}</div>${q?`<p>${changeMarkup(q.change_pct)} <span class="muted">${html(researchTime(q.updated_at))}</span></p>${quoteMetrics(q)}`:'<p class="muted">Waiting for a quote for this instrument.</p>'}`;
    }
    if(researchView==='chain'){
      const leg=(item)=>[item?.symbol?chartButton(item.symbol,researchNumber(item.price))+(item.symbol.startsWith('MCX:')?'':paperButtons('dhan',item.symbol)):researchNumber(item?.price),researchNumber(item?.oi,0),researchNumber(item?.iv),researchNumber(item?.volume,0),researchNumber(item?.bid),researchNumber(item?.ask)];
      return `<div class="dhan-chain-controls"><label>Expiry <select id="dhanChainExpiry">${data.dates.map(date=>`<option ${date===data.expiry?'selected':''}>${html(date)}</option>`).join('')}</select></label><span>${html(data.base)} <strong>${researchNumber(data.spot)}</strong></span></div>`+(data.strikes?.length?table(['Call last','Call OI','Call IV %','Call vol','Call bid','Call ask','Strike','Put last','Put OI','Put IV %','Put vol','Put bid','Put ask'],data.strikes.map(row=>[...leg(row.call),`<strong>${researchNumber(row.strike)}</strong>`,...leg(row.put)])):'<p class="muted">Dhan returned no strikes for this expiry.</p>');
    }
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
      const result=await api('/api/private-dhan/research?'+new URLSearchParams({view:researchView,symbol,interval,...(researchView==='chain'&&chainExpiry?{expiry:chainExpiry}:{}),segment:$('dhanMoversExchange').value,category:$('dhanMoversRanking').value}),{signal:request.signal,cache:'no-store'});
      if(!current())return;
      if(researchView==='technicals'&&(result.error||!Object.keys(result.data??{}).length)) {
        const data=localTechnicals(symbol,interval);
        if(data){body.innerHTML=renderResearch(data);status.textContent='Calculated by AlertPe from completed Dhan candles. Dhan’s indicator endpoint did not return values.';return;}
      }
      if(result.error){status.textContent=result.error;if(researchView==='chain'&&result.data?.dates)body.innerHTML=renderResearch(result.data);else body.replaceChildren();return;}
      const content=renderResearch(result.data);
      if(body.innerHTML!==content)body.innerHTML=content;
      const retrieved=researchTime(result.data.retrievedAt??result.retrievedAt);
      status.textContent=[result.warning,content&&researchView==='depth'?'Up to five levels · snapshot':null,content&&retrieved?`Retrieved ${retrieved}`:null,!content?(result.fallback?'No matching movers.':'Dhan returned no usable data for this selection.'):null].filter(Boolean).join(' · ');
    } catch(error){if(current()){status.textContent=error.message;body.replaceChildren();}}
    finally{if(researchController===request)button.disabled=false;}
  }
  $('privateHistorySymbol').addEventListener('change',()=>{chainExpiry='';selectTerminalView(terminalView,{syncUrl:false});void refresh();});
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
  page.querySelector('.dhan-research-nav').addEventListener('click',event=>{const target=event.target.closest('[data-dhan-research]');if(!target||target.dataset.dhanResearch===researchView)return;chooseResearch(target.dataset.dhanResearch);void loadResearch();if(researchView==='technicals')void ensureHistory();});
  function marketAction(event) {
    const chart=event.target.closest('[data-dhan-open-chart]');
    if(chart){openChart(chart.dataset.dhanOpenChart);desk.maximize();}
    const catalog=event.target.closest('[data-dhan-catalog]');
    if(catalog)desk.searchSymbols('',catalog.dataset.dhanCatalog);
  }
  overviewPanel.addEventListener('click',event=>{
    const view=event.target.closest('[data-market-view]')?.dataset.marketView;
    if(view&&view!==marketView)switchUniverse(view);
    const symbol=event.target.closest('[data-market-index]')?.dataset.marketIndex;
    if(symbol&&symbol!==$('dhanOverviewIndex').value){
      $('dhanOverviewIndex').value=symbol;
      $('dhanOverviewIndex').focus({preventScroll:true});
      switchUniverse('indices');
    }
    const offset=event.target.closest('[data-market-page]')?.dataset.marketPage;
    if(offset)switchUniverse('stocks',stockOffset+Number(offset));
    if(event.target.id==='dhanUniverseRetry')void loadUniverse();
  });
  $('dhanOverviewIndex').addEventListener('change',()=>switchUniverse('indices'));
  $('dhanOverviewExchange').addEventListener('change',()=>switchUniverse('stocks'));
  $('dhanOverviewSearch').addEventListener('input',()=>switchUniverse('stocks',0,200));
  commodityPanel.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.dataset.mcxKind&&button.dataset.mcxKind!==commodityKind){
      setCommodityFilters(commodityRoot,button.dataset.mcxKind);
      changeCommodities();
    }
    if(button.dataset.mcxRoot!==undefined||button.id==='mcxClear'){
      $('mcxSearch').value='';
      setCommodityFilters(button.dataset.mcxRoot??'',button.id==='mcxClear'?commodityKind:'futures');
      $('mcxRoot').focus({preventScroll:true});
      changeCommodities();
    }
    if(button.dataset.mcxOffset)changeCommodities(commodityOffset+Number(button.dataset.mcxOffset));
    if(button.dataset.mcxChain){
      setSymbol(button.dataset.mcxChain,commodityData?.items.find(item=>item.symbol===button.dataset.mcxChain));
      chooseResearch('chain');
      selectTerminalView('research');
      void refresh();
    }
  });
  $('mcxRoot').addEventListener('change',event=>{commodityRoot=event.target.value;changeCommodities();});
  $('mcxSearch').addEventListener('input',event=>{
    const term=event.target.value;
    if(/\bFUT(?:URES?)?\b/i.test(term))setCommodityFilters(commodityRoot,'futures');
    else if(/\b(?:OPTIONS?|CALLS?|PUTS?|CE|PE)\b/i.test(term))setCommodityFilters(commodityRoot,'options');
    changeCommodities(0,180);
  });
  page.addEventListener('click',marketAction);
  workspaceOverview.addEventListener('click',marketAction);
  $('dhanResearchBody').addEventListener('change',event=>{
    if(event.target.id==='dhanChainExpiry'){chainExpiry=event.target.value;void loadResearch({quiet:true});}
  });
  for(const id of ['dhanMoversExchange','dhanMoversRanking'])$(id).addEventListener('change',()=>void loadResearch());
  $('dhanResearchRefresh').addEventListener('click',()=>void loadResearch({quiet:true}));
  document.addEventListener('visibilitychange',()=>{
    if(quotesActive()){
      void refresh();
      if(overviewActive()&&!universe&&!universeRequest)void loadUniverse();
      if(active()&&terminalView==='dashboard')void ensureHistory();
      if(active()&&terminalView==='research')void loadResearch({quiet:true});
    }else{
      pause();
      stopUniverse();
      stopCommodityRequest();
      researchController?.abort();
    }
  });
  function reset() { stopUniverse(); stopCommodityRequest(); setCommodityFilters(''); $('mcxSearch').value=''; commodityOffset=0; commodityWaiting=false; commodityData=null; commodityQuotes=[]; renderCommodities([],''); overviewQuotes=[]; $('dhanOverviewIndex').value='NSE:NIFTY'; $('dhanOverviewSearch').value=''; $('dhanOverviewExchange').value=''; switchUniverse('indices',0,0,false); placeOverview(false); simulatedHeading.classList.add('hidden'); renderOverview(); chooseResearch('stock'); pause(); historyController?.abort();researchController?.abort();chartHistory=null;$('dhanResearchBody').replaceChildren();$('dhanResearchContext').textContent='';$('dhanResearchStatus').textContent='Choose a symbol to start.'; symbolList=''; query=''; nav.classList.add('hidden'); page.classList.add('hidden'); $('privateHistorySymbol').replaceChildren(); $('privateHistorySymbol').disabled=true; $('privateHistoryStatus').textContent='Loading the Dhan symbol list…'; $('privateDhanStats').replaceChildren();desk.reset(); $('privateDhanQuery').value=''; $('privateDhanBadge').textContent='WAITING FOR QUOTES'; $('privateDhanStatus').textContent='Waiting for Dhan.'; updateMarketWatch($('privateDhanTable'),[]); }
  window.privateDhanView = {
    reset,
    configure(allowed) {
      reset();
      nav.classList.toggle('hidden',!allowed);
      selectTerminalView('dashboard',{load:false,syncUrl:false});
    },
    navigate(target) {
      const embedded=target==='overview'&&state.meta?.privateDhan;
      placeOverview(embedded);
      simulatedHeading.classList.toggle('hidden',!(embedded&&state.meta.simulated));
      if(target==='private-dhan'){
        desk.loadLists();
        const params=new URLSearchParams(location.search);
        const root=params.get('commodity');
        if(params.get('tab')==='commodities'&&/^[A-Z0-9]{1,32}$/.test(root??'')&&root!==commodityRoot){
          setCommodityFilters(root);
          commodityData=null;
        }
        selectTerminalView(params.get('tab'));
        void refresh();
      } else {
        pause();
        stopCommodityRequest();
        historyController?.abort();
        researchController?.abort();
        if(embedded){desk.loadLists();if(!universe&&!universeRequest)void loadUniverse();void refresh();}
        else stopUniverse();
      }
    }
  };
})();
