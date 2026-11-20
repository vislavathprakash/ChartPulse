/* Personal notification formatting. Previews never enqueue or send messages. */
(()=>{
  const fields={email:[['emailSubject','Email subject','input'],['emailHeading','Card heading','input'],['emailBody','Message body','textarea'],['emailFooter','Footer','textarea'],['emailCta','Button label','input']],whatsapp:[['whatsappSymbol','Stock / market field · output up to 60 characters','input'],['whatsappTitle','Alert name field · output up to 100 characters','input'],['whatsappDetails','Trigger details field · output up to 500 characters','textarea']]};
  const settingsCard=document.createElement('section');settingsCard.className='panel settings-card';settingsCard.innerHTML='<h2>Notification templates</h2><p class="muted">Personalise your alert emails and WhatsApp alert details. Preview the message before saving.</p><button type="button" class="button secondary" data-account-section="notifications">Edit notification templates</button>';
  document.querySelector('#page-settings .settings-grid').append(settingsCard);
  async function mount(host){
    const owner=state.user?.id;let channel='email',data,draft,dirty=false,field='emailBody',previewToken=0,delay,saving=false;
    const current=()=>host.isConnected&&state.user?.id===owner;
    host.innerHTML='<p class="muted" role="status">Loading notification templates…</p>';
    try{data=await api('/api/account/notification-templates');if(!current())return;draft={...data.config};}
    catch(error){if(current())host.innerHTML=`<h2>Notification templates</h2><p role="alert">${html(error.message)}</p><button class="button secondary" type="button" data-template-reload>Try again</button>`;host.querySelector('[data-template-reload]')?.addEventListener('click',()=>mount(host));return;}
    host.innerHTML=`<div class="nt-heading"><div><h2>Notification templates</h2><p class="muted">Your format, applied to your alert notifications.</p></div><span class="nt-save-state" role="status">Saved format</span></div><div class="nt-channel-tabs" role="tablist" aria-label="Notification channel"><button type="button" role="tab" id="nt-email-tab" aria-selected="true" data-nt-channel="email">${terminalIcon('alerts')}Email</button><button type="button" role="tab" id="nt-whatsapp-tab" aria-selected="false" tabindex="-1" data-nt-channel="whatsapp">${terminalIcon('alerts')}WhatsApp</button></div><div class="nt-layout"><section class="nt-edit" role="tabpanel" aria-labelledby="nt-email-tab"><div class="nt-channel-note"></div><form class="nt-form"></form><details class="nt-placeholder-help"><summary>Insert alert information</summary><p>Select a field, then click a placeholder to insert it.</p><div class="nt-tokens">${Object.entries(data.tokens).map(([key,label])=>`<button type="button" data-nt-token="${key}" title="${html(label)}">{{${key}}}</button>`).join('')}</div></details><div class="nt-form-actions"><button class="button primary" type="button" data-nt-save>Save templates</button><button class="button secondary" type="button" data-nt-defaults>Restore default draft</button></div><p class="nt-status" role="status"></p><p class="nt-small">Save to apply changes. Retries retain the format prepared on their first attempt. Template edits do not change delivery consent or channel selections.</p></section><section class="nt-preview" aria-label="Message preview"><div class="nt-preview-heading"><h3>Message preview</h3><span>Preview only · nothing sent</span></div><label>Preview alert<select class="nt-alert"><option value="">Illustrative sample</option>${data.alerts.map(a=>`<option value="${a.id}">${html(a.title.slice(0,70))} · ${html(a.symbol||'Market')}</option>`).join('')}</select></label><button class="button secondary nt-preview-refresh" type="button" data-nt-preview>Refresh preview</button><div class="nt-preview-errors" role="alert"></div><div class="nt-email-subject"></div><iframe class="nt-email-frame" title="Alert email preview" sandbox=""></iframe><div class="nt-whatsapp-preview" hidden><div class="nt-whatsapp-meta"></div><div class="nt-message-bubble"></div><p class="nt-small">The surrounding wording belongs to your Meta-approved template. To change that wording or add more variables, edit the template in WhatsApp Manager and complete Meta’s review.</p><a href="https://business.facebook.com/latest/whatsapp_manager/message_templates" target="_blank" rel="noopener noreferrer">Open WhatsApp Manager ↗</a></div><div class="nt-preview-warnings"></div></section></div>`;
    const form=host.querySelector('.nt-form'),note=host.querySelector('.nt-channel-note'),status=host.querySelector('.nt-status'),stateLabel=host.querySelector('.nt-save-state'),frame=host.querySelector('iframe');
    function display(){
      form.innerHTML=fields[channel].map(([key,label,type])=>`<label>${label}${type==='textarea'?`<textarea name="${key}" maxlength="${data.limits[key]}" rows="${key==='emailBody'?7:4}" required>${html(draft[key])}</textarea>`:`<input name="${key}" maxlength="${data.limits[key]}" required value="${html(draft[key])}">`}</label>`).join('');
      note.innerHTML=channel==='email'?'<p>Customise the subject, heading, message and footer. Email is delivered as a formatted card with a plain-text alternative.</p>':`<div class="nt-provider-template"><b>Configured Meta template</b><span>${html(data.whatsapp.name)} · ${html(data.whatsapp.language)}</span></div><p>Edit the three dynamic values below. Meta’s fixed template wording stays as approved. WhatsApp variable text is sent on one line; long values are shortened to fit.</p>`;
      host.querySelector('.nt-edit').setAttribute('aria-labelledby','nt-'+channel+'-tab');
      host.querySelectorAll('[data-nt-channel]').forEach(b=>{const yes=b.dataset.ntChannel===channel;b.setAttribute('aria-selected',String(yes));b.tabIndex=yes?0:-1;});
      frame.hidden=channel!=='email';host.querySelector('.nt-email-subject').hidden=channel!=='email';host.querySelector('.nt-whatsapp-preview').hidden=channel!=='whatsapp';field=channel==='email'?'emailBody':'whatsappDetails';
      void preview();
    }
    function changed(){dirty=true;stateLabel.textContent='Unsaved changes';stateLabel.classList.add('nt-unsaved');status.textContent='';clearTimeout(delay);delay=setTimeout(preview,650);}
    form.addEventListener('input',event=>{if(!event.target.name)return;draft[event.target.name]=event.target.value;changed();});
    form.addEventListener('focusin',event=>{if(event.target.name)field=event.target.name;});
    async function preview(){
      const token=++previewToken,errorBox=host.querySelector('.nt-preview-errors');
      try{const result=await api('/api/account/notification-templates/preview',{method:'POST',body:JSON.stringify({config:draft,alertId:host.querySelector('.nt-alert').value||null})});if(!current()||token!==previewToken)return;
        errorBox.textContent='';frame.srcdoc=result.email.html;
        const subject=host.querySelector('.nt-email-subject');subject.replaceChildren();const label=document.createElement('b');label.textContent='Subject';const text=document.createElement('span');text.textContent=result.email.subject;subject.append(label,text);
        host.querySelector('.nt-message-bubble').textContent=result.whatsapp.body;
        host.querySelector('.nt-whatsapp-meta').textContent=result.whatsapp.name+' · '+result.whatsapp.language;
        host.querySelector('.nt-preview-warnings').textContent=result.warnings.join(' ');
      }catch(error){if(current()&&token===previewToken)errorBox.textContent=error.message;}
    }
    host.addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.ntChannel){channel=button.dataset.ntChannel;display();}
      if(button.dataset.ntToken){const input=form.elements[field];if(!input)return;input.focus();input.setRangeText('{{'+button.dataset.ntToken+'}}',input.selectionStart??input.value.length,input.selectionEnd??input.value.length,'end');draft[field]=input.value;changed();}
      if(button.hasAttribute('data-nt-preview'))void preview();
      if(button.hasAttribute('data-nt-defaults')){draft={...data.defaults};changed();display();status.textContent='Default draft restored. Save templates to apply it.';}
      if(button.hasAttribute('data-nt-save')){
        if(saving||!form.reportValidity())return;saving=true;button.disabled=true;button.textContent='Saving…';clearTimeout(delay);status.textContent='';
        try{const result=await api('/api/account/notification-templates',{method:'PUT',body:JSON.stringify({config:draft,version:data.version})});if(!current())return;data.version=result.version;data.config={...result.config};draft={...result.config};dirty=false;stateLabel.textContent='Saved format';stateLabel.classList.remove('nt-unsaved');status.textContent='Templates saved. New deliveries will use this format.';void preview();toast('Notification templates saved.');}
        catch(error){if(current())status.textContent=error.message;}
        finally{saving=false;button.disabled=false;button.textContent='Save templates';}
      }
    });
    host.querySelector('.nt-alert').addEventListener('change',preview);
    host.querySelector('.nt-channel-tabs').addEventListener('keydown',event=>{const buttons=[...host.querySelectorAll('[data-nt-channel]')],i=buttons.indexOf(event.target);if(i<0)return;const n={ArrowRight:1-i,ArrowLeft:1-i,Home:0,End:1}[event.key];if(n===undefined)return;event.preventDefault();buttons[n].click();buttons[n].focus();});
    display();
  }
  window.notificationTemplates={mount};
})();
