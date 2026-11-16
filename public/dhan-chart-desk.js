function dhanDrawingIcon(id,fallback) {
  const paths={
    cursor:'<path d="m5 3 14 9-7 1-3 7L5 3Z"/>',
    horizontal:'<path d="M3 12h18"/><circle cx="12" cy="12" r="2"/>',
    vertical:'<path d="M12 3v18"/><circle cx="12" cy="12" r="2"/>',
    trend:'<path d="m5 18 14-12"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="5" r="2"/>',
    ray:'<path d="M4 20 20 4m-6 0h6v6"/>',
    extended:'<path d="M3 21 21 3M3 15v6h6M15 3h6v6"/>',
    rectangle:'<rect x="4" y="6" width="16" height="12" rx="1"/>',
    channel:'<path d="m3 14 14-10m-10 16L21 10"/>',
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
      ${drawingTools.map(([id,icon,label])=>`<button type="button" data-dhan-tool="${id}" aria-label="${label}" title="${label}" aria-pressed="${id==='cursor'}">${dhanDrawingIcon(id,icon)}</button>`).join('')}
      <hr>
      <button type="button" data-dhan-setting="magnet" title="Snap to candle prices" aria-label="Snap to candle prices" aria-pressed="false">${terminalIcon('magnet')}</button>
      <button type="button" data-dhan-setting="lockDrawings" title="Lock drawings" aria-label="Lock drawings" aria-pressed="false">${terminalIcon('lock')}</button>
      <button type="button" data-dhan-setting="hideDrawings" title="Hide drawings" aria-label="Hide drawings" aria-pressed="false">${terminalIcon('eye')}</button>
      <button type="button" data-dhan-chart="undo" aria-label="Undo drawing" title="Undo drawing">↶</button>
      <button type="button" data-dhan-chart="redo" aria-label="Redo drawing" title="Redo drawing">↷</button>
    </div>
    <div class="dhan-chart-stage">
      <div class="dhan-ohlc-row"><div class="dhan-chart-ohlc" aria-label="Candle data"></div><span class="dhan-candle-clock hidden"></span></div>
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
    <button type="button" data-dhan-chart="options" aria-label="Chart settings" title="Chart settings">${terminalIcon('settings')}</button>`;
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
  const candleClock=desk.querySelector('.dhan-candle-clock');
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
  const chartPrefKey=()=>`alertpe:dhan-chart-settings:${state.user?.id}`;
  const settingFlags=[['grid','Grid lines'],['crosshair','Crosshair'],['volume','Volume'],['lastPrice','Last price marker'],['countdown','Candle-close countdown']];
  const drawingFlags=['magnet','lockDrawings','hideDrawings'];
  const viewDefaults={...chartDefaults(),countdown:true};
  let selectedTradeIsLive=false;
  const regularCloseMs=tradeMs=>Math.floor((tradeMs+19800000)/86400000)*86400000-19800000+55800000;
  function renderClock(now=Date.now()) {
    const bar=candles.at(-1);
    const tradeMs=Date.parse(owner.quote?.updated_at);
    const startMs=bar?.time*1000;
    const commodity=owner.symbol?.startsWith('MCX:');
    const daily=owner.settings.interval==='day';
    const fresh=selectedTradeIsLive&&Number.isFinite(tradeMs)&&now-tradeMs<120000&&tradeMs-now<=60000;
    let close=NaN;
    if(fresh&&Number.isFinite(startMs)){
      if(daily){
        if(!commodity&&Math.floor((startMs+19800000)/86400000)===Math.floor((tradeMs+19800000)/86400000))close=regularCloseMs(tradeMs);
      }else if(tradeMs>=startMs&&Math.floor((startMs+19800000)/86400000)===Math.floor((tradeMs+19800000)/86400000)){
        const duration=Number(owner.settings.interval)*60000;
        close=startMs+(Math.floor((tradeMs-startMs)/duration)+1)*duration;
        if(!commodity)close=Math.min(close,regularCloseMs(tradeMs));
      }
    }
    const remaining=Math.ceil((close-now)/1000);
    const visible=owner.settings.countdown&&remaining>0;
    candleClock.classList.toggle('hidden',!visible);
    if(visible){
      const parts=[Math.floor(remaining/3600),Math.floor(remaining/60)%60,remaining%60];
      const value=parts.slice(parts[0]?0:1).map(part=>String(part).padStart(2,'0')).join(':');
      candleClock.textContent=`Closes in ${value}`;
      candleClock.title=`Expected close ${quoteTime.format(close)} IST`;
    }
  }
  setInterval(()=>{if(chartPanel.getClientRects().length&&!document.hidden)renderClock();},1000);
  function reflectViewSettings(){
    tools.querySelector('select').value=owner.settings.chartType;
    desk.querySelectorAll('[data-dhan-setting]').forEach(button=>button.setAttribute('aria-pressed',String(owner.settings[button.dataset.dhanSetting])));
    renderClock();
    paint();
  }
  function saveViewSettings(){
    const keys=[...settingFlags.map(([key])=>key),...drawingFlags,'theme','scale','timezone','precision','chartType','upColor','downColor'];
    try{localStorage.setItem(chartPrefKey(),JSON.stringify(Object.fromEntries(keys.map(key=>[key,owner.settings[key]]))));}catch{}
    reflectViewSettings();
  }
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
    if(next!=='cursor'&&(owner.settings.lockDrawings||owner.settings.hideDrawings)){toast('Unlock or show drawings before adding one.',true);return;}
    tool=next;
    owner.anchor=null;
    owner.channelEnd=null;
    owner.preview=null;
    if(next!=='cursor')selectDrawing(null);
    canvas.classList.toggle('dhan-drawing-active',next!=='cursor');
    desk.classList.toggle('dhan-tool-selected',next!=='cursor');
    desk.querySelectorAll('[data-dhan-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dhanTool===tool)));
    hint.textContent=tool==='cursor'?'Drag to pan · Scroll to zoom':tool==='channel'?'Choose two endpoints, then the channel width.':['horizontal','vertical','text'].includes(tool)?'Select a point on the chart.':'Select two points on the chart.';
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
  function finishDrawing(start,end,widthPoint=null) {
    if(end&&['ray','extended','channel'].includes(tool)&&start.time===end.time){
      owner.anchor=start;
      hint.textContent='Choose a different candle for the second point.';
      return;
    }
    const kind=tool;
    if(kind==='channel'&&!widthPoint){
      owner.anchor=start;
      owner.channelEnd=end;
      hint.textContent='Choose a point for the channel width.';
      return;
    }
    const key=storageKey;
    const payload=drawingPayload(start,end);
    if(widthPoint){
      const price=start.price+(widthPoint.time-start.time)*(end.price-start.price)/(end.time-start.time);
      payload.width=Math.max(.000001,Math.abs(widthPoint.price-price)*2);
    }
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
      owner.preview=point&&canPreview?{kind:tool==='channel'?'trend':tool,payload:drawingPayload(single?point:start,owner.channelEnd||(single?null:point))}:null;
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
        else if(owner.channelEnd)finishDrawing(owner.anchor,owner.channelEnd,point);
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
    if(owner.settings.hideDrawings)return null;
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
    if(!drawing||owner.settings.lockDrawings)return;
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
  const alertDate=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const formatAlertTime=value=>value&&Number.isFinite(Date.parse(value))?`${alertDate.format(new Date(value))} IST`:'—';
  const deliveryLabels={in_app:'In-app',email:'In-app and email',whatsapp:'In-app and WhatsApp',all:'In-app, email and WhatsApp'};
  function expirationInput(value) {
    const time=Date.parse(value);
    return Number.isFinite(time)&&time>Date.now()?new Date(time+19800000).toISOString().slice(0,16):'';
  }
  let loadedAlerts=[];
  async function loadAlerts() {
    const epoch=++alertEpoch;
    alertsPanel.textContent='Loading Dhan alerts…';
    try {
      const {alerts}=await api('/api/private-dhan/alerts',{cache:'no-store'});
      if(epoch!==alertEpoch||dockView!=='alerts')return;
      loadedAlerts=alerts;
      alertsPanel.innerHTML=alerts.map(rule=>`<article class="dhan-alert-row"><button type="button" class="dhan-alert-open" data-open-alert="${rule.id}"><strong>${html(rule.name)}</strong><span class="tag">${html(rule.status)}</span>
        <span>${html(rule.symbol)} · ${html(conditionLabel(rule.condition))} ${quotePrice.format(rule.target)}</span>
        <small>${rule.triggered_at?'Triggered '+html(formatAlertTime(rule.triggered_at)):'Created '+html(formatAlertTime(rule.created_at))}</small></button>
      </article>`).join('')||'<p class="muted">Create a price alert to track a level on this chart.</p>';
    } catch(error) {
      if(epoch===alertEpoch&&dockView==='alerts')alertsPanel.textContent=error.message;
    }
  }
  function alertDetails(rule) {
    const editable=['active','paused'].includes(rule.status);
    const facts=[['Symbol',rule.symbol],['Status',rule.status],['Condition',`${conditionLabel(rule.condition)} ${quotePrice.format(rule.target)}`],
      ['Frequency',rule.repeat?'On each new match':'Once only'],['Delivery',deliveryLabels[rule.channel]],
      ['Created',formatAlertTime(rule.created_at)],['Expires',rule.expires_at?formatAlertTime(rule.expires_at):'No time limit'],
      ['Last triggered',rule.triggered_at?formatAlertTime(rule.triggered_at):'Not triggered yet']];
    if(rule.expiry)facts.push(['Contract expiry',rule.expiry]);
    if(rule.message)facts.push(['Message',rule.message]);
    const dialog=workspaceDialog(rule.name,`<dl class="dhan-metrics">${facts.map(([label,value])=>`<div><dt>${html(label)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl>
      <div class="dhan-alert-actions">${editable?`<button type="button" class="button primary" data-rule-action="edit">Edit alert</button><button type="button" class="button secondary" data-rule-action="toggle">${rule.status==='active'?'Pause':'Resume'}</button>`:''}
      <button type="button" class="button secondary" data-rule-action="reuse">Reuse alert</button><button type="button" class="button secondary" data-rule-action="chart">Open chart</button></div>`);
    dialog.querySelector('.dhan-alert-actions').addEventListener('click',async event=>{
      const button=event.target.closest('[data-rule-action]');
      if(!button)return;
      const action=button.dataset.ruleAction;
      if(action==='toggle'){
        button.disabled=true;
        try{
          await api('/api/private-dhan/alerts/'+rule.id,{method:'PATCH',body:JSON.stringify({enabled:rule.status==='paused'})});
          dialog.close();dialog.remove();void loadAlerts();
          toast(rule.status==='paused'?'Alert resumed.':'Alert paused.');
        }catch(error){dialog.querySelector('.dialog-error').textContent=error.message;button.disabled=false;}
        return;
      }
      dialog.close();dialog.remove();
      if(action==='chart'){selectSymbol(rule.symbol,symbols.find(item=>item.symbol===rule.symbol));return;}
      createAlert(undefined,rule,action);
    });
  }
  function createAlert(level,rule=null,mode='create') {
    const symbol=rule?.symbol??owner.symbol;
    if(!symbol){toast('Choose a chart symbol first.',true);return;}
    const instrument=symbols.find(item=>item.symbol===symbol);
    const target=rule?.target??level??quotes.get(symbol)?.price??candles.at(-1)?.close;
    const user=state.user;
    const options=[['in_app','In-app']];
    if(state.meta?.emailReady&&!state.meta?.emailSimulated&&user?.emailOptIn&&user?.emailVerified)options.push(['email','In-app and email']);
    if(state.meta?.whatsappReady&&user?.whatsappOptIn&&user?.whatsappPhone)options.push(['whatsapp','In-app and WhatsApp']);
    if(options.length===3)options.push(['all','In-app, email and WhatsApp']);
    if(rule?.channel&&!options.some(([value])=>value===rule.channel))options.push([rule.channel,deliveryLabels[rule.channel]]);
    const editing=mode==='edit';
    const title=editing?'Edit alert':mode==='reuse'?'Reuse alert':'Create alert';
    workspaceDialog(`${title} · ${symbol}`,`
      ${instrument?.expiry?`<p class="muted">Contract expiry ${html(instrument.expiry)}</p>`:''}
      <label>Alert name<input name="name" value="${html(rule?.name??symbol+' price alert')}" maxlength="100" required></label>
      <div class="workspace-form-grid">
        <label>Condition<select name="condition">${choice(priceConditions,rule?.condition??'crossing')}</select></label>
        <label>Target price (₹)<input name="target" type="number" min="0.000001" max="1000000000" step="any" value="${Number.isFinite(target)?Number(target.toFixed(4)):''}" required></label>
        <label>Trigger<select name="frequency">${choice([['once','Once only'],['repeat','On each new match']],rule?.repeat?'repeat':'once')}</select></label>
        <label>Expires (IST)<input type="datetime-local" name="expires" value="${expirationInput(rule?.expires_at)}"></label>
        <label>Delivery<select name="channel">${choice(options,rule?.channel??'in_app')}</select></label>
      </div>
      <label>Message<textarea name="message" rows="2" maxlength="500">${html(rule?.message)}</textarea></label>
      <p class="muted">Uses Dhan trades. In-app delivery is included. Manage email and WhatsApp in Settings.</p>`,async(data,dialog)=>{
      const submit=dialog.querySelector('[type=submit]');
      if(submit.disabled)return;
      submit.disabled=true;
      try {
        await api('/api/private-dhan/alerts'+(editing?'/'+rule.id:''),{method:editing?'PUT':'POST',body:JSON.stringify({
          symbol,name:data.get('name'),condition:data.get('condition'),target:Number(data.get('target')),
          repeat:data.get('frequency')==='repeat',channel:data.get('channel'),message:data.get('message'),
          expiresAt:data.get('expires')?new Date(data.get('expires')+'+05:30').toISOString():null
        })});
        showDock('alerts');
        toast(editing?'Dhan price alert updated.':'Dhan price alert created.');
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
  tools.querySelector('select').onchange=event=>{owner.settings.chartType=event.target.value;saveViewSettings();};
  const actions={
    zoomOut:()=>zoom(20),zoomIn:()=>zoom(-20),
    resetZoom:()=>{owner.count=Math.max(15,candles.length);owner.offset=0;owner.manualRange=null;paint();},
    undo:()=>{if(!owner.settings.lockDrawings&&undo.length){redo.push(drawings);drawings=undo.pop();persist();}},
    redo:()=>{if(!owner.settings.lockDrawings&&redo.length){undo.push(drawings);drawings=redo.pop();persist();}},
    options:()=>{
      const s=owner.settings;
      const dialog=workspaceDialog('Chart settings',`
        <div class="workspace-form-grid">
          <label>Appearance<select name="theme">${choice([['dark','Dark'],['light','Light']],s.theme)}</select></label>
          <label>Price scale<select name="scale">${choice([['linear','Linear'],['log','Logarithmic']],s.scale)}</select></label>
          <label>Chart timezone<select name="timezone">${choice([['Asia/Kolkata','India (IST)'],['UTC','UTC']],s.timezone)}</select></label>
          <label>Price decimals<select name="precision">${choice(['0','1','2','3','4'],String(s.precision))}</select></label>
          <label>Up candles<input name="upColor" type="color" value="${html(s.upColor)}"></label>
          <label>Down candles<input name="downColor" type="color" value="${html(s.downColor)}"></label>
        </div>
        <div class="dhan-setting-flags">${settingFlags.map(([key,label])=>`<label class="consent-row"><input type="checkbox" name="${key}" ${s[key]?'checked':''}> ${label}</label>`).join('')}</div>
        <div class="dhan-alert-actions dhan-options-list">
          <button class="button secondary" type="button" data-option="png">Download PNG</button>
          <button class="button secondary" type="button" data-option="csv">Download CSV</button>
          <button class="button secondary" type="button" data-option="reset">Reset chart settings</button>
        </div>`,async data=>{
          for(const key of ['theme','scale','timezone','upColor','downColor'])s[key]=data.get(key);
          s.precision=Number(data.get('precision'));
          for(const [key] of settingFlags)s[key]=data.has(key);
          owner.manualRange=null;
          saveViewSettings();
        });
      dialog.querySelector('.dhan-options-list').addEventListener('click',event=>{
        const action=event.target.closest('button')?.dataset.option;
        if(!action)return;
        dialog.close();
        dialog.remove();
        if(action==='reset'){
          for(const key of [...settingFlags.map(([key])=>key),...drawingFlags,'theme','scale','timezone','precision','chartType','upColor','downColor'])s[key]=viewDefaults[key];
          owner.manualRange=null;
          saveViewSettings();
        }else actions[action]();
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
    const setting=button.dataset.dhanSetting;
    if(drawingFlags.includes(setting)){
      owner.settings[setting]=!owner.settings[setting];
      if(owner.settings[setting]&&setting!=='magnet'){setTool('cursor');selectDrawing(null);}
      saveViewSettings();
    }
    if(dhanChart)Promise.resolve().then(()=>actions[dhanChart](button)).catch(error=>toast(error.message,true));
    if(dhanDock)showDock(dockView===dhanDock?null:dhanDock);
    if(dhanSymbol){selectSymbol(dhanSymbol);if(narrow.matches)showDock(null);}
    if(button.dataset.openAlert){
      const rule=loadedAlerts.find(item=>String(item.id)===button.dataset.openAlert);
      if(rule)alertDetails(rule);
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
    updateQuotes(items,liveQuotes,symbol,isLive=false) {
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
        let pref={};
        try{pref=JSON.parse(localStorage.getItem(chartPrefKey())||'{}')??{};}catch{}
        for(const key of [...settingFlags.map(([key])=>key),...drawingFlags])owner.settings[key]=typeof pref[key]==='boolean'?pref[key]:viewDefaults[key];
        for(const [key,allowed] of Object.entries({theme:['dark','light'],scale:['linear','log'],timezone:['Asia/Kolkata','UTC'],chartType:['candles','bars','line','area','heikin'],precision:[0,1,2,3,4]}))owner.settings[key]=allowed.includes(pref[key])?pref[key]:viewDefaults[key];
        for(const key of ['upColor','downColor'])owner.settings[key]=/^#[a-f0-9]{6}$/i.test(pref[key])?pref[key]:viewDefaults[key];
        reflectViewSettings();
      }
      symbols=items;
      searchButton.querySelector('span').textContent=symbol||'Search symbols';
      quotes=new Map(liveQuotes.map(q=>[q.symbol,q]));
      owner.quote=owner.symbol===symbol?quotes.get(symbol):null;
      selectedTradeIsLive=isLive;
      renderWatch();
      renderClock();
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
      renderClock();
      renderWatch();
      paint();
    },
    reset() {
      alertEpoch++;
      loadedAlerts=[];
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
