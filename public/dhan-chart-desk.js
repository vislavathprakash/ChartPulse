function createDhanChartDesk(host, toolbar, selectSymbol) {
  host.classList.add('dhan-chart-host');
  host.classList.remove('empty-state');
  const desk = document.createElement('div');
  desk.className = 'dhan-chart-desk';
  desk.innerHTML = `
    <div class="dhan-drawing-rail" role="group" aria-label="Drawing tools">
      ${drawingTools.filter(([id])=>id!=='channel').map(([id,icon,label])=>`<button type="button" data-dhan-tool="${id}" aria-label="${label}" title="${label}" aria-pressed="${id==='cursor'}">${icon}</button>`).join('')}
      <button type="button" data-dhan-chart="undo" aria-label="Undo drawing" title="Undo drawing">↶</button>
      <button type="button" data-dhan-chart="redo" aria-label="Redo drawing" title="Redo drawing">↷</button>
    </div>
    <div class="dhan-chart-stage">
      <div class="dhan-chart-ohlc" aria-label="Candle data"></div>
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
      <div class="dhan-dock-objects hidden"></div>
      <div class="dhan-dock-alerts hidden"></div>
    </aside>`;
  const rail = document.createElement('div');
  rail.className='dhan-right-rail';
  rail.setAttribute('role','group');
  rail.setAttribute('aria-label','Chart panels');
  rail.innerHTML=[['watch','Watchlist','list'],['alerts','Alerts','alerts'],['objects','Drawings','layers']].map(([key,label,icon])=>
    `<button type="button" data-dhan-dock="${key}" aria-controls="dhan-dock-content" aria-pressed="false" aria-label="${label}" title="${label}">${terminalIcon(icon)}</button>`).join('');
  desk.append(rail);
  host.replaceChildren(desk);
  const tools = document.createElement('div');
  tools.className = 'dhan-chart-actions';
  tools.innerHTML = `<select aria-label="Dhan chart type">${choice([['candles','Candles'],['bars','OHLC bars'],['line','Line'],['area','Area'],['heikin','Heikin Ashi']],'candles')}</select>
    <button type="button" data-dhan-chart="indicators">Indicators</button>
    <button type="button" data-dhan-chart="theme">Light chart</button>
    <button type="button" class="dhan-create-alert" data-dhan-chart="createAlert">${terminalIcon('alerts')} Create alert</button>
    <button type="button" data-dhan-chart="fullscreen" aria-label="Fullscreen chart" aria-pressed="false" title="Fullscreen chart">${terminalIcon('fullscreen')}</button>
    <button type="button" data-dhan-chart="png">PNG</button>
    <button type="button" data-dhan-chart="csv">CSV</button>`;
  toolbar.append(tools);
  const canvas=desk.querySelector('canvas');
  const box=desk.querySelector('.dhan-canvas-box');
  const empty=desk.querySelector('.dhan-chart-empty');
  const ohlc=desk.querySelector('.dhan-chart-ohlc');
  const watch=desk.querySelector('.dhan-watch-rows');
  const watchSelect=desk.querySelector('select');
  const search=desk.querySelector('.dhan-watch-search');
  const objects=desk.querySelector('.dhan-dock-objects');
  const alertsPanel=desk.querySelector('.dhan-dock-alerts');
  const hint=desk.querySelector('.dhan-chart-hint');
  const owner={settings:{...chartDefaults(),indicators:[],watermark:false},compactSessions:true,sourceLabel:'DHANHQ',chartHeight:()=>box.clientHeight,count:105,offset:0,updateDataWindow(index,candles){
    const bar=candles[index];
    if(!bar)return;
    const text=`O ${fmt(bar.open)}   H ${fmt(bar.high)}   L ${fmt(bar.low)}   C ${fmt(bar.close)}   Vol ${fmt(bar.volume,0)}`;
    if(ohlc.textContent!==text)ohlc.textContent=text;
  }};
  const renderer=new MarketChartRenderer(canvas,owner);
  let candles=[],drawings=[],undo=[],redo=[],symbols=[],quotes=new Map(),lists=[],watchId='',loadedFor=null,loadingLists=null,listEpoch=0;
  let tool='cursor',drag=null,storageKey='',dockView=null,alertEpoch=0;
  const chartPanel=host.closest('.private-dhan-chart');
  const fullscreenButton=tools.querySelector('[data-dhan-chart="fullscreen"]');
  const paint=()=>renderer.render(candles,drawings);
  new ResizeObserver(paint).observe(box);
  const persist=()=>{
    if(storageKey)try{localStorage.setItem(storageKey,JSON.stringify(drawings));}catch{}
    renderObjects();
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
    desk.querySelectorAll('[data-dhan-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dhanTool===tool)));
    hint.textContent=tool==='cursor'?'Drag to pan · Scroll to zoom':['horizontal','vertical','text'].includes(tool)?'Select a point on the chart.':'Select two points on the chart.';
    paint();
  }
  function drawAt(event) {
    const g=renderer.geometry;
    if(!g||event.offsetX<g.left||event.offsetX>g.right||event.offsetY<g.top||event.offsetY>g.bottom)return;
    const point=renderer.pricePoint(event.offsetX,event.offsetY);
    if(!point||point.price<=0)return;
    const single=['horizontal','vertical','text'].includes(tool);
    if(!single&&!owner.anchor){owner.anchor=point;paint();return;}
    const start=owner.anchor||point;
    if(['ray','extended'].includes(tool)&&start.time===point.time){hint.textContent='Select a point on a different candle.';return;}
    const payload={time:start.time,price:start.price,color:'#8b5cf6',lineWidth:1.5};
    if(!single)Object.assign(payload,{time2:point.time,price2:point.price});
    const kind=tool;
    const key=storageKey;
    const save=text=>{if(key===storageKey&&drawings.length<100)editDrawings([...drawings,{id:crypto.randomUUID(),kind,payload:{...payload,text}}]);};
    if(kind==='text')workspaceDialog('Text annotation','<label>Note<input name="note" required maxlength="100"></label>',async data=>save(data.get('note')));
    else save();
    setTool('cursor');
  }
  function zoom(delta) {
    owner.count=Math.min(Math.max(15,candles.length),Math.max(15,owner.count+delta));
    owner.offset=Math.min(owner.offset,Math.max(0,candles.length-owner.count));
    paint();
  }
  canvas.addEventListener('wheel',event=>{if(!candles.length)return;event.preventDefault();zoom(event.deltaY>0?10:-10);},{passive:false});
  canvas.onpointerdown=event=>{
    if(event.button!==0||!candles.length)return;
    drag={x:event.offsetX,offset:owner.offset};
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove=event=>{
    owner.hover={x:event.offsetX,y:event.offsetY};
    if(drag&&tool==='cursor'&&renderer.geometry){
      owner.offset=Math.max(0,Math.min(Math.max(0,candles.length-owner.count),drag.offset+Math.round((event.offsetX-drag.x)/renderer.geometry.spacing)));
    }
    paint();
  };
  canvas.onpointerleave=()=>{owner.hover=null;paint();};
  canvas.onpointercancel=()=>{drag=null;};
  canvas.onpointerup=event=>{if(drag&&tool!=='cursor')drawAt(event);drag=null;};
  canvas.onkeydown=event=>{
    if(event.key==='Escape')setTool('cursor');
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
    watchSelect.innerHTML='<option value="">All Dhan instruments</option>'+choice(lists.map(list=>[String(list.id),list.name]),watchId);
    watchSelect.value=watchId;
    renderWatch();
  }
  function loadLists() {
    const user=state.user?.id;
    if(!user||loadedFor===user||loadingLists)return;
    const epoch=listEpoch;
    loadingLists=reloadLists().then(()=>{if(epoch===listEpoch)loadedFor=user;}).catch(error=>{if(epoch===listEpoch)toast(error.message,true);}).finally(()=>{if(epoch===listEpoch)loadingLists=null;});
  }
  function renderObjects() {
    objects.innerHTML=drawings.map((drawing,index)=>`<div class="dhan-object"><span>${html(drawingTools.find(([id])=>id===drawing.kind)?.[2]||drawing.kind)}</span><span>${drawing.kind==='horizontal'?`<button type="button" data-dhan-level="${drawing.payload.price}" title="Create alert at this level" aria-label="Create alert at drawing ${index+1}">${terminalIcon('alerts')}</button>`:''}<button type="button" data-dhan-object="${html(drawing.id)}" aria-label="Remove drawing ${index+1}">×</button></span></div>`).join('')||'<p class="muted">Drawings for this instrument appear here.</p>';
  }
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
  function listDialog(rename=false) {
    const list=currentList();
    workspaceDialog(rename?'Rename watchlist':'Create watchlist',`<label>Name<input name="name" required maxlength="60" value="${html(rename?list.name:'')}"></label>`,async data=>{
      const response=await api('/api/watchlists'+(rename?'/'+list.id:''),{method:rename?'PATCH':'POST',body:JSON.stringify({name:data.get('name')})});
      watchId=String(response.watchlist.id);
      await reloadLists();
    });
  }
  function showDock(view) {
    dockView=view;
    const open=Boolean(view);
    desk.classList.toggle('dhan-dock-closed',!open);
    desk.querySelector('.dhan-dock').classList.toggle('hidden',!open);
    rail.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dhanDock===view)));
    desk.querySelector('.dhan-dock-heading b').textContent={watch:'Watchlist',objects:'Drawings',alerts:'Dhan alerts'}[view]||'';
    desk.querySelector('.dhan-dock-watch').classList.toggle('hidden',view!=='watch');
    objects.classList.toggle('hidden',view!=='objects');
    alertsPanel.classList.toggle('hidden',view!=='alerts');
    if(view==='objects')renderObjects();
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
  watchSelect.onchange=()=>{watchId=watchSelect.value;renderWatch();};
  search.oninput=renderWatch;
  tools.querySelector('select').onchange=event=>{owner.settings.chartType=event.target.value;paint();};
  const actions={
    zoomOut:()=>zoom(20),zoomIn:()=>zoom(-20),
    resetZoom:()=>{owner.count=Math.max(15,candles.length);owner.offset=0;paint();},
    undo:()=>{if(undo.length){redo.push(drawings);drawings=undo.pop();persist();}},
    redo:()=>{if(redo.length){undo.push(drawings);drawings=redo.pop();persist();}},
    theme:button=>{owner.settings.theme=owner.settings.theme==='light'?'dark':'light';button.textContent=owner.settings.theme==='light'?'Dark chart':'Light chart';paint();},
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
      const catalog=Technicals.catalog.filter(item=>item.type!=='volume');
      workspaceDialog('Chart indicators',catalog.map(item=>`<label class="consent-row"><input type="checkbox" name="indicator" value="${item.type}" ${owner.settings.indicators.some(i=>i.type===item.type)?'checked':''}> ${html(item.name)}</label>`).join(''),async data=>{
        const chosen=catalog.filter(item=>data.getAll('indicator').includes(item.type));
        if(chosen.length>4)throw new Error('Choose up to four indicators.');
        owner.settings.indicators=chosen;
        paint();
      });
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
    const {dhanTool,dhanChart,dhanDock,dhanSymbol,dhanRemove,dhanObject}=button.dataset;
    if(dhanTool)setTool(dhanTool);
    if(dhanChart)Promise.resolve().then(()=>actions[dhanChart](button)).catch(error=>toast(error.message,true));
    if(dhanDock)showDock(dockView===dhanDock?null:dhanDock);
    if(dhanSymbol){selectSymbol(dhanSymbol);if(narrow.matches)showDock(null);}
    if(dhanObject)editDrawings(drawings.filter(drawing=>drawing.id!==dhanObject));
    if(button.dataset.dhanLevel)createAlert(Number(button.dataset.dhanLevel));
    if(button.dataset.dhanRule){
      button.disabled=true;
      api('/api/private-dhan/alerts/'+button.dataset.dhanRule,{method:'PATCH',body:JSON.stringify({enabled:button.dataset.enable==='true'})})
        .then(loadAlerts).catch(error=>{button.disabled=false;toast(error.message,true);});
    }
    if(dhanRemove&&currentList())api(`/api/watchlists/${currentList().id}/items/${encodeURIComponent(dhanRemove)}`,{method:'DELETE'}).then(reloadLists).catch(error=>toast(error.message,true));
  }
  desk.addEventListener('click',click);
  tools.addEventListener('click',click);
  renderObjects();
  return {
    loadLists,
    updateQuotes(items,liveQuotes,symbol) {
      symbols=items;
      quotes=new Map(liveQuotes.map(q=>[q.symbol,q]));
      owner.quote=owner.symbol===symbol?quotes.get(symbol):null;
      renderWatch();
      if(!drag)paint();
    },
    show(symbol,interval,expiry,data,message) {
      const key=symbol?`alertpe:dhan-drawings:${state.user?.id}:${symbol}:${expiry||''}`:'';
      if(key!==storageKey||interval!==owner.settings.interval){owner.offset=0;owner.count=105;owner.hover=null;setTool('cursor');}
      if(key!==storageKey){
        storageKey=key;
        drawings=[];undo=[];redo=[];
        if(key)try{drawings=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(drawings))drawings=[];}catch{}
        renderObjects();
      }
      if(symbol!==owner.symbol)owner.quote=null;
      owner.symbol=symbol;
      owner.settings.interval=interval;
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
    }
  };
}
