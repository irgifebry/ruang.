import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,

      // The pool is shared by Better Auth (`auth.js`) and `/api/ledger`, and
      // `fetchLedger` fires four queries through `Promise.all` — so the pool
      // must be able to lend out more than one connection at a time or a single
      // dashboard load serialises behind itself.
      //
      // Everything below the connection string is a bound, not a default. Left
      // unset, `pg` opens up to 10 connections, holds each idle one for 10s,
      // and waits *forever* for a free slot — which is how a dev server plus the
      // root scripts pile up against the pooler's client cap.
      max: 5,
      idleTimeoutMillis: 10_000,

      // Fail fast instead of hanging a request forever when the database is
      // unreachable. The user gets an error; they do not get a spinner that
      // never resolves.
      connectionTimeoutMillis: 5_000,

      // Identifies this app's connections in `pg_stat_activity`. Note that
      // through Supavisor the pooler renames them to `Supavisor`, so this only
      // shows up as-is on a direct connection — it costs nothing and saves the
      // guesswork when someone reads the connection list.
      application_name: 'ruang-app',
    });
  }
  return pool;
}