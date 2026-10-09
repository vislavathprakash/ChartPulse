// Optional durable journal export. The database checkpoint is the launch evaluator's source of truth.
async function startKafkaRelay(runtime){
  if(!process.env.KAFKA_BROKERS)throw new Error('KAFKA_BROKERS is required for the relay role.');
  const {Kafka}=require('kafkajs');const kafka=new Kafka({clientId:'chartpulse-relay',brokers:process.env.KAFKA_BROKERS.split(','),ssl:process.env.KAFKA_SSL==='true',
    ...(process.env.KAFKA_USERNAME?{sasl:{mechanism:process.env.KAFKA_SASL_MECHANISM||'plain',username:process.env.KAFKA_USERNAME,password:process.env.KAFKA_PASSWORD}}:{})});
  const producer=kafka.producer({idempotent:true,maxInFlightRequests:1,allowAutoTopicCreation:false});await producer.connect();runtime.kafkaProducer=producer;
  const name=runtime.namespace+':kafka-relay';
  runtime.every(100,async()=>{
    const {rows:checkpoint}=await runtime.pool.query('SELECT sequence FROM consumer_checkpoints WHERE name=$1',[name]);const sequence=Number(checkpoint[0]?.sequence||0);
    const {rows}=await runtime.pool.query("SELECT id,event_key,payload FROM market_events WHERE id>$1 AND payload->>'namespace'=$2 ORDER BY id LIMIT 100",[sequence,runtime.namespace]);
    for(const event of rows){await producer.send({topic:process.env.KAFKA_MARKET_TOPIC||'chartpulse-market',acks:-1,messages:event.payload.quotes.map((q,index)=>({key:q.symbol,value:JSON.stringify({eventId:event.event_key+':'+index,sequence:Number(event.id),namespace:runtime.namespace,receivedAt:event.payload.receivedAt,quote:q})}))});
      await runtime.pool.query('INSERT INTO consumer_checkpoints(name,sequence) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET sequence=EXCLUDED.sequence,updated_at=NOW()',[name,event.id]);}
  });
}
module.exports={startKafkaRelay};
