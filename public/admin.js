const $=id=>document.getElementById(id);
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let adminUser=null,adminData=null;
async function api(url,options={}) {
 const res=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options}); const data=await res.json().catch(()=>({}));
 if(!res.ok){if(res.status===401 && adminUser)showAuth();throw new Error(data.error||'Request failed.');}return data;
}
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),4000);}
function showAuth(){adminUser=null;adminData=null;history.replaceState(null,'','/admin/login');$('authView').classList.remove('hidden');$('appView').classList.add('hidden');$('adminUsers').replaceChildren();$('adminFailures').replaceChildren();}
function showApp(user){adminUser=user;history.replaceState(null,'','/admin');$('authView').classList.add('hidden');$('appView').classList.remove('hidden');$('userName').textContent=user.name;$('avatar').textContent=user.name.slice(0,1).toUpperCase();loadAdmin();}
$('authForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;$('authSubmit').disabled=true;$('authError').classList.add('hidden');try{const result=await api('/api/admin/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.reset();showApp(result.user);}catch(err){$('authError').textContent=err.message;$('authError').classList.remove('hidden');}finally{$('authSubmit').disabled=false;}});
$('logoutBtn').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST'});showAuth();}catch(err){toast(err.message,true);}});
$('refreshAdmin').addEventListener('click',()=>loadAdmin());
let customerCursor=null,customerHistory=[],customerNext=null,customerGeneration=0;
$('customerSearch').addEventListener('input',()=>{clearTimeout(customerSearchTimer);customerSearchTimer=setTimeout(()=>{customerCursor=null;customerHistory=[];loadCustomers();},250);});let customerSearchTimer;
$('customerPrev').onclick=()=>{customerCursor=customerHistory.pop()??null;loadCustomers();};$('customerNext').onclick=()=>{if(customerNext){customerHistory.push(customerCursor);customerCursor=customerNext;loadCustomers();}};
async function loadCustomers(){const generation=++customerGeneration;try{const result=await api('/api/admin/customers?search='+encodeURIComponent($('customerSearch').value)+(customerCursor?'&cursor='+customerCursor:''));if(generation!==customerGeneration)return;adminData.users=result.users;customerNext=result.nextCursor;$('customerPrev').disabled=!customerHistory.length;$('customerNext').disabled=!customerNext;renderCustomers();}catch(err){toast(err.message,true);}}

