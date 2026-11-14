# Razorpay source map

The files below are active application code; do not create copies under `payments/`, because copies would not run and could drift from the real integration.

| Purpose | Active file |
| --- | --- |
| Razorpay SDK client and HMAC signature checks | `../server/lib/razorpay.js` |
| Payment split calculation | `../server/lib/payment-math.js` |
| Order creation, signature verification, webhook, payout APIs | `../server/routes/payments.js` |
| Express router registration and raw webhook-body support | `../server/server.js` |
| Browser Checkout loader and callback verification | `../client/assets/payments.js` |
| Poster approve-and-pay screen | `../client/poster-solutions.html` |
| Payment and payout database schema | `../supabase/migrations/20261108_payments.sql` |
| Local signed-webhook test utility | `../scripts/test-webhook.js` |

## Request flow

```text
Poster clicks Pay
  -> client/assets/payments.js
  -> POST /api/payments/create-order
  -> Razorpay Test Mode order
  -> Razorpay Checkout
  -> POST /api/payments/verify
  -> payment record marked paid in Supabase
```

The optional webhook follows a separate path: Razorpay -> `POST /api/payments/webhook` -> HMAC verification -> payment reconciliation.
