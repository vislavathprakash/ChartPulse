function dhanDrawingIcon(id,fallback) {
  const paths={
    cursor:'<path d="m5 3 14 9-7 1-3 7L5 3Z"/>',
    horizontal:'<path d="M3 12h18"/><circle cx="12" cy="12" r="2"/>',
    vertical:'<path d="M12 3v18"/><circle cx="12" cy="12" r="2"/>',
    trend:'<path d="m5 18 14-12"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="5" r="2"/>',
    ray:'<path d="M4 20 20 4m-6 0h6v6"/>',
    extended:'<path d="M3 21 21 3M3 15v6h6M15 3h6v6"/>',
    rectangle:'<rect x="4" y="6" width="16" height="12" rx="1"/>',
    fib:'<path d="M4 5h16M4 9h16M4 13h16M4 19h16M6 19 18 5"/>',
    text:'<path d="M4 6h16m-8 0v14m-4 0h8"/>',
    arrow:'<path d="m4 17 15-10m-6-1 6 1-1 6"/>',
    measure:'<path d="m3 15 12-12 6 6L9 21l-6-6Zm5-5 2 2m1-5 2 2m1-5 2 2"/>'
  };
  return paths[id]?`<svg class="terminal-icon" aria-hidden="true" viewBox="0 0 24 24">${paths[id]}</svg>`:fallback;
}

