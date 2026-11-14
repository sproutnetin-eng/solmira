# Solmira — Test Credentials

Local/dev test accounts. Recreate them any time with:

```bash
npm run seed:test
```

All accounts use the same password: **`Test@123`**

## Accounts

| Role | Email | Password | Login page | Notes |
|------|-------|----------|-----------|-------|
| Admin | `admin@solmira.test` | `Test@123` | `/login/admin` | Full admin panel at `/admin` |
| Poster | `poster@solmira.test` | `Test@123` | `/login/poster` | Owns the seeded "Smart Campus Navigation" problem |
| Mentor | `manjunathr@gmail.com` | `Test@123` | `/login/mentor` | Manjunath R (Deep Learning Expert, 13 yrs exp) |
| Student (team leader) | `leader@solmira.test` | `Test@123` | `/login/student` | Leader of team **Campus Coders** (invite code: `SOLMIRA-TEST01`) |
| Student (individual) | `student@solmira.test` | `Test@123` | `/login/student` | Used for Stage 1 & Stage 2 walkthroughs (limit reached) |
| Student 1 (fresh) | `student01@solmira.test` | `Test@123` | `/login/student` | Aarav Menon (1st Year CS) — clean account for fresh enroll / team join |
| Student 2 (fresh) | `student02@solmira.test` | `Test@123` | `/login/student` | Diya Nair (1st Year IS) — clean account for fresh enroll / team join |

## What to test with each

- **Admin** — problem moderation, participation mode (edit problem), Solutions viewer (`/admin/solutions`), judging queue, analytics.
- **Poster** — post/edit problems, review submissions at `/poster/solutions`.
- **Mentor** — mentor dashboard (`/mentor/dashboard`), profile editing (`/mentor/profile`), accept/decline team mentorship requests (`/mentor/connect/[notificationId]`), and join assigned team channels.
- **Team leader** — team workspace, milestones, mentor requests.
- **Individual student** — enroll, solution workspace (`/problems/[id]/submit`), up-to-5 final deliverables (links/files), Team vs Individual entry, and the forgot-password OTP flow.

## Seeded data

- Problem: **Build a Smart Campus Navigation App** (AI & Data, `team_mode = both`)
- Problem: **Smart Waste Segregation Awareness Tracker** (Climate, `team_mode = solo`)
- Team: **Campus Coders** + workspace + general channel
- Both test students are **enrolled (active)** in the Smart Campus problem
- Showcase submissions for `/solutions`:
  - `student@solmira.test` → Individual entry, ★8, 3 sample deliverables
  - `leader@solmira.test` → **Team** entry, ★9, 2 sample deliverables

## How to upload a solution (two-stage flow)

`student@solmira.test` can test BOTH stages — it is enrolled in two problems:

| Problem | State | Tests |
|---------|-------|-------|
| Build a Smart Campus Navigation App | ✅ Stage-1 approved (score 8) | **Stage 2** — final uploads |
| Smart Waste Segregation Awareness Tracker | 🆕 Enrolled, nothing submitted | **Stage 1** — fresh 7-field submission |

**Stage 1 — written solution (7 fields) — test with "Smart Waste Segregation"**
1. Sign in as `student@solmira.test` at `/login/student`
2. Navbar → **Dashboard** → *Browse Problems* card (or navbar **Problems**)
3. Open *Smart Waste Segregation Awareness Tracker* → click **Start Solving** → `/problems/[id]/submit`
4. Fill all 7 framework fields → optionally attach supporting PDFs → **Submit**
5. Problem page now shows "⏳ Submitted — waiting for admin review"

**Admin review**
6. Sign in as `admin@solmira.test` at `/login/admin` → sidebar **Judging** (`/admin/judging`)
7. Click **Judge**, set score 0–10, optional feedback, then **Approve** or **Reject**

**Stage 2 — final work (unlocked only on approval) — test with "Smart Campus Navigation"**
8. As `student@solmira.test`: navbar **Problems** → open *Build a Smart Campus Navigation App*
9. Click the green **"🎉 Approved! Upload Final Work"** button → `/problems/[id]/final-upload`
10. It shows your score + judge feedback. Add up to 5 items: research paper, APK build, live app link, GitHub repo, demo video… (links or any-type files, 25 MB max each), pick Team/Individual → **Save final work**
11. Admin sees both stages in sidebar **Solutions** (`/admin/solutions`) — expand a row for fields, attached files, links

> Note: students must be enrolled to open `/problems/[id]/submit`. Max 2 active enrollments per student — `student@solmira.test` is at the limit (both slots used by these two problems).

## Forgot-password OTP (local testing)

SMTP credentials live in `.env` under `SMTP_*`. OTP codes are emailed to the account's email address. The seeded `@solmira.test` addresses are fake — to test the full OTP email flow, sign up a real address (e.g. Gmail) via `/join`, then reset its password from `/forgot-password`.

> ⚠️ These credentials are for local development only. Never reuse them in production.
