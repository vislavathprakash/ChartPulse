function createPaperChart(panel,{search,trade}) {
  const intervals=[['1m','1'],['5m','5'],['15m','15'],['1h','60'],['1D','day']];
  const seconds={'1m':60,'5m':300,'15m':900,'1h':3600,'1D':86400};
  const studies=['sma','ema','bollinger','rsi','macd','volume'];
  const price=value=>value==null?'—':quotePrice.format(value);
  const tradeTime=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  panel.innerHTML=`
    <div class="paper-chart-toolbar" aria-label="Chart controls">
      <button type="button" class="button secondary" data-paper-chart="symbol">${terminalIcon('search')} <span>Choose instrument</span></button>
      <label>Interval<select aria-label="Paper chart interval">${intervals.map(([label])=>`<option>${label}</option>`).join('')}</select></label>
      <button type="button" class="button secondary" data-paper-chart="indicators">Indicators</button>
      <button type="button" class="button secondary" data-paper-chart="fit">Reset view</button>
      <button type="button" class="button secondary" data-paper-chart="expand" aria-label="Fullscreen paper chart" aria-pressed="false">${terminalIcon('fullscreen')}</button>
      <div class="paper-chart-trade">
        <button type="button" class="button primary" data-paper-chart="buy" disabled>Buy</button>
        <button type="button" class="button secondary paper-chart-sell" data-paper-chart="sell" disabled>Sell</button>
      </div>
    </div>
    <div class="paper-chart-info"><strong id="paperChartInstrument"></strong><span id="paperChartOHLC"></span><span class="paper-quote-strip"><strong id="paperChartQuote"></strong><span id="paperChartChange"></span><span id="paperChartFeed" class="tag" role="status"></span><time id="paperChartTradeTime"></time></span></div>
    <div class="paper-chart-box"><canvas aria-label="Paper trading candlestick chart" tabindex="0" class="hidden"></canvas><p class="paper-chart-message muted" role="status"></p></div>
    <div class="paper-chart-legend"><span><b class="positive">B</b> Buy fill</span><span><b class="negative">S</b> Sell fill</span><span class="muted">Scroll to zoom · Drag to pan · Times shown in IST</span></div>
    <div class="paper-chart-fills muted" aria-label="Recent fills for this chart"></div>`;
  const box=panel.querySelector('.paper-chart-box'),canvas=box.querySelector('canvas');
  const message=box.querySelector('[role=status]'), select=panel.querySelector('select');
  const instrument=$('paperChartInstrument'),ohlc=$('paperChartOHLC'),quote=$('paperChartQuote'),change=$('paperChartChange'),feed=$('paperChartFeed'),lastTrade=$('paperChartTradeTime');
  const fillsInfo=panel.querySelector('.paper-chart-fills');
  const symbolButton=panel.querySelector('[data-paper-chart=symbol] span');
  const fullscreen=panel.querySelector('[data-paper-chart=expand]');
  const owner={settings:{...chartDefaults(),interval:'5m',indicators:[],watermark:false},compactSessions:true,chartHeight:()=>box.clientHeight,
    count:90,offset:0,markers:[],updateDataWindow(index,candles){
      const bar=candles[index];
      ohlc.textContent=bar?`O ${price(bar.open)}  H ${price(bar.high)}  L ${price(bar.low)}  C ${price(bar.close)}`:'';
    }};
  select.value=owner.settings.interval;
  const renderer=new MarketChartRenderer(canvas,owner);
  let item,source,candles=[],fills=[],walletPositions=[],controller,timer,drag,shown=false,historyAt=0,currentInstrument,sampled;

  function paint(){
    if(!shown||panel.classList.contains('hidden'))return;
    const start=candles[0]?.time;
    const span=seconds[owner.settings.interval];
    owner.markers=fills.flatMap(fill=>{
      if(!fill.chartTime||fill.chartTime<start)return [];
      let lo=0,hi=candles.length;
      while(lo<hi){const mid=(lo+hi)>>1;if(candles[mid].time<=fill.chartTime)lo=mid+1;else hi=mid;}
      const bar=candles[lo-1];
      if(!bar||fill.chartTime>=bar.time+span)return [];
      return [{...fill,time:bar.time}];
    });
    const lines=walletPositions.filter(p=>p.symbol===item?.symbol&&p.source===source).flatMap(p=>[
      ['Avg',p.average,'#818cf8'],['SL',p.stopLoss,'#f97383'],['TP',p.takeProfit,'#4cc79f']
    ].filter(([,level])=>level>0).map(([label,level,color])=>({kind:'horizontal',payload:{price:level,color,text:`${p.product==='intraday'?'Intraday':p.kind==='equity'?'Delivery':'Carry forward'} ${label} · ${price(level)}`}})));
    canvas.classList.toggle('hidden',!candles.length);
    message.classList.toggle('paper-chart-overlay',Boolean(candles.length));
    renderer.render(candles,lines);
  }
  function fit(){
    owner.count=90;owner.offset=0;owner.hover=null;paint();
  }
  function installBars(incoming,replace=false){
    if(replace)candles=[];
    if(!incoming?.length)return;
    const before=candles.at(-1)?.time;
    const all=new Map(candles.map(bar=>[bar.time,bar]));
    for(const bar of incoming)all.set(bar.time,bar);
    candles=[...all.values()].sort((a,b)=>a.time-b.time).slice(-800);
    if(owner.offset&&before)candles.filter(bar=>bar.time>before).forEach(()=>owner.offset++);
  }
  function dhanTick(meta){
    if(!meta.fresh||!meta.quoteAt||!meta.last||!candles.length||sampled===meta.quoteAt)return;
    sampled=meta.quoteAt;
    const at=Math.floor(Date.parse(meta.quoteAt)/1000), last=candles.at(-1), span=seconds[owner.settings.interval];
    if(at<last.time)return;
    const time=owner.settings.interval==='1D'?last.time+(Math.floor((at+19800)/86400)-Math.floor((last.time+19800)/86400))*86400:last.time+Math.floor((at-last.time)/span)*span;
    if(time<last.time)return;
    const next=time===last.time?{...last,high:Math.max(last.high,meta.last),low:Math.min(last.low,meta.last),close:meta.last}:{time,open:meta.last,high:meta.last,low:meta.last,close:meta.last,volume:0};
    installBars([next]);
  }
  function renderQuote(meta,mode){
    const live=meta.fresh&&meta.streaming;
    quote.textContent=price(meta.last);
    change.textContent=meta.changePct==null?'':changeText(meta.changePct);
    change.className=changeTone(meta.changePct);
    const label=mode!=='dhan'?'Practice quotes':live?'Live · DhanHQ':meta.feedIssue==='authentication'?'Dhan token needs renewal':meta.fresh&&meta.quoteSource==='snapshot'?'DhanHQ snapshot':meta.last!=null?'Last known · DhanHQ':'Waiting for DhanHQ';
    if(feed.textContent!==label)feed.textContent=label;
    feed.classList.toggle('paper-feed-live',mode==='dhan'&&live);
    feed.classList.toggle('paper-feed-warn',mode==='dhan'&&meta.feedIssue==='authentication');
    const received=Date.parse(meta.quoteAt);
    const timed=Number.isFinite(received)&&mode==='dhan';
    lastTrade.textContent=timed?(live?quoteTime.format(received):tradeTime.format(received))+' IST':'';
    lastTrade.dateTime=timed?meta.quoteAt:'';
  }
  function pause(){
    clearTimeout(timer);controller?.abort();controller=null;
  }
  async function load(){
    pause();
    if(!shown||document.hidden||!item||!state.user)return;
    const request=new AbortController();controller=request;
    const selected=item.symbol, interval=owner.settings.interval, mode=source;
    const current=()=>controller===request&&!request.signal.aborted&&shown&&selected===item?.symbol;
    const first=!candles.length;
    if(first)message.textContent='Loading candles…';
    try{
      const options={signal:request.signal,cache:'no-store'};
      const historyNeeded=mode==='dhan'&&Date.now()-historyAt>90000;
      const stateCall=api('/api/paper/chart?'+new URLSearchParams({source:mode,symbol:selected,interval,since:candles.at(-1)?.time??0}),options);
      const historyCall=historyNeeded?api('/api/private-dhan/history?'+new URLSearchParams({symbol:selected,interval:intervals.find(([label])=>label===interval)[1]}),options):null;
      const [snapshot,history]=await Promise.allSettled([stateCall,historyCall]);
      if(!current())return;
      if(snapshot.status==='rejected')throw snapshot.reason;
      const {instrument:meta,fills:recent,candles:updates}=snapshot.value;
      currentInstrument=meta;
      owner.sourceLabel=mode==='dhan'?'DHANHQ · PAPER':'PRACTICE · ACCELERATED';
      owner.settings.volume=mode==='dhan'||meta.kind==='equity';
      owner.symbol=meta.name;owner.quote=meta.last?{price:meta.last}:null;
      instrument.textContent=meta.name+(meta.expiry?' · '+meta.expiry:'');
      symbolButton.textContent=meta.symbol.replace(/_\d{4}-\d{2}-\d{2}$/,'');
      renderQuote(meta,mode);
      for(const side of ['buy','sell'])panel.querySelector('[data-paper-chart='+side+']').disabled=Boolean(meta.expired);
      if(history.status==='fulfilled'&&history.value){historyAt=Date.now();installBars(history.value.candles,first);sampled=null;}
      if(updates)installBars(updates);
      if(mode==='dhan')dhanTick(meta);
      fills=recent;
      fillsInfo.textContent=fills.length?'Recent paper fills · '+fills.slice(0,4).map(fill=>fill.side.toUpperCase()+' '+price(fill.price)+' at '+quoteTime.format(Date.parse(fill.filledAt))).join(' · '):'Paper fills appear here and on the chart.';
      message.textContent=history.status==='rejected'?history.reason.message:candles.length?'':mode==='workspace'&&!state.meta?.simulated?'Historical candles are unavailable for this feed.':'No candles returned for this interval.';
      paint();
    }catch(error){
      if(current()){message.textContent=error.message;paint();}
    }finally{if(current())timer=setTimeout(()=>void load(),5000);}
  }
  function choose(nextSource,nextItem){
    pause();source=nextSource;item=nextItem;currentInstrument=null;candles=[];fills=[];owner.markers=[];owner.quote=null;sampled=null;historyAt=0;
    symbolButton.textContent=nextItem?.name||nextItem?.symbol||'Choose instrument';
    instrument.textContent='';ohlc.textContent='';quote.textContent='';change.textContent='';fillsInfo.textContent='';
    feed.textContent=nextSource==='dhan'?'Connecting to DhanHQ…':nextSource==='workspace'?'Practice quotes':'';
    feed.classList.remove('paper-feed-live','paper-feed-warn');lastTrade.textContent='';lastTrade.dateTime='';
    for(const side of ['buy','sell'])panel.querySelector('[data-paper-chart='+side+']').disabled=true;
    fit();
    if(shown)void load();
  }
  function indicators(){
    const d=workspaceDialog('Paper chart indicators','<div class="paper-chart-study-list">'+studies.map(type=>{
      const study=Technicals.catalog.find(item=>item.type===type);
      return `<label><input type="checkbox" value="${type}" ${owner.settings.indicators.some(item=>item.type===type)?'checked':''}> ${html(study.name)}</label>`;
    }).join('')+'</div>');
    d.addEventListener('change',()=>{
      const active=[...d.querySelectorAll('input:checked')].map(input=>input.value);
      owner.settings.indicators=Technicals.catalog.filter(spec=>active.includes(spec.type));
      paint();
    });
  }
  panel.addEventListener('click',async event=>{
    const action=event.target.closest('[data-paper-chart]')?.dataset.paperChart;
    if(action==='symbol')search();
    else if(action==='indicators')indicators();
    else if(action==='fit')fit();
    else if(action==='expand'){
      if(document.fullscreenElement===panel)await document.exitFullscreen();
      else if(panel.classList.contains('paper-chart-expanded'))panel.classList.remove('paper-chart-expanded');
      else try{await panel.requestFullscreen();}catch{panel.classList.add('paper-chart-expanded');}
      fullscreen.setAttribute('aria-pressed',String(document.fullscreenElement===panel||panel.classList.contains('paper-chart-expanded')));
      requestAnimationFrame(paint);
    }else if((action==='buy'||action==='sell')&&item&&currentInstrument)trade(source,item.symbol,action);
  });
  const bound=()=>{owner.offset=Math.max(0,Math.min(Math.max(0,candles.length-owner.count),owner.offset));};
  canvas.addEventListener('wheel',event=>{
    if(!candles.length)return;
    event.preventDefault();owner.count=Math.max(12,Math.min(Math.max(12,candles.length),owner.count+Math.sign(event.deltaY)*12));bound();paint();
  },{passive:false});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.pointerType==='touch'||!renderer.geometry)return;
    drag={x:event.offsetX,offset:owner.offset};canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    owner.hover={x:event.offsetX,y:event.offsetY};
    if(drag&&renderer.geometry){owner.offset=drag.offset+Math.round((event.offsetX-drag.x)/renderer.geometry.spacing);bound();}
    paint();
  });
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('pointerleave',()=>{owner.hover=null;paint();});
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();owner.offset+=event.key==='ArrowLeft'?8:-8;bound();paint();
  });
  select.addEventListener('change',()=>{owner.settings.interval=select.value;if(item)choose(source,item);});
  new ResizeObserver(()=>paint()).observe(box);
  document.addEventListener('fullscreenchange',()=>{
    fullscreen.setAttribute('aria-pressed',String(document.fullscreenElement===panel||panel.classList.contains('paper-chart-expanded')));
    requestAnimationFrame(paint);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!document.querySelector('dialog[open]'))panel.classList.remove('paper-chart-expanded');
  });
  return {choose,refresh:load,positions(rows){walletPositions=rows;paint();},
    show(){
      shown=true;
      if(!item&&state.meta?.privateDhan)choose('dhan',{symbol:'NSE:RELIANCE'});
      else if(!item&&state.meta?.simulated)choose('workspace',{symbol:'NSE:SIM001'});
      else if(item)void load();
      else message.textContent='Choose an instrument to open its chart.';
    },
    hide(){shown=false;pause();panel.classList.remove('paper-chart-expanded');},
    reset(){this.hide();walletPositions=[];choose(null,null);owner.settings.indicators=[];}
  };
}
