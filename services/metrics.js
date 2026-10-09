const { monitorEventLoopDelay } = require('perf_hooks');
const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
const started = Date.now(), counters = Object.create(null), durations = new Map();
function count(name, amount=1) { counters[name] = (counters[name] || 0) + amount; }
function observe(name, milliseconds) { const list = durations.get(name) || []; list.push(milliseconds); if (list.length > 512) list.shift(); durations.set(name, list); }
function snapshot() {
  const latency = Object.fromEntries([...durations].map(([name, list]) => { const sorted=[...list].sort((a,b)=>a-b);return [name,{samples:list.length,p95:sorted[Math.ceil(sorted.length*.95)-1]||0,p99:sorted[Math.ceil(sorted.length*.99)-1]||0}]; }));
  return { uptimeSeconds: (Date.now()-started)/1000, counters, latency, eventLoopP99Ms: loop.percentile(99)/1e6, memory: process.memoryUsage() };
}
function middleware(req,res,next) { const start=performance.now();res.once('finish',()=>{count('http_requests');if(res.statusCode>=500)count('http_errors');observe(req.path.startsWith('/api/admin/')?'admin_api':'customer_api',performance.now()-start);});next(); }
module.exports={count,observe,snapshot,middleware};