function renderCustomers(){if(!adminData)return;const search=$('customerSearch').value.toLowerCase();const users=adminData.users;
    $('adminUsers').innerHTML = `<table class="data-table"><thead><tr><th>ACCOUNT</th><th>ROLE</th><th>WHATSAPP OPT-IN</th><th>STATUS</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td><b>${html(u.name)}</b><br><small>${html(u.email)}</small></td><td>${html(u.role)}</td><td>${u.whatsapp_opt_in ? 'Yes' : 'No'}</td><td>${u.active ? 'Active' : 'Paused'}</td><td>${u.role === 'admin' ? '' : `<button class="admin-users-toggle ${u.active ? 'pause' : ''}" data-user-id="${u.id}" data-active="${!u.active}">${u.active ? 'Pause' : 'Activate'}</button>`}</td></tr>`).join('')}</tbody></table>`;
    $('adminUsers').querySelectorAll('[data-user-id]').forEach(b => b.addEventListener('click', async () => { try { await api(`/api/admin/users/${b.dataset.userId}`, { method: 'PATCH', body: JSON.stringify({ active: b.dataset.active === 'true' }) }); loadAdmin(); } catch (err) { toast(err.message, true); } }));

if(!users.length)$('adminUsers').innerHTML='<p class="settings-intro muted">No customers match your search.</p>';
}
async function loadAdmin() {
  try {
    const [data,health,delivery] = await Promise.all([api('/api/admin/overview'),api('/api/admin/runtime'),api('/api/admin/delivery-jobs')]);
    renderRuntime(health);
    adminData = data; $('simulationControls').classList.toggle('hidden', !data.simulated); $('simulationNav').classList.toggle('hidden', !data.simulated); $('importMarketSymbols').disabled = data.simulated; $('marketSymbolFile').disabled = data.simulated; $('adminUserCount').textContent = data.customerCount; $('adminEventCount').textContent = data.eventCount;
    $('adminMarketMode').textContent = data.marketConnected ? data.marketMode : 'Disconnected'; $('adminMarketStatus').textContent = `${data.marketSymbolCount} instruments · ${data.redistributionApproved ? 'Redistribution approved' : 'License approval required'}`; $('adminMarketBadge').textContent = data.marketConnected ? 'CONNECTED' : 'NOT CONNECTED'; $('adminMarketMessage').textContent = data.marketConnected ? `Connected to ${data.marketMode}; ${data.marketSymbolCount} imported instruments.` : data.redistributionApproved ? 'Provider credentials or instrument master may be missing. Check Render logs and the imported symbol list.' : 'Import the licensed provider instrument master. Do not enable shared live data until the provider/exchange has granted written display and redistribution rights.'; $('adminWhatsApp').textContent = data.simulated ? 'Simulated' : data.whatsappReady ? 'Connected' : 'Not configured'; if(data.simulated) { $('adminMarketMode').textContent=data.simulationPaused?'Paused':'Simulated'; $('adminMarketStatus').textContent='60 fictional instruments'; $('adminMarketMessage').textContent='SIMULATED DATA: generated locally; no exchange or provider credentials needed.'; }
    await loadCustomers();
    $('adminFailures').innerHTML = delivery.jobs.length ? delivery.jobs.map(job => `<div class="saved-query"><div><b>${html(job.title)} · ${html(job.symbol || '')}</b><code>${html(job.channel)} · ${job.attempts} attempts · ${html(job.last_error || 'Provider delivery failed')}</code></div><span class="status-chip failed">failed</span></div>`).join('') : '<p class="muted">No failed delivery jobs.</p>';
  } catch (err) { toast(err.message, true); }
}

function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('CSV must have a header and at least one instrument.');
  const headers = rows[0].map(v => v.toLowerCase());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] || ''])));
}
$('importMarketSymbols').addEventListener('click', async () => {
  const file = $('marketSymbolFile').files?.[0]; if (!file) return toast('Choose a CSV instrument master first.', true);
  try {
    const symbols = parseCSV(await file.text());
    const result = await api('/api/admin/market-symbols', { method: 'POST', body: JSON.stringify({ symbols }) });
    $('marketImportResult').textContent = `${result.imported} instruments imported. ${result.message}`; toast(`${result.imported} instruments imported.`); loadAdmin();
  } catch (err) { $('marketImportResult').textContent = err.message; toast(err.message, true); }
});

document.querySelectorAll('[data-simulation]').forEach(button => button.addEventListener('click', async () => {
  try { await api('/api/admin/simulation', {method:'POST',body:JSON.stringify({action:button.dataset.simulation,symbol:$('scenarioSymbol').value,scenario:$('scenarioType').value})}); toast('Simulation updated.'); loadAdmin(); } catch(err) { toast(err.message,true); }
}));

(async()=>{try{const data=await api('/api/admin/me');if(data.user)showApp(data.user);else showAuth();}catch{showAuth();}})();

document.querySelectorAll('#adminNav .nav-item').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('#adminNav .nav-item').forEach(item=>item.classList.toggle('active',item===link));}));

function renderRuntime(info){
 $('runtimeSummary').textContent='Market snapshot '+info.sequence+' · '+Math.max(0,(info.metrics.counters.socket_connections||0)-(info.metrics.counters.socket_closed||0))+' local stream connections · '+info.jobs.filter(j=>j.status==='ready'||j.status==='processing').reduce((n,j)=>n+j.count,0)+' pending delivery jobs.';
 $('runtimeServices').innerHTML='<table class="data-table"><thead><tr><th>SERVICE</th><th>FEED POSITION</th><th>LAST SEEN</th></tr></thead><tbody>'+info.services.map(s=>'<tr><td>'+html(s.role)+(s.role==='evaluator'?' '+s.details.shard+'/'+s.details.shards:'')+'</td><td>'+html(s.details.sequence)+'</td><td>'+html(new Date(s.updated_at).toLocaleTimeString())+'</td></tr>').join('')+'</tbody></table>';
}
