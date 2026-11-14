'use strict';
// server/lib/razorpay.js
const crypto = require('crypto');
const Razorpay = require('razorpay');

let client = null;

function getRazorpay() {
  if (client) return client;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys are not configured');
  }
  client = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  return client;
}

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Checkout callback signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
function verifyCheckoutSignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  return safeEqual(hmac(secret, `${orderId}|${paymentId}`), signature);
}

// Webhook signature = HMAC_SHA256(RAW request body, webhook secret)
function verifyWebhookSignature(rawBody, signature,
  secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  if (!secret || !rawBody) return false;
  return safeEqual(hmac(secret, rawBody), signature);
}

module.exports = { getRazorpay, verifyCheckoutSignature, verifyWebhookSignature };

