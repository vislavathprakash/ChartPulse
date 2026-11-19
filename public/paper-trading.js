(() => {
  const money=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
  const format=value=>value==null?'—':money.format(value);
  const pnl=value=>`<span class="${value>0?'positive':value<0?'negative':''}">${value>0?'+':''}${format(value)}</span>`;
  const fullTime=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'});
  const cutoffTime=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const date=value=>value?`${fullTime.format(new Date(value))} IST`:'—';
  const query=params=>new URLSearchParams(params).toString();
  const nameOf=kind=>({equity:'Stock',futures:'Future',options:'Option'})[kind]??kind;
  const productLabel=(row)=>row.product==='intraday'?'Intraday':row.kind==='equity'?'Delivery':'Carry forward';
  const tabs=[['chart','Chart','charts'],['positions','Positions','layers'],['orders','Orders','list'],['trades','Trade history','calendar']];
  const activityTabs={
    positions:[['intraday','Intraday'],['delivery','Delivery & holdings']],
    orders:[['open','Open orders'],['closed','Closed orders']]
  };
  const defaultActivity={positions:'delivery',orders:'open'};
  const nav=document.createElement('button');
  nav.type='button';nav.className='nav-item';nav.dataset.page='paper';
  nav.innerHTML=`<span class="nav-icon" aria-hidden="true">${terminalIcon('paper')}</span> Paper Trading`;
  $('mainNav').append(nav);
  const page=document.createElement('section');
  page.id='page-paper';page.className='page paper-page hidden';
  page.innerHTML=`
    <div class="page-heading">
      <div class="paper-title"><h1>Paper Trading</h1><span class="tag">Virtual orders</span></div>
      <button class="button primary" type="button" data-paper-new>New paper order</button>
    </div>
    <div class="paper-wallet" aria-label="Virtual wallet"></div>
    <section class="panel paper-panel">
      <div class="dhan-research-nav paper-tabs" role="tablist" aria-label="Paper trading activity">${tabs.map(([id,label,icon],i)=>`<button type="button" id="paper-tab-${id}" role="tab" data-paper-tab="${id}" aria-selected="${!i}" aria-pressed="${!i}" aria-controls="${id==='chart'?'paper-chart':'paper-activity'}" tabindex="${i?-1:0}">${terminalIcon(icon)}<span>${label}</span></button>`).join('')}</div>
      <div id="paper-chart" role="tabpanel" aria-labelledby="paper-tab-chart"></div>
      <div id="paper-activity" class="hidden" role="tabpanel" aria-labelledby="paper-tab-positions" tabindex="0">
        <div class="paper-activity-tabs" role="tablist" hidden></div>
        <div id="paper-activity-content"></div>
      </div>
      <p class="muted paper-status" role="status"></p>
    </section>
    <p class="muted paper-disclosure">Paper fills use the latest eligible quote without modelling fees, order-book liquidity, or partial fills. Futures reserve 20% of notional. Short options reserve 20% of underlying notional plus premium. These are practice estimates. Practice derivatives use fictional prices and preset lot sizes.</p>`;
  document.querySelector('.content-wrap').append(page);
  const metrics=page.querySelector('.paper-wallet'), body=$('paper-activity'), status=page.querySelector('.paper-status');
  const activityNav=body.querySelector('.paper-activity-tabs'), activityContent=$('paper-activity-content');
  const activitySelection={...defaultActivity};
  const expandedPositions=new Set();
  const expandedTrades=new Set();
  let reportData=null, reportParams={};
  const reportToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const reportControls=document.createElement('form');
  reportControls.className='paper-report-filters';reportControls.hidden=true;reportControls.setAttribute('aria-label','Trade report filters');
  reportControls.innerHTML=`<div class="paper-report-heading"><div><h3>${terminalIcon('calendar')}Trade report</h3><p>Filter all filled paper orders · Dates in IST</p></div><button class="button secondary" type="button" data-report-reset>Reset filters</button></div><div class="paper-report-fields"><label>Period<select name="period"><option value="all">All time</option><option value="today">Today</option><option value="day">Specific day</option><option value="month">Month</option><option value="year">Year</option><option value="custom">Custom range</option></select></label><label data-report-period="day" hidden>Day<input type="date" name="day" value="${reportToday}"></label><label data-report-period="month" hidden>Month<input type="month" name="month" value="${reportToday.slice(0,7)}"></label><label data-report-period="year" hidden>Year<input type="number" name="year" min="2000" max="2100" step="1" value="${reportToday.slice(0,4)}"></label><label data-report-period="custom" hidden>From<input type="date" name="from" value="${reportToday}"></label><label data-report-period="custom" hidden>To<input type="date" name="to" value="${reportToday}"></label><label>Product<select name="product"><option value="">All products</option><option value="intraday">Intraday</option><option value="delivery">Delivery / carry forward</option></select></label><label>Instrument<select name="kind"><option value="">All instruments</option><option value="equity">Stocks</option><option value="futures">Futures</option><option value="options">Options</option></select></label><label>Side<select name="side"><option value="">Buy & sell</option><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label class="paper-report-search">Stock or symbol<input name="q" maxlength="100" placeholder="Search company or symbol"></label><button class="button primary" type="submit">${terminalIcon('search')}Apply filters</button></div><p class="paper-report-filter-error" role="alert"></p>`;
  activityNav.after(reportControls);
  const showReportPeriod=()=>{const period=reportControls.elements.period.value;reportControls.querySelectorAll('[data-report-period]').forEach(label=>{label.hidden=label.dataset.reportPeriod!==period;label.querySelector('input').disabled=label.hidden;});};
  reportControls.elements.period.addEventListener('change',showReportPeriod);showReportPeriod();
  reportControls.addEventListener('submit',event=>{
    event.preventDefault();const values=Object.fromEntries(new FormData(reportControls)),next={};
    if(values.period==='today')next.from=next.to=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(values.period==='day')next.from=next.to=values.day;
    if(values.period==='month'&&/^\d{4}-\d{2}$/.test(values.month)){next.from=values.month+'-01';const [year,month]=values.month.split('-').map(Number);next.to=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);}
    if(values.period==='year'){next.from=values.year+'-01-01';next.to=values.year+'-12-31';}
    if(values.period==='custom'){next.from=values.from;next.to=values.to;}
    const issue=reportControls.querySelector('[role=alert]');issue.textContent='';
    if(values.period!=='all'&&(!next.from||!next.to)){issue.textContent='Choose the date or period to report on.';return;}
    if(next.from&&next.from>next.to){issue.textContent='Start date must be on or before end date.';return;}
    for(const key of ['product','kind','side','q'])if(values[key]?.trim())next[key]=values[key].trim();
    reportParams=next;reportData=null;offset=0;expandedTrades.clear();render(true);void refresh();
  });
  reportControls.querySelector('[data-report-reset]').onclick=()=>{reportControls.reset();showReportPeriod();reportControls.requestSubmit();};
  let tab='chart', offset=0, data, generation=0, controller, timer, dialog;
  const chartPanel=$('paper-chart');
  const chart=createPaperChart(chartPanel,{search:(kind,exchange)=>search(true,kind,exchange),trade:(source,symbol,side)=>void open(source,symbol,side,1,'delivery',false,true),
    editProtection,moveProtection:(position,field,value)=>saveProtection(position,{[field]:value})});
  const active=()=>state.user&&state.currentPage==='paper'&&!document.hidden;
  function grid(rows) {
    return `<dl class="paper-grid">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  }
  function table(headers,rows,empty,layout='') {
    if(!rows.length)return `<div class="empty-state">${empty}</div>`;
    return `<div class="table-wrap${layout?' '+layout:''}"${layout?' tabindex="0" role="region" aria-label="Paper positions table"':''}><table class="data-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function instrument(row) {
    return `<strong>${html(row.name)}</strong><small>${html(row.symbol.replace(/_\d{4}-\d{2}-\d{2}$/,''))} · ${html(nameOf(row.kind))} · ${productLabel(row)} · ${row.source==='dhan'?'DhanHQ':state.meta?.simulated?'Simulated':'Workspace'}</small>`;
  }
  function quantity(row) {
    const q=Math.abs(row.quantity);
    return row.kind==='equity'?fmt(q,0):`${fmt(q/row.lotSize,0)} lot${q===row.lotSize?'':'s'}<small>${fmt(q,0)} units</small>`;
  }
  function positionRow(position) {
    const {name,symbol,source,product,kind}=position;
    const detail=[symbol.replace(/_\d{4}-\d{2}-\d{2}$/,''),productLabel(position)].join(' · ');
    const long=position.quantity>0;
    const units=Math.abs(position.quantity);
    const lots=units/position.lotSize;
    const size=kind==='equity'?fmt(units,0)+' shares':fmt(lots,0)+' lot'+(lots===1?'':'s');
    const attrs=`data-position-source="${html(source)}" data-position-product="${html(product)}"`;
    const action=(field,icon,label)=>`<button class="paper-position-action" type="button" ${attrs} data-paper-${field}="${html(symbol)}" aria-label="${html(label+' for '+name)}" title="${html(label)}">${terminalIcon(icon)}<span>${html(label)}</span></button>`;
    const key=JSON.stringify([source,product,symbol]);
    const metric=(label,value,extra='')=>`<span class="position-metric"><small>${label}</small><strong>${value}</strong>${extra}</span>`;
    const quoteStatus=position.last==null?'Unavailable':position.fresh?'Live quote':'Last known';
    const sourceName=source==='dhan'?'DhanHQ':state.meta?.simulated?'Simulated':'Workspace';
    const more=[['Instrument',html(nameOf(kind))],['Data source',html(sourceName)],['Product',html(productLabel(position))],['Open quantity',fmt(units,0)+(kind==='equity'?' shares':' units')],['Capital allocated',format(position.capital)],['Stop loss',position.stopLoss==null?'Not set':format(position.stopLoss)],['Take profit',position.takeProfit==null?'Not set':format(position.takeProfit)],['Quote updated (IST)',position.quoteAt?html(date(position.quoteAt)):'Not available']];
    if(kind!=='equity')more.push(['Contract size',fmt(position.lotSize,0)+' units per lot']);
    if(position.expiry)more.push(['Contract expiry',html(position.expiry)]);
    return `<details class="paper-position-record" data-position-key="${html(key)}" ${expandedPositions.has(key)?'open':''}><summary><span class="position-record-name"><span class="position-record-icon">${terminalIcon(kind==='equity'?'charts':'commodity')}</span><span><strong>${html(name)}</strong><small>${html(detail)}</small></span></span>${metric('Position',`<span class="paper-side ${long?'positive':'negative'}">${long?'Long':'Short'}</span>`, `<span class="position-size">${size}</span>`)}${metric('Average',format(position.average))}${metric('Last price',format(position.last),`<span class="position-quote-status ${position.fresh?'positive':''}">${quoteStatus}</span>`)}${metric('Unrealised P&L',pnl(position.pnl))}<span class="position-expand" aria-hidden="true">⌄</span></summary><div class="position-record-detail"><div class="position-detail-heading">${terminalIcon('list')}<h3>Position details</h3><span>${html(symbol)}</span></div><dl>${more.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><div class="position-detail-footer"><p>${position.expired?'Contract expired · awaiting settlement.':'Virtual position · P&L uses the latest available quote.'}</p>${position.expired?'':`<div class="position-detail-actions">${action('position-chart','charts','Open chart')}${action('protection','settings','Edit protection')}${action('close','arrow','Close position')}</div>`}</div></div></details>`;
  }
  function showActivityTabs() {
    reportControls.hidden=tab!=='trades';
    const items=activityTabs[tab];
    activityNav.hidden=!items;
    if(!items){
      activityContent.removeAttribute('role');
      activityContent.removeAttribute('aria-labelledby');
      activityContent.removeAttribute('tabindex');
      return;
    }
    activityNav.setAttribute('aria-label',tab==='positions'?'Position products':'Order status');
    activityNav.innerHTML=items.map(([id,label])=>`<button type="button" role="tab" id="paper-activity-tab-${id}" data-paper-activity-tab="${id}" aria-controls="paper-activity-content">${label}</button>`).join('');
    activityContent.setAttribute('role','tabpanel');
    activityContent.tabIndex=0;
    selectActivity(activitySelection[tab]);
  }
  function selectActivity(id) {
    activitySelection[tab]=id;
    for(const button of activityNav.querySelectorAll('[data-paper-activity-tab]')){
      const selected=button.dataset.paperActivityTab===id;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
    }
    activityContent.setAttribute('aria-labelledby','paper-activity-tab-'+id);
  }
  function render(force=false) {
    if(!data)return;
    metrics.innerHTML=grid([['Available funds',format(data.available)],['Portfolio value',format(data.equity)],['In positions',format(data.capital)],['Reserved by orders',format(data.reserved)],['Unrealised P&L',pnl(data.unrealized)],['Realised P&L',pnl(data.realized)]]);
    chart.positions(data.positions);
    if(tab==='chart'||!force&&tab!=='positions'&&activityContent.contains(document.activeElement))return;
    const pager=hasMore=>`<nav class="paper-pager" aria-label="History pages"><button class="button secondary" type="button" data-paper-page="-25" ${offset?'':'disabled'}>Previous</button><span>Page ${offset/25+1}</span><button class="button secondary" type="button" data-paper-page="25" ${hasMore?'':'disabled'}>Next</button></nav>`;
    const orders=(rows,empty)=>table(['Instrument','Side / size','Order type','Price','Status','Time','Action'],rows.map(o=>[
      instrument(o),`<span class="${o.side==='buy'?'positive':'negative'}">${o.side.toUpperCase()}</span> · ${quantity(o)}`,html({market:'Market',limit:'Limit',stop:'Stop market'}[o.type]),format(o.fill??o.level),
      `<span class="paper-order-state">${html(o.state)}</span>${o.reason?`<small>${html(o.reason)}</small>`:o.reserved?`<small>${format(o.reserved)} reserved</small>`:''}`,date(o.filledAt??o.createdAt),o.state==='pending'?`<button class="button secondary" type="button" data-paper-cancel="${o.id}">Cancel</button>`:'—'
    ]),empty);
    let markup;
    if(tab==='positions'){
      const intraday=activitySelection.positions==='intraday';
      const positions=data.positions.filter(position=>(position.product==='intraday')===intraday);
      const empty=intraday?'No open intraday positions.':'No delivery holdings or carried-forward positions.';
      markup=positions.length?`<div class="paper-position-list" aria-label="Open paper positions">${positions.map(positionRow).join('')}</div>`:`<div class="empty-state">${empty}</div>`;
    }else if(tab==='orders'){
      if(activitySelection.orders==='closed'){
        markup=orders(data.history,'Filled, cancelled, and other completed orders will appear here.')+(offset||data.hasMoreHistory?pager(data.hasMoreHistory):'');
      }else{
        const protection=data.positions.flatMap(position=>[['Stop loss',position.stopLoss],['Take profit',position.takeProfit]].filter(([,value])=>value!=null).map(([label,value])=>[
          instrument(position),position.quantity>0?'Sell':'Buy',label,format(value),position.expired?'Awaiting settlement':'Armed',positionButton(position,'Edit protection')
        ]));
        markup=orders(data.pending,'No pending paper orders.');
        if(protection.length)markup+='<h3>Position protection</h3>'+table(['Instrument','Exit side','Trigger','Price','Status','Action'],protection);
      }
    }else{
      markup=tradeReportMarkup(pager);
    }
    if(activityContent.dataset.markup!==markup){
      const focused=!force?document.activeElement.closest?.('.paper-position-record'):null;
      const focusKey=focused?.dataset?.positionKey;
      const focusAction=focused&&['data-paper-position-chart','data-paper-protection','data-paper-close'].find(attribute=>document.activeElement.hasAttribute(attribute));
      activityContent.innerHTML=markup;activityContent.dataset.markup=markup;
      if(focusKey){const replacement=[...activityContent.querySelectorAll('.paper-position-record')].find(row=>row.dataset.positionKey===focusKey);replacement?.querySelector(focusAction?'['+focusAction+']':'summary')?.focus({preventScroll:true});}
    }
  }
  function tradeReportMarkup(pager){
    if(!reportData)return '<div class="empty-state" role="status">Loading your trade report…</div>';
    const s=reportData.summary;
    const reportDay=value=>new Date(value+'T00:00:00+05:30').toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'});
    const period=reportParams.from?`${reportDay(reportParams.from)} — ${reportDay(reportParams.to)} · IST`:'All time · IST';
    const totals=grid([['Filled orders',fmt(s.fills,0)],['Realised P&L',pnl(s.realized)],['Buy turnover',format(s.bought)],['Sell turnover',format(s.sold)],['Profitable / loss exits',`${s.wins} / ${s.losses}`],['Exit fills',fmt(s.exits,0)]]);
    const rows=reportData.trades.map(o=>{
      const filled=new Date(o.filledAt),valid=Number.isFinite(filled.getTime());
      const day=valid?filled.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}):'Date unavailable';
      const clock=valid?filled.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
      const details=[['Order ID','#'+html(o.id)],['Product',html(productLabel(o))],['Order type',html({market:'Market',limit:'Limit',stop:'Stop market'}[o.type]||o.type)],['Data source',o.source==='dhan'?'DhanHQ':state.meta?.simulated?'Simulated':'Workspace'],['Filled quantity',fmt(o.quantity,0)+' units'],['Fill value',format(o.fill*o.quantity)],['Placed (IST)',html(date(o.createdAt))],['Filled (IST)',html(date(o.filledAt))],['Stop loss',o.stopLoss==null?'Not set':format(o.stopLoss)],['Take profit',o.takeProfit==null?'Not set':format(o.takeProfit)]];
      if(o.kind!=='equity')details.push(['Contract size',fmt(o.lotSize,0)+' units per lot']);
      return `<details class="paper-trade-record paper-position-record" data-trade-id="${html(o.id)}" ${expandedTrades.has(String(o.id))?'open':''}><summary><span class="position-record-name"><span class="position-record-icon">${terminalIcon(o.kind==='equity'?'charts':'commodity')}</span><span><strong>${html(o.name)}</strong><small>${html(o.symbol.replace(/_\d{4}-\d{2}-\d{2}$/,''))} · ${html(productLabel(o))}</small></span></span><span class="position-metric"><small>Side / size</small><strong class="${o.side==='buy'?'positive':'negative'}">${html(o.side.toUpperCase())}</strong><span class="position-size">${o.kind==='equity'?fmt(o.quantity,0)+' shares':fmt(o.quantity/o.lotSize,0)+' lot'+(o.quantity===o.lotSize?'':'s')}</span></span><span class="position-metric"><small>Fill price</small><strong>${format(o.fill)}</strong></span><span class="position-metric"><small>Realised P&L</small><strong>${o.pnl==null?'—':pnl(o.pnl)}</strong><span class="position-size">${o.pnl==null?'Entry fill':'Exit fill'}</span></span><time class="position-metric"${valid?` datetime="${filled.toISOString()}"`:''}><small>Filled (IST)</small><strong>${html(day)}</strong><span class="position-size">${html(clock)} IST</span></time><span class="position-expand" aria-hidden="true">⌄</span></summary><div class="position-record-detail"><div class="position-detail-heading">${terminalIcon('list')}<h3>Fill details</h3><span>${html(o.symbol)}</span></div><dl>${details.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><div class="position-detail-footer"><p>${o.pnl==null?'Entry fill · realised P&L is recorded on closing fills.':'Realised paper P&L excludes fees and slippage.'}${o.reason?' '+html(o.reason):''}</p><button class="button secondary" type="button" data-report-chart="${html(o.id)}">${terminalIcon('charts')}Open chart</button></div></div></details>`;
    }).join('');
    return `<div class="paper-report-totals">${totals}</div><div class="paper-report-caption"><span>${html(period)}</span><span>${reportData.total?`${offset+1}–${Math.min(offset+25,reportData.total)} of ${fmt(reportData.total,0)} fills`:'0 matching fills'}</span></div><p class="paper-report-note">Totals cover all matching fills. Turnover is traded value, not profit. Opening fills show no realised P&L.</p>${rows||'<div class="empty-state">No fills match these filters. Try another period or reset filters.</div>'}${offset||reportData.hasMore?pager(reportData.hasMore):''}`;
  }
  function pause() { clearTimeout(timer);controller?.abort();generation++; }
  activityContent.addEventListener('toggle',event=>{
    const row=event.target;
    if(row.matches?.('.paper-trade-record')){if(row.open)expandedTrades.add(row.dataset.tradeId);else expandedTrades.delete(row.dataset.tradeId);return;}
    if(!row.matches?.('.paper-position-record'))return;
    if(row.open)expandedPositions.add(row.dataset.positionKey);else expandedPositions.delete(row.dataset.positionKey);
  },true);
  async function refresh(quiet=false) {
    pause();
    if(!active())return;
    const version=generation, owner=state.user.id;
    controller=new AbortController();
    const current=()=>version===generation&&active()&&owner===state.user.id;
    if(!quiet)status.textContent='Loading your paper wallet…';
    const reportSubmit=reportControls.querySelector('[type=submit]');
    if(tab==='trades'&&!quiet){reportSubmit.disabled=true;reportSubmit.setAttribute('aria-busy','true');}
    try{
      const results=await Promise.all([api('/api/paper?'+query({offset}),{signal:controller.signal}),tab==='trades'?api('/api/paper/report?'+query({...reportParams,offset}),{signal:controller.signal}):null]);
      if(!current())return;
      data=results[0];if(results[1])reportData=results[1];
      render(!quiet);
      status.textContent=data.marked<data.positions.length?'Portfolio value reflects positions with an available price.':'';
    }catch(error){if(current()){status.textContent=error.message;if(tab==='trades'&&!reportData)activityContent.innerHTML='<div class="empty-state">Could not load the report. '+html(error.message)+' Apply filters to try again.</div>';}}
    finally{if(current()){reportSubmit.disabled=false;reportSubmit.removeAttribute('aria-busy');timer=setTimeout(()=>void refresh(true),10000);}}
  }
  function activate(id) {
    tab=id;offset=0;
    for(const button of page.querySelectorAll('[data-paper-tab]')){
      const current=button.dataset.paperTab===tab;
      button.tabIndex=current?0:-1;
      button.setAttribute('aria-selected',String(current));
      button.setAttribute('aria-pressed',String(current));
    }
    body.setAttribute('aria-labelledby','paper-tab-'+id);
    showActivityTabs();
    body.classList.toggle('hidden',id==='chart');
    chartPanel.classList.toggle('hidden',id!=='chart');
    if(id==='chart'&&active())chart.show();else chart.hide();
    render(true);
    void refresh();
  }

  function dialogClose(d) { d.close();d.remove(); }
  function search(forChart=false,initialKind='equity',initialExchange='') {
    const d=workspaceDialog(forChart?'Find a chart instrument':'Find an instrument',`
      <div class="paper-form-grid">
        ${state.meta?.privateDhan?`<label>Quote source<select name="source"><option value="dhan">DhanHQ</option><option value="workspace">Practice quotes</option></select></label>`:''}
        <label data-paper-kind>Instrument type<select name="kind">${choice([['equity','Stocks'],['futures','Futures'],['options','Options']],initialKind)}</select></label>
        ${state.meta?.privateDhan?`<label data-paper-exchange>Exchange<select name="exchange">${choice([['','All exchanges'],['NSE','NSE'],['BSE','BSE'],['MCX','MCX · Commodities']],initialExchange)}</select></label>`:''}
        <label class="paper-field-wide">Search instruments<input type="search" name="search" placeholder="Symbol, company, expiry or strike" autocomplete="off" maxlength="80"></label>
      </div><div class="paper-search-results"></div><p class="muted" role="status"></p>`);
    dialog=d;
    d.classList.add('paper-dialog');
    const field=d.querySelector('[name=search]'), kind=d.querySelector('[name=kind]'), source=d.querySelector('[name=source]');
    const exchange=d.querySelector('[name=exchange]');
    const stockOption=kind.querySelector('option[value=equity]');
    const results=d.querySelector('.paper-search-results'), status=d.querySelector('[role=status]');
    const provider=()=>source?.value??'workspace';
    let timer,request,items=[];
    async function lookup() {
      request?.abort();
      const next=new AbortController();
      request=next;
      const mode=provider(),term=field.value.trim();
      const simulated=mode==='workspace'&&state.meta?.simulated;
      const selectedExchange=mode==='dhan'?exchange.value:'';
      if(exchange)d.querySelector('[data-paper-exchange]').classList.toggle('hidden',mode!=='dhan');
      stockOption.disabled=selectedExchange==='MCX';
      if(stockOption.disabled&&kind.value==='equity')kind.value='futures';
      d.querySelector('[data-paper-kind]').classList.toggle('hidden',mode!=='dhan'&&!simulated);
      status.textContent='Searching…';
      try{
        const endpoint=mode==='dhan'?'/api/private-dhan/symbols':simulated?'/api/paper/instruments':'/api/stocks';
        const data=await api(endpoint+'?'+query({kind:kind.value,q:term,...(mode==='dhan'?{paper:'1',exchange:selectedExchange}:{})}),{signal:next.signal});
        if(next.signal.aborted||!d.open)return;
        items=data.items?data.items.filter(item=>item.lotSize):data.data.filter(item=>[item.name,item.symbol].some(value=>String(value).toLowerCase().includes(term.toLowerCase()))).slice(0,50);
        results.innerHTML=items.map((item,i)=>`<button type="button" data-ticket-item="${i}"><strong>${html(item.expiry?item.name:item.symbol)}</strong><small>${html(item.expiry?[item.exchange,item.expiry,item.exchange==='MCX'?item.lotSize+' quote units per lot':item.lotSize+' units per lot'].filter(Boolean).join(' · '):item.name)}</small></button>`).join('');
        status.textContent=items.length?(data.total>items.length?'Showing the first '+items.length+' matches. Refine the search to find a specific contract.':''):data.ready===false?'Dhan’s directory is still loading. Retrying…':'No matching instruments.';
        if(data.ready===false){clearTimeout(timer);timer=setTimeout(()=>void lookup(),2500);}
      }catch(error){if(!next.signal.aborted){items=[];results.replaceChildren();status.textContent=error.message;}}
    }
    const schedule=()=>{clearTimeout(timer);request?.abort();items=[];results.replaceChildren();timer=setTimeout(()=>void lookup(),180);};
    field.addEventListener('input',()=>{
      if(/\bFUT(?:URES?)?\b/i.test(field.value))kind.value='futures';
      else if(/\b(?:OPTIONS?|CALLS?|PUTS?)\b/i.test(field.value))kind.value='options';
      schedule();
    });
    kind.addEventListener('change',schedule);
    exchange?.addEventListener('change',schedule);
    source?.addEventListener('change',schedule);
    d.addEventListener('close',()=>{clearTimeout(timer);request?.abort();});
    d.addEventListener('submit',event=>{event.preventDefault();results.querySelector('button')?.click();});
    results.addEventListener('click',event=>{
      const i=event.target.closest('[data-ticket-item]')?.dataset.ticketItem;
      if(i==null||!items[i])return;
      const item=items[i];dialogClose(d);
      if(forChart)chart.choose(provider(),item);
      else void open(provider(),item.symbol);
    });
    field.focus();
    void lookup();
  }

  async function open(source,symbol,side='buy',units=1,product='delivery',closing=false,stayOnChart=false) {
    const owner=state.user?.id;
    if(!owner)return;
    const d=workspaceDialog('Paper order',`<div class="paper-ticket-loading" role="status">Loading instrument and quote…</div>`);
    dialog=d;
    d.classList.add('paper-dialog','paper-order-ticket');
    try {
      const item=await api('/api/paper/instrument?'+query({source,symbol}));
      symbol=item.symbol;
      if(!d.open||state.user?.id!==owner)return;
      d.querySelector('.paper-ticket-loading').outerHTML=`
        <section class="paper-ticket-security" aria-label="Order instrument"><div class="paper-ticket-security-name"><span class="paper-ticket-security-icon">${terminalIcon('charts')}</span><div><h3>${html(item.name)}</h3><p>${html(symbol.replace(/_\d{4}-\d{2}-\d{2}$/,''))} <span>· ${html(nameOf(item.kind))}${item.expiry?' · '+html(item.expiry):''}</span></p></div><span class="paper-ticket-practice">${terminalIcon('paper')}Practice</span></div><div class="paper-ticket-price"><strong>${format(item.last)}</strong><span class="paper-ticket-feed ${item.fresh?'is-live':'is-stale'}"><i></i>${source==='workspace'&&state.meta?.simulated?'Simulated quote':item.fresh?'Live quote':item.last==null?'Quote unavailable':'Last known price'}</span></div></section>
        <fieldset class="paper-ticket-side"><legend>Order side</legend>${['buy','sell'].map(value=>`<label class="paper-side-${value}"><input type="radio" name="side" value="${value}" ${side===value?'checked':''}><span>${terminalIcon('arrow')}${value==='buy'?'Buy':'Sell'}</span></label>`).join('')}</fieldset>
        <div class="paper-ticket-section-label">Order details</div><div class="paper-form-grid">
          <label class="paper-field-wide">Product<select name="product" ${closing?'disabled':''}><option value="delivery" ${product==='delivery'?'selected':''}>${item.kind==='equity'?'Delivery · hold overnight':'Carry forward · hold overnight'}</option><option value="intraday" ${product==='intraday'?'selected':''}>Intraday · same-day trade</option></select></label>
          <label>Order type<select name="type"><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop market</option></select></label>
          <label>${item.kind==='equity'?'Quantity · shares':'Quantity · lots'}<input type="number" name="units" min="1" max="100000" step="1" value="${units}" required>${item.kind!=='equity'?`<small>1 lot = ${html(item.lotSize)} ${item.exchange==='MCX'?'quote units':'units'}</small>`:''}</label>
          <label data-paper-order-level class="hidden"><span>Limit price (₹)</span><input type="number" name="level" min="0.01" step="0.01" disabled></label>
        </div>
        <details class="paper-risk-settings"><summary>${terminalIcon('lock')}<span>Stop loss & target</span><small>Optional</small><span class="paper-risk-chevron">⌄</span></summary><div class="paper-form-grid">
          <label>Stop loss (₹)<input type="number" name="stopLoss" min="0.01" step="0.01" placeholder="Optional"></label>
          <label>Take profit (₹)<input type="number" name="takeProfit" min="0.01" step="0.01" placeholder="Optional"></label>
        </div><p class="paper-risk-help">Price levels per unit. Protection uses eligible quotes.</p></details>
        <p class="muted paper-ticket-note">${terminalIcon('paper')}<span>Virtual funds only. ${item.intradayCutoff?'Intraday cutoff '+cutoffTime.format(new Date(item.intradayCutoff))+' IST. ':''}${item.exchange==='MCX'?'MCX calculations use the contract multiplier; short-option margin is an estimate.':''}</span></p>
        <div class="paper-preview" aria-live="polite"></div>`;
      const form=d.querySelector('form'), issue=d.querySelector('.dialog-error'), preview=d.querySelector('.paper-preview');
      const actions=d.querySelector('.dialog-actions');
      actions.insertAdjacentHTML('beforeend','<button class="button primary" type="submit">Review order '+terminalIcon('arrow')+'</button><button class="button primary hidden" type="button" data-submit-paper>Place paper order</button>');
      const review=actions.querySelector('button[type=submit]'), submit=actions.querySelector('[data-submit-paper]');
      const level=d.querySelector('[data-paper-order-level]'), levelInput=level.querySelector('input');
      let payload, requestId=crypto.randomUUID(), revision=0, busy=false;
      form.addEventListener('input',()=>{
        revision++;
        payload=null;
        issue.textContent='';
        preview.replaceChildren();
        review.classList.remove('hidden');
        submit.classList.add('hidden');
        const type=form.elements.type.value;
        level.classList.toggle('hidden',type==='market');
        levelInput.disabled=type==='market';levelInput.required=type!=='market';
        level.querySelector('span').textContent=type==='stop'?'Trigger price (₹)':'Limit price (₹)';
      });
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if(busy)return;
        const token=++revision;
        const values=new FormData(form);
        const numeric=key=>values.get(key)?Number(values.get(key)):null;
        const input={source,symbol,product:closing?product:values.get('product'),side:values.get('side'),type:values.get('type'),units:numeric('units'),level:numeric('level'),stopLoss:numeric('stopLoss'),takeProfit:numeric('takeProfit'),requestId};
        review.disabled=true;
        review.setAttribute('aria-busy','true');review.textContent='Reviewing…';
        submit.classList.add('hidden');
        issue.textContent='';
        try{
          const estimate=await api('/api/paper/preview',{method:'POST',body:JSON.stringify(input)});
          if(!d.open||token!==revision)return;
          preview.innerHTML=grid([['Units',fmt(estimate.quantity,0)],['Estimated price',format(estimate.price)],['Notional',format(estimate.notional)],estimate.closing?['Capital released',format(estimate.releases)]:['Required paper funds',format(estimate.required)],['Available now',format(estimate.available)],estimate.closing?['Estimated realised P&L',pnl(estimate.pnl)]:['Available after this order',format(estimate.available-estimate.required)]]);
          if(estimate.required>estimate.available&&estimate.required>0){issue.textContent='Insufficient virtual funds for this order.';return;}
          payload=input;
          review.classList.add('hidden');
          submit.classList.remove('hidden');
        }catch(error){if(d.open&&token===revision)issue.textContent=error.message;}
        finally{review.disabled=false;review.removeAttribute('aria-busy');review.innerHTML='Review order '+terminalIcon('arrow');}
      });
      submit.addEventListener('click',async()=>{
        if(!payload||busy)return;
        busy=true;submit.disabled=true;review.disabled=true;
        const fields=Array.from(form.querySelectorAll('input:not(:disabled),select:not(:disabled)'));
        fields.forEach(field=>field.disabled=true);
        issue.textContent='';
        try{
          const {order}=await api('/api/paper/orders',{method:'POST',body:JSON.stringify(payload)});
          if(!d.open||state.user?.id!==owner)return;
          dialogClose(d);
          if(!stayOnChart&&document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
          toast(order.state==='filled'? 'Paper order filled at '+format(order.fill)+'.':'Paper order is pending.');
          if(stayOnChart&&active()&&tab==='chart'){void refresh();void chart.refresh();}
          else{
            activitySelection.positions=order.product==='intraday'?'intraday':'delivery';
            activitySelection.orders='open';
            navigate('paper');activate(order.state==='filled'?'positions':'orders');
          }
        }catch(error){if(d.open)issue.textContent=error.message;}
        finally{busy=false;submit.disabled=false;review.disabled=false;fields.forEach(field=>field.disabled=false);}
      });
      if(item.expired){review.disabled=true;issue.textContent='This contract has expired.';}
    }catch(error){if(d.open)d.querySelector('.paper-ticket-loading').textContent=error.message;}
  }

  function positionButton(position,label) {
    return `<button class="button secondary" type="button" data-paper-protection="${html(position.symbol)}" data-position-source="${html(position.source)}" data-position-product="${html(position.product)}">${label}</button>`;
  }
  async function saveProtection(position,values) {
    const expected=Object.fromEntries(Object.keys(values).map(key=>[key,position[key]??null]));
    try{
      const result=await api('/api/paper/protection',{method:'PATCH',body:JSON.stringify({source:position.source,symbol:position.symbol,product:position.product,...values,expected})});
      const live=data?.positions.find(p=>p.source===position.source&&p.symbol===position.symbol&&p.product===position.product);
      if(live)Object.assign(live,{stopLoss:result.stopLoss,takeProfit:result.takeProfit});
      if(data)render(true);
      return result;
    }finally{
      if(active())void refresh(true);
    }
  }
  function editProtection(position) {
    const d=workspaceDialog('Position protection',`
      <p class="muted">${html(position.name)} · ${position.quantity>0?'Long':'Short'} · leave either price blank to remove it.</p>
      <div class="paper-form-grid">
        <label>Stop loss (₹)<input name="stop" type="number" min="0.01" step="0.01" value="${position.stopLoss??''}"></label>
        <label>Take profit (₹)<input name="target" type="number" min="0.01" step="0.01" value="${position.takeProfit??''}"></label>
      </div>`,async(values,d)=>{
      const save=d.querySelector('[type=submit]');
      if(save.disabled)throw new Error('Saving protection…');
      save.disabled=true;
      try{
        await saveProtection(position,{stopLoss:values.get('stop')?Number(values.get('stop')):null,takeProfit:values.get('target')?Number(values.get('target')):null});
        toast('Position protection updated.');
      }finally{save.disabled=false;}
    });
    dialog=d;
  }
  page.addEventListener('click',async event=>{
    const b=event.target.closest('button');
    if(!b)return;
    if(b.hasAttribute('data-paper-new'))search();
    if(b.dataset.paperTab&&b.dataset.paperTab!==tab)activate(b.dataset.paperTab);
    if(b.dataset.paperActivityTab&&b.dataset.paperActivityTab!==activitySelection[tab]){
      selectActivity(b.dataset.paperActivityTab);
      render(true);
    }
    if(b.dataset.paperPage){offset+=Number(b.dataset.paperPage);if(tab==='trades'){reportData=null;render(true);}void refresh();}
    if(b.dataset.reportChart){const trade=reportData?.trades.find(row=>String(row.id)===b.dataset.reportChart);if(trade){chart.choose(trade.source,trade);activate('chart');}}
    if(b.dataset.positionSource){
      const p=data?.positions.find(p=>p.source===b.dataset.positionSource&&p.product===b.dataset.positionProduct&&p.symbol===(b.dataset.paperClose??b.dataset.paperProtection??b.dataset.paperPositionChart));
      if(!p){void refresh();return;}
      if(b.dataset.paperPositionChart){chart.choose(p.source,p);activate('chart');}
      else if(b.dataset.paperClose)void open(p.source,p.symbol,p.quantity>0?'sell':'buy',Math.abs(p.quantity)/p.lotSize,p.product,true);
      else editProtection(p);
    }
    if(b.dataset.paperCancel){
      b.disabled=true;
      try{await api('/api/paper/orders/'+b.dataset.paperCancel,{method:'DELETE'});toast('Paper order cancelled.');void refresh();}
      catch(error){toast(error.message,true);b.disabled=false;}
    }
  });
  for(const list of [page.querySelector('.paper-tabs'),activityNav]){
    list.addEventListener('keydown',event=>{
      const buttons=[...list.querySelectorAll('[role=tab]')];
      const index=buttons.indexOf(event.target), length=buttons.length;
      const next={ArrowRight:(index+1)%length,ArrowLeft:(index-1+length)%length,Home:0,End:length-1}[event.key];
      if(index<0||next===undefined)return;
      event.preventDefault();
      buttons[next].click();
      buttons[next].focus();
    });
  }
  document.body.addEventListener('click',event=>{
    const button=event.target.closest('[data-paper-symbol]');
    if(button)void open(button.dataset.paperSource,button.dataset.paperSymbol,button.dataset.paperSide);
  });
  document.addEventListener('visibilitychange',()=>{if(active()){void refresh(true);if(tab==='chart')chart.show();}else {pause();chart.hide();}});
  window.paperTrading={open,navigate(target){if(target==='paper'){if(tab==='chart')chart.show();void refresh();}else {pause();chart.hide();}},reset(){
    pause();chart.reset();data=null;tab='chart';offset=0;
    expandedPositions.clear();
    expandedTrades.clear();reportData=null;reportParams={};reportControls.reset();showReportPeriod();
    if(dialog?.open)dialogClose(dialog);
    Object.assign(activitySelection,defaultActivity);
    metrics.replaceChildren();activityContent.replaceChildren();activityContent.dataset.markup='';
    activate('chart');
  }};
})();
