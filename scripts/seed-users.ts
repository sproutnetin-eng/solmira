// Run: npx tsx scripts/seed-users.ts
// Creates 10 student accounts + 5 problem-poster accounts (idempotent).
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(import.meta.dirname!, '../.env') })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const PASSWORD = process.env.SEED_USER_PASSWORD || 'Test@123'

const STUDENTS = [
  { name: 'Aarav Menon',   dept: 'Computer Science',        year: '1st Year' },
  { name: 'Diya Nair',     dept: 'Information Science',     year: '1st Year' },
  { name: 'Rohan Pillai',  dept: 'Computer Science',        year: '2nd Year' },
  { name: 'Ananya Iyer',   dept: 'Electronics & Comm.',     year: '2nd Year' },
  { name: 'Karthik Rao',   dept: 'Mechanical Engineering',  year: '2nd Year' },
  { name: 'Meera Krishnan',dept: 'Information Science',     year: '3rd Year' },
  { name: 'Aditya Varma',  dept: 'Computer Science',        year: '3rd Year' },
  { name: 'Sneha Thomas',  dept: 'Civil Engineering',       year: '3rd Year' },
  { name: 'Vikram Das',    dept: 'Electrical Engineering',  year: '4th Year' },
  { name: 'Ishita Bose',   dept: 'Information Science',     year: '4th Year' },
]

const POSTERS = [
  { name: 'Campus Innovation Cell',   domainHint: 'Public Impact' },
  { name: 'Green Campus Initiative',  domainHint: 'Climate' },
  { name: 'Smart City Research Lab',  domainHint: 'AI & Data' },
  { name: 'Health & Wellness Board',  domainHint: 'Healthcare' },
  { name: 'Industry Partnership Cell',domainHint: 'Developer Tools' },
]

const pad = (n: number) => String(n).padStart(2, '0')

async function ensureUser(opts: {
  email: string
  name: string
  role: 'student' | 'poster'
  extra?: Record<string, any>
}) {
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('email', opts.email)
    .maybeSingle()

  if (existing) {
    console.log(`  ↻ ${opts.email} already exists`)
    return existing.id
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: opts.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: opts.name, role: opts.role },
  })
  if (authErr || !authUser?.user) {
    console.error(`  ✗ Failed to create ${opts.email}:`, authErr?.message)
    return null
  }

  const { error: profErr } = await admin.from('users').upsert({
    id: authUser.user.id,
    email: opts.email,
    name: opts.name,
    role: opts.role,
    ...(opts.extra || {}),
  }, { onConflict: 'id' })

  if (profErr) {
    console.error(`  ✗ Failed profile upsert for ${opts.email}:`, profErr.message)
    return null
  }

  console.log(`  ✓ ${opts.email} (${opts.name}) — ${opts.role}`)
  return authUser.user.id
}

async function main() {
  console.log('Seeding 10 students + 5 problem posters...\n')

  console.log('Students:')
  for (let i = 0; i < STUDENTS.length; i++) {
    const s = STUDENTS[i]
    await ensureUser({
      email: `student${pad(i + 1)}@solmira.test`,
      name: s.name,
      role: 'student',
      extra: { dept: s.dept, year: s.year },
    })
  }

  console.log('\nProblem posters:')
  for (let i = 0; i < POSTERS.length; i++) {
    const p = POSTERS[i]
    await ensureUser({
      email: `poster${pad(i + 1)}@solmira.test`,
      name: p.name,
      role: 'poster',
    })
  }

  console.log('\nDone! Credentials (all share the same password):')
  console.log(`  Password: ${PASSWORD}`)
  for (let i = 0; i < STUDENTS.length; i++) {
    console.log(`  student${pad(i + 1)}@solmira.test  — ${STUDENTS[i].name} (student)`)
  }
  for (let i = 0; i < POSTERS.length; i++) {
    console.log(`  poster${pad(i + 1)}@solmira.test   — ${POSTERS[i].name} (poster)`)
  }
}

main()
