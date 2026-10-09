// Native chart for the simulated provider; saved drawings belong to the signed-in user.
window.simulationChart = {
  symbol: null, candles: [], drawings: [], count: 100, offset: 0, tool: 'cursor', anchor: null,
  async mount(symbol) {
    this.symbol = symbol; this.offset = 0;
    const host = document.getElementById('tvChart');
    host.innerHTML = `<div class="sim-tools"><select id="simInterval" aria-label="Chart interval"><option>1m</option><option>5m</option><option>15m</option><option>1h</option></select><button data-tool="cursor">Cursor / pan</button><button data-tool="horizontal">Horizontal line</button><button data-tool="trend">Trend line</button><label><input id="drawingAlert" type="checkbox" checked> Alert on crossing</label><label><input id="showSma" type="checkbox" checked> SMA 20</label><button id="chartReset">Reset view</button></div><p id="chartHint" class="tiny muted">SIMULATED · Wheel to zoom; drag to pan. Choose a drawing tool, then click the chart.</p><canvas id="marketCanvas" aria-label="Simulated candlestick chart"></canvas><div id="drawingList"></div>`;
    this.canvas = document.getElementById('marketCanvas'); this.ctx = this.canvas.getContext('2d');
    host.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => { this.tool = button.dataset.tool; this.anchor = null; document.getElementById('chartHint').textContent = this.tool === 'trend' ? 'SIMULATED · Click two points to draw a trend line.' : this.tool === 'horizontal' ? 'SIMULATED · Click a price level to save a horizontal line.' : 'SIMULATED · Drag to pan; wheel to zoom.'; });
    document.getElementById('simInterval').onchange = () => { this.offset = 0; this.refresh(); };
    document.getElementById('showSma').onchange = () => this.paint();
    document.getElementById('chartReset').onclick = () => { this.offset=0; this.count=100; this.paint(); };
    this.canvas.onwheel = e => { e.preventDefault(); this.count = Math.max(15,Math.min(this.candles.length,this.count+(e.deltaY>0?10:-10))); this.paint(); };
    this.canvas.onpointerdown = e => { this.drag = {x:e.offsetX,offset:this.offset}; this.canvas.setPointerCapture(e.pointerId); };
    this.canvas.onpointermove = e => {
      if (this.drag && this.tool==='cursor') { this.offset=Math.max(0,Math.min(this.candles.length-this.count,this.drag.offset+Math.round((e.offsetX-this.drag.x)/this.spacing))); this.paint(); }
      if (this.geometry) { const point=this.point(e.offsetX,e.offsetY); document.getElementById('chartHint').textContent=`SIMULATED · ${new Date(point.time*1000).toLocaleString()} · ₹ ${point.price.toFixed(2)}`; }
    };
    this.canvas.onpointerup = async e => {
      const moved = this.drag && Math.abs(e.offsetX-this.drag.x)>5; this.drag=null;
      if (moved || this.tool==='cursor' || !this.geometry) return;
      const point=this.point(e.offsetX,e.offsetY);
      if (this.tool==='trend' && !this.anchor) { this.anchor=point; return; }
      const payload={price:point.price,time:point.time,alertEnabled:document.getElementById('drawingAlert').checked};
      if (this.tool==='trend') { payload.price=this.anchor.price; payload.time=this.anchor.time; payload.price2=point.price; payload.time2=point.time; this.anchor=null; if(payload.time===payload.time2) return; }
      try { await api('/api/drawings',{method:'POST',body:JSON.stringify({symbol:this.symbol,kind:this.tool,payload})}); await this.refresh(); toast('Drawing saved. Crossing alerts are active if selected.'); } catch(err) { toast(err.message,true); }
    };
    this.observer?.disconnect(); this.observer=new ResizeObserver(()=>this.paint()); this.observer.observe(this.canvas);
    clearInterval(this.timer); this.timer=setInterval(()=>{if(state.user && state.currentPage==='charts' && state.meta.simulated) this.refresh().catch(err=>toast(err.message,true));},3000);
    await this.refresh();
  },
  async refresh() {
    const symbol=this.symbol;
    const [history,saved]=await Promise.all([api(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${document.getElementById('simInterval').value}`),api(`/api/drawings/${encodeURIComponent(symbol)}`)]);
    if(symbol!==this.symbol) return;
    this.candles=history.candles; this.drawings=saved.drawings; this.paint();
    document.getElementById('drawingList').innerHTML=this.drawings.map(d=>`<div class="saved-query"><span>${html(d.kind)} · ₹ ${fmt(d.payload.price)} · ${d.payload.alertEnabled?'crossing alert':'drawing only'}</span><button data-delete-drawing="${d.id}" aria-label="Delete drawing">Delete</button></div>`).join('') || '<p class="tiny muted">No saved drawings for this instrument.</p>';
    document.querySelectorAll('[data-delete-drawing]').forEach(b=>b.onclick=async()=>{try{await api(`/api/drawings/${b.dataset.deleteDrawing}`,{method:'DELETE'});await this.refresh();}catch(err){toast(err.message,true);}});
  },
  point(x,y) { const g=this.geometry; const index=Math.max(0,Math.min(g.visible.length-1,Math.floor((x-12)/this.spacing))); return {time:g.visible[index].time,price:g.max-(y-20)/g.height*(g.max-g.min)}; },
  paint() {
    if(!this.canvas || !this.candles.length) return;
    const w=this.canvas.clientWidth,h=420,dpr=window.devicePixelRatio||1; if(w<50)return;
    this.canvas.width=w*dpr;this.canvas.height=h*dpr; const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#101722';ctx.fillRect(0,0,w,h);
    const end=Math.max(1,this.candles.length-this.offset),start=Math.max(0,end-this.count),visible=this.candles.slice(start,end);
    let min=Math.min(...visible.map(c=>c.low)),max=Math.max(...visible.map(c=>c.high));const pad=(max-min)*.1||1;min-=pad;max+=pad;
    const width=w-85,height=300;this.spacing=(width-12)/visible.length;const y=p=>20+(max-p)/(max-min)*height,x=t=>12+((t-visible[0].time)/(visible.at(-1).time-visible[0].time||1))*(width-12-this.spacing)+this.spacing/2;
    this.geometry={visible,min,max,height};ctx.font='11px monospace';
    for(let i=0;i<=5;i++){const yy=20+i*height/5;ctx.strokeStyle='#263144';ctx.beginPath();ctx.moveTo(12,yy);ctx.lineTo(width,yy);ctx.stroke();ctx.fillStyle='#94a3b8';ctx.fillText((max-i*(max-min)/5).toFixed(2),width+8,yy+4);}
    const maxVolume=Math.max(...visible.map(c=>c.volume));
    visible.forEach(c=>{const xx=x(c.time);ctx.strokeStyle=ctx.fillStyle=c.close>=c.open?'#29c99b':'#f26c7b';ctx.beginPath();ctx.moveTo(xx,y(c.high));ctx.lineTo(xx,y(c.low));ctx.stroke();ctx.fillRect(xx-this.spacing*.3,Math.min(y(c.open),y(c.close)),Math.max(1,this.spacing*.6),Math.max(1,Math.abs(y(c.close)-y(c.open))));ctx.globalAlpha=.5;ctx.fillRect(xx-this.spacing*.3,390-c.volume/maxVolume*50,Math.max(1,this.spacing*.6),c.volume/maxVolume*50);ctx.globalAlpha=1;});
    if(document.getElementById('showSma').checked){ctx.strokeStyle='#e6b657';ctx.beginPath();let began=false;visible.forEach((c,i)=>{const idx=start+i;if(idx<19)return;const avg=this.candles.slice(idx-19,idx+1).reduce((sum,v)=>sum+v.close,0)/20;if(!began){ctx.moveTo(x(c.time),y(avg));began=true;}else ctx.lineTo(x(c.time),y(avg));});ctx.stroke();}
    ctx.save();ctx.beginPath();ctx.rect(12,20,width-12,height);ctx.clip();
    for(const d of this.drawings){const p=d.payload;ctx.strokeStyle=p.alertEnabled?'#9b8afb':'#75c8fa';ctx.setLineDash([5,4]);ctx.beginPath();if(d.kind==='horizontal'){ctx.moveTo(12,y(p.price));ctx.lineTo(width,y(p.price));}else {const level=t=>p.price+(t-p.time)*(p.price2-p.price)/(p.time2-p.time);ctx.moveTo(12,y(level(visible[0].time)));ctx.lineTo(width,y(level(visible.at(-1).time)));}ctx.stroke();}ctx.restore();ctx.setLineDash([]);
    ctx.fillStyle='#94a3b8';ctx.fillText(new Date(visible[0].time*1000).toLocaleTimeString(),12,410);ctx.fillText(new Date(visible.at(-1).time*1000).toLocaleTimeString(),Math.max(12,width-90),410);ctx.fillStyle='#e6b657';ctx.fillText('SIMULATED • SMA 20 • Volume • accelerated 1 minute / 3 seconds',12,345);
  }
};
