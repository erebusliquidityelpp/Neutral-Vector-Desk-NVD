const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. On Railway, add the Postgres plugin — it injects this automatically.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway's internal Postgres doesn't need SSL; their public proxy URL does. This covers both.
  ssl: process.env.DATABASE_URL.includes('railway.internal') ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error', err);
});

module.exports = pool;
