const integrationQuery=new URLSearchParams(location.search);
let pendingEmailToken=integrationQuery.get('email_verify');
const googleErrors={not_configured:'Google sign-in is not configured yet.',expired:'Google sign-in expired. Try again.',cancelled:'Google sign-in was cancelled.',invalid:'Google could not verify this sign-in. Try again.',link_required:'This email already has a password account. Sign in with your password, then connect Google in Workspace settings.',link_mismatch:'Choose the Google account with the same email as your ChartPulse account.',unavailable:'This account cannot access the customer portal.',account_conflict:'This Google account could not be connected.'};
window.syncIntegrationPreferences=function(){
  const me=state.user,meta=state.meta||{};
  $('googleSignIn').disabled=!meta.googleReady;
  $('googleSignInHint').textContent=meta.googleReady?'Use Google to sign in or create your customer account.':'Google sign-in is awaiting provider configuration.';
  if(!me)return;
  if(integrationQuery.has('auth_error')){toast(googleErrors[integrationQuery.get('auth_error')]||'Google sign-in failed.',true);integrationQuery.delete('auth_error');}
  $('emailAddress').textContent=me.email;
  $('emailBadge').textContent=!meta.emailReady?'NOT CONFIGURED':meta.emailSimulated?'SIMULATED ALERTS':'CONFIGURED';
  $('emailVerificationStatus').textContent=me.emailVerified?'Email verified':'Email not verified';
  $('emailConsentInput').checked=me.emailOptIn;
  $('emailConsentInput').disabled=!me.emailVerified;
  $('verifyEmailRequest').classList.toggle('hidden',me.emailVerified);
  $('verifyEmailRequest').disabled=!meta.emailReady;
  $('emailModeHint').textContent=meta.emailSimulated?'Alert emails are simulated. Verification emails use your configured email provider.':'Email alerts use your verified account address. Provider acceptance does not guarantee inbox delivery.';
  $('confirmEmailVerification').classList.toggle('hidden',!pendingEmailToken);
  $('connectGoogle').disabled=!meta.googleReady||me.googleLinked;
  $('connectGoogle').textContent=me.googleLinked?'Google connected':'Connect Google';
  if(pendingEmailToken){navigate('settings');toast('Confirm email verification in Workspace settings.');}
};
$('googleSignIn').onclick=()=>location.assign('/api/auth/google');
$('connectGoogle').onclick=()=>location.assign('/api/auth/google/link');
$('emailPrefsForm').onsubmit=async event=>{event.preventDefault();try{
  const result=await api('/api/email/preferences',{method:'PATCH',body:JSON.stringify({emailOptIn:$('emailConsentInput').checked})});
  state.user=result.user;syncIntegrationPreferences();toast('Email alert preferences saved.');
}catch(err){toast(err.message,true);}};
$('verifyEmailRequest').onclick=async()=>{const button=$('verifyEmailRequest');button.disabled=true;try{
  const result=await api('/api/email/verification',{method:'POST'});toast(result.message||'Email already verified.');
}catch(err){toast(err.message,true);}finally{button.disabled=!state.meta?.emailReady;}};
$('confirmEmailVerification').onclick=async()=>{try{
  const result=await api('/api/email/verify',{method:'POST',body:JSON.stringify({token:pendingEmailToken})});pendingEmailToken=null;
  state.user=result.user;syncIntegrationPreferences();toast('Email verified. You can now enable email alerts.');
}catch(err){toast(err.message,true);}};
if(integrationQuery.has('auth_error')){
  $('authError').textContent=googleErrors[integrationQuery.get('auth_error')]||'Google sign-in failed. Try again.';$('authError').classList.remove('hidden');
}
