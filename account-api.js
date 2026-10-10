const bcrypt=require('./services/passwords');
function installAccount({app,pool,requireAuth,asyncRoute,publicUser,regenerateSession,runtime}) {
  app.use('/api/account',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const audit=async(id,action)=>pool.query('INSERT INTO account_activity(user_id,action) VALUES($1,$2)',[id,action]);
  app.use((req,res,next)=>{res.on('finish',()=>{if(req.session?.portal==='customer'&&req.session.user&&((res.statusCode<300&&req.method==='POST'&&['/api/login','/api/register'].includes(req.path))||(res.statusCode===302&&req.path==='/api/auth/google/callback'&&String(res.getHeader('Location')||'').startsWith('/app?google_connected=1'))))audit(req.session.user.id,req.path==='/api/register'?'Account created':req.path.includes('google')?'Signed in with Google':'Signed in').catch(console.error);});next();});
  app.get('/api/account',requireAuth,asyncRoute(async(req,res)=>{
    const id=req.session.user.id;
    const {rows:[user]}=await pool.query('SELECT * FROM users WHERE id=$1',[id]);
    const {rows:[settings]}=await pool.query('SELECT * FROM account_settings WHERE user_id=$1',[id]);
    const {rows:activity}=await pool.query('SELECT id,action,created_at FROM account_activity WHERE user_id=$1 ORDER BY id DESC LIMIT 50',[id]);
    const {rows:[usage]}=await pool.query(`SELECT (SELECT COUNT(*) FROM watchlists WHERE user_id=$1)::int AS watchlists,(SELECT COUNT(*) FROM saved_queries WHERE user_id=$1)::int AS screeners,(SELECT COUNT(*) FROM technical_alerts WHERE user_id=$1)::int AS chart_alerts,(SELECT COUNT(*) FROM calendar_reminders WHERE user_id=$1)::int AS event_alerts`,[id]);
    res.json({user:{...publicUser(user),createdAt:user.created_at,hasPassword:Boolean(user.password_hash)},settings:settings||{theme:'midnight',timezone:'Asia/Kolkata',bio:'',city:''},subscription:{plan:'Free',price:0,currency:'INR',billingEnabled:false,watchlistLimit:5},usage,activity});
  }));
  app.patch('/api/account/profile',requireAuth,asyncRoute(async(req,res)=>{
    const {name,city='',bio='',timezone='Asia/Kolkata'}=req.body;
    if(typeof name!=='string'||!name.trim()||name.length>80||typeof city!=='string'||city.length>100||typeof bio!=='string'||bio.length>500)return res.status(400).json({error:'Enter a name up to 80 characters, city up to 100 and bio up to 500.'});
    try{if(typeof timezone!=='string'||timezone.length>80)throw new Error();new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{return res.status(400).json({error:'Choose a valid timezone.'});}
    const id=req.session.user.id;
    await pool.query(`INSERT INTO account_settings(user_id,city,bio,timezone) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET city=$2,bio=$3,timezone=$4`,[id,city.trim(),bio.trim(),timezone]);
    const {rows:[row]}=await pool.query('UPDATE users SET name=$2 WHERE id=$1 RETURNING *',[id,name.trim()]);
    req.session.user=publicUser(row);await audit(id,'Profile updated');res.json({user:req.session.user});
  }));
  app.patch('/api/account/appearance',requireAuth,asyncRoute(async(req,res)=>{
    if(!['midnight','light','forest'].includes(req.body.theme))return res.status(400).json({error:'Choose an available theme.'});
    await pool.query(`INSERT INTO account_settings(user_id,theme) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET theme=$2`,[req.session.user.id,req.body.theme]);
    await audit(req.session.user.id,'Appearance changed to '+req.body.theme);res.json({theme:req.body.theme});
  }));
  app.post('/api/account/password',requireAuth,asyncRoute(async(req,res)=>{
    const {currentPassword,newPassword}=req.body;
    if(typeof currentPassword!=='string'||Buffer.byteLength(currentPassword)>200||typeof newPassword!=='string'||newPassword.length<10||Buffer.byteLength(newPassword)>72)return res.status(400).json({error:'Use a new password with at least 10 characters and at most 72 bytes.'});
    const id=req.session.user.id;const {rows:[row]}=await pool.query('SELECT * FROM users WHERE id=$1',[id]);
    if(!row.password_hash)return res.status(400).json({error:'This account uses Google sign-in. Manage your password through Google.'});
    if(!await bcrypt.compare(currentPassword,row.password_hash))return res.status(400).json({error:'Current password is incorrect.'});
    if(await bcrypt.compare(newPassword,row.password_hash))return res.status(400).json({error:'Choose a different new password.'});
    const hash=await bcrypt.hash(newPassword,12);
    const changed=await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1 AND password_hash=$3 RETURNING id',[id,hash,row.password_hash]);
    if(!changed.rows.length)return res.status(409).json({error:'Your password changed in another session. Sign in again.'});
    const oldSid=req.sessionID;
    await pool.query(`DELETE FROM session WHERE sess::jsonb->'user'->>'id'=$1 AND sess::jsonb->>'portal'='customer'`,[String(id)]);
    await regenerateSession(req);req.session.portal='customer';req.session.user=publicUser(row);
    runtime.notify(id,{type:'revoked',sessionId:oldSid});await audit(id,'Password changed; previous sessions signed out');res.json({ok:true});
  }));
  return {setup:async()=>{
    await pool.query(`CREATE TABLE IF NOT EXISTS account_settings(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,theme TEXT NOT NULL DEFAULT 'midnight',timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',city TEXT NOT NULL DEFAULT '',bio TEXT NOT NULL DEFAULT '')`);
    await pool.query(`CREATE TABLE IF NOT EXISTS account_activity(id BIGSERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,action TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query('CREATE INDEX IF NOT EXISTS account_activity_user_idx ON account_activity(user_id,id DESC)');
  }};
}
module.exports={installAccount};
