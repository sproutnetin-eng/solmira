-- supabase/migrations/20261108_payments.sql
-- Apply in the Supabase SQL editor (same way as your other migrations).

-- 1) Where each solver / mentor wants to receive money -----------------------
create table if not exists public.payout_accounts (
  user_id uuid primary key references public.users(id) on delete cascade,
  method text not null default 'upi' check (method in ('upi')),
  upi_id text not null,
  account_holder_name text not null,
  razorpayx_fund_account_id text,           -- filled in Phase 2
  updated_at timestamptz not null default now()
);

-- 2) One row per poster payment (money IN) -----------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(id),
  submission_id uuid not null references public.submissions(id),
  poster_id uuid not null references public.users(id),
  solver_id uuid not null references public.users(id),
  currency text not null default 'INR',
  amount_paise bigint not null check (amount_paise > 0),
  platform_fee_percent numeric(5,2) not null,
  platform_fee_paise bigint not null check (platform_fee_paise >= 0),
  solver_amount_paise bigint not null check (solver_amount_paise > 0),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  status text not null default 'created'
    check (status in ('created', 'paid', 'failed', 'refunded')),
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint payments_split_adds_up
    check (platform_fee_paise + solver_amount_paise = amount_paise)
);

-- one open/paid payment per solution, and only ONE paid reward per problem
create unique index if not exists payments_one_open_per_submission
  on public.payments (submission_id) where status in ('created', 'paid');
create unique index if not exists payments_one_paid_per_problem
  on public.payments (problem_id) where status = 'paid';

-- 3) One row per payout (money OUT to the solver) -----------------------------
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  recipient_id uuid not null references public.users(id),
  recipient_type text not null default 'solver'
    check (recipient_type = 'solver'),
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  method text not null default 'manual' check (method in ('manual', 'razorpayx')),
  razorpayx_payout_id text unique,
  utr text,                                   -- bank reference number
  failure_reason text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- 4) Webhook log: lets us ignore duplicate deliveries -------------------------
create table if not exists public.razorpay_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- 5) Lock everything down. Your browser talks to Supabase directly for some
--    tables, so money tables must have RLS ON and NO policies. Only the Node
--    server (service-role key) can read or write them.
alter table public.payout_accounts enable row level security;
alter table public.payments        enable row level security;
alter table public.payouts         enable row level security;
alter table public.razorpay_events enable row level security;

