// client/assets/invoice.js — browser-generated payment invoice (PDF).
// jsPDF is loaded from the CDN on first use, same lazy pattern as Razorpay's
// checkout.js in payments.js. Amounts are printed as "INR 1,234.00" because
// jsPDF's base fonts cannot glyph the ₹ sign.

const GREEN = [45, 106, 79];
const INK = [28, 20, 16];
const GREY = [106, 95, 88];
const LIGHT = [220, 215, 208];
const PALE = [250, 248, 244];

let pdfLib;
function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!pdfLib) {
    pdfLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
      s.onload = () => resolve(window.jspdf?.jsPDF);
      s.onerror = () => reject(new Error('Could not load the PDF library'));
      document.head.appendChild(s);
    });
  }
  return pdfLib;
}

const inr = (paise) =>
  'INR ' + (Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// Invoice number: stable per payment, readable in Razorpay's dashboard too.
export function invoiceNumber(payment) {
  const seed = payment?.razorpay_payment_id || payment?.razorpay_order_id || payment?.id || 'draft';
  return 'INV-' + String(seed).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
}

function rightText(doc, text, x, y, opts = {}) {
  doc.text(text, x, y, { align: 'right', ...opts });
}

// Draws the invoice onto a fresh A4 jsPDF document and returns it.
export async function buildInvoice(payment, ctx = {}) {
  const JS = await loadJsPdf();
  const doc = new JS({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 18;
  const RIGHT = W - M;

  const problemTitle = ctx.problemTitle || 'Solution reward';
  const posterName = ctx.posterName || 'Solmira poster';
  const solverName = ctx.solverName || 'Solmira solver';
  const total = Number(payment?.amount_paise || 0);
  const fee = Number(payment?.platform_fee_paise || 0);
  const net = Number(payment?.solver_amount_paise || Math.max(total - fee, 0));
  const feePct = Number(payment?.platform_fee_percent ?? ctx.feePercent ?? 0);
  const status = String(payment?.status || 'created').toUpperCase();
  const invoiceNo = invoiceNumber(payment);
  const issued = payment?.paid_at || payment?.created_at || new Date().toISOString();

  // ---- Header --------------------------------------------------------------
  doc.setTextColor(...GREEN);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('Solmira', M, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  rightText(doc, 'PAYMENT INVOICE', RIGHT, 20);
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  rightText(doc, invoiceNo, RIGHT, 26);
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  rightText(doc, `Issued ${fmtDate(issued)}`, RIGHT, 31);

  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.6);
  doc.line(M, 36, RIGHT, 36);

  // ---- Parties -------------------------------------------------------------
  let y = 46;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREEN);
  doc.text('BILLED TO', M, y);
  doc.text('PAID TO', 112, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(String(posterName), M, y + 6);
  doc.text('Solmira', 112, y + 6);
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text('Problem poster', M, y + 11);
  doc.text('Platform account (reward held for release)', 112, y + 11);
  doc.text(`Beneficiary: ${solverName} \u2014 released by admin`, 112, y + 16);

  // ---- Line item -----------------------------------------------------------
  y = 72;
  doc.setFillColor(...PALE);
  doc.rect(M, y - 5, W - M * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('DESCRIPTION', M + 3, y);
  rightText(doc, 'AMOUNT', RIGHT - 3, y);

  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  const desc = `Solution reward \u2014 ${problemTitle}`;
  const lines = doc.splitTextToSize(desc, (W - M * 2) - 40);
  doc.text(lines, M + 3, y);
  rightText(doc, inr(total), RIGHT - 3, y);
  y += lines.length * 5 + 2;

  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.3);
  doc.line(M, y, RIGHT, y);

  // ---- Totals --------------------------------------------------------------
  y += 8;
  const labelX = 118;
  const valueX = RIGHT - 3;
  const row = (label, value, bold = false, color = INK) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 9.5);
    doc.setTextColor(...color);
    doc.text(label, labelX, y);
    rightText(doc, value, valueX, y);
    y += 5.5;
  };
  row('Subtotal', inr(total));
  if (feePct > 0 || fee > 0) row(`Platform fee (${feePct || 0}%)`, `- ${inr(fee)}`, false, GREY);
  row('Solver share (released by admin)', inr(net), false, GREEN);

  y += 1;
  doc.setFillColor(...GREEN);
  doc.roundedRect(labelX - 3, y - 5.5, valueX - labelX + 6, 9, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Total paid', labelX, y);
  rightText(doc, inr(total), valueX, y);
  y += 14;

  // ---- Payment details -----------------------------------------------------
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.3);
  doc.line(M, y, RIGHT, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREEN);
  doc.text('PAYMENT DETAILS', M, y);
  y += 6;

  const detail = (label, value) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(label, M, y);
    doc.setTextColor(...INK);
    doc.text(String(value || '\u2014'), 62, y);
    y += 5;
  };
  detail('Status', status);
  detail('Paid on', payment?.paid_at ? fmtDateTime(payment.paid_at) : (status === 'PAID' ? fmtDateTime(issued) : 'Not yet paid'));
  detail('Razorpay payment ID', payment?.razorpay_payment_id);
  detail('Razorpay order ID', payment?.razorpay_order_id);
  detail('Invoice number', invoiceNo);

  // ---- Footer --------------------------------------------------------------
  const footY = 272;
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.6);
  doc.line(M, footY - 8, RIGHT, footY - 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GREEN);
  doc.text('Thank you for funding this reward!', M, footY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  doc.text('This is a computer-generated invoice issued by Solmira for a Razorpay payment.', M, footY + 5);
  rightText(doc, 'solmira', RIGHT, footY + 5);

  return { doc, invoiceNo };
}

