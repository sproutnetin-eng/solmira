// Run: npx tsx scripts/run-migration.ts <sql-file>
// Requires SUPABASE_DB_URL in .env (the PostgreSQL connection string from
// Supabase Dashboard > Connect). A service-role API key is not a DB password.
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(import.meta.dirname!, '../.env') })

import { readFileSync } from 'fs'
import pg from 'pg'

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: npx tsx scripts/run-migration.ts <path-to-sql>')
  process.exit(1)
}

async function run() {
  const sql = readFileSync(resolve(import.meta.dirname!, '..', sqlFile), 'utf-8')
  const connectionString = process.env.SUPABASE_DB_URL
  if (!connectionString) {
    console.error('Missing SUPABASE_DB_URL in .env. Copy the PostgreSQL connection string from Supabase Dashboard > Connect.')
    process.exit(1)
  }

  const directPool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await directPool.query(sql)
    console.log('Migration applied successfully')
  } catch (err: any) {
    console.error('Migration failed:', err.message)
    process.exitCode = 1
  } finally {
    await directPool.end()
  }
}

run()
