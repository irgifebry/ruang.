const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verify() {
  const client = await pool.connect();
  try {
    const userRes = await client.query('SELECT * FROM "user"');
    console.log('Users:', JSON.stringify(userRes.rows, null, 2));
    const accountRes = await client.query('SELECT * FROM "account"');
    console.log('Accounts:', JSON.stringify(accountRes.rows, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}
verify();