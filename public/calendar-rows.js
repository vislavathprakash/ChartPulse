/* Compact, expandable calendar records with shared alert actions. */
(() => {
  const categories={economic:'Economic',earnings:'Earnings',dividends:'Dividends',ipo:'IPO',events:'Events'};
  const fields={actual:'Actual',forecast:'Forecast',previous:'Previous',dividendAmount:'Dividend',epsActual:'EPS actual',epsEstimate:'EPS estimate',importance:'Impact'};
  const mainFields={economic:['actual','forecast','previous'],earnings:['epsActual','epsEstimate'],dividends:['dividendAmount','exDate'],events:[],ipo:[]};
  const originalRender=marketCalendar.renderPage.bind(marketCalendar);
  let owner;
  const selectedEvents=calendar=>(calendar.data?.events||[]).filter(e=>!calendar.day||calendar.date(new Date(e.starts_at))===calendar.day);
  function icon(name){return terminalIcon(name);}
  function action(label,name,callback){
    const button=document.createElement('button');
    button.type='button';button.className='calendar-inline-action';button.title=label;button.setAttribute('aria-label',label);
    button.innerHTML=icon(name);button.onclick=callback;return button;
  }
  function record(calendar,event){
    const card=document.createElement('article');
    card.className='calendar-event calendar-expandable-event';
    card.dataset.search=[event.title,event.symbol,event.source_name,event.details,...Object.values(event.metadata||{})].join(' ').toLowerCase();
    const details=document.createElement('details');
    const summary=document.createElement('summary');
    const metadata=event.metadata||{};
    const category=categories[event.category]||'Event';
    const metrics=(mainFields[event.category]||[]).filter(k=>metadata[k]!=null&&metadata[k]!=='').slice(0,3);
    summary.innerHTML=`<span class="calendar-event-chevron" aria-hidden="true">${icon('arrow')}</span><time datetime="${html(event.starts_at)}">${html(metadata.dateOnly?calendar.date(new Date(event.starts_at))+' · Date only':calendar.time(event.starts_at))}</time><span class="calendar-event-name"><strong>${html(event.title)}</strong><small>${html(event.symbol||metadata.company||category)}</small></span><span class="calendar-event-metrics">${metrics.map(k=>`<span><small>${html(fields[k]||k)}</small><b>${html(String(metadata[k]))}</b></span>`).join('')}</span>`;
    summary.setAttribute('aria-label','Show details for '+event.title);
    const content=document.createElement('div');content.className='calendar-expanded-content';
    content.innerHTML=`<dl class="calendar-data-grid">${calendar.eventData(event)}</dl>${event.details?`<p>${html(event.details)}</p>`:''}${metadata.eventTimeNote?`<p>${html(metadata.eventTimeNote)}</p>`:''}<small>${html(event.source_name||'Personal event')}</small>`;
    if(event.source_url){
      const source=document.createElement('a');source.href=event.source_url;source.target='_blank';source.rel='noopener';source.textContent='Verify with source ↗';content.append(source);
    }
    details.append(summary,content);
    const actions=document.createElement('div');actions.className='calendar-inline-actions';
    const alert=action('Create event alert for '+event.title,'alerts',()=>calendar.reminder(event));alert.classList.add('calendar-inline-alert');actions.append(alert);
    const count=calendar.centre().reminders.filter(r=>String(r.event_id)===String(event.id)&&r.enabled&&!r.fired_at).length;
    if(count){const badge=document.createElement('span');badge.className='calendar-inline-count';badge.textContent=count;badge.title=count+' scheduled alerts';actions.append(badge);}
    if(event.symbol){
      actions.append(action('Create price alert for '+event.symbol,'alerts',()=>nativeAlerts.open(event.symbol,{startsAt:event.starts_at,name:event.title+' · price alert'})));
      actions.lastElementChild.innerHTML=icon('research');
      actions.append(action('Open chart for '+event.symbol,'charts',()=>{navigate('charts');stockWorkspace.open({symbol:event.symbol,name:event.symbol});}));
    }
    card.append(details,actions);return card;
  }
  function counts(calendar,host){
    const all=calendar.data?.events||[], today=calendar.date(new Date());
    for(const day of host.querySelectorAll('[data-calendar-day]')){
      const date=day.dataset.calendarDay, events=all.filter(e=>calendar.date(new Date(e.starts_at))===date);
      const totals=Object.entries(categories).map(([key,label])=>[label,events.filter(e=>e.category===key).length]).filter(([,n])=>n);
      const formatted=new Date(date+'T12:00:00+05:30').toLocaleDateString('en-IN',{weekday:'short',timeZone:'Asia/Kolkata'});
      day.innerHTML=`<span class="calendar-day-heading"><small>${formatted}</small>${date===today?'<small class="calendar-day-today">Today</small>':''}</span><b>${Number(date.slice(-2))}</b><span class="calendar-day-total">${events.length} event${events.length===1?'':'s'}</span><span class="calendar-day-categories">${totals.map(([label,n])=>`<span>${label} (${n})</span>`).join('')||'<span>No events</span>'}</span>`;
      day.title=date+' · '+(totals.map(([label,n])=>label+' ('+n+')').join(', ')||'No events');
      const reminders=calendar.centre().reminders.filter(r=>r.enabled&&!r.fired_at&&calendar.date(new Date(r.due_at))===date).length;
      if(reminders){const note=document.createElement('small');note.className='calendar-day-reminders';note.textContent=reminders+' alert'+(reminders===1?'':'s');day.append(note);}
    }
    const group=host.querySelector('.calendar-categories');
    const allTab=document.createElement('button');allTab.type='button';allTab.setAttribute('role','tab');allTab.dataset.calendarCategory='all';group.prepend(allTab);
    const selected=selectedEvents(calendar);
    for(const button of group.querySelectorAll('[data-calendar-category]')){
      const key=button.dataset.calendarCategory, count=key==='all'?selected.length:selected.filter(e=>e.category===key).length;
      button.textContent=(key==='all'?'All events':categories[key])+' ('+count+')';
      button.setAttribute('aria-selected',String(key===calendar.category));
      button.onclick=()=>{calendar.category=key;calendar.render();};
    }
  }
  marketCalendar.renderPage=function(){
    if(owner!==state.user?.id){owner=state.user?.id;this.day=this.date(new Date());this.category='all';this.economicFeedOpen=false;}
    originalRender();
    const host=$('calendarWorkspace');if(!host)return;
    host.classList.add('calendar-single-rows','calendar-refined');
    if(this.section!=='events')return;
    counts(this,host);
    host.querySelectorAll('[data-calendar-view]').forEach(b=>b.textContent=b.dataset.calendarView==='table'?'Compact':'Comfortable');
    host.querySelector('.calendar-table-heading')?.remove();
    const list=host.querySelector('.calendar-list');
    list.classList.remove('calendar-table-view');
    list.querySelectorAll('.calendar-feed-note').forEach(e=>e.remove());
    if(this.category!=='ipo'){
      list.querySelectorAll('.calendar-event,.calendar-empty').forEach(e=>e.remove());
      const records=selectedEvents(this).filter(e=>this.category==='all'||e.category===this.category);
      const section=document.createElement('section');section.className='calendar-event-records';
      const heading=document.createElement('h3');heading.className='calendar-selection-title';
      heading.textContent=(this.day===this.date(new Date())?"Today's events":this.day?new Date(this.day+'T12:00:00+05:30').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short',timeZone:'Asia/Kolkata'})+' events':'This week’s events')+' · '+records.length;
      section.append(heading,...records.map(e=>record(this,e)));
      if(!records.length){const empty=document.createElement('p');empty.className='calendar-empty';empty.textContent=this.data?'No saved events in this category for the selected dates.':'Loading events…';section.append(empty);}
      list.prepend(section);
    }
    const feed=list.querySelector('.calendar-feed-panel');
    if(feed){const details=document.createElement('details');details.className='calendar-source-details';const summary=document.createElement('summary');summary.textContent='Data sources and updates';details.append(summary);feed.before(details);details.append(feed);}
    const controls=host.querySelector('.calendar-view-controls');
    const summary=controls?.querySelector(':scope > span');
    if(summary)summary.textContent=selectedEvents(this).length+' saved events '+(this.day?'on selected day':'this week');
    this.filterPage(host);
  };
})();
