'use strict';
// server/routes/payments.js  — Razorpay payment chain (Phase 1)
const express = require('express');
const router = express.Router();

const { authRequired, loadProfile, requireRole } = require('../middleware/auth');
const { getAdmin } = require('../supabase');
const { getRazorpay, verifyCheckoutSignature, verifyWebhookSignature } =
  require('../lib/razorpay');
const { computeSplit } = require('../lib/payment-math');

const FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? 10);
// Poster payments always settle in the platform's (admin's) Razorpay account.
// Students are NEVER paid automatically: each payout stays a pending manual
// row that the admin releases from /admin/payouts after transferring the money
// themselves. There is no code path that sends money straight to a student.
const PAYOUT_METHOD = 'manual';
// A poster can release a reward as soon as they approve a solution. Set this
// explicitly to true only when a final deliverable must be received first.
const REQUIRE_FINAL_WORK = process.env.PAYMENT_REQUIRES_FINAL_WORK === 'true';

async function notify(admin, userId, eventType, title, body, linkUrl, metadata = {}) {
  const { error } = await admin.from('notifications').insert({
    user_id: userId, event_type: eventType, title, body,
    link_url: linkUrl, metadata,
  });
  if (error) console.error('payment notify failed:', error.message);
}

const inr = (paise) => `Rs ${(Number(paise) / 100).toLocaleString('en-IN')}`;

// ---- Public key for Checkout (the key SECRET never leaves the server) --------
router.get('/api/payments/config', authRequired, (req, res) => {
  res.json({ key_id: process.env.RAZORPAY_KEY_ID || null, fee_percent: FEE_PERCENT,
    payout_method: PAYOUT_METHOD });
});

// ---- Test-mode demonstration checkout ---------------------------------------
// This is deliberately unavailable with live credentials. It lets a poster
// demonstrate Checkout before problems have rewards and before the optional
// payment-record migration is installed.
router.post('/api/payments/create-test-order', authRequired, loadProfile,
  requireRole('poster', 'admin'), async (_req, res) => {
  if (!String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')) {
    return res.status(409).json({ error: 'The test checkout is available only with Razorpay test keys.' });
  }
  try {
    const order = await getRazorpay().orders.create({
      amount: 100,
      currency: 'INR',
      receipt: `sn_demo_${Date.now()}`,
      notes: { solmira_demo: 'true', environment: 'test' },
    });
    return res.json({
      key_id: process.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      description: 'Solmira Razorpay Test Payment',
    });
  } catch (e) {
    console.error('razorpay test order create failed:', e?.error || e);
    if (Number(e?.statusCode || e?.status) === 401) {
      return res.status(502).json({
        error: 'Razorpay rejected the Test Mode key and secret. Update the matching pair in .env, then restart the server.',
      });
    }
    return res.status(502).json({ error: 'Could not start the Razorpay test checkout. Try again.' });
  }
});

router.post('/api/payments/verify-test-order', authRequired, loadProfile,
  requireRole('poster', 'admin'), async (req, res) => {
  if (!String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')) {
    return res.status(409).json({ error: 'The test checkout is available only with Razorpay test keys.' });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature ||
      !verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return res.status(400).json({ error: 'Invalid Razorpay test-payment signature.' });
  }
  try {
    const payment = await getRazorpay().payments.fetch(razorpay_payment_id);
    if (payment.order_id !== razorpay_order_id || Number(payment.amount) !== 100) {
      return res.status(400).json({ error: 'The Razorpay test payment does not match this checkout.' });
    }
    return res.json({ ok: true, payment_id: payment.id, status: payment.status });
  } catch (e) {
    console.error('razorpay test payment verify failed:', e?.error || e);
    return res.status(502).json({ error: 'Could not verify the Razorpay test payment.' });
  }
});

