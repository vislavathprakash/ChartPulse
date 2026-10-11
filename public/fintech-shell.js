/* Responsive navigation uses the existing routes and navigation handlers. */
(()=>{
  const toggle=$('sidebarToggle'),sidebar=$('workspaceSidebar'),backdrop=$('sidebarBackdrop');
  const mobile=matchMedia('(max-width: 767px)');
  let previousFocus=null;
  function setOpen(open){
    document.body.classList.toggle('navigation-open',open);
    toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close workspace navigation':'Open workspace navigation');
    backdrop.classList.toggle('hidden',!open);
    sidebar.inert=mobile.matches&&!open;
    if(open){previousFocus=document.activeElement;$('sidebarClose').focus();}
    else if(previousFocus){previousFocus.focus();previousFocus=null;}
  }
  toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
  $('sidebarClose').addEventListener('click',()=>setOpen(false));backdrop.addEventListener('click',()=>setOpen(false));
  sidebar.addEventListener('click',e=>{if(mobile.matches&&e.target.closest('[data-page],#logoutBtn'))setOpen(false);});
  document.addEventListener('keydown',e=>{
    if(!document.body.classList.contains('navigation-open'))return;
    if(e.key==='Escape'){e.preventDefault();setOpen(false);}
    if(e.key==='Tab'){const controls=[...sidebar.querySelectorAll('button,a,input')].filter(el=>!el.disabled&&el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  mobile.addEventListener('change',()=>setOpen(false));setOpen(false);
  const priorNavigate=navigate;
  navigate=function(page){const previousPage=state.currentPage;priorNavigate(page);document.querySelectorAll('.nav-item').forEach(b=>{if(b.dataset.page===state.currentPage)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(previousPage!==state.currentPage)window.scrollTo({top:0,behavior:'instant'});};
  $('queryInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();runQuery();}});
})();
