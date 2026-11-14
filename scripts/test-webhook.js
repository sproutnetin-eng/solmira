'use strict';

// Sends a signed Razorpay-shaped webhook to a local Solmira server.
// Usage: RAZORPAY_WEBHOOK_SECRET=... node scripts/test-webhook.js
const crypto = require('crypto');

const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
if (!secret) throw new Error('Set RAZORPAY_WEBHOOK_SECRET before running this script.');

const baseUrl = process.env.SOLMIRA_URL || 'http://localhost:3001';
const orderId = process.env.RAZORPAY_TEST_ORDER_ID || 'order_test_replace_me';
const paymentId = process.env.RAZORPAY_TEST_PAYMENT_ID || 'pay_test_replace_me';
const amount = Number(process.env.RAZORPAY_TEST_AMOUNT_PAISE || 10000);
const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {
  id: paymentId, order_id: orderId, amount, status: 'captured',
} } } });
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

fetch(`${baseUrl}/api/payments/webhook`, { method: 'POST', headers: {
  'content-type': 'application/json', 'x-razorpay-signature': signature,
  'x-razorpay-event-id': `local_${Date.now()}`,
}, body: payload }).then(async (response) => {
  console.log(response.status, await response.text());
  process.exitCode = response.ok ? 0 : 1;
}).catch((error) => { console.error(error); process.exitCode = 1; });
