/* Expiry payoffs for same-underlying, same-expiry European-style option baskets. */
((root)=>{
  const presets=[];
  const add=(id,name,group,outlook,description,legs)=>presets.push({id,name,group,outlook,description,legs:legs.map(([side,right,offset,lots=1])=>({side,right,offset,lots}))});
  add('long-call','Buy call','buying','Bullish','One call; premium paid defines the expiry loss.',[['buy','CE',0]]);
  add('long-put','Buy put','buying','Bearish','One put; premium paid defines the expiry loss.',[['buy','PE',0]]);
  add('long-straddle','Long straddle','buying','Volatile','Buy an ATM call and put at the same strike.',[['buy','CE',0],['buy','PE',0]]);
  add('long-strangle','Long strangle','buying','Volatile','Buy an OTM put and OTM call.',[['buy','PE',-1],['buy','CE',1]]);
  add('call-backspread','Call ratio backspread','buying','Strongly bullish','Sell one lower call and buy two higher calls.',[['sell','CE',0],['buy','CE',1,2]]);
  add('put-backspread','Put ratio backspread','buying','Strongly bearish','Sell one higher put and buy two lower puts.',[['sell','PE',0],['buy','PE',-1,2]]);
  add('short-call','Sell call','selling','Bearish / neutral','Unhedged call selling has unlimited upside risk.',[['sell','CE',1]]);
  add('short-put','Sell put','selling','Bullish / neutral','Unhedged put selling has substantial downside risk.',[['sell','PE',-1]]);
  add('short-straddle','Short straddle','selling','Range-bound','Sell an ATM call and put; unbounded upside loss.',[['sell','CE',0],['sell','PE',0]]);
  add('short-strangle','Short strangle','selling','Range-bound','Sell an OTM put and call; unbounded upside loss.',[['sell','PE',-1],['sell','CE',1]]);
  add('bull-put','Bull put credit spread','selling','Bullish','Buy a lower put and sell a higher put.',[['buy','PE',-2],['sell','PE',-1]]);
  add('bear-call','Bear call credit spread','selling','Bearish','Sell a lower call and buy a higher call.',[['sell','CE',1],['buy','CE',2]]);
  add('bull-call','Bull call debit spread','hedged','Bullish','Buy a lower call and sell a higher call.',[['buy','CE',0],['sell','CE',2]]);
  add('bear-put','Bear put debit spread','hedged','Bearish','Buy a higher put and sell a lower put.',[['buy','PE',0],['sell','PE',-2]]);
  add('iron-condor','Iron condor','hedged','Range-bound','Sell an inner strangle and buy outer wings.',[['buy','PE',-2],['sell','PE',-1],['sell','CE',1],['buy','CE',2]]);
  add('iron-butterfly','Iron butterfly','hedged','Range-bound','Sell an ATM straddle and buy protective wings.',[['buy','PE',-2],['sell','PE',0],['sell','CE',0],['buy','CE',2]]);
  add('reverse-condor','Reverse iron condor','hedged','Volatile','Buy the inner strangle and sell outer wings.',[['sell','PE',-2],['buy','PE',-1],['buy','CE',1],['sell','CE',2]]);
  add('reverse-butterfly','Reverse iron butterfly','hedged','Volatile','Buy an ATM straddle and sell protective outer strikes.',[['sell','PE',-2],['buy','PE',0],['buy','CE',0],['sell','CE',2]]);
  add('call-butterfly','Long call butterfly','hedged','Range-bound','Buy outer calls and sell two middle calls.',[['buy','CE',-1],['sell','CE',0,2],['buy','CE',1]]);
  add('put-butterfly','Long put butterfly','hedged','Range-bound','Buy outer puts and sell two middle puts.',[['buy','PE',-1],['sell','PE',0,2],['buy','PE',1]]);
  add('short-call-butterfly','Short call butterfly','hedged','Volatile','Sell outer calls and buy two middle calls.',[['sell','CE',-1],['buy','CE',0,2],['sell','CE',1]]);
  add('short-put-butterfly','Short put butterfly','hedged','Volatile','Sell outer puts and buy two middle puts.',[['sell','PE',-1],['buy','PE',0,2],['sell','PE',1]]);
  add('call-condor','Long call condor','hedged','Range-bound','Buy outer calls and sell the two inner calls.',[['buy','CE',-2],['sell','CE',-1],['sell','CE',1],['buy','CE',2]]);
  add('put-condor','Long put condor','hedged','Range-bound','Buy outer puts and sell the two inner puts.',[['buy','PE',-2],['sell','PE',-1],['sell','PE',1],['buy','PE',2]]);
  function validate(legs){
    if(!Array.isArray(legs)||!legs.length||legs.length>8)throw new Error('Use 1–8 option legs.');
    for(const l of legs)if(!['buy','sell'].includes(l.side)||!['CE','PE'].includes(l.right)||!Number.isFinite(l.strike)||l.strike<=0||!Number.isFinite(l.premium)||l.premium<0||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>1000000)throw new Error('Each leg needs a valid side, call/put, strike, premium and quantity.');
  }
  function payoff(legs,spot){return legs.reduce((n,l)=>n+(l.side==='buy'?1:-1)*l.quantity*(Math.max(0,l.right==='CE'?spot-l.strike:l.strike-spot)-l.premium),0);}
  const tidy=n=>Math.round(n*100)/100;
  function analyse(legs){
    validate(legs);const points=[0,...new Set(legs.map(l=>l.strike))].sort((a,b)=>a-b),values=points.map(s=>payoff(legs,s));
    const slope=legs.reduce((n,l)=>n+(l.right==='CE'?(l.side==='buy'?1:-1)*l.quantity:0),0);
    const roots=[],zeroRanges=[];const add=n=>{if(n>=0&&Number.isFinite(n)&&!roots.some(r=>Math.abs(r-n)<.005))roots.push(tidy(n));};
    for(let i=0;i<points.length-1;i++){const a=values[i],b=values[i+1];if(Math.abs(a)<1e-7)add(points[i]);if(Math.abs(a)<1e-7&&Math.abs(b)<1e-7)zeroRanges.push([points[i],points[i+1]]);else if(a*b<0)add(points[i]-a*(points[i+1]-points[i])/(b-a));}
    const last=points.at(-1),end=values.at(-1);if(Math.abs(end)<1e-7)add(last);if(slope&&-end/slope>0)add(last-end/slope);if(!slope&&Math.abs(end)<1e-7)zeroRanges.push([last,null]);
    return {maxProfit:slope>0?null:tidy(Math.max(...values)),maxLoss:slope<0?null:tidy(Math.max(0,-Math.min(...values))),unlimitedProfit:slope>0,unlimitedLoss:slope<0,breakevens:roots.sort((a,b)=>a-b),zeroRanges,netPremium:tidy(-legs.reduce((n,l)=>n+(l.side==='buy'?1:-1)*l.premium*l.quantity,0)),tailSlope:slope};
  }
  const api={presets,analyse,payoff};if(typeof module==='object'&&module.exports)module.exports=api;else root.optionStrategyModel=api;
})(typeof window==='object'?window:this);
