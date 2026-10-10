/* A single, horizontally scrollable row for each calendar record. */
(()=>{
  const names={actual:'Actual',forecast:'Forecast',previous:'Previous',company:'Company',country:'Country',currency:'Currency',importance:'Impact',epsActual:'EPS actual',epsEstimate:'EPS estimate',revenueActual:'Revenue actual',revenueEstimate:'Revenue estimate',dividendAmount:'Dividend',exDate:'Ex-dividend date',recordDate:'Record date',ipoPriceBand:'Price band',lotSize:'Lot size',issueOpen:'Issue opens',issueClose:'Issue closes',listingDate:'Listing date',securityType:'Security type',ipoSymbol:'IPO symbol',issueStatus:'Status',issueSize:'Issue size'};
  const orders={economic:['actual','forecast','previous','importance','country','currency'],earnings:['epsActual','epsEstimate','revenueActual','revenueEstimate','company','country','currency'],dividends:['dividendAmount','exDate','recordDate','currency','company','country'],events:['company','country','currency']};
  const before=marketCalendar.renderPage.bind(marketCalendar);
  const cell=(row,text,className='')=>{const td=document.createElement('td');td.className=className;td.textContent=text??'—';row.appendChild(td);return td;};
  const table=(label,headers)=>{const wrap=document.createElement('div');wrap.className='calendar-row-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',label+'; scroll horizontally for all details');const t=document.createElement('table');t.className='calendar-row-table';const caption=document.createElement('caption');caption.textContent=label; t.appendChild(caption);const head=t.createTHead().insertRow();headers.forEach(s=>{const th=document.createElement('th');th.scope='col';th.textContent=s;head.appendChild(th);});wrap.appendChild(t);return {wrap,t,body:t.createTBody()};};
  marketCalendar.renderPage=function(){
    before();if(this.section!=='events')return;
    const host=$('calendarWorkspace');if(!host)return;
    host.classList.add('calendar-single-rows');
    host.querySelectorAll('[data-calendar-view]').forEach(b=>b.textContent=b.dataset.calendarView==='table'?'Compact':'Comfortable');
    host.querySelector('.calendar-table-heading')?.remove();
    const cards=[...host.querySelectorAll('.calendar-event')];
    const events=(this.data?.events||[]).filter(e=>e.category===this.category&&(!this.day||this.date(new Date(e.starts_at))===this.day));
    if(cards.length){
      const available=Object.keys(names).filter(k=>events.some(e=>e.metadata?.[k]!==undefined&&e.metadata[k]!==null&&e.metadata[k]!==''));
      const preferred=orders[this.category]||[];
      const keys=[...preferred.filter(k=>available.includes(k)),...available.filter(k=>!preferred.includes(k))];
      const {wrap,body}=table('Saved '+this.category+' events', ['Date / time','Event',...keys.map(k=>names[k]),'Symbol','Source','Notes','Actions']);
      wrap.classList.toggle('calendar-row-compact',this.view==='table');cards[0].before(wrap);
      cards.forEach((card,i)=>{const e=events[i];if(!e)return;const row=body.insertRow();row.className='calendar-event calendar-record-row';row.dataset.search=[e.title,e.symbol,e.source_name,e.details,...Object.values(e.metadata||{})].join(' ').toLowerCase();
        cell(row,card.querySelector('.calendar-event-time').textContent,'calendar-row-date');cell(row,e.title,'calendar-row-title');keys.forEach(k=>cell(row,e.metadata?.[k]));cell(row,e.symbol||e.metadata?.ipoSymbol||'—','calendar-row-symbol');
        const source=cell(row,'');if(e.source_url){const a=document.createElement('a');a.href=e.source_url;a.target='_blank';a.rel='noopener';a.textContent=(e.source_name||'View source')+' ↗';source.appendChild(a);}else source.textContent=e.source_name||'Personal event';
        cell(row,e.details||e.metadata?.eventTimeNote||'—','calendar-row-notes');const actions=cell(row,'','calendar-row-actions');actions.appendChild(card.querySelector('.calendar-event-actions'));actions.querySelectorAll('button').forEach(b=>{const label=b.textContent;if(label==='Details'||label==='Price alert'||label==='Open chart ↗'){b.setAttribute('aria-label',label);b.title=label;b.textContent=label==='Details'?'ⓘ':label==='Price alert'?'♧':'⌁';b.classList.add('calendar-row-icon');}});card.remove();
      });
    }
    const docs=[...host.querySelectorAll('.ipo-document')];
    if(docs.length){const {wrap,body}=table('Latest IPO filings',['Company / filing','Filed on','Details','Actions']);docs[0].parentElement.prepend(wrap);
      docs.forEach(card=>{const row=body.insertRow();row.className='ipo-document calendar-record-row';cell(row,card.querySelector('b').textContent,'calendar-row-title');cell(row,card.querySelector('small').textContent.replace(/^Filed /,''),'calendar-row-date');cell(row,card.querySelector('p').textContent,'calendar-row-notes');cell(row,'','calendar-row-actions').appendChild(card.querySelector('.calendar-event-actions'));card.remove();});
    }
    this.filterPage(host);
  };
})();
