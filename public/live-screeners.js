(() => {
  const page=$('page-screener');
  const root=document.createElement('div');root.id='liveScreeners';page.append(root);
  const groups=[['intraday','Intraday','charts'],['investing','Investing','research'],['fundamental','Fundamentals','overview'],['options','Options','layers'],['futures','Futures','list'],['commodities','Commodities','commodity']];
  const universes=[['NSE:NIFTY','Nifty 50'],['NSE:BANKNIFTY','Bank Nifty'],['NSE:NIFTYNXT50','Nifty Next 50'],['NSE:NIFTYIT','Nifty IT'],['BSE:SENSEX','Sensex']];
  const fmt=new Intl.NumberFormat('en-IN',{maximumFractionDigits:2});
  const value=v=>v==null?'—':fmt.format(v);
  const time=v=>v?new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' IST':'Trade time unavailable';
  let owner,group='intraday',preset,config,model,job,timer,version=0,busy=false,saved=[],lastResult,paused=false;
  const active=()=>state.meta?.privateDhan&&state.currentPage==='screener'&&!document.hidden;
  const options=(items,selected)=>items.map(([v,label])=>`<option value="${html(v)}" ${v===selected?'selected':''}>${html(label)}</option>`).join('');
  function saveLocal(){localStorage.setItem('alertpe-live-scans:'+owner,JSON.stringify(saved));}
  function render(){
    root.innerHTML=`<div class="page-heading"><div><div class="eyebrow">DHAN MARKET DATA</div><h1>Market screeners</h1><p class="muted">Find stocks and contracts with live prices, technical signals, and reported fundamentals.</p></div><span class="tag">DhanHQ</span></div>
      <div class="live-scan-groups" role="tablist" aria-label="Screener categories">${groups.map(([id,label,icon])=>`<button type="button" role="tab" data-scan-group="${id}" aria-selected="${id===group}">${terminalIcon(icon)}${label}</button>`).join('')}</div>
      <div class="live-scan-layout"><aside class="panel live-scan-library"><h2>${groups.find(([id])=>id===group)[1]} screeners</h2><div class="live-scan-presets">${model.presets.filter(p=>p.group===group).map(p=>`<button type="button" data-scan-preset="${p.id}" aria-pressed="${preset.id===p.id}"><strong>${html(p.name)}</strong><small>${html(p.description)}</small></button>`).join('')}</div></aside>
      <section class="panel live-scan-editor"><div class="panel-heading"><div><h2>${html(preset.name)}</h2><p class="muted">${html(preset.description)}</p></div></div>
      <form id="liveScanForm"><div class="live-scan-inputs"><label ${group==='commodities'?'hidden':''}>${group==='options'?'Underlying':'Stock universe'}<select name="universe">${options(universes,config.universe)}</select></label>
      ${group==='options'?`<label>Expiry<select name="expiry"><option value="">Nearest listed expiry</option>${options((lastResult?.expiries||[]).map(d=>[d,d]),config.expiry)}</select></label><label>Option side<select name="side">${options([['','Calls and puts'],['CE','Calls'],['PE','Puts']],config.side)}</select></label>`:''}
      <label>Sort by<select name="sort">${options(Object.entries(model.fields),config.sort)}</select></label><label>Order<select name="direction">${options([['desc','Highest first'],['asc','Lowest first']],config.direction)}</select></label></div>
      <div class="live-scan-condition-heading"><b>Match all conditions</b><button type="button" id="liveScanAdd">＋ Add condition</button></div><div id="liveScanRules"></div><p class="live-scan-help">Enter a number or another field name, such as <code>sma50</code>, to compare two fields. Prices in ₹, market cap in ₹ crore.</p><div class="live-scan-run"><label class="live-scan-auto"><input type="checkbox" name="auto" ${config.auto?'checked':''}>Auto refresh</label><span id="liveScanProgress" role="status" aria-live="polite"></span><button type="button" id="liveScanCancel" class="button secondary" hidden>Cancel</button><button type="submit" id="liveScanRun" class="button primary">Run scan</button></div><p id="liveScanError" role="alert" hidden></p></form></section></div>
      <section class="panel live-scan-results"><div class="panel-heading"><div><h2>Scan results <span class="count-pill" id="liveScanCount">0</span></h2><p id="liveScanSummary" class="muted">Select a screener to find matching instruments.</p></div><button type="button" id="liveScanSave" class="button secondary">Save screener</button></div><p id="liveScanCoverage" class="live-scan-coverage"></p><div id="liveScanTable" class="table-wrap"><p class="empty-state">Your scan results will appear here.</p></div></section>
      <section class="panel live-scan-saved"><h2>Saved screeners</h2><p class="muted">Saved for this account on this browser.</p><div id="liveScanSaved"></div></section>`;
    renderRules();renderSaved();
    root.querySelector('#liveScanForm').onsubmit=e=>{e.preventDefault();void run();};
    root.querySelector('#liveScanAdd').onclick=()=>{if(config.rules.length>=10)return;readRules();config.rules.push({field:'price',op:'>',value:0});renderRules();};
    root.querySelector('#liveScanCancel').onclick=()=>void cancel();
    root.querySelector('#liveScanSave').onclick=()=>{
      try{readConfig();const d=workspaceDialog('Save live screener','<label>Screener name<input name="name" required maxlength="80" value="'+html(preset.name)+'"></label>',async form=>{const name=form.get('name').trim();if(!name)throw new Error('Enter a screener name.');saved=[...saved,{id:crypto.randomUUID(),name,preset:preset.id,config:JSON.parse(JSON.stringify(config))}].slice(-30);saveLocal();renderSaved();toast('Screener saved.');});d.querySelector('button[type=submit]').textContent='Save screener';}catch(e){showError(e.message);}
    };
    root.querySelectorAll('[data-scan-group]').forEach(b=>b.onclick=()=>void choose(model.presets.find(p=>p.group===b.dataset.scanGroup)));
    root.querySelectorAll('[data-scan-preset]').forEach(b=>b.onclick=()=>void choose(model.presets.find(p=>p.id===b.dataset.scanPreset)));
    root.querySelectorAll('select[name=universe],select[name=expiry],select[name=side]').forEach(el=>el.onchange=()=>{if(el.name==='universe'){lastResult=null;const expiry=root.querySelector('[name=expiry]');if(expiry){expiry.innerHTML='<option value="">Nearest listed expiry</option>';}}void run();});
    root.querySelector('[name=auto]').onchange=e=>{config.auto=e.target.checked;clearTimeout(timer);if(config.auto&&!busy)void run();};
    if(lastResult)showResults(lastResult);
  }
  function renderRules(){root.querySelector('#liveScanRules').innerHTML=config.rules.map((r,i)=>`<div class="live-scan-rule" data-rule="${i}"><label><span class="sr-only">Field ${i+1}</span><select data-field>${options(Object.entries(model.fields),r.field)}</select></label><label><span class="sr-only">Comparison ${i+1}</span><select data-op>${options(['>','>=','<','<=','=','!='].map(v=>[v,v]),r.op)}</select></label><label><span class="sr-only">Value or field ${i+1}</span><input data-value value="${html(String(r.value))}" list="liveScanFieldNames" required></label><button type="button" data-remove-rule="${i}" aria-label="Remove condition ${i+1}" ${config.rules.length===1?'disabled':''}>${terminalIcon('trash')}</button></div>`).join('')+`<datalist id="liveScanFieldNames">${Object.keys(model.fields).map(k=>`<option value="${k}">${html(model.fields[k])}</option>`).join('')}</datalist>`;root.querySelectorAll('[data-remove-rule]').forEach(b=>b.onclick=()=>{readRules();config.rules.splice(Number(b.dataset.removeRule),1);renderRules();});}
  function readRules(){config.rules=[...root.querySelectorAll('[data-rule]')].map(el=>{const raw=el.querySelector('[data-value]').value.trim(),numeric=Number(raw);if(!raw)throw new Error('Enter a number or field name for every condition.');const v=Number.isFinite(numeric)?numeric:raw;if(typeof v==='string'&&!Object.hasOwn(model.fields,v))throw new Error('Unknown field '+v+'. Use a field from the suggestions.');return {field:el.querySelector('[data-field]').value,op:el.querySelector('[data-op]').value,value:v};});}
  function readConfig(){readRules();const form=root.querySelector('#liveScanForm');for(const key of ['universe','expiry','side','sort','direction'])if(form.elements[key])config[key]=form.elements[key].value;config.auto=form.elements.auto.checked;}
  function showError(message){const e=root.querySelector('#liveScanError');e.textContent=message;e.hidden=!message;}
  function setBusy(value){busy=value;const button=root.querySelector('#liveScanRun');if(!button)return;button.disabled=value;button.textContent=value?'Scanning…':'Run scan';root.querySelector('#liveScanCancel').hidden=!value;root.querySelector('#liveScanForm').setAttribute('aria-busy',String(value));}
  async function cancel(){version++;clearTimeout(timer);const old=job;job=null;setBusy(false);const progress=root.querySelector('#liveScanProgress');if(progress)progress.textContent='Scan cancelled.';if(old)try{await api('/api/private-dhan/scans/'+old,{method:'DELETE'});}catch{}}
  async function choose(next,savedConfig){await cancel();group=next.group;preset=next;config=savedConfig?JSON.parse(JSON.stringify(savedConfig)):{universe:'NSE:NIFTY',expiry:'',side:'',sort:next.sort,direction:next.direction,rules:JSON.parse(JSON.stringify(next.rules)),auto:true};lastResult=null;render();void run();}
  async function run(){
    if(!active()||busy)return;clearTimeout(timer);showError('');let current=++version;const user=owner;
    try{
      readConfig();setBusy(true);root.querySelector('#liveScanProgress').textContent='Loading universe…';
      let symbols=[];
      if(!['options','commodities'].includes(group)){
        const data=await api('/api/private-dhan/constituents?'+new URLSearchParams({index:config.universe}));symbols=data.items.filter(i=>i.symbol).map(i=>i.symbol);if(!symbols.length)throw new Error('No mapped stocks are available for this universe.');
      }
      if(current!==version||user!==state.user?.id)return;
      const result=await api('/api/private-dhan/scans',{method:'POST',body:JSON.stringify({preset:preset.id,rules:config.rules,sort:config.sort,direction:config.direction,symbols,underlying:config.universe,expiry:config.expiry,side:config.side})});
      if(current!==version||user!==state.user?.id){void api('/api/private-dhan/scans/'+result.id,{method:'DELETE'}).catch(()=>{});return;}
      job=result.id;void poll(current,user,result);
    }catch(error){if(current===version){showError(error.message);setBusy(false);root.querySelector('#liveScanProgress').textContent='Scan failed.';}}
  }
  async function poll(current,user,initial){
    if(current!==version||user!==state.user?.id)return;
    try{
      const result=initial||await api('/api/private-dhan/scans/'+job);
      if(current!==version||user!==state.user?.id)return;
      root.querySelector('#liveScanProgress').textContent=result.total?`Checked ${result.completed} / ${result.total}`:'Requesting Dhan data…';
      if(result.status==='running'){timer=setTimeout(()=>void poll(current,user),1200);return;}
      job=null;setBusy(false);
      if(result.status==='error')throw new Error(result.error);
      if(result.status==='cancelled')return;
      lastResult=result;showResults(result);
      if(config.auto&&active())timer=setTimeout(()=>void run(),result.fundamentals?300000:result.interval?60000:15000);
    }catch(error){if(current===version){job=null;setBusy(false);showError(error.message);}}
  }
  function showResults(result){
    const used=[...new Set(config.rules.flatMap(r=>[r.field,...(typeof r.value==='string'?[r.value]:[])]).concat(config.sort))].filter(k=>!['price','change_pct','volume'].includes(k));
    const cols=used.slice(0,6);
    root.querySelector('#liveScanCount').textContent=result.rows.length;
    root.querySelector('#liveScanSummary').textContent=`${result.rows.length} matches · ${result.total} instruments checked · ${result.universe||universes.find(([id])=>id===config.universe)?.[1]||'MCX futures'} · Updated ${time(result.finishedAt)}`;
    const notes=[result.unavailable?`${result.unavailable} instruments excluded because a required value was unavailable.`:'',result.available>result.total?`Scanned the first ${result.total} dated contracts of ${result.available}.`:'',result.interval?`Indicators use ${result.interval.toLowerCase()}.`:'',result.fundamentals?'Fundamentals are the latest reported figures, cached up to 6 hours.':'',...result.warnings].filter(Boolean);
    root.querySelector('#liveScanCoverage').textContent=notes.join(' ');
    if(result.expiries){const select=root.querySelector('[name=expiry]');const chosen=select.value;select.innerHTML='<option value="">Nearest listed expiry</option>'+options(result.expiries.map(d=>[d,d]),chosen);}
    const headers=['Instrument','Last ₹','Change %','Volume',...cols.map(k=>model.fields[k]),'Quote time','Actions'];
    root.querySelector('#liveScanTable').innerHTML=result.rows.length?`<table class="data-table"><thead><tr>${headers.map(h=>`<th scope="col">${html(h)}</th>`).join('')}</tr></thead><tbody>${result.rows.map(row=>{const live=row.quoteAt&&Date.now()-Date.parse(row.quoteAt)<120000;return `<tr><td><strong>${html(row.name)}</strong><small>${html(row.symbol||'Provider contract')}${row.expiry?' · '+html(row.expiry):''}</small></td><td>${value(row.price)}</td><td class="${row.change_pct>0?'positive':row.change_pct<0?'negative':''}">${row.change_pct>0?'+':''}${value(row.change_pct)}${row.change_pct==null?'':'%'}</td><td>${value(row.volume)}</td>${cols.map(k=>`<td>${value(row[k])}</td>`).join('')}<td><span class="${live?'positive':'muted'}">${live?'Live trade':row.quoteAt?'Last trade':'Chain snapshot'}</span><small>${time(row.quoteAt||row.retrievedAt)}</small></td><td>${row.symbol?`<div class="live-scan-actions"><button type="button" data-scan-chart="${html(row.symbol)}" aria-label="Open chart for ${html(row.name)}" title="Open chart">${terminalIcon('charts')}</button><button type="button" data-scan-alert="${html(row.symbol)}" aria-label="Create alert for ${html(row.name)}" title="Create alert">${terminalIcon('alerts')}</button>${row.lotSize?paperButtons('dhan',row.symbol):''}</div>`:'—'}</td></tr>`;}).join('')}</tbody></table>`:`<div class="empty-state"><strong>No matches for these conditions</strong><p>Adjust the thresholds or choose another screener or universe.${result.unavailable?' Some instruments were missing required provider fields.':''}</p></div>`;
    root.querySelectorAll('[data-scan-chart]').forEach(b=>b.onclick=()=>window.privateDhanView.openChart(b.dataset.scanChart));
    root.querySelectorAll('[data-scan-alert]').forEach(b=>b.onclick=()=>window.privateDhanView.openAlert(b.dataset.scanAlert));
  }
  function renderSaved(){root.querySelector('#liveScanSaved').innerHTML=saved.length?saved.map(s=>`<div><button type="button" data-saved-scan="${html(s.id)}">${html(s.name)}</button><button type="button" data-remove-scan="${html(s.id)}" aria-label="Remove ${html(s.name)}">${terminalIcon('trash')}</button></div>`).join(''):'<p class="muted">Save a screener to reuse its filters.</p>';root.querySelectorAll('[data-saved-scan]').forEach(b=>b.onclick=()=>{const savedScan=saved.find(s=>s.id===b.dataset.savedScan),p=model.presets.find(p=>p.id===savedScan.preset);if(p)void choose(p,savedScan.config);});root.querySelectorAll('[data-remove-scan]').forEach(b=>b.onclick=()=>{saved=saved.filter(s=>s.id!==b.dataset.removeScan);saveLocal();renderSaved();});}
  async function enter(){
    const enabled=state.meta?.privateDhan===true;page.classList.toggle('live-screeners-active',enabled);
    if(!enabled)return;
    if(owner!==state.user?.id){owner=state.user.id;model=null;lastResult=null;try{saved=JSON.parse(localStorage.getItem('alertpe-live-scans:'+owner)||'[]');if(!Array.isArray(saved))saved=[];}catch{saved=[];}}
    if(!model){root.innerHTML='<p class="panel" role="status">Loading live screener library…</p>';try{const user=owner;model=await api('/api/private-dhan/screeners');if(user!==state.user?.id)return;void choose(model.presets[0]);}catch(error){root.innerHTML='<p class="panel" role="alert">'+html(error.message)+'</p>';}}
    else if(paused){paused=false;setBusy(false);if(config.auto)void run();}
  }
  const previousNavigate=navigate;
  navigate=function(target){previousNavigate(target);if(target==='screener')void enter();else {paused=true;void cancelIfMounted();}};
  async function cancelIfMounted(){if(model)await cancel();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;void cancelIfMounted();}else if(active())void enter();});
  if(state.currentPage==='screener')void enter();
})();
