import { api, esc } from '/assets/app.js';
import { rupees } from '/assets/payments.js?v=20261113-amt-inv';
import { downloadInvoiceFromButton } from '/assets/invoice.js?v=20261113-amt-inv';

// Payments the current user has started/completed. Returns [] on any error so
// reward controls can still render from the API's own reward/payment flags.
export async function loadPayments() {
  try {
    const { payments } = await api('/api/payments/mine');
    return Array.isArray(payments) ? payments : [];
  } catch { return []; }
}

export function summarizePayments(payments) {
  const bySubmission = new Map();
  const paidProblems = new Set();
  for (const p of payments || []) {
    if (!p) continue;
    if (p.submission_id) bySubmission.set(p.submission_id, p);
    if (p.status === 'paid' && p.problem_id) paidProblems.add(p.problem_id);
  }
  return { bySubmission, paidProblems };
}

export function profileOf(me) {
  return me?.profile || me || null;
}

export function canPayFor(me, posterId) {
  const profile = profileOf(me);
  if (!profile) return false;
  if (profile.role === 'admin' || profile.is_master) return true;
  return Boolean(profile.id && posterId && profile.id === posterId);
}

// Returns the HTML for a reward payment control on an approved solution. The
// poster can type any amount; it is pre-filled with the problem's reward.
// `rewardPaid` / `paymentStatus` come from server payloads where available;
// `payments` is used as a fallback on pages that load them client-side.
export function payButtonHtml({
  submissionId, problemId, status, reward, posterId, me,
  payments = [], rewardPaid, paymentStatus,
}) {
  if (status !== 'approved' || !submissionId || !canPayFor(me, posterId)) return '';
  const { bySubmission, paidProblems } = summarizePayments(payments);
  const pay = bySubmission.get(submissionId);
  const alreadyPaid = paymentStatus === 'paid' || (pay && pay.status === 'paid');
  if (alreadyPaid) {
    const amount = paymentStatus === 'paid' ? null : pay?.amount_paise;
    return `<span class="sn-pay-group sn-pay-paid">
      <span class="sn-pay-state paid">${amount ? `Paid \u00B7 ${rupees(amount)}` : 'Reward paid'}</span>
      <button type="button" class="sn-pay-inv" data-invoice-for="${esc(submissionId)}">Invoice</button>
    </span>`;
  }
  if (rewardPaid === true || paidProblems.has(problemId)) {
    return '<span class="sn-pay-state">Reward already paid</span>';
  }
  const amount = Number(reward || 0);
  return `<span class="sn-pay-group">
    <button type="button" class="sn-pay-btn" data-pay-submission="${esc(submissionId)}">Pay${amount > 0 ? ` ${rupees(amount)}` : ''} with Razorpay</button>
  </span>`;
}

// Delegated click handler for any `.sn-pay-btn` / `[data-invoice-for]` inside
// `root`. Pay buttons navigate to the in-app checkout page, where the poster
// enters/edits the amount and reviews the bill before Razorpay opens; invoice
// buttons open the PDF preview modal. Call once per container; render() can
// freely replace the buttons.
export function wirePayButtons(root, { me, onPaid, onError } = {}) {
  if (!root || root.dataset.payWired === '1') return;
  root.dataset.payWired = '1';
  root.addEventListener('click', async (e) => {
    const inv = e.target.closest('[data-invoice-for]');
    if (inv && !inv.disabled) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const summary = await api(`/api/payments/checkout/${encodeURIComponent(inv.dataset.invoiceFor)}`);
        if (summary?.payment?.status !== 'paid') throw new Error('This payment is not settled yet.');
        await downloadInvoiceFromButton(inv, summary.payment, {
          problemTitle: summary.problem?.title,
          posterName: summary.poster?.name,
          solverName: summary.solver?.name,
          feePercent: summary.fee_percent,
        });
      } catch (err) { onError?.(err?.message || 'Could not build the invoice.'); }
      return;
    }
    const btn = e.target.closest('[data-pay-submission]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    // The checkout page is where the amount is entered/edited and the bill
    // previewed; Razorpay opens from there.
    location.href = `/checkout/${encodeURIComponent(btn.dataset.paySubmission)}`;
  });
}