function createDhanChartDesk(host, toolbar, selectSymbol, watchChanged, quoteStats) {
  host.classList.add('dhan-chart-host');
  host.classList.remove('empty-state');
  const desk = document.createElement('div');
  desk.className = 'dhan-chart-desk';
  desk.innerHTML = `
    <div class="dhan-drawing-rail" role="group" aria-label="Drawing tools">
      ${drawingTools.filter(([id])=>id!=='channel').map(([id,icon,label])=>`<button type="button" data-dhan-tool="${id}" aria-label="${label}" title="${label}" aria-pressed="${id==='cursor'}">${dhanDrawingIcon(id,icon)}</button>`).join('')}
      <button type="button" data-dhan-chart="undo" aria-label="Undo drawing" title="Undo drawing">↶</button>
      <button type="button" data-dhan-chart="redo" aria-label="Redo drawing" title="Redo drawing">↷</button>
    </div>
    <div class="dhan-chart-stage">
      <div class="dhan-chart-ohlc" aria-label="Candle data"></div>
      <div class="dhan-indicator-legend hidden" aria-label="Active indicators"></div>
      <div class="dhan-drawing-actions hidden" role="group" aria-label="Selected drawing">
        <span></span>
        <button type="button" data-dhan-chart="drawingAlert" aria-label="Create alert at this level" title="Create alert at this level">${terminalIcon('alerts')}</button>
        <button type="button" data-dhan-chart="deleteDrawing" aria-label="Delete drawing" title="Delete drawing (Delete)">${terminalIcon('trash')}</button>
      </div>
      <div class="dhan-canvas-box"><canvas aria-label="Interactive Dhan price chart" tabindex="0"></canvas><p class="dhan-chart-empty" role="status">Choose a symbol to load candles.</p></div>
      <div class="dhan-chart-bottom">
        <button type="button" data-dhan-chart="zoomOut" aria-label="Zoom out">−</button>
        <button type="button" data-dhan-chart="zoomIn" aria-label="Zoom in">+</button>
        <button type="button" data-dhan-chart="resetZoom">Fit chart</button>
        <span class="dhan-chart-hint">Drag to pan · Scroll to zoom</span>
      </div>
    </div>
    <aside class="dhan-dock" aria-label="Chart side panel" id="dhan-dock-content">
      <div class="dhan-dock-heading"><b>Watchlist</b><button type="button" data-dhan-chart="closeDock" aria-label="Close side panel">×</button></div>
      <div class="dhan-dock-watch">
        <div class="dhan-watch-controls">
          <select aria-label="Saved watchlist"></select>
          <button type="button" data-dhan-chart="newList" title="Create watchlist" aria-label="Create watchlist">＋</button>
          <button type="button" data-dhan-chart="rename" title="Rename watchlist" aria-label="Rename watchlist">✎</button>
        </div>
        <input class="dhan-watch-search" type="search" aria-label="Search Dhan symbols" placeholder="Search symbol or company">
        <button type="button" data-dhan-chart="addSymbol">Add chart symbol</button>
        <div class="dhan-watch-rows"></div>
      </div>
      <div class="dhan-dock-alerts hidden"></div>
      <div class="dhan-dock-quote hidden"></div>
    </aside>`;
  const rail = document.createElement('div');
  rail.className='dhan-right-rail';
  rail.setAttribute('role','group');
  rail.setAttribute('aria-label','Chart panels');
  rail.innerHTML=[['watch','Watchlist','list'],['alerts','Alerts','alerts'],['quote','Quote details','overview']].map(([key,label,icon])=>
    `<button type="button" data-dhan-dock="${key}" aria-controls="dhan-dock-content" aria-pressed="false" aria-label="${label}" title="${label}">${terminalIcon(icon)}</button>`).join('');
  desk.append(rail);
  host.replaceChildren(desk);
  const quotePanel=desk.querySelector('.dhan-dock-quote');
  quotePanel.append(quoteStats);
  const tools = document.createElement('div');
  tools.className = 'dhan-chart-actions';
  tools.innerHTML = `<select aria-label="Dhan chart type">${choice([['candles','Candles'],['bars','OHLC bars'],['line','Line'],['area','Area'],['heikin','Heikin Ashi']],'candles')}</select>
    <button type="button" data-dhan-chart="indicators">Indicators</button>
    <button type="button" class="dhan-create-alert" data-dhan-chart="createAlert" aria-label="Create alert" title="Create alert">${terminalIcon('alerts')} <span>Alert</span></button>
    <button type="button" data-dhan-chart="fullscreen" aria-label="Fullscreen chart" aria-pressed="false" title="Fullscreen chart">${terminalIcon('fullscreen')}</button>
    <button type="button" data-dhan-chart="options" aria-label="Chart options" title="Chart options">${terminalIcon('more')}</button>`;
  toolbar.append(tools);
  const searchButton=document.createElement('button');
  searchButton.type='button';
  searchButton.className='dhan-symbol-search';
  searchButton.setAttribute('aria-label','Search symbols');
  searchButton.innerHTML=`${terminalIcon('search')} <span>Search symbols</span>`;
  toolbar.prepend(searchButton);
  const refreshButton=toolbar.querySelector('#privateHistoryRefresh');
  refreshButton.setAttribute('aria-label','Refresh chart');
  refreshButton.title='Refresh chart';
  refreshButton.innerHTML=terminalIcon('refresh');
  const interval=toolbar.querySelector('#privateHistoryInterval');
  const intervalLabels=Array.from(interval.options,option=>[option.value,option.text]);
  const shortcuts=document.createElement('div');
  shortcuts.className='dhan-interval-favorites';
  shortcuts.setAttribute('aria-label','Favorite chart intervals');
  interval.before(shortcuts);
  const star=document.createElement('button');
  star.type='button';
  star.textContent='☆';
  star.setAttribute('aria-label','Manage favorite intervals');
  star.title='Manage favorite intervals';
  interval.after(star);
  const defaultIntervals=['5','15','60','day'];
  let favorites=defaultIntervals;
  let favoriteOwner;
  const intervalKey=()=>`alertpe:dhan-intervals:${state.user?.id}`;
  const renderIntervals=()=>{
    shortcuts.innerHTML=intervalLabels.filter(([value])=>favorites.includes(value)).map(([value,label])=>
      `<button type="button" aria-label="${html(label)}" title="${html(label)}" aria-pressed="${interval.value===value}" data-interval="${value}">${value==='day'?'D':value==='60'?'1h':value+'m'}</button>`).join('');
  };
  shortcuts.onclick=event=>{
    const value=event.target.closest('button')?.dataset.interval;
    if(!value||value===interval.value)return;
    interval.value=value;
    interval.dispatchEvent(new Event('change'));
  };
  interval.addEventListener('change',renderIntervals);
  star.onclick=()=>workspaceDialog('Favorite intervals',intervalLabels.map(([value,label])=>
    `<label class="consent-row"><input type="checkbox" name="favorite" value="${value}" ${favorites.includes(value)?'checked':''}> ${html(label)}</label>`).join(''),async data=>{
    favorites=data.getAll('favorite');
    try{localStorage.setItem(intervalKey(),JSON.stringify(favorites));}catch{}
    renderIntervals();
  });
  renderIntervals();
  const canvas=desk.querySelector('canvas');
  const box=desk.querySelector('.dhan-canvas-box');
  const empty=desk.querySelector('.dhan-chart-empty');
  const ohlc=desk.querySelector('.dhan-chart-ohlc');
  const legend=desk.querySelector('.dhan-indicator-legend');
  const watch=desk.querySelector('.dhan-watch-rows');
  const watchSelect=desk.querySelector('select');
  const search=desk.querySelector('.dhan-watch-search');
  const drawingActions=desk.querySelector('.dhan-drawing-actions');
  const alertsPanel=desk.querySelector('.dhan-dock-alerts');
  const hint=desk.querySelector('.dhan-chart-hint');
  const owner={settings:{...chartDefaults(),indicators:[],watermark:false},compactSessions:true,sourceLabel:'DHANHQ',chartHeight:()=>box.clientHeight,count:105,offset:0,updateDataWindow(index,candles){
    const bar=candles[index];
    if(!bar)return;
    const text=`O ${fmt(bar.open)}   H ${fmt(bar.high)}   L ${fmt(bar.low)}   C ${fmt(bar.close)}   Vol ${fmt(bar.volume,0)}`;
    if(ohlc.textContent!==text)ohlc.textContent=text;
  }};
  const renderer=new MarketChartRenderer(canvas,owner);
  const indicatorKey=()=>`alertpe:dhan-indicators:${state.user?.id}`;
  const indicatorCatalog=Technicals.catalog.filter(item=>item.type!=='volume');
  const indicatorName=item=>item.type.toUpperCase()+(item.period?` ${item.period}`:'');
  function updateIndicators(items,save=true) {
    owner.settings.indicators=items;
    if(save)try{localStorage.setItem(indicatorKey(),JSON.stringify(items));}catch{}
    legend.innerHTML=items.map(item=>`<span class="dhan-indicator-chip"><b>${html(indicatorName(item))}</b><button type="button" data-remove-indicator="${item.type}" aria-label="Remove ${html(indicatorName(item))}">×</button></span>`).join('');
    legend.classList.toggle('hidden',!items.length);
    paint();
  }
  legend.addEventListener('click',event=>{
    const type=event.target.closest('button')?.dataset.removeIndicator;
    if(type)updateIndicators(owner.settings.indicators.filter(item=>item.type!==type));
  });
  let candles=[],drawings=[],undo=[],redo=[],symbols=[],quotes=new Map(),lists=[],watchId='',loadedFor=null,loadingLists=null,listEpoch=0;
  let tool='cursor',drag=null,storageKey='',dockView=null,alertEpoch=0;
  const chartPanel=host.closest('.private-dhan-chart');
  const fullscreenButton=tools.querySelector('[data-dhan-chart="fullscreen"]');
  searchButton.onclick=()=>openSymbolSearch();
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||
      chartPanel.closest('.page')?.classList.contains('hidden')||!chartPanel.getClientRects().length||
      document.querySelector('dialog[open]')||event.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
    if(!/^[a-z0-9]$/i.test(event.key))return;
    event.preventDefault();
    openSymbolSearch(event.key);
  });
  const paint=()=>renderer.render(candles,owner.preview?[...drawings,owner.preview]:drawings);
  new ResizeObserver(paint).observe(box);
  const persist=()=>{
    if(storageKey)try{localStorage.setItem(storageKey,JSON.stringify(drawings));}catch{}
    if(!selectedDrawing())owner.selectedDrawing=null;
    renderDrawingActions();
    paint();
  };
  function editDrawings(next) {
    undo.push(drawings);
    if(undo.length>30)undo.shift();
    redo=[];
    drawings=next;
    persist();
  }
  function setTool(next) {
    tool=next;
    owner.anchor=null;
    owner.preview=null;
    if(next!=='cursor')selectDrawing(null);
    canvas.classList.toggle('dhan-drawing-active',next!=='cursor');
    desk.classList.toggle('dhan-tool-selected',next!=='cursor');
    desk.querySelectorAll('[data-dhan-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dhanTool===tool)));
    hint.textContent=tool==='cursor'?'Drag to pan · Scroll to zoom':['horizontal','vertical','text'].includes(tool)?'Select a point on the chart.':'Select two points on the chart.';
    paint();
  }
  function chartPoint(event, clamp=false) {
    const g=renderer.geometry;
    if(!g)return null;
    const bounds=canvas.getBoundingClientRect();
    const x=event.clientX-bounds.left,y=event.clientY-bounds.top;
    if(!clamp&&(x<g.left||x>=g.right||y<g.top||y>g.bottom))return null;
    return renderer.pricePoint(Math.max(g.left,Math.min(g.right-1,x)),Math.max(g.top,Math.min(g.bottom,y)));
  }
  const singlePoint=()=>['horizontal','vertical','text'].includes(tool);
  function drawingPayload(start,end) {
    return {time:start.time,price:start.price,color:'#a78bfa',lineWidth:2,...(end?{time2:end.time,price2:end.price}:{})};
  }
  function finishDrawing(start,end) {
    if(end&&['ray','extended'].includes(tool)&&start.time===end.time){
      owner.anchor=start;
      hint.textContent='Choose a different candle for the second point.';
      return;
    }
    const kind=tool;
    const key=storageKey;
    const payload=drawingPayload(start,end);
    const save=text=>{
      if(key!==storageKey)return;
      if(drawings.length>=100)throw new Error('Remove a drawing before adding another.');
      const drawing={id:crypto.randomUUID(),kind,payload:{...payload,text}};
      editDrawings([...drawings,drawing]);
      selectDrawing(drawing);
    };
    if(kind==='text')workspaceDialog('Text annotation','<label>Note<input name="note" required maxlength="100"></label>',async data=>save(data.get('note')));
    else try{save();}catch(error){toast(error.message,true);}
    setTool('cursor');
  }
  function zoom(delta, anchor=.5) {
    const old=Math.min(owner.count,candles.length);
    owner.count=Math.min(Math.max(15,candles.length),Math.max(15,owner.count+delta));
    owner.offset=Math.max(0,Math.min(Math.max(0,candles.length-owner.count),Math.round(owner.offset+(old-owner.count)*(1-anchor))));
    paint();
  }
  const touches=new Map();
  let pinch=null;
  const distance=()=>{const [a,b]=touches.values();return Math.hypot(a.x-b.x,a.y-b.y);};
  canvas.addEventListener('wheel',event=>{
    const g=renderer.geometry;
    if(!candles.length||!g)return;
    event.preventDefault();
    if(event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)){
      const delta=event.deltaX||event.deltaY;
      owner.offset=Math.max(0,Math.min(Math.max(0,candles.length-owner.count),owner.offset+Math.sign(delta)*5));
      paint();
    } else zoom(event.deltaY>0?8:-8,Math.max(0,Math.min(1,(event.offsetX-g.left)/(g.right-g.left))));
  },{passive:false});
  canvas.onpointerdown=event=>{
    const g=renderer.geometry;
    if(event.button!==0||!candles.length||!g)return;
    canvas.setPointerCapture(event.pointerId);
    if(event.pointerType==='touch'){
      touches.set(event.pointerId,{x:event.offsetX,y:event.offsetY});
      if(touches.size===2){pinch=distance();drag=null;return;}
      if(touches.size>2)return;
    }
    drag={x:event.offsetX,y:event.offsetY,offset:owner.offset,scale:event.offsetX>g.right,min:g.min,max:g.max,height:g.bottom-g.top,point:chartPoint(event)};
  };
  canvas.onpointermove=event=>{
    if(touches.has(event.pointerId))touches.set(event.pointerId,{x:event.offsetX,y:event.offsetY});
    if(pinch!==null){
      if(touches.size===2){const next=distance();if(Math.abs(next-pinch)>12){zoom(next>pinch?-6:6);pinch=next;}}
      return;
    }
    owner.hover={x:event.offsetX,y:event.offsetY};
    if(tool!=='cursor'){
      const point=chartPoint(event,Boolean(drag?.point));
      const start=owner.anchor||drag?.point;
      const single=singlePoint();
      const canPreview=single?tool!=='text':start&&(!['ray','extended'].includes(tool)||start.time!==point?.time);
      owner.preview=point&&canPreview?{kind:tool,payload:drawingPayload(single?point:start,single?null:point)}:null;
      paint();
      return;
    }
    if(drag&&tool==='cursor'&&renderer.geometry){
      if(drag.scale){
        const center=(drag.min+drag.max)/2;
        const half=(drag.max-drag.min)/2*Math.exp(Math.max(-3,Math.min(3,(event.offsetY-drag.y)/150)));
        owner.manualRange={min:Math.max(.000001,center-half),max:center+half};
      }else{
        owner.offset=Math.max(0,Math.min(Math.max(0,candles.length-owner.count),drag.offset+Math.round((event.offsetX-drag.x)/renderer.geometry.spacing)));
        if(Math.abs(event.offsetY-drag.y)>4){
          const shift=(event.offsetY-drag.y)*(drag.max-drag.min)/drag.height;
          const min=Math.max(.000001,drag.min+shift);
          owner.manualRange={min,max:min+drag.max-drag.min};
        }
      }
    }
    paint();
  };
  canvas.onpointerleave=()=>{owner.hover=null;owner.preview=null;paint();};
  canvas.onpointercancel=event=>{touches.delete(event.pointerId);if(touches.size<2)pinch=null;drag=null;owner.preview=null;paint();};
  canvas.onpointerup=event=>{
    touches.delete(event.pointerId);
    if(pinch!==null){if(touches.size<2)pinch=null;return;}
    if(drag?.point&&tool==='cursor'&&Math.hypot(event.offsetX-drag.x,event.offsetY-drag.y)<8){
      selectDrawing(drawingAtEvent(event));
      canvas.focus({preventScroll:true});
    }else if(drag?.point&&tool!=='cursor'){
      const point=chartPoint(event,true);
      const moved=Math.hypot(event.offsetX-drag.x,event.offsetY-drag.y)>=8;
      if(point){
        if(singlePoint())finishDrawing(point);
        else if(owner.anchor||moved)finishDrawing(owner.anchor||drag.point,point);
        else {owner.anchor=point;hint.textContent='Choose the second point.';paint();}
      }
    }
    drag=null;
  };
  canvas.ondblclick=()=>{if(tool==='cursor'){owner.manualRange=null;paint();}};
  canvas.oncontextmenu=event=>{
    const drawing=drawingAtEvent(event);
    if(!drawing)return;
    event.preventDefault();
    setTool('cursor');
    selectDrawing(drawing);
    drawingActions.querySelector('[data-dhan-chart="deleteDrawing"]').focus({preventScroll:true});
  };
  canvas.onkeydown=event=>{
    if(event.key==='Escape'){setTool('cursor');selectDrawing(null);}
    if(event.key==='+'||event.key==='-'){event.preventDefault();zoom(event.key==='+'?-10:10);}
    if(['ArrowLeft','ArrowRight'].includes(event.key)){
      event.preventDefault();
      owner.offset=Math.max(0,Math.min(Math.max(0,candles.length-owner.count),owner.offset+(event.key==='ArrowLeft'?5:-5)));
      paint();
    }
  };
  const currentList=()=>lists.find(list=>String(list.id)===watchId);
  function renderWatch() {
    const list=currentList();
    const query=search.value.trim().toLowerCase();
    const matching=symbols.filter(s=>(!list||list.symbols.includes(s.symbol))&&`${s.symbol} ${s.name}`.toLowerCase().includes(query));
    const markup=matching.map(s=>{
      const q=quotes.get(s.symbol);
      const [price,change,,tone]=quoteCells(q||{});
      return `<div class="dhan-watch-row"><button type="button" data-dhan-symbol="${html(s.symbol)}" aria-current="${s.symbol===owner.symbol?'true':'false'}"><span><b>${html(s.symbol)}</b><small>${html(s.name)}</small></span><span>${price}</span><span class="${tone}">${change}</span></button>${list?`<button type="button" data-dhan-remove="${html(s.symbol)}" aria-label="Remove ${html(s.symbol)}">×</button>`:''}</div>`;
    }).join('')||'<p class="muted">No matching Dhan instruments.</p>';
    if(watch.innerHTML!==markup){
      const focused=document.activeElement;
      const key=focused?.dataset.dhanSymbol?'dhanSymbol':focused?.dataset.dhanRemove?'dhanRemove':null;
      const value=key&&focused.dataset[key];
      watch.innerHTML=markup;
      if(value)[...watch.querySelectorAll('button')].find(button=>button.dataset[key]===value)?.focus({preventScroll:true});
    }
    desk.querySelector('[data-dhan-chart="rename"]').disabled=!list;
    desk.querySelector('[data-dhan-chart="addSymbol"]').disabled=!list||!owner.symbol||list.symbols.includes(owner.symbol);
  }
  async function reloadLists() {
    const epoch=listEpoch;
    const result=await api('/api/watchlists',{cache:'no-store'});
    if(epoch!==listEpoch)return;
    lists=result.watchlists;
    if(!currentList())watchId='';
    watchSelect.innerHTML='<option value="">Starter quotes</option>'+choice(lists.map(list=>[String(list.id),list.name]),watchId);
    watchSelect.value=watchId;
    renderWatch();
    if(watchId)watchChanged();
  }
  function loadLists() {
    const user=state.user?.id;
    if(!user||loadedFor===user||loadingLists)return;
    const epoch=listEpoch;
    loadingLists=reloadLists().then(()=>{if(epoch===listEpoch)loadedFor=user;}).catch(error=>{if(epoch===listEpoch)toast(error.message,true);}).finally(()=>{if(epoch===listEpoch)loadingLists=null;});
  }
  function openSymbolSearch(initial='') {
    const dialog=workspaceDialog('Symbol search',`
      <label>Search stocks or futures<input class="dhan-search-input" type="search" placeholder="Symbol or company name" autocomplete="off"></label>
      <label>Exchange<select class="dhan-search-exchange"><option value="">All exchanges</option><option>NSE</option><option>BSE</option><option>MCX</option></select></label>
      <label>Save to watchlist<select class="dhan-search-list"></select></label>
      <div class="dhan-search-results"></div><button type="button" class="dhan-search-more button secondary hidden">Show more</button>
      <p class="dhan-search-count muted"></p><p class="dhan-search-status muted" role="status"></p>`);
    const field=dialog.querySelector('.dhan-search-input');
    const results=dialog.querySelector('.dhan-search-results');
    const listField=dialog.querySelector('.dhan-search-list');
    const status=dialog.querySelector('.dhan-search-status');
    const exchange=dialog.querySelector('.dhan-search-exchange');
    const more=dialog.querySelector('.dhan-search-more');
    const count=dialog.querySelector('.dhan-search-count');
    let found=[], total=0, ready=false, pending, timer, version=0;
    const paintLists=()=>{
      listField.innerHTML='<option value="">Choose a watchlist</option>'+choice(lists.map(list=>[String(list.id),list.name]),watchId);
      listField.value=watchId;
    };
    const render=()=>{
      const list=lists.find(item=>String(item.id)===listField.value);
      const markup=found.map(item=>{
        const saved=list?.symbols.includes(item.symbol);
        return `<div class="dhan-search-row"><button type="button" data-open-symbol="${html(item.symbol)}"><strong>${html(item.symbol)}</strong><small>${html(item.name)}${item.expiry?' · '+html(item.expiry):''}</small></button>
          <button type="button" data-save-symbol="${html(item.symbol)}" aria-label="Add ${html(item.symbol)} to watchlist" title="${saved?'Already saved':'Add to watchlist'}" ${saved?'disabled':''}>${saved?'✓':'＋'}</button></div>`;
      }).join('')||`<p class="muted">${ready?'No matching instruments.':'Loading Dhan instruments…'}</p>`;
      if(results.dataset.markup!==markup){
        results.innerHTML=markup;
        results.dataset.markup=markup;
      }
      more.classList.toggle('hidden',found.length>=total);
      count.textContent=ready?`Showing ${fmt(found.length,0)} of ${fmt(total,0)} listings`:'';
    };
    async function searchCatalog(append=false) {
      pending?.abort();
      const request=new AbortController();
      pending=request;
      const revision=++version;
      more.disabled=true;
      try {
        const data=await api('/api/private-dhan/symbols?'+new URLSearchParams({q:field.value,exchange:exchange.value,offset:append?found.length:0}),{signal:request.signal,cache:'no-store'});
        if(!dialog.open||revision!==version)return;
        found=append?[...found,...data.items]:data.items;
        total=data.total;
        ready=data.ready;
        render();
        if(!ready)timer=setTimeout(()=>void searchCatalog(),1800);
      }catch(error){
        if(dialog.open&&!request.signal.aborted)status.textContent=error.message;
      }finally{if(revision===version)more.disabled=false;}
    }
    function scheduleSearch(){
      clearTimeout(timer);
      pending?.abort();
      version++;
      found=[];total=0;ready=false;status.textContent='';
      render();
      timer=setTimeout(()=>void searchCatalog(),150);
    }
    function open(symbol){
      const item=found.find(item=>item.symbol===symbol);
      dialog.close();dialog.remove();selectSymbol(symbol,item);canvas.focus({preventScroll:true});
    }
    field.value=initial;
    paintLists();
    render();
    field.focus();
    field.setSelectionRange(initial.length,initial.length);
    void searchCatalog();
    dialog.addEventListener('close',()=>{clearTimeout(timer);pending?.abort();});
    reloadLists().then(()=>{if(dialog.open){paintLists();render();}}).catch(error=>{status.textContent=error.message;});
    field.oninput=scheduleSearch;
    exchange.onchange=scheduleSearch;
    more.onclick=()=>void searchCatalog(true);
    listField.onchange=render;
    field.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();const first=results.querySelector('[data-open-symbol]');if(first)open(first.dataset.openSymbol);}};
    results.onclick=async event=>{
      const button=event.target.closest('button');
      if(!button)return;
      if(button.dataset.openSymbol){open(button.dataset.openSymbol);return;}
      const symbol=button.dataset.saveSymbol;
      if(!symbol)return;
      if(!listField.value){
        if(!lists.length){listDialog(false,async()=>{if(dialog.open){paintLists();render();}});}
        else {listField.focus();status.textContent='Choose a watchlist to save this symbol.';}
        return;
      }
      const target=listField.value;
      button.disabled=true;
      try {
        await api(`/api/watchlists/${target}/items`,{method:'POST',body:JSON.stringify({symbol})});
        watchId=target;
        await reloadLists();
        if(!dialog.open)return;
        listField.value=target;
        render();
        showDock('watch');
        status.textContent=`${symbol} added to ${currentList()?.name||'watchlist'}.`;
      }catch(error){status.textContent=error.message;button.disabled=false;}
    };
    listField.insertAdjacentHTML('afterend','<button type="button" class="dhan-search-create button secondary">New watchlist</button>');
    dialog.querySelector('.dhan-search-create').onclick=()=>listDialog(false,async()=>{if(dialog.open){paintLists();render();}});
  }
  const selectedDrawing=()=>drawings.find(drawing=>drawing.id===owner.selectedDrawing);
  function drawingAtEvent(event) {
    const rect=canvas.getBoundingClientRect();
    return renderer.drawingAt(drawings,event.clientX-rect.left,event.clientY-rect.top,event.pointerType==='touch'?13:8);
  }
  function renderDrawingActions() {
    const drawing=selectedDrawing();
    drawingActions.classList.toggle('hidden',!drawing);
    drawingActions.querySelector('span').textContent=drawing?drawingTools.find(([id])=>id===drawing.kind)?.[2]||drawing.kind:'';
    drawingActions.querySelector('[data-dhan-chart="drawingAlert"]').classList.toggle('hidden',drawing?.kind!=='horizontal');
  }
  function selectDrawing(drawing) {
    owner.selectedDrawing=drawing?.id??null;
    renderDrawingActions();
    paint();
  }
  function deleteDrawing() {
    const drawing=selectedDrawing();
    if(!drawing)return;
    editDrawings(drawings.filter(item=>item.id!==drawing.id));
    canvas.focus({preventScroll:true});
  }
  desk.addEventListener('keydown',event=>{
    if(event.key!=='Delete'||event.target.closest('input,textarea,select,[contenteditable=true]')||!selectedDrawing())return;
    event.preventDefault();
    deleteDrawing();
  });
  const priceConditions=chartConditions.slice(0,5);
  const conditionLabel=key=>priceConditions.find(([value])=>value===key)?.[1]||key;
  async function loadAlerts() {
    const epoch=++alertEpoch;
    alertsPanel.textContent='Loading Dhan alerts…';
    try {
      const {alerts}=await api('/api/private-dhan/alerts',{cache:'no-store'});
      if(epoch!==alertEpoch||dockView!=='alerts')return;
      alertsPanel.innerHTML=alerts.map(rule=>`<article class="dhan-alert-row"><strong>${html(rule.name)}</strong><span class="tag">${html(rule.status)}</span>
        <p>${html(rule.symbol)}${rule.expiry?' · '+html(rule.expiry):''} · ${html(conditionLabel(rule.condition))} ${quotePrice.format(rule.target)}</p>
        ${rule.triggered_at?`<p>Last triggered ${html(new Date(rule.triggered_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))} IST</p>`:''}
        ${['active','paused'].includes(rule.status)?`<button type="button" data-dhan-rule="${rule.id}" data-enable="${rule.status==='paused'}">${rule.status==='paused'?'Resume':'Pause'}</button>`:''}
      </article>`).join('')||'<p class="muted">Create a price alert to track a level on this chart.</p>';
    } catch(error) {
      if(epoch===alertEpoch&&dockView==='alerts')alertsPanel.textContent=error.message;
    }
  }
  function createAlert(level) {
    const symbol=owner.symbol;
    if(!symbol){toast('Choose a chart symbol first.',true);return;}
    const instrument=symbols.find(item=>item.symbol===symbol);
    const target=level??quotes.get(symbol)?.price??candles.at(-1)?.close;
    const user=state.user;
    const options=[['in_app','In-app']];
    if(state.meta?.emailReady&&!state.meta?.emailSimulated&&user?.emailOptIn&&user?.emailVerified)options.push(['email','In-app and email']);
    if(state.meta?.whatsappReady&&user?.whatsappOptIn&&user?.whatsappPhone)options.push(['whatsapp','In-app and WhatsApp']);
    if(options.length===3)options.push(['all','In-app, email and WhatsApp']);
    workspaceDialog(`Create alert · ${symbol}`,`
      ${instrument?.expiry?`<p class="muted">Contract expiry ${html(instrument.expiry)}</p>`:''}
      <label>Alert name<input name="name" value="${html(symbol)} price alert" maxlength="100" required></label>
      <div class="workspace-form-grid">
        <label>Condition<select name="condition">${choice(priceConditions,'crossing')}</select></label>
        <label>Target price (₹)<input name="target" type="number" min="0.000001" max="1000000000" step="any" value="${Number.isFinite(target)?Number(target.toFixed(4)):''}" required></label>
        <label>Trigger<select name="frequency"><option value="once">Once only</option><option value="repeat">On each new match</option></select></label>
        <label>Expires (local time)<input type="datetime-local" name="expires"></label>
        <label>Delivery<select name="channel">${choice(options,'in_app')}</select></label>
      </div>
      <label>Message<textarea name="message" rows="2" maxlength="500"></textarea></label>
      <p class="muted">Uses Dhan trades. In-app delivery is included. Manage email and WhatsApp in Settings.</p>`,async(data,dialog)=>{
      const submit=dialog.querySelector('[type=submit]');
      if(submit.disabled)return;
      submit.disabled=true;
      try {
        await api('/api/private-dhan/alerts',{method:'POST',body:JSON.stringify({
          symbol,name:data.get('name'),condition:data.get('condition'),target:Number(data.get('target')),
          repeat:data.get('frequency')==='repeat',channel:data.get('channel'),message:data.get('message'),
          expiresAt:data.get('expires')?new Date(data.get('expires')).toISOString():null
        })});
        showDock('alerts');
        toast('Dhan price alert created.');
      } finally { submit.disabled=false; }
    });
  }
  function listDialog(rename=false,onSaved) {
    const list=currentList();
    workspaceDialog(rename?'Rename watchlist':'Create watchlist',`<label>Name<input name="name" required maxlength="60" value="${html(rename?list.name:'')}"></label>`,async data=>{
      const response=await api('/api/watchlists'+(rename?'/'+list.id:''),{method:rename?'PATCH':'POST',body:JSON.stringify({name:data.get('name')})});
      watchId=String(response.watchlist.id);
      await reloadLists();
      await onSaved?.();
    });
  }
  function showDock(view) {
    dockView=view;
    const open=Boolean(view);
    desk.classList.toggle('dhan-dock-closed',!open);
    desk.querySelector('.dhan-dock').classList.toggle('hidden',!open);
    rail.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dhanDock===view)));
    desk.querySelector('.dhan-dock-heading b').textContent={watch:'Watchlist',alerts:'Dhan alerts',quote:'Quote details'}[view]||'';
    desk.querySelector('.dhan-dock-watch').classList.toggle('hidden',view!=='watch');
    alertsPanel.classList.toggle('hidden',view!=='alerts');
    quotePanel.classList.toggle('hidden',view!=='quote');
    if(view==='alerts')void loadAlerts();
  }
  const narrow=matchMedia('(max-width: 900px)');
  showDock(null);
  function reflectFullscreen() {
    const expanded=document.fullscreenElement===chartPanel||chartPanel.classList.contains('dhan-focus-chart');
    fullscreenButton.setAttribute('aria-pressed',String(expanded));
    fullscreenButton.setAttribute('aria-label',expanded?'Exit fullscreen':'Fullscreen chart');
    fullscreenButton.title=fullscreenButton.getAttribute('aria-label');
    requestAnimationFrame(paint);
  }
  function exitFocus() {
    chartPanel.classList.remove('dhan-focus-chart');
    document.body.classList.remove('dhan-chart-focused');
    reflectFullscreen();
  }
  document.addEventListener('fullscreenchange',reflectFullscreen);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&chartPanel.classList.contains('dhan-focus-chart')&&!document.querySelector('dialog[open]'))exitFocus();
  });
  watchSelect.onchange=()=>{watchId=watchSelect.value;renderWatch();watchChanged();};
  search.oninput=renderWatch;
  tools.querySelector('select').onchange=event=>{owner.settings.chartType=event.target.value;paint();};
  const actions={
    zoomOut:()=>zoom(20),zoomIn:()=>zoom(-20),
    resetZoom:()=>{owner.count=Math.max(15,candles.length);owner.offset=0;owner.manualRange=null;paint();},
    undo:()=>{if(undo.length){redo.push(drawings);drawings=undo.pop();persist();}},
    redo:()=>{if(redo.length){undo.push(drawings);drawings=redo.pop();persist();}},
    theme:()=>{owner.settings.theme=owner.settings.theme==='light'?'dark':'light';paint();},
    options:()=>{
      const dialog=workspaceDialog('Chart options',`<div class="dhan-options-list">
        <button class="button secondary" type="button" data-option="theme">${owner.settings.theme==='light'?'Dark chart':'Light chart'}</button>
        <button class="button secondary" type="button" data-option="png">Download PNG</button>
        <button class="button secondary" type="button" data-option="csv">Download CSV</button>
      </div>`);
      dialog.querySelector('.dhan-options-list').addEventListener('click',event=>{
        const action=event.target.closest('button')?.dataset.option;
        if(!action)return;
        dialog.close();
        dialog.remove();
        actions[action]();
      });
    },
    closeDock:()=>showDock(null),
    fullscreen:async()=>{
      if(document.fullscreenElement===chartPanel){await document.exitFullscreen();return;}
      if(chartPanel.classList.contains('dhan-focus-chart')){exitFocus();return;}
      showDock(null);
      try { await chartPanel.requestFullscreen(); }
      catch {
        chartPanel.classList.add('dhan-focus-chart');
        document.body.classList.add('dhan-chart-focused');
        reflectFullscreen();
      }
    },
    createAlert:()=>createAlert(),
    deleteDrawing,
    drawingAlert:()=>{const drawing=selectedDrawing();if(drawing?.kind==='horizontal')createAlert(drawing.payload.price);},
    png:()=>{if(candles.length)simulationChart.download(canvas.toDataURL('image/png'),`${owner.symbol.replace(':','-')}-dhan.png`);},
    csv:()=>{
      if(!candles.length)return;
      const data=['time_utc,open,high,low,close,volume',...candles.map(bar=>[new Date(bar.time*1000).toISOString(),bar.open,bar.high,bar.low,bar.close,bar.volume].join(','))].join('\n');
      const url=URL.createObjectURL(new Blob([data],{type:'text/csv'}));
      const link=document.createElement('a');
      link.href=url;link.download=`${owner.symbol.replace(':','-')}-${owner.settings.interval}-dhan.csv`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
    indicators:()=>{
      const dialog=workspaceDialog('Indicators','<label>Search indicators<input type="search" placeholder="SMA, RSI, MACD…"></label><div class="dhan-indicator-results"></div><p class="muted" role="status"></p>');
      const input=dialog.querySelector('input'), results=dialog.querySelector('.dhan-indicator-results'), status=dialog.querySelector('[role=status]');
      const render=()=>{
        const term=input.value.trim().toLowerCase();
        results.innerHTML=indicatorCatalog.filter(item=>`${indicatorName(item)} ${item.name}`.toLowerCase().includes(term)).map(item=>{
          const active=owner.settings.indicators.some(i=>i.type===item.type);
          return `<button type="button" data-study="${item.type}" aria-pressed="${active}"><span><b>${html(item.name)}</b><small>${html(indicatorName(item))} · ${item.overlay?'Price overlay':'Separate pane'}</small></span><span aria-hidden="true">${active?'✓':'+'}</span></button>`;
        }).join('')||'<p class="muted">No matching indicators.</p>';
      };
      const toggle=type=>{
        const study=indicatorCatalog.find(item=>item.type===type);
        if(!study)return;
        const active=owner.settings.indicators;
        const exists=active.some(item=>item.type===type);
        if(!exists&&active.length>=4){status.textContent='Remove an indicator before adding another. You can show up to four.';return;}
        updateIndicators(exists?active.filter(item=>item.type!==type):[...active,{...study}]);
        render();
        results.querySelector(`[data-study="${type}"]`)?.focus({preventScroll:true});
        status.textContent=`${study.name} ${exists?'removed':'added to the chart'}.`;
      };
      input.oninput=render;
      input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();toggle(results.querySelector('[data-study]')?.dataset.study);}};
      results.onclick=event=>toggle(event.target.closest('[data-study]')?.dataset.study);
      render();
      input.focus();
    },
    newList:()=>listDialog(),
    rename:()=>{if(currentList())listDialog(true);},
    addSymbol:async()=>{
      const list=currentList();
      if(!list||!owner.symbol)return;
      await api(`/api/watchlists/${list.id}/items`,{method:'POST',body:JSON.stringify({symbol:owner.symbol})});
      await reloadLists();
    }
  };
  function click(event) {
    const button=event.target.closest('button');
    if(!button)return;
    const {dhanTool,dhanChart,dhanDock,dhanSymbol,dhanRemove}=button.dataset;
    if(dhanTool)setTool(dhanTool);
    if(dhanChart)Promise.resolve().then(()=>actions[dhanChart](button)).catch(error=>toast(error.message,true));
    if(dhanDock)showDock(dockView===dhanDock?null:dhanDock);
    if(dhanSymbol){selectSymbol(dhanSymbol);if(narrow.matches)showDock(null);}
    if(button.dataset.dhanRule){
      button.disabled=true;
      api('/api/private-dhan/alerts/'+button.dataset.dhanRule,{method:'PATCH',body:JSON.stringify({enabled:button.dataset.enable==='true'})})
        .then(loadAlerts).catch(error=>{button.disabled=false;toast(error.message,true);});
    }
    if(dhanRemove&&currentList())api(`/api/watchlists/${currentList().id}/items/${encodeURIComponent(dhanRemove)}`,{method:'DELETE'}).then(reloadLists).catch(error=>toast(error.message,true));
  }
  desk.addEventListener('click',click);
  tools.addEventListener('click',click);
  renderDrawingActions();
  return {
    loadLists,
    searchSymbols:()=>openSymbolSearch(),
    watchSymbols:()=>currentList()?.symbols??[],
    updateQuotes(items,liveQuotes,symbol) {
      if(favoriteOwner!==state.user?.id){
        favoriteOwner=state.user?.id;
        favorites=defaultIntervals;
        try {
          const stored=JSON.parse(localStorage.getItem(intervalKey())||'null');
          if(Array.isArray(stored))favorites=stored;
        }catch{}
        renderIntervals();
        let saved=[];
        try {const items=JSON.parse(localStorage.getItem(indicatorKey())||'[]');if(Array.isArray(items))saved=items;}catch{}
        updateIndicators(indicatorCatalog.filter(item=>saved.some(savedItem=>savedItem?.type===item.type)).slice(0,4),false);
      }
      symbols=items;
      searchButton.querySelector('span').textContent=symbol||'Search symbols';
      quotes=new Map(liveQuotes.map(q=>[q.symbol,q]));
      owner.quote=owner.symbol===symbol?quotes.get(symbol):null;
      renderWatch();
      if(!drag)paint();
    },
    show(symbol,interval,expiry,data,message) {
      const key=symbol?`alertpe:dhan-drawings:${state.user?.id}:${symbol}:${expiry||''}`:'';
      if(key!==storageKey||interval!==owner.settings.interval){owner.offset=0;owner.count=105;owner.hover=null;owner.manualRange=null;setTool('cursor');}
      if(key!==storageKey){
        storageKey=key;
        drawings=[];undo=[];redo=[];
        if(key)try{drawings=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(drawings))drawings=[];}catch{}
        selectDrawing(null);
      }
      if(symbol!==owner.symbol)owner.quote=null;
      owner.symbol=symbol;
      owner.settings.interval=interval;
      renderIntervals();
      candles=data;
      if(!data.length)renderer.geometry=null;
      canvas.classList.toggle('hidden',!data.length);
      empty.classList.toggle('hidden',Boolean(data.length));
      empty.textContent=message||'No candles returned for this interval.';
      if(!data.length)ohlc.textContent='';
      renderWatch();
      paint();
    },
    reset() {
      alertEpoch++;
      showDock(null);
      exitFocus();
      listEpoch++;
      loadedFor=null;loadingLists=null;lists=[];watchId='';watchSelect.replaceChildren();search.value='';
      this.updateQuotes([],[],null);
      this.show(null,'day',null,[],'Choose a symbol to load candles.');
      favoriteOwner=undefined;
      updateIndicators([],false);
    }
  };
}
