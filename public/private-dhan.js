(() => {
  const nav = document.createElement('button');
  nav.type = 'button'; nav.className = 'nav-item hidden'; nav.dataset.page = 'private-dhan';
  nav.innerHTML = `<span class="nav-icon" aria-hidden="true">${terminalIcon('charts')}</span> Private live quotes`;
  $('mainNav').append(nav);
  const page = document.createElement('section');
  page.id = 'page-private-dhan'; page.className = 'page hidden';
  page.innerHTML = `<div class="page-heading"><div><div class="eyebrow">PRIVATE WORKSPACE · DHANHQ</div><h1>Live market terminal</h1><p class="muted">NSE and BSE quotes, price history, and research for your account.</p></div><span class="tag" id="privateDhanBadge">WAITING FOR QUOTES</span></div>
    <section class="panel private-dhan-chart"><div class="panel-heading"><div><h2>Price history</h2><p class="muted" id="privateHistoryStatus" role="status">Loading the Dhan symbol list…</p></div><div class="terminal-actions"><select id="privateHistorySymbol" aria-label="Dhan symbol" disabled></select><select id="privateHistoryInterval" aria-label="Candle interval"><option value="day">Daily</option><option value="5">5 min</option><option value="15">15 min</option><option value="60">1 hour</option></select><button id="privateHistoryRefresh" type="button" class="button secondary">Refresh chart</button></div></div><div id="privateDhanStats" class="private-dhan-stats"></div><div id="privateDhanPlot" class="empty-state">Waiting for a symbol.</div></section>
    <section class="panel dhan-research" aria-labelledby="dhanResearchHeading"><div class="panel-heading"><div><div class="eyebrow">DHANHQ DATA</div><h2 id="dhanResearchHeading">Market intelligence</h2><p id="dhanResearchContext" class="muted"></p></div><button class="button secondary" type="button" id="dhanResearchRefresh">Refresh data</button></div><div class="dhan-research-nav" role="group" aria-label="Market intelligence views">${[['depth','Market depth'],['company','Fundamentals'],['technicals','Technicals'],['movers','Market movers'],['news','Stock news']].map(([value,label])=>`<button type="button" data-dhan-research="${value}" aria-pressed="${value==='depth'}">${label}</button>`).join('')}</div><div class="dhan-research-filters hidden" id="dhanMoversFilters"><label>Exchange <select id="dhanMoversExchange"><option value="NSE_EQ">NSE</option><option value="BSE_EQ">BSE</option></select></label><label>Ranking <select id="dhanMoversRanking"><option value="PRICE_GAINERS">Gainers</option><option value="PRICE_LOSERS">Losers</option></select></label></div><p class="muted dhan-research-status" id="dhanResearchStatus" role="status">Choose a symbol to start.</p><div id="dhanResearchBody"></div></section>
    <form class="panel query-panel" id="privateDhanFilter"><label for="privateDhanQuery">Filter configured live quotes</label><div class="query-box"><input id="privateDhanQuery" maxlength="2000" placeholder="change_pct &lt;= -3" autocomplete="off"><button class="button primary" type="submit">Apply filter</button><button class="button secondary" type="reset">Clear</button></div></form>
    <section class="panel terminal-watch"><div class="panel-heading"><div><h2>Market watch</h2><p class="muted" id="privateDhanStatus" role="status">Waiting for Dhan.</p></div></div><div id="privateDhanTable" class="table-wrap empty-state">Waiting for quotes.</div></section>`;
  document.querySelector('.content-wrap').append(page);
  let timer, query = '', generation = 0, controller, historyController, symbolList = '';
  let researchView = 'depth', researchController;
  function pause() { clearTimeout(timer); controller?.abort(); generation++; }
  function active() { return state.currentPage === 'private-dhan' && state.meta?.privateDhan && state.user && !document.hidden; }
  async function refresh() {
    pause(); if (!active()) return;
    const token = generation, owner = state.user.id;
    controller = new AbortController();
    const current = () => token === generation && owner === state.user?.id && active();
    try {
      const data = await api('/api/private-dhan/quotes?' + new URLSearchParams({ query, symbol:$('privateHistorySymbol').value }), { signal: controller.signal, cache: 'no-store' });
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
      if(list!==symbolList){const old=select.value;symbolList=list;select.replaceChildren(...(data.symbols||[]).map(s=>new Option(s.symbol,s.symbol)));select.disabled=!select.options.length;if([...select.options].some(o=>o.value===old))select.value=old;if(select.value){void loadHistory();void loadResearch();}}
      const chosen=data.selected?.symbol===select.value?data.selected:data.quotes.find(q=>q.symbol===select.value);
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
  const researchNumber=(n,digits=2)=>n==null?'—':fmt(n,digits);
  const researchTime=value=>{const ms=typeof value==='number'?(value<1e12?value*1000:value):Date.parse(value);return Number.isFinite(ms)&&Math.abs(ms)<=864e13?`${quoteTime.format(ms)} IST`:'';};
  const metricNames={MARKET_CAP:'Market cap (₹ cr)',EBITDA:'EBITDA (₹ cr)',EPS:'EPS (₹)',BOOK_VALUE:'Book value (₹)',FIFTY_TWO_WEEK_HIGH:'52-week high (₹)',FIFTY_TWO_WEEK_LOW:'52-week low (₹)',PE_RATIO:'P/E',PB_RATIO:'P/B',PE_TO_SECTOR_PE:'P/E vs. sector',ROE:'ROE (%)',ROCE:'ROCE (%)',RSI_14:'RSI (14)',ATR_14:'ATR (14)',ADX_14:'ADX (14)',MACD_HIST:'MACD histogram'};
  function metricGrid(entries) {
    return `<dl class="dhan-metrics">${entries.map(([label,value])=>`<div><dt>${html(label)}</dt><dd>${html(value??'—')}</dd></div>`).join('')}</dl>`;
  }
  function table(headers,rows){return `<div class="table-wrap" tabindex="0" aria-label="Scrollable data table"><table class="data-table dhan-data-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  function safeNewsLink(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
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
    if(!active()||(!symbol&&researchView!=='movers'))return;
    const request=new AbortController();researchController=request;
    const status=$('dhanResearchStatus'),body=$('dhanResearchBody'),button=$('dhanResearchRefresh');
    const current=()=>researchController===request&&!request.signal.aborted&&active();
    $('dhanMoversFilters').classList.toggle('hidden',researchView!=='movers');
    $('dhanResearchContext').textContent=researchView==='movers'?'Exchange ranking · DhanHQ':`${symbol} · ${researchView==='technicals'?$('privateHistoryInterval').selectedOptions[0].text+' · latest closed candle':'DhanHQ'}`;
    if(!quiet){status.textContent='Loading Dhan data…';body.replaceChildren();}
    button.disabled=true;
    try {
      const result=await api('/api/private-dhan/research?'+new URLSearchParams({view:researchView,symbol,interval,segment:$('dhanMoversExchange').value,category:$('dhanMoversRanking').value}),{signal:request.signal,cache:'no-store'});
      if(!current())return;
      if(result.error){status.textContent=result.error;body.replaceChildren();return;}
      const content=renderResearch(result.data);
      if(body.innerHTML!==content)body.innerHTML=content;
      const retrieved=researchTime(result.data.retrievedAt??result.retrievedAt);
      status.textContent=content?[result.warning,researchView==='depth'?'Five-level snapshot':null,retrieved?`Retrieved ${retrieved}`:null].filter(Boolean).join(' · '):'Dhan returned no usable data for this selection.';
    } catch(error){if(current()){status.textContent=error.message;body.replaceChildren();}}
    finally{if(researchController===request)button.disabled=false;}
  }
  $('privateHistorySymbol').addEventListener('change',()=>{void loadHistory();void loadResearch();void refresh();});
  $('privateHistoryInterval').addEventListener('change',()=>{void loadHistory();if(researchView==='technicals')void loadResearch();});
  $('privateHistoryRefresh').addEventListener('click',()=>void loadHistory());
  $('privateDhanTable').addEventListener('click',event=>{const symbol=event.target.closest('[data-terminal-chart]')?.dataset.terminalChart;if(!symbol)return;event.stopPropagation();$('privateHistorySymbol').value=symbol;$('privateHistorySymbol').dispatchEvent(new Event('change'));});
  $('privateDhanFilter').addEventListener('submit',event=>{event.preventDefault();query=$('privateDhanQuery').value.trim();void refresh();});
  $('privateDhanFilter').addEventListener('reset',()=>{query='';void refresh();});
  page.querySelector('.dhan-research-nav').addEventListener('click',event=>{const target=event.target.closest('[data-dhan-research]');if(!target||target.dataset.dhanResearch===researchView)return;researchView=target.dataset.dhanResearch;page.querySelectorAll('[data-dhan-research]').forEach(btn=>btn.setAttribute('aria-pressed',btn===target));void loadResearch();});
  for(const id of ['dhanMoversExchange','dhanMoversRanking'])$(id).addEventListener('change',()=>void loadResearch());
  $('dhanResearchRefresh').addEventListener('click',()=>void loadResearch({quiet:true}));
  document.addEventListener('visibilitychange',()=>{if(active()){void refresh();void loadResearch({quiet:true});}else {pause();researchController?.abort();}});
  function reset() { pause(); historyController?.abort();researchController?.abort();$('dhanResearchBody').replaceChildren();$('dhanResearchContext').textContent='';$('dhanResearchStatus').textContent='Choose a symbol to start.'; symbolList=''; query=''; nav.classList.add('hidden'); page.classList.add('hidden'); $('privateHistorySymbol').replaceChildren(); $('privateHistorySymbol').disabled=true; $('privateHistoryStatus').textContent='Loading the Dhan symbol list…'; $('privateDhanStats').replaceChildren();drawHistory([]); $('privateDhanPlot').textContent='Waiting for a symbol.'; $('privateDhanQuery').value=''; $('privateDhanBadge').textContent='WAITING FOR QUOTES'; $('privateDhanStatus').textContent='Waiting for Dhan.'; updateMarketWatch($('privateDhanTable'),[]); }
  window.privateDhanView = { reset, configure(allowed) { reset(); nav.classList.toggle('hidden',!allowed); if(state.currentPage==='private-dhan')navigate('overview'); }, navigate(target) { if(target==='private-dhan'){void refresh();if($('privateHistorySymbol').value){void loadHistory();void loadResearch();}}else {pause();historyController?.abort();researchController?.abort();} } };
})();