// ---- 1. Poster clicks "Pay": create (or reuse) a Razorpay order ---------------
router.post('/api/payments/create-order', authRequired, loadProfile,
  requireRole('poster', 'admin'), async (req, res) => {
  const submissionId = req.body?.submission_id;
  if (!submissionId) return res.status(400).json({ error: 'Missing submission_id' });

  const admin = getAdmin();

  const { data: sub } = await admin.from('submissions')
    .select('id, student_id, problem_id, status, final_deliverables')
    .eq('id', submissionId).maybeSingle();
  if (!sub) return res.status(404).json({ error: 'Solution not found' });

  const { data: problem } = await admin.from('problems')
    .select('id, title, poster_id, reward_amount')
    .eq('id', sub.problem_id).maybeSingle();
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  // Only the poster who owns the problem (or an admin) can pay for it.
  const isAdmin = req.profile?.role === 'admin' || req.profile?.is_master;
  if (problem.poster_id !== req.user.id && !isAdmin) {
    return res.status(403).json({ error: 'Only the problem poster can pay for this.' });
  }
  if (sub.status !== 'approved') {
    return res.status(409).json({ error: 'Approve the solution before paying.' });
  }
  const finals = Array.isArray(sub.final_deliverables) ? sub.final_deliverables : [];
  if (REQUIRE_FINAL_WORK && finals.length === 0) {
    return res.status(409).json({ error: 'The solver has not uploaded final work yet.' });
  }

  // The poster chooses how much to pay (defaults to the problem's reward).
  const requested = Number(req.body?.amount ?? problem.reward_amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    return res.status(422).json({ error: 'Enter a valid payment amount.' });
  }
  const amountPaise = Math.round(requested * 100);
  if (amountPaise < 100) {
    return res.status(422).json({ error: 'The payment amount must be at least ₹1.00.' });
  }

  // Reward is paid once per problem.
  const { data: paidAlready } = await admin.from('payments').select('id')
    .eq('problem_id', problem.id).eq('status', 'paid').limit(1).maybeSingle();
  if (paidAlready) {
    return res.status(409).json({ error: 'The reward for this problem is already paid.' });
  }

  // Double-click / page refresh safe: reuse the open order for this solution
  // when the amount is unchanged. A different amount needs a fresh Razorpay
  // order, so drop the stale open row first.
  const { data: open } = await admin.from('payments').select('*')
    .eq('submission_id', sub.id).eq('status', 'created').maybeSingle();
  if (open && Number(open.amount_paise) === amountPaise) {
    return res.json({
      key_id: process.env.RAZORPAY_KEY_ID, order_id: open.razorpay_order_id,
      amount: open.amount_paise, currency: open.currency,
      description: `Reward for "${problem.title}"`,
    });
  }
  if (open) {
    await admin.from('payments').delete().eq('id', open.id).eq('status', 'created');
  }

  let split;
  try { split = computeSplit(amountPaise, { feePercent: FEE_PERCENT }); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  let order;
  try {
    order = await getRazorpay().orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `sn_${sub.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        problem_id: problem.id, submission_id: sub.id,
        poster_id: problem.poster_id, solver_id: sub.student_id,
      },
    });
  } catch (e) {
    console.error('razorpay order create failed:', e?.error || e);
    return res.status(502).json({ error: 'Could not start the payment. Try again.' });
  }

  const { error } = await admin.from('payments').insert({
    problem_id: problem.id, submission_id: sub.id,
    poster_id: problem.poster_id, solver_id: sub.student_id,
    amount_paise: amountPaise,
    platform_fee_percent: FEE_PERCENT,
    platform_fee_paise: split.platformFee,
    solver_amount_paise: split.solverAmount,
    razorpay_order_id: order.id,
  });
  if (error) {
    console.error('payments insert failed:', error.message);
    if (/schema cache|does not exist|relation .* does not exist/i.test(error.message)) {
      return res.status(503).json({
        error: 'Payments are not set up yet. Apply supabase/migrations/20261108_payments.sql in the Supabase SQL editor.',
      });
    }
    return res.status(409).json({ error: 'A payment is already in progress. Refresh.' });
  }

  return res.json({
    key_id: process.env.RAZORPAY_KEY_ID, order_id: order.id,
    amount: amountPaise, currency: 'INR',
    description: `Reward for "${problem.title}"`,
  });
});

// ---- Checkout-page summary (before Razorpay opens) --------------------------
// GET /api/payments/checkout/:submissionId -> everything the in-app checkout
// page needs to preview the bill: problem, poster, solver, fee split and any
// payment already recorded for this solution. Same guards as create-order.
router.get('/api/payments/checkout/:submissionId', authRequired, loadProfile,
  requireRole('poster', 'admin'), async (req, res) => {
    const submissionId = req.params.submissionId;
    if (!submissionId) return res.status(400).json({ error: 'Missing submission id' });

    const admin = getAdmin();

    const { data: sub } = await admin.from('submissions')
      .select('id, student_id, problem_id, status')
      .eq('id', submissionId).maybeSingle();
    if (!sub) return res.status(404).json({ error: 'Solution not found' });

    const { data: problem } = await admin.from('problems')
      .select('id, title, poster_id, reward_amount')
      .eq('id', sub.problem_id).maybeSingle();
    if (!problem) return res.status(404).json({ error: 'Problem not found' });

    const isAdmin = req.profile?.role === 'admin' || req.profile?.is_master;
    if (problem.poster_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Only the problem poster can pay for this.' });
    }
    if (sub.status !== 'approved') {
      return res.status(409).json({ error: 'Approve the solution before paying.' });
    }

    const [posterRes, solverRes, payRes, problemPaidRes] = await Promise.all([
      admin.from('users').select('id, name').eq('id', problem.poster_id).maybeSingle(),
      admin.from('users').select('id, name').eq('id', sub.student_id).maybeSingle(),
      admin.from('payments').select('*')
        .eq('submission_id', sub.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      admin.from('payments').select('id').eq('problem_id', problem.id)
        .eq('status', 'paid').limit(1).maybeSingle(),
    ]);

    return res.json({
      submission: { id: sub.id, status: sub.status, problem_id: sub.problem_id, student_id: sub.student_id },
      problem: { id: problem.id, title: problem.title, reward_amount: problem.reward_amount, poster_id: problem.poster_id },
      poster: posterRes.data || null,
      solver: solverRes.data || null,
      payment: payRes.data || null,
      problem_paid: Boolean(problemPaidRes.data),
      fee_percent: FEE_PERCENT,
      key_id: process.env.RAZORPAY_KEY_ID || null,
    });
  });

// ---- Shared helpers (used by verify AND the webhook) --------------------------

// Ask Razorpay directly whether the money really arrived (never trust the browser).
async function confirmCaptured(payment, razorpayPaymentId) {
  const rz = getRazorpay();
  let p = await rz.payments.fetch(razorpayPaymentId);
  if (p.order_id !== payment.razorpay_order_id ||
      Number(p.amount) !== Number(payment.amount_paise)) {
    throw new Error('Payment does not match the order');
  }
  if (p.status === 'authorized') {            // only if auto-capture is OFF
    p = await rz.payments.capture(razorpayPaymentId, payment.amount_paise,
      payment.currency);
  }
  return p.status === 'captured';
}

function payoutStatus(status) {
  if (status === 'processed') return 'paid';
  if (['queued', 'pending', 'processing'].includes(status)) return 'processing';
  if (status === 'reversed' || status === 'cancelled') return 'cancelled';
  return 'failed';
}

async function createPayouts(admin, payment) {
  // Always a pending MANUAL payout: the money is already with the platform
  // (admin). The admin sends it to the student and records the UTR later.
  const rows = [{
    payment_id: payment.id, recipient_id: payment.solver_id,
    recipient_type: 'solver', amount_paise: payment.solver_amount_paise,
    method: PAYOUT_METHOD, idempotency_key: `payout_${payment.id}_solver`,
  }];
  const { error } = await admin.from('payouts')
    .upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  if (error) throw new Error(`payout rows: ${error.message}`);
  const { data: payout, error: loadError } = await admin.from('payouts').select('*')
    .eq('idempotency_key', rows[0].idempotency_key).maybeSingle();
  if (loadError || !payout) throw new Error(`Could not load payout: ${loadError?.message || 'not found'}`);
  return payout;
}

// Idempotent: safe to call from verify AND the webhook, in any order, many times.
async function markPaid(admin, payment, razorpayPaymentId) {
  if (payment.status === 'paid') {
    await createPayouts(admin, payment);
    return payment;
  }

  const { data: updated, error } = await admin.from('payments')
    .update({
      status: 'paid', razorpay_payment_id: razorpayPaymentId,
      paid_at: new Date().toISOString(),
    })
    .eq('id', payment.id).eq('status', 'created')   // compare-and-set
    .select().maybeSingle();

  if (error) {
    if (error.code === '23505') {   // a different solution was already paid
      console.error('DUPLICATE PAID REWARD - REFUND REQUIRED', razorpayPaymentId);
      await admin.from('payments').update({
        status: 'failed', razorpay_payment_id: razorpayPaymentId,
        failure_reason: 'duplicate_reward_refund_required',
      }).eq('id', payment.id);
      return payment;
    }
    throw new Error(error.message);
  }
  if (!updated) return payment;     // someone else got there first

  await createPayouts(admin, updated);

  const { data: problem } = await admin.from('problems')
    .select('title').eq('id', updated.problem_id).maybeSingle();
  const title = problem?.title || 'your problem';
  const { data: solver } = await admin.from('users')
    .select('name').eq('id', updated.solver_id).maybeSingle();
  const solverName = solver?.name || 'the solver';
  await notify(admin, updated.solver_id, 'PAYMENT_RECEIVED', 'Reward funded',
    `${inr(updated.solver_amount_paise)} for "${title}" has been received by Solmira. ` +
    'The admin will release it to you shortly.', '/dashboard',
    { payment_id: updated.id });
  await notify(admin, updated.poster_id, 'PAYMENT_CONFIRMED', 'Payment received',
    `We received ${inr(updated.amount_paise)} for "${title}". The admin will release ` +
    `${inr(updated.solver_amount_paise)} to ${solverName}.`,
    '/poster/solutions', { payment_id: updated.id });
  // The money is with the platform now — tell every admin to release it.
  const { data: admins } = await admin.from('users')
    .select('id').or('role.eq.admin,is_master.eq.true');
  for (const a of admins || []) {
    await notify(admin, a.id, 'RELEASE_PAYOUT',
      'Reward payment received — release payout',
      `${inr(updated.solver_amount_paise)} for "${title}" (${solverName}) is with Solmira. ` +
      'Send it to the student\'s UPI and record the UTR.',
      '/admin/payouts', { payment_id: updated.id });
  }
  return updated;
}

// ---- 2. Browser tells us Checkout finished: verify, then mark paid ------------
router.post('/api/payments/verify', authRequired, loadProfile,
  requireRole('poster', 'admin'), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' });
  }
  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id,
      razorpay_signature)) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  const admin = getAdmin();
  const { data: payment } = await admin.from('payments').select('*')
    .eq('razorpay_order_id', razorpay_order_id).maybeSingle();
  const verifierIsAdmin = req.profile?.role === 'admin' || req.profile?.is_master;
  if (!payment || (payment.poster_id !== req.user.id && !verifierIsAdmin)) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  try {
    const captured = await confirmCaptured(payment, razorpay_payment_id);
    if (!captured) {
      return res.status(202).json({ ok: false, pending: true,
        message: 'Payment is still being confirmed. Check back in a minute.' });
    }
    await markPaid(admin, payment, razorpay_payment_id);
    return res.json({ ok: true });
  } catch (e) {
    console.error('verify failed:', e);
    return res.status(502).json({
      error: 'Could not confirm the payment yet. If money was debited it will ' +
             'be reconciled automatically.' });
  }
});

// ---- 3. Webhook: Razorpay -> your server (safety net) -------------------------

async function handleRefund(admin, refund) {
  if (!refund?.payment_id) return;
  const { data: pay } = await admin.from('payments').select('*')
    .eq('razorpay_payment_id', refund.payment_id).maybeSingle();
  // Partial refunds are rare here; handle those by hand in the admin screen.
  if (!pay || Number(refund.amount) < Number(pay.amount_paise)) return;
  await admin.from('payments').update({ status: 'refunded' }).eq('id', pay.id);
  await admin.from('payouts').update({ status: 'cancelled' })
    .eq('payment_id', pay.id).in('status', ['pending', 'failed']);
}

router.post('/api/payments/webhook', async (req, res) => {
  // 1. Is this really Razorpay? (signature of the RAW body)
  const signature = req.get('x-razorpay-signature');
  if (!verifyWebhookSignature(req.rawBody, signature)) {
    return res.status(400).json({ error: 'Bad signature' });
  }

  const event = req.body || {};
  const eventId = req.get('x-razorpay-event-id');
  const admin = getAdmin();

  // 2. Have we already handled this exact delivery? (Razorpay retries.)
  if (eventId) {
    const { error: dup } = await admin.from('razorpay_events')
      .insert({ event_id: eventId, event_type: event.event, payload: event });
    if (dup) {
      if (dup.code === '23505') return res.json({ ok: true, duplicate: true });
      console.error('event log failed:', dup.message);
      return res.status(500).json({ error: 'log failed' });
    }
  }

  // 3. Act on it.
  try {
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const entity = event.payload?.payment?.entity || {};
      const orderId = entity.order_id || event.payload?.order?.entity?.id;
      if (orderId && entity.id) {
        const { data: row } = await admin.from('payments').select('*')
          .eq('razorpay_order_id', orderId).maybeSingle();
        if (row && Number(entity.amount) === Number(row.amount_paise)) {
          await markPaid(admin, row, entity.id);
        }
      }
    } else if (event.event === 'payment.failed') {
      // Not final: the poster can retry inside the same order. Log only.
      const e = event.payload?.payment?.entity || {};
      console.log('payment.failed', e.id, e.error_description || '');
    } else if (event.event === 'refund.processed') {
      await handleRefund(admin, event.payload?.refund?.entity);
    } else if (event.event && event.event.startsWith('payout.')) {
      const payout = event.payload?.payout?.entity || {};
      if (payout.id) {
        await admin.from('payouts').update({
          status: payoutStatus(payout.status), utr: payout.utr || null,
          paid_at: payout.status === 'processed' ? new Date().toISOString() : null,
          failure_reason: payout.status_details?.description || null,
        }).eq('razorpayx_payout_id', payout.id);
      }
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('webhook processing failed:', e);
    // Forget the event so Razorpay's retry is processed again.
    if (eventId) await admin.from('razorpay_events').delete().eq('event_id', eventId);
    return res.status(500).json({ error: 'processing failed' });
  }
});

// ---- My payments (poster) / my earnings (student, mentor) ---------------------
router.get('/api/payments/mine', authRequired, loadProfile, async (req, res) => {
  const admin = getAdmin();
  const role = req.profile?.role;

  if (role === 'student' || role === 'mentor') {
    const { data, error } = await admin.from('payouts')
      .select('id, amount_paise, status, method, utr, created_at, paid_at, ' +
        'recipient_type, payments(problem_id, problems(title))')
      .eq('recipient_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ payouts: data || [] });
  }

  const { data, error } = await admin.from('payments')
    .select('id, problem_id, submission_id, amount_paise, platform_fee_percent, ' +
      'platform_fee_paise, solver_amount_paise, status, created_at, paid_at, ' +
      'razorpay_order_id, razorpay_payment_id, problems(title), users:solver_id(name)')
    .eq('poster_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ payments: data || [] });
});

// ---- Where should my money go? (UPI ID) ---------------------------------------
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

router.get('/api/payout-account', authRequired, async (req, res) => {
  const { data } = await getAdmin().from('payout_accounts')
    .select('upi_id, account_holder_name, updated_at')
    .eq('user_id', req.user.id).maybeSingle();
  res.json({ account: data || null });
});

router.post('/api/payout-account', authRequired, loadProfile,
  requireRole('student', 'mentor'), async (req, res) => {
  const upi = String(req.body?.upi_id || '').trim();
  const name = String(req.body?.account_holder_name || '').trim();
  if (!UPI_RE.test(upi)) {
    return res.status(422).json({ error: 'Enter a valid UPI ID, e.g. name@okaxis' });
  }
  if (name.length < 2 || name.length > 80) {
    return res.status(422).json({ error: 'Enter the name on the UPI account.' });
  }
  const { error } = await getAdmin().from('payout_accounts').upsert({
    user_id: req.user.id, upi_id: upi, account_holder_name: name,
    razorpayx_fund_account_id: null,        // details changed -> re-create in Phase 2
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---- Admin: see and settle payouts --------------------------------------------
router.get('/api/admin/payouts', authRequired, loadProfile,
  requireRole('admin'), async (req, res) => {
  const admin = getAdmin();
  const status = String(req.query.status || 'pending');

  let q = admin.from('payouts')
    .select('id, payment_id, recipient_id, recipient_type, amount_paise, status, ' +
      'method, utr, failure_reason, created_at, paid_at, ' +
      'payments(amount_paise, platform_fee_paise, problems(title))')
    .order('created_at', { ascending: false }).limit(200);
  if (status !== 'all') q = q.eq('status', status);

  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const ids = [...new Set((rows || []).map((r) => r.recipient_id))];
  const [{ data: users }, { data: accounts }] = await Promise.all([
    admin.from('users').select('id, name').in('id', ids),
    admin.from('payout_accounts')
      .select('user_id, upi_id, account_holder_name').in('user_id', ids),
  ]);
  const userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
  const acctMap = Object.fromEntries((accounts || []).map((a) => [a.user_id, a]));

  res.json({
    payouts: (rows || []).map((r) => ({
      ...r,
      recipient_name: userMap[r.recipient_id]?.name || 'Unknown',
      account: acctMap[r.recipient_id] || null,
    })),
  });
});

// Your platform-fee income and totals.
router.get('/api/admin/payments/summary', authRequired, loadProfile,
  requireRole('admin'), async (req, res) => {
  const { data, error } = await getAdmin().from('payments')
    .select('amount_paise, platform_fee_paise, solver_amount_paise')
    .eq('status', 'paid');
  if (error) return res.status(500).json({ error: error.message });
  const sum = (k) => (data || []).reduce((t, r) => t + Number(r[k] || 0), 0);
  res.json({
    payments_count: (data || []).length,
    collected_paise: sum('amount_paise'),
    platform_fee_paise: sum('platform_fee_paise'),
    owed_to_solvers_paise: sum('solver_amount_paise'),
  });
});

// Phase 1: you sent the money yourself (UPI app / net banking); record it here.
router.post('/api/admin/payouts/mark-paid', authRequired, loadProfile,
  requireRole('admin'), async (req, res) => {
  const { payout_id, utr } = req.body || {};
  const ref = String(utr || '').trim();
  if (!payout_id || ref.length < 6) {
    return res.status(422).json({
      error: 'Payout id and the bank reference (UTR) are required.' });
  }
  const admin = getAdmin();
  const { data: row, error } = await admin.from('payouts')
    .update({ status: 'paid', utr: ref, paid_at: new Date().toISOString(),
              failure_reason: null })
    .eq('id', payout_id).in('status', ['pending', 'processing', 'failed'])
    .select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!row) return res.status(409).json({ error: 'Payout not found or already settled.' });

  await notify(admin, row.recipient_id, 'PAYOUT_SENT', 'Your reward has been paid',
    `${inr(row.amount_paise)} was sent to your UPI account. Ref: ${ref}`,
    '/dashboard', { payout_id: row.id });
  res.json({ ok: true });
});

module.exports = router;

