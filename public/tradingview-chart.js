// Official TradingView hosted widget. No market data or drawing objects are
// read from its cross-origin iframe by ChartPulse.
window.tradingViewChart = {
  key: null,
  generation: 0,
  dispose() { this.generation++; this.key=null; clearTimeout(this.timeout); this.observer?.disconnect(); document.getElementById('tradingViewStatus')?.remove(); },
  mount(symbol) {
    const host=document.getElementById('tvChart');
    if(this.key===symbol&&host.querySelector('iframe,script'))return;
    this.dispose();this.key=symbol;const generation=this.generation;
    host.innerHTML='<div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><div class="tradingview-widget-copyright"><a target="_blank" rel="noopener nofollow" href="https://www.tradingview.com/"><span>Charts by TradingView</span></a></div></div>';
    const status=document.createElement('div');status.id='tradingViewStatus';status.className='tradingview-status';status.setAttribute('role','status');status.textContent='Connecting to TradingView…';host.appendChild(status);
    const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;script.type='text/javascript';
    script.textContent=JSON.stringify({autosize:true,symbol,interval:'D',timezone:'Asia/Kolkata',theme:'dark',style:'1',locale:'en',allow_symbol_change:true,hide_top_toolbar:false,hide_side_toolbar:false,hide_legend:false,hide_volume:false,withdateranges:true,save_image:true,calendar:false,details:false,hotlist:false,backgroundColor:'#101722',gridColor:'rgba(130,150,170,0.08)',studies:[],watchlist:['BSE:RELIANCE','BSE:TCS','BSE:HDFCBANK','BSE:INFY','BSE:SBIN']});
    const observer=new MutationObserver(()=>{const frame=host.querySelector('iframe');if(!frame)return;observer.disconnect();frame.setAttribute('title','TradingView interactive chart');frame.addEventListener('load',()=>{if(generation===this.generation){clearTimeout(this.timeout);status.remove();}},{once:true});});
    this.observer=observer;observer.observe(host,{childList:true,subtree:true});
    script.onerror=()=>{clearTimeout(this.timeout);if(generation===this.generation)status.textContent='TradingView could not load. Check your connection and select Reload chart.';observer.disconnect();};
    this.timeout=setTimeout(()=>{observer.disconnect();if(generation===this.generation&&status.isConnected)status.textContent='TradingView is taking longer to respond. You can reload the chart or open TradingView.';},20000);
    host.querySelector('.tradingview-widget-container').appendChild(script);
  }
};
