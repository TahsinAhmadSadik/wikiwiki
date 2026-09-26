import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

/**
 * Explicit Transaction Runner
 * Issues explicit BEGIN, COMMIT, and ROLLBACK queries.
 */
export async function executeTransaction(callback) {
  const client = await pool.connect();
  try {
    // 1. Explicit transaction start
    await client.query('BEGIN');

    // 2. Execute operations using the dedicated client
    const result = await callback(client);

    // 3. Explicit commit if every statement succeeds
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // 4. Explicit rollback if any statement or constraint fails
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // 5. Release client back to the pool
    client.release();
  }
}