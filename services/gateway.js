const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');
const metrics = require('./metrics');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function allowedOrigin(req) {
  const configured=(process.env.ALLOWED_ORIGINS||process.env.RENDER_EXTERNAL_URL||'').split(',').filter(Boolean);
  const origin=req.headers.origin;
  return Boolean(origin&&(configured.length?configured.includes(origin):origin===`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`));
}
function installGateway({server,app,runtime,pool,requireAuth,asyncRoute,entitled=()=>true}) {
  app.post('/api/stream-ticket',requireAuth,asyncRoute(async(req,res)=>{
    if(!entitled())return res.status(503).json({error:'Market-data display permission is not enabled.'});
    if(req.headers.origin&&!allowedOrigin(req))return res.status(403).json({error:'Origin is not allowed.'});
    const token=crypto.randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO socket_tickets(token_hash,user_id,session_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '20 seconds')",[hash(token),req.session.user.id,req.sessionID]);
    res.set('Cache-Control','no-store');res.json({ticket:token,url:process.env.STREAM_URL||null,expiresIn:20});
  }));
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});const clients=new Set();let pending=null;
  server.on('upgrade',(req,socket,head)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/stream'||!allowedOrigin(req)){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    if(clients.size>=Number(process.env.MAX_GATEWAY_CONNECTIONS||10000)){socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function send(ws,data){if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>Number(process.env.SOCKET_BUFFER_LIMIT||262144)){metrics.count('slow_socket_disconnects');ws.close(1013,'Resynchronize');return;}ws.send(JSON.stringify(data));}
  function snapshot(ws){send(ws,{type:'snapshot',sequence:runtime.sequence,epoch:runtime.sourceEpoch,receivedAt:runtime.marketRuntime.lastTickAt,simulated:runtime.isSimulated,quotes:runtime.getQuotes().filter(q=>ws.symbols.has(q.symbol))});}
  wss.on('connection',ws=>{
    clients.add(ws);metrics.count('socket_connections');ws.alive=true;ws.symbols=new Set();ws.chartSymbols=[];ws.interval='1m';ws.rate={at:Date.now(),count:0};
    const timeout=setTimeout(()=>{if(!ws.userId)ws.close(1008,'Authentication required');},5000);
    ws.on('error',()=>metrics.count('socket_errors'));ws.on('pong',()=>ws.alive=true);
    ws.on('close',()=>{clearTimeout(timeout);clients.delete(ws);metrics.count('socket_closed');});
    ws.on('message',async raw=>{
      if(ws.handling){ws.close(1008,'Request already pending');return;}ws.handling=true;
      try{
        if(Date.now()-ws.rate.at>1000)ws.rate={at:Date.now(),count:0};if(++ws.rate.count>10){ws.close(1008,'Too many requests');return;}
        const message=JSON.parse(raw.toString());
        if(!ws.userId){
          if(!entitled()){ws.close(1008,'Market data not entitled');return;}
          if(message.type!=='authenticate'||typeof message.ticket!=='string'||message.ticket.length>100){ws.close(1008,'Authentication required');return;}
          const {rows}=await pool.query('DELETE FROM socket_tickets WHERE token_hash=$1 AND expires_at>NOW() RETURNING user_id,session_id',[hash(message.ticket)]);
          if(!rows[0]){ws.close(1008,'Invalid ticket');return;}
          const {rows:users}=await pool.query("SELECT u.id FROM users u JOIN session s ON s.sid=$2 WHERE u.id=$1 AND u.active=TRUE AND u.role='customer' AND s.expire>NOW() AND s.sess->>'portal'='customer' AND (s.sess->'user'->>'id')::int=u.id",[rows[0].user_id,rows[0].session_id]);
          if(!users[0]){ws.close(1008,'Session expired');return;}ws.userId=rows[0].user_id;ws.sessionId=rows[0].session_id;clearTimeout(timeout);send(ws,{type:'ready',sequence:runtime.sequence,epoch:runtime.sourceEpoch});return;
        }
        if(message.type==='subscribe'){
          if(!Array.isArray(message.symbols)||message.symbols.length>50||message.symbols.some(s=>typeof s!=='string'||!runtime.quotes.has(s))||!['1m','2m','3m','5m','10m','15m','30m','1h','2h','4h','1D'].includes(message.interval||'1m')){send(ws,{type:'error',message:'Choose up to 50 active symbols and a supported interval.'});return;}
          const chartSymbols=message.charts??message.symbols.slice(0,1);
          if(!Array.isArray(chartSymbols)||chartSymbols.length>2||chartSymbols.some(s=>!message.symbols.includes(s))){send(ws,{type:'error',message:'Choose up to two chart symbols from your subscription.'});return;}
          ws.symbols=new Set(message.symbols);ws.chartSymbols=chartSymbols;ws.awaitingUniverse=!ws.symbols.size&&!runtime.quotes.size;ws.interval=message.interval||'1m';snapshot(ws);
        } else if(message.type==='resync')snapshot(ws);
        else if(message.type==='ping')send(ws,{type:'pong',at:Date.now()});
        else send(ws,{type:'error',message:'Unknown message.'});
      }catch(err){metrics.count('socket_message_errors');ws.close(1008,'Invalid message');}finally{ws.handling=false;}
    });
  });
  const onMarket=event=>{pending=event;};runtime.on('market',onMarket);
  const onPrivate=(userId,event)=>{for(const ws of clients)if(ws.userId===userId){if(event.type==='revoked'&&(!event.sessionId||event.sessionId===ws.sessionId))ws.close(1008,'Session revoked');else send(ws,event);}};runtime.on('private',onPrivate);
  // Coalesce display updates only. Durable evaluators use every committed market event.
  const flush=runtime.every(250,async()=>{
    if(!pending)return;const event=pending;pending=null;metrics.observe('quote_age_at_gateway_ms',Date.now()-Date.parse(event.receivedAt));const batches=new Map(),candleCache=new Map();const all=runtime.getQuotes();const summary={symbolCount:all.length,decliningCount:all.filter(q=>q.change_pct<=-3).length,movers:all.filter(q=>q.change_pct<0).sort((a,b)=>a.change_pct-b.change_pct).slice(0,4)};
    for(const ws of clients){if(ws.userId&&ws.awaitingUniverse&&all.length){ws.awaitingUniverse=false;send(ws,{type:'available',sequence:runtime.sequence});}if(!ws.userId||!ws.symbols.size)continue;const key=[...ws.symbols].sort().join(',')+'|'+ws.interval+'|'+ws.chartSymbols.join(',');
      if(!batches.has(key)){
        const symbols=[...ws.symbols],quotes=symbols.map(s=>runtime.quotes.get(s)).filter(Boolean);
        const candles=runtime.simulation?ws.chartSymbols.map(symbol=>{const key=symbol+':'+ws.interval;if(!candleCache.has(key))candleCache.set(key,{symbol,bars:runtime.simulation.history(symbol,ws.interval).slice(-2)});return candleCache.get(key);}):[];
        batches.set(key,{type:'market',sequence:event.sequence,epoch:event.epoch,receivedAt:event.receivedAt,simulated:runtime.isSimulated,quotes,candles,summary,interval:ws.interval});
      }send(ws,batches.get(key));
    }metrics.count('socket_batches',batches.size);
  });
  const heartbeat=runtime.every(15000,async()=>{
    for(const ws of clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();if(ws.userId)send(ws,{type:'status',paused:runtime.simulation?.paused||false,stale:!runtime.marketRuntime.lastTickAt||Date.now()-Date.parse(runtime.marketRuntime.lastTickAt)>15000});}
    const authenticated=[...clients].filter(ws=>ws.userId);const ids=[...new Set(authenticated.map(ws=>ws.userId))];const sids=[...new Set(authenticated.map(ws=>ws.sessionId))];
    const active=new Set(),sessions=new Set();
    for(let i=0;i<ids.length;i+=500){const {rows}=await pool.query("SELECT id FROM users WHERE id=ANY($1::int[]) AND active=TRUE AND role='customer'",[ids.slice(i,i+500)]);rows.forEach(u=>active.add(u.id));}
    for(let i=0;i<sids.length;i+=500){const {rows}=await pool.query('SELECT sid FROM session WHERE sid=ANY($1::text[]) AND expire>NOW()',[sids.slice(i,i+500)]);rows.forEach(s=>sessions.add(s.sid));}
    for(const ws of authenticated)if(!active.has(ws.userId)||!sessions.has(ws.sessionId))ws.close(1008,'Session revoked');
    await pool.query('DELETE FROM socket_tickets WHERE expires_at<NOW()');
  });
  return {clients,wss,async close(){clearInterval(flush);clearInterval(heartbeat);runtime.off('market',onMarket);runtime.off('private',onPrivate);for(const ws of clients)ws.close(1001,'Server restarting');await new Promise(resolve=>wss.close(resolve));}};
}
module.exports={installGateway,allowedOrigin};
