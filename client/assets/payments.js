// client/assets/payments.js  (new file)
import { api } from '/assets/app.js';

let sdk;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!sdk) {
    sdk = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load Razorpay Checkout'));
      document.head.appendChild(s);
    });
  }
  return sdk;
}

export const rupees = (paise) =>
  '\u20B9' + (Number(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Opens Razorpay Checkout for one approved solution. `amount` is the rupee
// amount the poster wants to pay; the server validates it before creating the
// Razorpay order. Resolves when the server has verified the payment. Rejects if
// the poster closes the window. `onFailure(message)` is called for a failed
// attempt, but the window stays open so the poster can retry.
export async function payForSubmission(submissionId, { prefill = {}, amount, onFailure } = {}) {
  await loadCheckout();
  const body = { submission_id: submissionId };
  if (Number.isFinite(Number(amount)) && Number(amount) > 0) body.amount = Number(amount);
  const order = await api('/api/payments/create-order', {
    method: 'POST', body,
  });

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Solmira',
      description: order.description,
      prefill,
      theme: { color: '#2D6A4F' },
      handler: async (response) => {
        try {
          // response = { razorpay_payment_id, razorpay_order_id, razorpay_signature }
          resolve(await api('/api/payments/verify', { method: 'POST', body: response }));
        } catch (e) { reject(e); }
      },
      modal: { ondismiss: () => reject(new Error('Payment window closed')) },
    });
    rzp.on('payment.failed', (r) =>
      onFailure && onFailure(r?.error?.description || 'Payment failed'));
    rzp.open();
  });
}

// Test-mode-only demonstration checkout. The server refuses this endpoint when
// configured with live Razorpay keys, so it can never collect a real payment.
export async function payForTestCheckout({ prefill = {}, onFailure } = {}) {
  await loadCheckout();
  const order = await api('/api/payments/create-test-order', { method: 'POST' });

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Solmira',
      description: order.description,
      prefill,
      theme: { color: '#2D6A4F' },
      handler: async (response) => {
        try {
          resolve(await api('/api/payments/verify-test-order', { method: 'POST', body: response }));
        } catch (e) { reject(e); }
      },
      modal: { ondismiss: () => reject(new Error('Payment window closed')) },
    });
    rzp.on('payment.failed', (r) =>
      onFailure && onFailure(r?.error?.description || 'Payment failed'));
    rzp.open();
  });
}

