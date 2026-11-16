(() => {
  const money=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
  const format=value=>value==null?'—':money.format(value);
  const pnl=value=>`<span class="${value>0?'positive':value<0?'negative':''}">${value>0?'+':''}${format(value)}</span>`;
  const fullTime=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'});
  const date=value=>value?`${fullTime.format(new Date(value))} IST`:'—';
  const query=params=>new URLSearchParams(params).toString();
  const nameOf=kind=>({equity:'Stock',futures:'Future',options:'Option'})[kind]??kind;
  const tabs=[['positions','Positions'],['orders','Orders'],['trades','Trade history']];
  const nav=document.createElement('button');
  nav.type='button';nav.className='nav-item';nav.dataset.page='paper';
  nav.innerHTML=`<span class="nav-icon" aria-hidden="true">${terminalIcon('paper')}</span> Paper Trading`;
  $('mainNav').querySelector('[data-page=charts]').after(nav);
  const page=document.createElement('section');
  page.id='page-paper';page.className='page paper-page hidden';
  page.innerHTML=`
    <div class="page-heading">
      <div><div class="eyebrow">VIRTUAL PORTFOLIO</div><h1>Paper Trading</h1><p class="muted">Practice trades and manage risk with ₹10 lakh in virtual funds.</p></div>
      <button class="button primary" type="button" data-paper-new>New paper order</button>
    </div>
    <div class="paper-wallet" aria-label="Virtual wallet"></div>
    <section class="panel paper-panel">
      <div class="dhan-research-nav" role="tablist" aria-label="Paper trading activity">${tabs.map(([id,label],i)=>`<button type="button" id="paper-tab-${id}" role="tab" data-paper-tab="${id}" aria-selected="${!i}" aria-pressed="${!i}" aria-controls="paper-activity" tabindex="${i?-1:0}">${label}</button>`).join('')}</div>
      <div id="paper-activity" role="tabpanel" aria-labelledby="paper-tab-positions" tabindex="0"></div>
      <p class="muted paper-status" role="status"></p>
    </section>
    <p class="muted paper-disclosure">Paper fills use the latest eligible quote without modelling fees, order-book liquidity, or partial fills. Futures reserve 20% of notional. Short options reserve 20% of underlying notional plus premium. These are practice estimates.</p>`;
  document.querySelector('.content-wrap').append(page);
  const metrics=page.querySelector('.paper-wallet'), body=$('paper-activity'), status=page.querySelector('.paper-status');
  let tab='positions', offset=0, data, generation=0, controller, timer, dialog;
  const active=()=>state.user&&state.currentPage==='paper'&&!document.hidden;
  function grid(rows) {
    return `<dl class="paper-grid">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  }
  function table(headers,rows,empty) {
    if(!rows.length)return `<div class="empty-state">${empty}</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function instrument(row) {
    return `<strong>${html(row.name)}</strong><small>${html(row.symbol.replace(/_\d{4}-\d{2}-\d{2}$/,''))} · ${html(nameOf(row.kind))} · ${row.source==='dhan'?'DhanHQ':'Workspace'}</small>`;
  }
  function quantity(row) {
    const q=Math.abs(row.quantity);
    return row.kind==='equity'?fmt(q,0):`${fmt(q/row.lotSize,0)} lot${q===row.lotSize?'':'s'}<small>${fmt(q,0)} units</small>`;
  }
  function render(force=false) {
    if(!data)return;
    metrics.innerHTML=grid([['Available funds',format(data.available)],['Portfolio value',format(data.equity)],['In positions',format(data.capital)],['Reserved by orders',format(data.reserved)],['Unrealised P&L',pnl(data.unrealized)],['Realised P&L',pnl(data.realized)]]);
    if(!force&&body.contains(document.activeElement))return;
    const pager=hasMore=>`<nav class="paper-pager" aria-label="History pages"><button class="button secondary" type="button" data-paper-page="-25" ${offset?'':'disabled'}>Previous</button><span>Page ${offset/25+1}</span><button class="button secondary" type="button" data-paper-page="25" ${hasMore?'':'disabled'}>Next</button></nav>`;
    const orders=rows=>table(['Instrument','Side / size','Order type','Price','Status','Time','Action'],rows.map(o=>[
      instrument(o),`<span class="${o.side==='buy'?'positive':'negative'}">${o.side.toUpperCase()}</span> · ${quantity(o)}`,html({market:'Market',limit:'Limit',stop:'Stop market'}[o.type]),format(o.fill??o.level),
      `<span class="paper-order-state">${html(o.state)}</span>${o.reason?`<small>${html(o.reason)}</small>`:o.reserved?`<small>${format(o.reserved)} reserved</small>`:''}`,date(o.filledAt??o.createdAt),o.state==='pending'?`<button class="button secondary" type="button" data-paper-cancel="${o.id}">Cancel</button>`:'—'
    ]),'No orders in this section.');
    let markup;
    if(tab==='positions'){
      markup=table(['Instrument','Position','Average','Last','P&L','Protection','Actions'],data.positions.map(p=>[
        instrument(p),`<strong>${p.quantity>0?'Long':'Short'}</strong> · ${quantity(p)}`,format(p.average),`${format(p.last)}${p.fresh?'':'<small>Last known</small>'}`,pnl(p.pnl),
        `<small>Stop ${format(p.stopLoss)}</small><small>Target ${format(p.takeProfit)}</small>`,
        p.expired?'<span class="muted">Awaiting expiry settlement</span>':`<div class="paper-actions"><button class="button secondary" type="button" data-paper-protection="${html(p.symbol)}" data-position-source="${html(p.source)}">Protection</button><button class="button secondary" type="button" data-paper-close="${html(p.symbol)}" data-position-source="${html(p.source)}">Close position</button></div>`
      ]),'No open positions. Place a paper order to get started.');
    }else if(tab==='orders'){
      markup=`<h3>Open orders</h3>${orders(data.pending)}<h3>Order history</h3>${orders(data.history)}${pager(data.hasMoreHistory)}`;
    }else{
      markup=table(['Instrument','Side / size','Fill price','Realised P&L','Filled (IST)'],data.trades.map(o=>[instrument(o),`${o.side.toUpperCase()} · ${quantity(o)}`,format(o.fill),pnl(o.pnl),date(o.filledAt)]),'Filled paper trades will appear here.')+pager(data.hasMoreTrades);
    }
    if(body.dataset.markup!==markup){body.innerHTML=markup;body.dataset.markup=markup;}
  }
  function pause() { clearTimeout(timer);controller?.abort();generation++; }
  async function refresh(quiet=false) {
    pause();
    if(!active())return;
    const version=generation, owner=state.user.id;
    controller=new AbortController();
    const current=()=>version===generation&&active()&&owner===state.user.id;
    if(!quiet)status.textContent='Loading your paper wallet…';
    try{
      const result=await api('/api/paper?'+query({offset}),{signal:controller.signal});
      if(!current())return;
      data=result;
      render(!quiet);
      status.textContent=data.marked<data.positions.length?'Portfolio value reflects positions with an available price.':'';
    }catch(error){if(current())status.textContent=error.message;}
    finally{if(current())timer=setTimeout(()=>void refresh(true),10000);}
  }
  function activate(id) {
    tab=id;offset=0;
    for(const button of page.querySelectorAll('[data-paper-tab]')){
      const current=button.dataset.paperTab===tab;
      button.tabIndex=current?0:-1;
      button.setAttribute('aria-selected',String(current));
      button.setAttribute('aria-pressed',String(current));
    }
    body.setAttribute('aria-labelledby','paper-tab-'+id);
    render(true);
    void refresh();
  }

  function dialogClose(d) { d.close();d.remove(); }
  function search() {
    const d=workspaceDialog('Find an instrument',`
      <div class="paper-form-grid">
        ${state.meta?.privateDhan?`<label>Quote source<select name="source"><option value="dhan">DhanHQ</option><option value="workspace">Workspace quotes</option></select></label>`:''}
        <label data-paper-kind>Instrument type<select name="kind"><option value="equity">Stocks</option><option value="futures">Futures</option><option value="options">Options</option></select></label>
        <label class="paper-field-wide">Search instruments<input type="search" name="search" placeholder="Symbol or company" autocomplete="off" maxlength="80"></label>
      </div><div class="paper-search-results"></div><p class="muted" role="status"></p>`);
    dialog=d;
    const field=d.querySelector('[name=search]'), kind=d.querySelector('[name=kind]'), source=d.querySelector('[name=source]');
    const results=d.querySelector('.paper-search-results'), status=d.querySelector('[role=status]');
    const provider=()=>source?.value??'workspace';
    let timer,request,items=[];
    async function lookup() {
      request?.abort();
      const next=new AbortController();
      request=next;
      const mode=provider(),term=field.value.trim();
      d.querySelector('[data-paper-kind]').classList.toggle('hidden',mode!=='dhan');
      status.textContent='Searching…';
      try{
        const data=mode==='dhan'?await api('/api/private-dhan/symbols?'+query({kind:kind.value,q:term}),{signal:next.signal}):await api('/api/stocks',{signal:next.signal});
        if(next.signal.aborted||!d.open)return;
        items=mode==='dhan'?data.items.filter(item=>item.lotSize):data.data.filter(item=>[item.name,item.symbol].some(value=>String(value).toLowerCase().includes(term.toLowerCase()))).slice(0,50);
        results.innerHTML=items.map((item,i)=>`<button type="button" data-ticket-item="${i}"><strong>${html(item.expiry?item.name:item.symbol)}</strong><small>${html(item.expiry?item.expiry+' · '+item.lotSize+' units per lot':item.name)}</small></button>`).join('');
        status.textContent=items.length?'':data.ready===false?'Dhan’s directory is still loading.':'No matching instruments.';
      }catch(error){if(!next.signal.aborted){items=[];results.replaceChildren();status.textContent=error.message;}}
    }
    const schedule=()=>{clearTimeout(timer);request?.abort();items=[];results.replaceChildren();timer=setTimeout(()=>void lookup(),180);};
    field.addEventListener('input',schedule);
    kind.addEventListener('change',schedule);
    source?.addEventListener('change',schedule);
    d.addEventListener('close',()=>{clearTimeout(timer);request?.abort();});
    d.addEventListener('submit',event=>{event.preventDefault();results.querySelector('button')?.click();});
    results.addEventListener('click',event=>{
      const i=event.target.closest('[data-ticket-item]')?.dataset.ticketItem;
      if(i==null||!items[i])return;
      const item=items[i];dialogClose(d);void open(provider(),item.symbol);
    });
    field.focus();
    void lookup();
  }

  async function open(source,symbol,side='buy',units=1) {
    const owner=state.user?.id;
    if(!owner)return;
    const d=workspaceDialog('Paper order',`<div class="paper-ticket-loading" role="status">Loading instrument and quote…</div>`);
    dialog=d;
    try {
      const item=await api('/api/paper/instrument?'+query({source,symbol}));
      if(!d.open||state.user?.id!==owner)return;
      d.querySelector('.paper-ticket-loading').outerHTML=`
        <div class="paper-ticket-intro"><h3>${html(item.name)}</h3><span class="tag">PAPER ONLY</span></div>
        <p class="muted">${html(nameOf(item.kind))} · ${format(item.last)}${item.fresh?'':' · Last known or unavailable'}${item.expiry?' · Expires '+html(item.expiry):''}</p>
        <div class="paper-form-grid">
          <label>Side<select name="side"><option value="buy" ${side==='buy'?'selected':''}>Buy</option><option value="sell" ${side==='sell'?'selected':''}>Sell</option></select></label>
          <label>Order type<select name="type"><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop market</option></select></label>
          <label>${item.kind==='equity'?'Shares':`Lots · ${item.lotSize} units each`}<input type="number" name="units" min="1" max="100000" step="1" value="${units}" required></label>
          <label data-paper-order-level class="hidden"><span>Limit price (₹)</span><input type="number" name="level" min="0.01" step="0.01" disabled></label>
          <label>Stop loss (₹)<input type="number" name="stopLoss" min="0.01" step="0.01" placeholder="Optional"></label>
          <label>Take profit (₹)<input type="number" name="takeProfit" min="0.01" step="0.01" placeholder="Optional"></label>
        </div>
        <p class="muted paper-ticket-note">Stop loss and take profit protect the resulting position and use the next eligible quote after a trigger.</p>
        <div class="paper-preview" aria-live="polite"></div>`;
      const form=d.querySelector('form'), issue=d.querySelector('.dialog-error'), preview=d.querySelector('.paper-preview');
      const actions=d.querySelector('.dialog-actions');
      actions.insertAdjacentHTML('beforeend','<button class="button secondary" type="submit">Review order</button><button class="button primary hidden" type="button" data-submit-paper>Place paper order</button>');
      const review=actions.querySelector('button[type=submit]'), submit=actions.querySelector('[data-submit-paper]');
      const level=d.querySelector('[data-paper-order-level]'), levelInput=level.querySelector('input');
      let payload, requestId=crypto.randomUUID(), revision=0, busy=false;
      form.addEventListener('input',()=>{
        revision++;
        payload=null;
        issue.textContent='';
        preview.replaceChildren();
        submit.classList.add('hidden');
        const type=form.elements.type.value;
        level.classList.toggle('hidden',type==='market');
        levelInput.disabled=type==='market';levelInput.required=type!=='market';
        level.querySelector('span').textContent=type==='stop'?'Trigger price (₹)':'Limit price (₹)';
      });
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if(busy)return;
        const token=++revision;
        const values=new FormData(form);
        const numeric=key=>values.get(key)?Number(values.get(key)):null;
        const input={source,symbol,side:values.get('side'),type:values.get('type'),units:numeric('units'),level:numeric('level'),stopLoss:numeric('stopLoss'),takeProfit:numeric('takeProfit'),requestId};
        review.disabled=true;
        submit.classList.add('hidden');
        issue.textContent='';
        try{
          const estimate=await api('/api/paper/preview',{method:'POST',body:JSON.stringify(input)});
          if(!d.open||token!==revision)return;
          preview.innerHTML=grid([['Units',fmt(estimate.quantity,0)],['Estimated price',format(estimate.price)],['Notional',format(estimate.notional)],estimate.closing?['Capital released',format(estimate.releases)]:['Required paper funds',format(estimate.required)],['Available now',format(estimate.available)],estimate.closing?['Estimated realised P&L',pnl(estimate.pnl)]:['Available after this order',format(estimate.available-estimate.required)]]);
          if(estimate.required>estimate.available&&estimate.required>0){issue.textContent='Insufficient virtual funds for this order.';return;}
          payload=input;
          submit.classList.remove('hidden');
        }catch(error){if(d.open&&token===revision)issue.textContent=error.message;}
        finally{review.disabled=false;}
      });
      submit.addEventListener('click',async()=>{
        if(!payload||busy)return;
        busy=true;submit.disabled=true;review.disabled=true;
        const fields=Array.from(form.querySelectorAll('input:not(:disabled),select:not(:disabled)'));
        fields.forEach(field=>field.disabled=true);
        issue.textContent='';
        try{
          const {order}=await api('/api/paper/orders',{method:'POST',body:JSON.stringify(payload)});
          if(!d.open||state.user?.id!==owner)return;
          dialogClose(d);
          if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
          toast(order.state==='filled'? 'Paper order filled at '+format(order.fill)+'.':'Paper order is pending.');
          navigate('paper');
          activate(order.state==='filled'?'positions':'orders');
        }catch(error){if(d.open)issue.textContent=error.message;}
        finally{busy=false;submit.disabled=false;review.disabled=false;fields.forEach(field=>field.disabled=false);}
      });
      if(item.expired){review.disabled=true;issue.textContent='This contract has expired.';}
    }catch(error){if(d.open)d.querySelector('.paper-ticket-loading').textContent=error.message;}
  }

  function editProtection(position) {
    const d=workspaceDialog('Position protection',`
      <p class="muted">${html(position.name)} · ${position.quantity>0?'Long':'Short'} · leave either price blank to remove it.</p>
      <div class="paper-form-grid">
        <label>Stop loss (₹)<input name="stop" type="number" min="0.01" step="0.01" value="${position.stopLoss??''}"></label>
        <label>Take profit (₹)<input name="target" type="number" min="0.01" step="0.01" value="${position.takeProfit??''}"></label>
      </div>`,async(values,d)=>{
      const save=d.querySelector('[type=submit]');
      if(save.disabled)throw new Error('Saving protection…');
      save.disabled=true;
      try{
        await api('/api/paper/protection',{method:'PATCH',body:JSON.stringify({source:position.source,symbol:position.symbol,stopLoss:values.get('stop')?Number(values.get('stop')):null,takeProfit:values.get('target')?Number(values.get('target')):null})});
        toast('Position protection updated.');void refresh();
      }finally{save.disabled=false;}
    });
    dialog=d;
  }
  page.addEventListener('click',async event=>{
    const b=event.target.closest('button');
    if(!b)return;
    if(b.hasAttribute('data-paper-new'))search();
    if(b.dataset.paperTab&&b.dataset.paperTab!==tab)activate(b.dataset.paperTab);
    if(b.dataset.paperPage){offset+=Number(b.dataset.paperPage);void refresh();}
    if(b.dataset.positionSource){
      const p=data?.positions.find(p=>p.source===b.dataset.positionSource&&p.symbol===(b.dataset.paperClose??b.dataset.paperProtection));
      if(!p){void refresh();return;}
      if(b.dataset.paperClose)void open(p.source,p.symbol,p.quantity>0?'sell':'buy',Math.abs(p.quantity)/p.lotSize);
      else editProtection(p);
    }
    if(b.dataset.paperCancel){
      b.disabled=true;
      try{await api('/api/paper/orders/'+b.dataset.paperCancel,{method:'DELETE'});toast('Paper order cancelled.');void refresh();}
      catch(error){toast(error.message,true);b.disabled=false;}
    }
  });
  page.querySelector('[role=tablist]').addEventListener('keydown',event=>{
    const index=tabs.findIndex(([id])=>id===event.target.dataset.paperTab);
    const next={ArrowRight:(index+1)%tabs.length,ArrowLeft:(index-1+tabs.length)%tabs.length,Home:0,End:tabs.length-1}[event.key];
    if(index<0||next===undefined)return;
    event.preventDefault();
    activate(tabs[next][0]);
    $(`paper-tab-${tab}`).focus();
  });
  document.body.addEventListener('click',event=>{
    const button=event.target.closest('[data-paper-symbol]');
    if(button)void open(button.dataset.paperSource,button.dataset.paperSymbol,button.dataset.paperSide);
  });
  document.addEventListener('visibilitychange',()=>{if(active())void refresh(true);else pause();});
  window.paperTrading={open,navigate(target){if(target==='paper')void refresh();else pause();},reset(){
    pause();data=null;tab='positions';offset=0;
    if(dialog?.open)dialogClose(dialog);
    metrics.replaceChildren();body.replaceChildren();body.dataset.markup='';
    activate('positions');
  }};
})();