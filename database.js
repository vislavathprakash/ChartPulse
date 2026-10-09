const { EventEmitter } = require('events');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

function createPool() {
  if (process.env.DATABASE_URL) {
    const { Pool, Client } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 10), connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
      ssl: process.env.PG_SSL === 'false' ? false : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false });
    const context = new AsyncLocalStorage(), query = pool.query.bind(pool);
    pool.query = (...args) => context.getStore() ? context.getStore().query(...args) : query(...args);
    pool.transaction = async fn => {
      if (context.getStore()) return fn();
      const client = await pool.connect();
      try { await client.query('BEGIN'); const result = await context.run(client, fn); await client.query('COMMIT'); return result; }
      catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    };
    pool.leadership = async key => {
      const client = new Client({connectionString:process.env.LEADER_DATABASE_URL||process.env.DATABASE_URL,ssl:process.env.PG_SSL==='false'?false:process.env.NODE_ENV==='production'?{rejectUnauthorized:process.env.PG_SSL_REJECT_UNAUTHORIZED!=='false'}:false});
      await client.connect();
      client.on('error', () => { console.error('Leadership connection lost.'); process.exit(1); });
      const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [key]);
      if (!rows[0].acquired) { await client.end(); return null; }
      return async () => { await client.query('SELECT pg_advisory_unlock($1)', [key]); await client.end(); };
    };
    pool.distributed = true;
    return pool;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production.');
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite(path.resolve(process.env.LOCAL_DATABASE_PATH || 'work/local-db'));
  const pool = new EventEmitter();
  pool.query = (sql, values, callback) => {
    if (typeof values === 'function') { callback = values; values = undefined; }
    if (typeof sql === 'object') { values = sql.values; sql = sql.text; }
    const operation = (async () => {
      const result = !values?.length && sql.split(';').filter(s => s.trim()).length > 1 ? (await db.exec(sql.replace('WITH (OIDS=FALSE)', ''))).at(-1) : await db.query(sql, values);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    })();
    if (callback) operation.then(result => callback(null, result), callback);
    return operation;
  };
  // Queue all local queries so requests cannot enter another request's transaction.
  const context = new AsyncLocalStorage(), rawQuery = pool.query.bind(pool); let tail = Promise.resolve();
  const enqueue = fn => { const result = tail.then(fn); tail = result.catch(() => {}); return result; };
  pool.query = (sql, values, callback) => {
    if (typeof values === 'function') { callback = values; values = undefined; }
    const operation = context.getStore() ? rawQuery(sql, values) : enqueue(() => rawQuery(sql, values));
    if (callback) operation.then(r => callback(null, r), callback); return operation;
  };
  pool.transaction = fn => context.getStore() ? fn() : enqueue(() => context.run(true, async () => {
    await rawQuery('BEGIN'); try { const result = await fn(); await rawQuery('COMMIT'); return result; }
    catch (err) { await rawQuery('ROLLBACK'); throw err; }
  }));
  pool.leadership = async () => async () => {};
  pool.end = () => db.close();
  return pool;
}
module.exports = { createPool };
