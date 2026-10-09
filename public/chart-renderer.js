class MarketChartRenderer {
  constructor(canvas,owner) {this.canvas=canvas;this.owner=owner;this.ctx=canvas.getContext('2d');}
  pricePoint(x,y) {
    const g=this.geometry;if(!g)return null;
    const index=Math.max(0,Math.min(g.visible.length-1,Math.floor((x-g.left)/g.spacing)));
    let price=g.inverseY(y);
    if(this.owner.settings.magnet){const bar=g.visible[index];price=[bar.open,bar.high,bar.low,bar.close].sort((a,b)=>Math.abs(a-price)-Math.abs(b-price))[0];}
    return {time:g.visible[index].time,price,index:g.start+index};
  }
  render(candles,drawings=[],secondary=false) {
    if(!candles.length||!this.canvas.isConnected)return;
    const o=this.owner,s=o.settings;
    const active=s.indicators.filter(i=>i.visible!==false),overlay=active.filter(i=>Technicals.catalog.find(c=>c.type===i.type)?.overlay),panes=active.filter(i=>!Technicals.catalog.find(c=>c.type===i.type)?.overlay && i.type!=='volume');
    const width=this.canvas.clientWidth;if(width<100)return;
    const showVolume=s.volume||active.some(i=>i.type==='volume');
    const priceHeight=secondary?310:Math.max(270,Math.min(450,window.innerHeight-380)),volumeHeight=showVolume?65:0,height=priceHeight+65+volumeHeight+(secondary?0:panes.length*110),dpr=window.devicePixelRatio||1;
    this.canvas.style.height=height+'px';this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
    const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);
    const light=s.theme==='light',bg=s.background||(light?'#f8fafc':'#101722'),text=light?'#475569':'#91a0b5',grid=light?'#dce3ed':'#223044';
    ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.font='11px monospace';
    const source=s.chartType==='heikin'?Technicals.heikinAshi(candles):candles;
    const end=Math.max(1,source.length-(secondary?0:o.offset)),start=Math.max(0,end-o.count),visible=source.slice(start,end);
    const left=12,right=width-85,plotWidth=right-left,spacing=plotWidth/visible.length,top=34,bottom=priceHeight;
    const allIndicators=active.map(spec=>({spec,series:Technicals.calculate(candles,spec)}));
    let min=Math.min(...visible.map(c=>c.low)),max=Math.max(...visible.map(c=>c.high));
    for(const {spec,series} of allIndicators.filter(v=>overlay.includes(v.spec)))for(const line of series)for(const v of line.data.slice(start,end))if(Number.isFinite(v)&&v>0){min=Math.min(min,v);max=Math.max(max,v);}
    if(o.manualRange&&!secondary){min=o.manualRange.min;max=o.manualRange.max;}else {const pad=(max-min)*.1||1;min=Math.max(.000001,min-pad);max+=pad;}
    const log=s.scale==='log',low=log?Math.log(min):min,high=log?Math.log(max):max;
    const y=price=>top+(high-(log?Math.log(Math.max(price,.000001)):price))/(high-low)*(bottom-top);
    const inverseY=yy=>{const value=high-(yy-top)/(bottom-top)*(high-low);return log?Math.exp(value):value;};
    const stepTime=visible.length>1?visible[1].time-visible[0].time:60;
    const x=time=>left+((time-visible[0].time)/stepTime+.5)*spacing;
    this.geometry={visible,start,end,left,right,spacing,top,bottom,x,y,inverseY,min,max,height};
    const priceFormat=p=>p.toLocaleString('en-IN',{minimumFractionDigits:s.precision,maximumFractionDigits:s.precision});
    const textAt=(value,xx,yy,color=text)=>{ctx.fillStyle=color;ctx.fillText(value,xx,yy);};
    const stroke=(x1,y1,x2,y2,color=grid,dash=[])=>{ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);};
    for(let i=0;i<=5;i++){const yy=top+(bottom-top)*i/5;if(s.grid)stroke(left,yy,right,yy);textAt(priceFormat(inverseY(yy)),right+9,yy+4);}
    for(let i=0;i<6;i++){const index=Math.floor((visible.length-1)*i/5),c=visible[index],xx=x(c.time);if(s.grid)stroke(xx,top,xx,bottom);const label=new Date(c.time*1000).toLocaleTimeString('en-GB',{timeZone:s.timezone,hour:'2-digit',minute:'2-digit'});textAt(label,Math.max(left,Math.min(right-40,xx-17)),height-10);}
    if(s.watermark){ctx.save();ctx.globalAlpha=.09;ctx.fillStyle=text;ctx.font='bold 38px sans-serif';ctx.textAlign='center';ctx.fillText(secondary?(s.compareSymbol||'Comparison'):o.symbol,(left+right)/2,(top+bottom)/2);ctx.restore();}
    const linePlot=(data,color,transform=y,fill=false)=>{
      ctx.save();ctx.beginPath();ctx.rect(left,top,plotWidth,bottom-top);ctx.clip();ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();let points=[];
      data.slice(start,end).forEach((value,i)=>{if(!Number.isFinite(value))return;const xx=x(visible[i].time),yy=transform(value);points.push([xx,yy]);if(points.length===1)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);});
      ctx.stroke();if(fill&&points.length){ctx.lineTo(points.at(-1)[0],bottom);ctx.lineTo(points[0][0],bottom);ctx.closePath();const grad=ctx.createLinearGradient(0,top,0,bottom);grad.addColorStop(0,color+'65');grad.addColorStop(1,color+'05');ctx.fillStyle=grad;ctx.fill();}ctx.restore();
    };
    ctx.save();ctx.beginPath();ctx.rect(left,top,plotWidth,bottom-top);ctx.clip();
    if(['line','area','baseline'].includes(s.chartType)) {
      linePlot(source.map(c=>c.close),s.upColor,y,s.chartType==='area');
      if(s.chartType==='baseline'){const baseline=visible[0].close;stroke(left,y(baseline),right,y(baseline),text,[4,4]);visible.forEach((c,i)=>{if(i){stroke(x(visible[i-1].time),y(visible[i-1].close),x(c.time),y(c.close),c.close>=baseline?s.upColor:s.downColor);}});}
    } else visible.forEach(c=>{
      const xx=x(c.time),up=c.close>=c.open,color=up?s.upColor:s.downColor;ctx.fillStyle=ctx.strokeStyle=color;ctx.lineWidth=1;
      if(s.chartType==='columns'){ctx.fillRect(xx-spacing*.3,y(c.close),Math.max(1,spacing*.6),bottom-y(c.close));return;}
      stroke(xx,y(c.high),xx,y(c.low),color);
      if(s.chartType==='bars'){stroke(xx-spacing*.3,y(c.open),xx,y(c.open),color);stroke(xx,y(c.close),xx+spacing*.3,y(c.close),color);}
      else {const yy=Math.min(y(c.open),y(c.close)),hh=Math.max(1,Math.abs(y(c.close)-y(c.open)));if(s.chartType==='hollow'&&up){ctx.strokeRect(xx-spacing*.3,yy,Math.max(1,spacing*.6),hh);}else ctx.fillRect(xx-spacing*.3,yy,Math.max(1,spacing*.6),hh);}
    });
    ctx.restore();
    for(const {spec,series} of allIndicators.filter(v=>overlay.includes(v.spec)))for(const line of series)linePlot(line.data,line.color);
    if(s.lastPrice){const price=source.at(-1).close,yy=y(price);if(yy>=top&&yy<=bottom){stroke(left,yy,right,yy,price>=source.at(-1).open?s.upColor:s.downColor,[3,3]);ctx.fillStyle=price>=source.at(-1).open?s.upColor:s.downColor;ctx.fillRect(right+2,yy-9,81,18);textAt(priceFormat(price),right+6,yy+4,light?'#ffffff':'#071b16');}}
    if(!secondary && !s.hideDrawings) {
      ctx.save();ctx.beginPath();ctx.rect(left,top,plotWidth,bottom-top);ctx.clip();
      for(const drawing of drawings.filter(d=>!d.payload.hidden))this.drawObject(drawing,{ctx,x,y,left,right,top,bottom,visible,stroke,textAt});
      if(o.anchor){ctx.fillStyle='#c4b5fd';ctx.beginPath();ctx.arc(x(o.anchor.time),y(o.anchor.price),4,0,2*Math.PI);ctx.fill();}
      ctx.restore();
    }
    let paneTop=bottom+14;
    if(showVolume){const maxVol=Math.max(...visible.map(c=>c.volume),1);textAt('Volume',left,paneTop+11);visible.forEach(c=>{ctx.fillStyle=c.close>=c.open?s.upColor:s.downColor;ctx.globalAlpha=.55;ctx.fillRect(x(c.time)-spacing*.3,paneTop+volumeHeight-c.volume/maxVol*(volumeHeight-18),Math.max(1,spacing*.6),c.volume/maxVol*(volumeHeight-18));ctx.globalAlpha=1;});paneTop+=volumeHeight+8;}
    if(!secondary)for(const {spec,series} of allIndicators.filter(v=>panes.includes(v.spec))){
      const values=series.flatMap(line=>line.data.slice(start,end)).filter(Number.isFinite);let pmin=Math.min(...values),pmax=Math.max(...values);if(!values.length){pmin=0;pmax=1;}
      if(['rsi','stochastic'].includes(spec.type)){pmin=0;pmax=100;}else{const padding=(pmax-pmin)*.1||1;pmin-=padding;pmax+=padding;}
      const pbottom=paneTop+88,py=value=>paneTop+20+(pmax-value)/(pmax-pmin)*(pbottom-paneTop-20);
      stroke(left,paneTop-3,right,paneTop-3);textAt(spec.type.toUpperCase()+(spec.period?' '+spec.period:''),left,paneTop+10);
      [pmin,(pmin+pmax)/2,pmax].forEach(value=>{if(s.grid)stroke(left,py(value),right,py(value));textAt(value.toFixed(2),right+9,py(value)+3);});
      if(['rsi','stochastic'].includes(spec.type)){stroke(left,py(30),right,py(30),'#69748c',[4,4]);stroke(left,py(70),right,py(70),'#69748c',[4,4]);}
      for(const line of series){ctx.strokeStyle=line.color;ctx.lineWidth=1.3;ctx.beginPath();let began=false;line.data.slice(start,end).forEach((value,i)=>{if(!Number.isFinite(value)){began=false;return;}const xx=x(visible[i].time),yy=py(value);if(line.histogram){ctx.fillStyle=value>=0?s.upColor:s.downColor;ctx.fillRect(xx-spacing*.28,Math.min(py(0),yy),Math.max(1,spacing*.56),Math.max(1,Math.abs(py(0)-yy)));}else{if(!began){ctx.moveTo(xx,yy);began=true;}else ctx.lineTo(xx,yy);}});ctx.stroke();}
      paneTop+=110;
    }
    const hover=o.hover;
    if(!secondary && hover && s.crosshair){const point=this.pricePoint(hover.x,hover.y);if(point){stroke(x(point.time),top,x(point.time),height-25,text,[3,4]);if(hover.y>=top&&hover.y<=bottom){stroke(left,hover.y,right,hover.y,text,[3,4]);ctx.fillStyle=light?'#334155':'#33465e';ctx.fillRect(right+2,hover.y-9,81,18);textAt(priceFormat(point.price),right+6,hover.y+4,'#ffffff');}}}
    textAt((o.replay?'HISTORICAL REPLAY · ':'SIMULATED · ')+(s.chartType==='heikin'?'Heikin Ashi · ':'')+(secondary?s.compareSymbol:o.symbol)+' · '+s.interval,left,19,light?'#996715':'#e8bb67');
    if(!secondary)o.updateDataWindow(hover?this.pricePoint(hover.x,hover.y)?.index:source.length-1,candles,allIndicators);
  }
  drawObject(d,g) {
    const p=d.payload,{ctx,x,y,left,right,top,bottom,visible,stroke,textAt}=g,color=p.color||'#a78bfa';ctx.lineWidth=p.lineWidth||1;
    const x1=x(p.time),y1=y(p.price),x2=x(p.time2),y2=y(p.price2),line=(a,b,c,e)=>stroke(a,b,c,e,color,p.alertEnabled?[5,3]:[]);
    if(d.kind==='horizontal'){line(left,y1,right,y1);textAt(p.text||'₹ '+p.price.toFixed(2),left+5,y1-5,color);}
    else if(d.kind==='vertical')line(x1,top,x1,bottom);
    else if(['trend','ray','extended','channel'].includes(d.kind)){
      const level=time=>p.price+(time-p.time)*(p.price2-p.price)/(p.time2-p.time);
      const a=d.kind==='extended'?left:x1,b=['ray','extended','channel'].includes(d.kind)?right:x2;
      const start=d.kind==='extended'?y(level(visible[0].time)):y1,end=['ray','extended','channel'].includes(d.kind)?y(level(visible.at(-1).time)):y2;
      if(d.kind==='channel'){const delta=(y(p.price-p.width/2)-y(p.price+p.width/2))/2;line(a,start-delta,b,end-delta);line(a,start+delta,b,end+delta);ctx.globalAlpha=.1;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(a,start-delta);ctx.lineTo(b,end-delta);ctx.lineTo(b,end+delta);ctx.lineTo(a,start+delta);ctx.closePath();ctx.fill();ctx.globalAlpha=1;}else line(a,start,b,end);
    }else if(d.kind==='rectangle'){ctx.strokeStyle=color;ctx.fillStyle=color+'22';ctx.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));}
    else if(d.kind==='fib')for(const ratio of [0,.236,.382,.5,.618,.786,1]){const price=p.price+(p.price2-p.price)*ratio,yy=y(price);line(Math.min(x1,x2),yy,right,yy);textAt(ratio+' · '+price.toFixed(2),Math.min(x1,x2)+3,yy-3,color);}
    else if(d.kind==='text'){ctx.font='13px sans-serif';textAt(p.text||'Note',x1,y1,color);ctx.font='11px monospace';}
    else if(d.kind==='arrow'){line(x1,y1,x2,y2);const angle=Math.atan2(y2-y1,x2-x1);line(x2,y2,x2-10*Math.cos(angle-.5),y2-10*Math.sin(angle-.5));line(x2,y2,x2-10*Math.cos(angle+.5),y2-10*Math.sin(angle+.5));}
    else if(d.kind==='measure'){line(x1,y1,x2,y2);textAt(((p.price2-p.price)/p.price*100).toFixed(2)+'% · '+Math.round((p.time2-p.time)/60)+' min',(x1+x2)/2,(y1+y2)/2-5,color);}
    if(d.id===this.owner.selectedDrawing){ctx.fillStyle=color;for(const [xx,yy] of [[x1,y1],...(Number.isFinite(p.time2)?[[x2,y2]]:[])]){ctx.beginPath();ctx.arc(xx,yy,4,0,Math.PI*2);ctx.fill();}}
  }
}
window.MarketChartRenderer=MarketChartRenderer;
