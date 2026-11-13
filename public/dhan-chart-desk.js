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
    <aside class="dhan-dock" aria-label="Chart side panel">
      <div class="dhan-dock-tabs" role="group" aria-label="Chart side panel views">
        <button type="button" data-dhan-dock="watch" aria-pressed="true">Watchlist</button>
        <button type="button" data-dhan-dock="objects" aria-pressed="false">Drawings</button>
      </div>
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
    </aside>`;
  host.append(desk);
  const tools = document.createElement('div');
  tools.className = 'dhan-chart-actions';
  tools.innerHTML = `<select aria-label="Dhan chart type">${choice([['candles','Candles'],['bars','OHLC bars'],['line','Line'],['area','Area'],['heikin','Heikin Ashi']],'candles')}</select>
    <button type="button" data-dhan-chart="indicators">Indicators</button>
    <button type="button" data-dhan-chart="theme">Light chart</button>
    <button type="button" data-dhan-chart="toggleDock" aria-expanded="true">Watchlist</button>
    <button type="button" data-dhan-chart="fullscreen">Fullscreen</button>
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
  const hint=desk.querySelector('.dhan-chart-hint');
  const owner={settings:{...chartDefaults(),indicators:[],watermark:false},compactSessions:true,sourceLabel:'DHANHQ',chartHeight:()=>box.clientHeight,count:105,offset:0,updateDataWindow(index,candles){
    const bar=candles[index];
    if(!bar)return;
    const text=`O ${fmt(bar.open)}   H ${fmt(bar.high)}   L ${fmt(bar.low)}   C ${fmt(bar.close)}   Vol ${fmt(bar.volume,0)}`;
    if(ohlc.textContent!==text)ohlc.textContent=text;
  }};
  const renderer=new MarketChartRenderer(canvas,owner);
  let candles=[],drawings=[],undo=[],redo=[],symbols=[],quotes=new Map(),lists=[],watchId='',loadedFor=null,loadingLists=null,listEpoch=0;
  let tool='cursor',drag=null,storageKey='',isDockOpen=true;
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
    objects.innerHTML=drawings.map((drawing,index)=>`<div class="dhan-object"><span>${html(drawingTools.find(([id])=>id===drawing.kind)?.[2]||drawing.kind)}</span><button type="button" data-dhan-object="${html(drawing.id)}" aria-label="Remove drawing ${index+1}">×</button></div>`).join('')||'<p class="muted">Drawings for this instrument appear here.</p>';
  }
  function listDialog(rename=false) {
    const list=currentList();
    workspaceDialog(rename?'Rename watchlist':'Create watchlist',`<label>Name<input name="name" required maxlength="60" value="${html(rename?list.name:'')}"></label>`,async data=>{
      const response=await api('/api/watchlists'+(rename?'/'+list.id:''),{method:rename?'PATCH':'POST',body:JSON.stringify({name:data.get('name')})});
      watchId=String(response.watchlist.id);
      await reloadLists();
    });
  }
  function toggleDock(open) {
    isDockOpen=open;
    desk.classList.toggle('dhan-dock-closed',!open);
    desk.querySelector('.dhan-dock').classList.toggle('hidden',!open);
    tools.querySelector('[data-dhan-chart="toggleDock"]').setAttribute('aria-expanded',String(open));
  }
  if(matchMedia('(max-width: 900px)').matches)toggleDock(false);
  watchSelect.onchange=()=>{watchId=watchSelect.value;renderWatch();};
  search.oninput=renderWatch;
  tools.querySelector('select').onchange=event=>{owner.settings.chartType=event.target.value;paint();};
  const actions={
    zoomOut:()=>zoom(20),zoomIn:()=>zoom(-20),
    resetZoom:()=>{owner.count=Math.max(15,candles.length);owner.offset=0;paint();},
    undo:()=>{if(undo.length){redo.push(drawings);drawings=undo.pop();persist();}},
    redo:()=>{if(redo.length){undo.push(drawings);drawings=redo.pop();persist();}},
    theme:button=>{owner.settings.theme=owner.settings.theme==='light'?'dark':'light';button.textContent=owner.settings.theme==='light'?'Dark chart':'Light chart';paint();},
    toggleDock:()=>toggleDock(!isDockOpen),
    fullscreen:async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await host.closest('.private-dhan-chart').requestFullscreen();},
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
    if(dhanDock){
      desk.querySelectorAll('[data-dhan-dock]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));
      objects.classList.toggle('hidden',dhanDock!=='objects');
      desk.querySelector('.dhan-dock-watch').classList.toggle('hidden',dhanDock!=='watch');
      if(dhanDock==='objects')renderObjects();
    }
    if(dhanSymbol){selectSymbol(dhanSymbol);if(matchMedia('(max-width:900px)').matches)toggleDock(false);}
    if(dhanObject)editDrawings(drawings.filter(drawing=>drawing.id!==dhanObject));
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
      listEpoch++;
      loadedFor=null;loadingLists=null;lists=[];watchId='';watchSelect.replaceChildren();search.value='';
      this.updateQuotes([],[],null);
      this.show(null,'day',null,[],'Choose a symbol to load candles.');
    }
  };
}
