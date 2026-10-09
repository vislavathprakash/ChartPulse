const {Worker,isMainThread,parentPort}=require('worker_threads');
if(!isMainThread){
  const bcrypt=require('bcryptjs');
  parentPort.on('message',async task=>{try{const result=await bcrypt[task.operation](...task.args);parentPort.postMessage({result});}catch{parentPort.postMessage({error:'Password operation failed.'});}});
}else{
  const queue=[],workers=[];let initialized=false;
  function createWorker(){const entry={worker:new Worker(__filename),task:null};entry.worker.unref();workers.push(entry);
    entry.worker.on('message',message=>{const task=entry.task;entry.task=null;if(task){if(message.error)task.reject(new Error(message.error));else task.resolve(message.result);}pump();});
    entry.worker.on('error',()=>{entry.task?.reject(new Error('Password worker failed.'));entry.task=null;});
    entry.worker.on('exit',code=>{const index=workers.indexOf(entry);if(index>=0)workers.splice(index,1);if(code!==0){entry.task?.reject(new Error('Password worker stopped.'));createWorker();pump();}});
    return entry;
  }
  function pump(){for(const entry of workers)if(!entry.task&&queue.length){entry.task=queue.shift();entry.worker.postMessage({operation:entry.task.operation,args:entry.task.args});}}
  function execute(operation,args){if(!initialized){initialized=true;for(let i=0;i<Math.max(1,Math.min(8,Number(process.env.PASSWORD_WORKERS||2)));i++)createWorker();}
    if(queue.length>=Number(process.env.MAX_PASSWORD_JOBS||64))return Promise.reject(Object.assign(new Error('Sign-in service is busy. Please retry shortly.'),{status:503}));
    return new Promise((resolve,reject)=>{queue.push({operation,args,resolve,reject});pump();});
  }
  module.exports={hash:(...args)=>execute('hash',args),compare:(...args)=>execute('compare',args)};
}
