// One authenticated connection per tab. No credentials in a URL and no quote polling.
window.liveMarket={
  socket:null,timer:null,generation:0,retries:0,quotes:new Map(),listeners:new Set(),sequence:0,epoch:null,connected:false,
  async start(){this.stop();const generation=this.generation;try{
    const access=await api('/api/stream-ticket',{method:'POST',body:'{}'});if(generation!==this.generation||!state.user)return;
    const url=access.url||`${location.protocol==='https:'?'wss':'ws'}://${location.host}/stream`;
    const socket=new WebSocket(url);this.socket=socket;
    socket.onopen=()=>socket.send(JSON.stringify({type:'authenticate',ticket:access.ticket}));
    socket.onmessage=event=>{if(generation!==this.generation)return;try{this.receive(JSON.parse(event.data));}catch{this.status('Stream resynchronizing');}};
    socket.onerror=()=>this.status('Stream reconnecting');
    socket.onclose=event=>{if(generation!==this.generation)return;this.connected=false;this.status(event.code===1008?'Session verification required':'Stream reconnecting');
      if(state.user&&!this.stopped)this.timer=setTimeout(()=>this.start(),Math.min(15000,500*2**Math.min(this.retries++,5))+Math.random()*500);};
  }catch(err){if(generation!==this.generation)return;this.status('Stream unavailable');if(state.user)this.timer=setTimeout(()=>this.start(),3000+Math.random()*1000);}},
  stop(){this.stopped=true;this.generation++;clearTimeout(this.timer);if(this.socket){this.socket.onclose=null;this.socket.close();}this.socket=null;this.connected=false;this.stopped=false;},
  status(message,mode='warning'){const label=document.getElementById('marketMode');if(label){label.textContent=message;label.parentElement.dataset.feed=mode;}},
  receive(message){
    if(message.type==='ready'){this.connected=true;this.subscriptionKey=null;this.retries=0;this.epoch=message.epoch;simulationChart.resyncNeeded=true;this.subscribe();loadAlerts();return;}
    if(message.type==='status'){this.status(message.paused?'Simulated · feed paused':message.connected===false?'Market feed unavailable':message.stale?'Feed stale · last prices retained':`${state.meta.marketMode||'Provider'} · streaming`,message.paused||message.stale||message.connected===false?'warning':state.meta.simulated?'simulated':'streaming');return;}
    if(message.type==='available'){loadWatch();return;}
    if(message.type==='error'){this.status(message.message);return;}
    if(message.type==='alert'){refreshCounts();if(state.currentPage==='calendar')marketCalendar.refreshSoon();if(state.currentPage==='alerts')loadAlerts();return;}
    if(!['snapshot','market'].includes(message.type))return;
    if(message.type==='market'&&message.sequence<=this.sequence&&message.epoch===this.epoch)return;
    if(message.epoch!==this.epoch){this.epoch=message.epoch;this.sequence=0;simulationChart.resyncNeeded=true;}
    this.sequence=message.sequence;for(const quote of message.quotes||[])this.quotes.set(quote.symbol,quote);
    const stale=message.receivedAt&&Date.now()-Date.parse(message.receivedAt)>15000;
    this.status(stale?'Feed stale · last prices retained':`${message.simulated?'Simulated':state.meta.marketMode||'Provider'} · streaming`,stale?'warning':message.simulated?'simulated':'streaming');
    for(const listener of this.listeners)listener(message);
    if(state.currentPage==='overview')renderMarketOverview([...this.quotes.values()],message.summary,message.receivedAt);
    if(state.currentPage==='charts')simulationChart.acceptLive(message);
  },
  subscribe(){if(!this.connected||this.socket?.readyState!==WebSocket.OPEN)return;
    const chart=window.simulationChart,stocks=state.meta.simulated&&chart.stocks?.length?chart.stocks:[...this.quotes.values()];
    const charts=state.currentPage==='charts'&&state.meta.simulated?[chart.symbol,chart.settings.split?chart.settings.compareSymbol:null].filter(symbol=>this.quotes.has(symbol)):[];
    const candidates=[...charts,...(window.stockWorkspace?.current()?.symbols||[]),...(state.currentPage==='charts'&&chart.visibleWatchSymbols?.length?chart.visibleWatchSymbols:stocks.slice(0,20).map(q=>q.symbol))];
    const symbols=[...new Set(candidates.filter(symbol=>this.quotes.has(symbol)))].slice(0,50);
    const message={type:'subscribe',symbols,charts,discover:!symbols.length,interval:chart.settings?.interval||'1m'};const key=JSON.stringify(message);if(key===this.subscriptionKey)return;this.subscriptionKey=key;this.socket.send(key);
  },
  seed(quotes){for(const quote of quotes)this.quotes.set(quote.symbol,quote);this.subscribe();}
};
document.addEventListener('visibilitychange',()=>{if(!state?.user)return;if(document.hidden){if(liveMarket.socket?.readyState===WebSocket.OPEN)liveMarket.socket.send(JSON.stringify({type:'subscribe',symbols:[],interval:'1m'}));}else{liveMarket.subscriptionKey=null;liveMarket.subscribe();if(state.currentPage==='charts')simulationChart.refresh();}});
