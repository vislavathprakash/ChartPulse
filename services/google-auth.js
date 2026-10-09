const crypto=require('crypto');
const {OAuth2Client}=require('google-auth-library');
const {applicationOrigin,hashToken}=require('./email');
function googleReady(){return Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&(process.env.APP_BASE_URL||process.env.RENDER_EXTERNAL_URL));}
function installGoogleAuth({app,pool,asyncRoute,requireAuth,publicUser,regenerateSession}) {
  const save=req=>new Promise((resolve,reject)=>req.session.save(err=>err?reject(err):resolve()));
  function client(){return new OAuth2Client({clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,redirectUri:applicationOrigin()+'/api/auth/google/callback',transporterOptions:{timeout:8000}});}
  const start=async (req,res,link)=>{
    if(!googleReady())return res.status(503).json({error:'Google sign-in is not configured.'});
    const state=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
    await pool.query('DELETE FROM google_login_flows WHERE expires_at<NOW() OR session_id=$1',[req.sessionID]);
    req.session.googleFlow=hashToken(state);await save(req);
    await pool.query('INSERT INTO google_login_flows(state_hash,session_id,nonce,verifier,link_user_id,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL \'10 minutes\')',[hashToken(state),req.sessionID,nonce,verifier,link?req.session.user.id:null]);
    const url=client().generateAuthUrl({scope:['openid','email','profile'],state,nonce,prompt:'select_account',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    res.set('Cache-Control','no-store');res.redirect(url);
  };
  app.get('/api/auth/google',asyncRoute((req,res)=>start(req,res,false)));
  app.get('/api/auth/google/link',requireAuth,asyncRoute((req,res)=>start(req,res,true)));
  app.get('/api/auth/google/callback',asyncRoute(async(req,res)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
    const fail=code=>res.redirect('/app/login?auth_error='+code);
    if(!googleReady())return fail('not_configured');
    if(typeof req.query.state!=='string'||req.query.state.length>200||req.session.googleFlow!==hashToken(req.query.state))return fail('expired');
    const {rows}=await pool.query('DELETE FROM google_login_flows WHERE state_hash=$1 AND session_id=$2 AND expires_at>NOW() RETURNING *',[hashToken(req.query.state),req.sessionID]);
    delete req.session.googleFlow;await save(req);
    const flow=rows[0];if(!flow)return fail('expired');
    if(req.query.error)return fail('cancelled');
    if(typeof req.query.code!=='string'||req.query.code.length>4096)return fail('invalid');
    let identity;
    try{
      const oauth=client();const {tokens}=await oauth.getToken({code:req.query.code,codeVerifier:flow.verifier});
      if(!tokens.id_token)return fail('invalid');
      const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:process.env.GOOGLE_CLIENT_ID});identity=ticket.getPayload();
      if(!identity?.sub||identity.nonce!==flow.nonce||identity.email_verified!==true||typeof identity.email!=='string'||identity.email.length>254||!/^\S+@\S+\.\S+$/.test(identity.email))return fail('invalid');
    }catch{return fail('invalid');}
    const email=identity.email.toLowerCase().trim();let user;
    try{await pool.transaction(async()=>{
      if(flow.link_user_id){
        if(req.session.portal!=='customer'||req.session.user?.id!==flow.link_user_id)throw new Error('expired');
        const result=await pool.query("UPDATE users SET google_sub=$1,email_verified=TRUE WHERE id=$2 AND email=$3 AND role='customer' AND active=TRUE AND (google_sub IS NULL OR google_sub=$1) RETURNING *",[identity.sub,flow.link_user_id,email]);
        user=result.rows[0];if(!user)throw new Error('link_mismatch');
      }else{
        user=(await pool.query('SELECT * FROM users WHERE google_sub=$1',[identity.sub])).rows[0];
        if(!user){
          if((await pool.query('SELECT id FROM users WHERE email=$1',[email])).rows.length)throw new Error('link_required');
          user=(await pool.query("INSERT INTO users(email,name,password_hash,role,google_sub,email_verified,webhook_token) VALUES($1,$2,NULL,'customer',$3,TRUE,$4) RETURNING *",[email,String(identity.name||email.split('@')[0]).slice(0,120),identity.sub,crypto.randomBytes(32).toString('hex')])).rows[0];
        }
        if(!user.active||user.role!=='customer')throw new Error('unavailable');
      }
    });}catch(err){return fail(['expired','link_mismatch','link_required','unavailable'].includes(err.message)?err.message:'account_conflict');}
    await regenerateSession(req);req.session.portal='customer';req.session.user=publicUser(user);await save(req);
    res.redirect('/app?google_connected=1');
  }));
}
module.exports={googleReady,installGoogleAuth};