// Builds the invoice and triggers a PDF download in the browser.
export async function downloadInvoice(payment, ctx = {}) {
  const { doc, invoiceNo } = await buildInvoice(payment, ctx);
  doc.save(invoiceFileName(invoiceNo, ctx));
  return invoiceNo;
}

function invoiceFileName(invoiceNo, ctx = {}) {
  const safe = String(ctx.problemTitle || 'payment')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `Solmira-${invoiceNo}-${safe}.pdf`;
}

// ---- Preview modal ----------------------------------------------------------
// Shows the generated PDF in an overlay before anything is saved, so the
// poster can review the invoice and then choose to download it.

function ensureModalStyles() {
  if (document.getElementById('sn-inv-style')) return;
  const s = document.createElement('style');
  s.id = 'sn-inv-style';
  s.textContent = `
    .sn-inv-overlay { position: fixed; inset: 0; background: rgba(28,20,16,0.55); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: clamp(12px, 3vw, 28px); }
    .sn-inv-modal { background: #fff; border-radius: 14px; width: min(820px, 100%); height: min(88vh, 940px); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 64px rgba(28,20,16,0.35); font-family: 'Manrope', sans-serif; }
    .sn-inv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid rgba(28,20,16,0.08); background: #FAF8F4; }
    .sn-inv-title { font-family: 'Sora', sans-serif; font-size: 15px; font-weight: 700; color: #1C1410; }
    .sn-inv-sub { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6A5F58; margin-top: 2px; }
    .sn-inv-x { border: 1px solid rgba(28,20,16,0.12); background: #fff; border-radius: 8px; width: 32px; height: 32px; font-size: 16px; line-height: 1; color: #4A3F38; cursor: pointer; }
    .sn-inv-x:hover { background: #F2EEE8; }
    .sn-inv-frame { flex: 1 1 auto; width: 100%; border: none; background: #EDEAE4; }
    .sn-inv-actions { display: flex; gap: 10px; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid rgba(28,20,16,0.08); background: #FFFDF8; flex-wrap: wrap; }
    .sn-inv-dl { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 700; color: #fff; background: #2D6A4F; border: none; border-radius: 9px; padding: 11px 20px; cursor: pointer; text-decoration: none; display: inline-block; }
    .sn-inv-dl:hover { background: #245c43; }
    .sn-inv-close { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 600; color: #6A5F58; background: #fff; border: 1.5px solid rgba(28,20,16,0.14); border-radius: 9px; padding: 10px 18px; cursor: pointer; }
    .sn-inv-close:hover { color: #1C1410; }
  `;
  document.head.appendChild(s);
}

function closeInvoiceModal() {
  const old = document.getElementById('sn-inv-overlay');
  if (!old) return;
  const url = old.querySelector('iframe')?.src;
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  old.remove();
  document.removeEventListener('keydown', onInvEsc);
}

function onInvEsc(e) {
  if (e.key === 'Escape') closeInvoiceModal();
}

function showInvoiceModal(blob, fileName, invoiceNo) {
  ensureModalStyles();
  closeInvoiceModal();
  const url = URL.createObjectURL(blob);
  const overlay = document.createElement('div');
  overlay.className = 'sn-inv-overlay';
  overlay.id = 'sn-inv-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Invoice preview');
  overlay.innerHTML = `
    <div class="sn-inv-modal">
      <div class="sn-inv-head">
        <div>
          <div class="sn-inv-title">Invoice preview</div>
          <div class="sn-inv-sub">${String(invoiceNo || '').replace(/[<>&]/g, '')} · review before downloading</div>
        </div>
        <button type="button" class="sn-inv-x" aria-label="Close">×</button>
      </div>
      <iframe class="sn-inv-frame" src="${url}" title="Invoice preview"></iframe>
      <div class="sn-inv-actions">
        <button type="button" class="sn-inv-close">Close</button>
        <a class="sn-inv-dl" href="${url}" download="${String(fileName).replace(/[<>&"]/g, '')}">Download PDF</a>
      </div>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.sn-inv-x, .sn-inv-close')) closeInvoiceModal();
    if (e.target.closest('.sn-inv-dl')) setTimeout(closeInvoiceModal, 150);
  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onInvEsc);
}

// Builds the invoice and opens the preview modal (Download inside the modal
// saves the PDF). This is what every "Invoice" / "Download Invoice" button uses.
export async function previewInvoice(payment, ctx = {}) {
  const { doc, invoiceNo } = await buildInvoice(payment, ctx);
  showInvoiceModal(doc.output('blob'), invoiceFileName(invoiceNo, ctx), invoiceNo);
  return invoiceNo;
}

// Convenience for inline "Invoice" buttons: shows a short-lived label change.
export async function downloadInvoiceFromButton(btn, payment, ctx = {}) {
  if (!btn || btn.dataset.busy === '1') return;
  const label = btn.textContent;
  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.textContent = 'Preparing\u2026';
  try {
    await previewInvoice(payment, ctx);
    btn.textContent = 'Preview open \u2713';
    setTimeout(() => { btn.textContent = label; }, 1600);
  } catch (e) {
    btn.textContent = 'Failed';
    setTimeout(() => { btn.textContent = label; }, 1600);
    throw e;
  } finally {
    btn.disabled = false;
    delete btn.dataset.busy;
  }
}
