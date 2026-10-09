const crypto=require('crypto');
function requestLimits(runtime){const local=new Map();
  return async(req,res,next)=>{try{
    if(!req.path.startsWith('/api/'))return next();
    if(req.body?.query!=null&&(typeof req.body.query!=='string'||req.body.query.length>2000))return res.status(400).json({error:'Use a query with at most 2,000 characters.'});
    if(req.body?.password!=null&&(typeof req.body.password!=='string'||req.body.password.length>200))return res.status(400).json({error:'Password is too long.'});
    if(req.body?.email!=null&&(typeof req.body.email!=='string'||req.body.email.length>254))return res.status(400).json({error:'Email address is too long.'});
    const auth=['/api/login','/api/admin/login','/api/register'].includes(req.path);const limit=auth?30:300;
    const identity=crypto.createHash('sha256').update(req.session?.user?String(req.session.user.id):String(req.ip)).digest('hex').slice(0,32);const window=Math.floor(Date.now()/60000),key=runtime.namespace+':limit:'+(auth?'auth':'api')+':'+identity+':'+window;
    let count;
    if(runtime.redis?.isReady){count=Number(await runtime.redis.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],65) end;return n",{keys:[key],arguments:[]}));}
    else {if(local.size>10000)for(const [k,v]of local)if(v.window<window)local.delete(k);if(local.size>20000)return res.status(503).json({error:'Request limiter capacity reached.'});const entry=local.get(key)||{window,count:0};count=++entry.count;local.set(key,entry);}
    if(count>limit){res.set('Retry-After','60');return res.status(429).json({error:'Too many requests. Please retry shortly.'});}
    next();
  }catch(err){next(err);}};
}
module.exports={requestLimits};
