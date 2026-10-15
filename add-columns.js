const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function addColumns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "userMetadata" JSONB');
    await client.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "appMetadata" JSONB');
    await client.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMPTZ');
    await client.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "lastSignInAt" TIMESTAMPTZ');
    await client.query('COMMIT');
    console.log('Columns added successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}
addColumns();