import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../src/db/migrate_auth.sql'), 'utf8');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log('✅ Migração aplicada com sucesso!');
} catch (err) {
  console.error('❌ Erro na migração:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
