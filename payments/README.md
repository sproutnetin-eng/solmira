# Solmira payments

This folder is the payment-integration guide for Solmira. The active source files stay in the application folders so Express can load its route and the browser can load its Checkout module. See [SOURCE_MAP.md](SOURCE_MAP.md) for every Razorpay file.

## Test mode: ready for a demo

Use only Razorpay keys beginning with `rzp_test_`. Test Mode opens the real Razorpay Checkout UI but creates simulated payments: no money is debited and no live settlement occurs.

1. Copy the values in [test-mode.env.example](test-mode.env.example) into `.env` (do not commit real credentials).
2. Start the app: `npm run serve:dev`.
3. Sign in as `poster@solmira.test` with password `Test@123`.
4. Open `/poster/solutions`, approve a solution, and select **Pay**.
5. In Checkout, use UPI ID `success@razorpay` for a successful simulated payment or `failure@razorpay` to test failure handling.
6. In the Razorpay Dashboard, switch to **Test Mode** and inspect **Transactions → Payments**.

For a complete walkthrough, see [TEST_MODE.md](TEST_MODE.md).

`RAZORPAY_WEBHOOK_SECRET` is optional for this local demonstration. It is required only when testing Razorpay's server-to-server webhook delivery.

## Before enabling payments

1. Apply `../supabase/migrations/20261108_payments.sql` in the Supabase SQL editor.
2. Add these private environment values to `.env` and to the deployment environment:

   ```text
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=long-random-secret
   PLATFORM_FEE_PERCENT=10
   # Optional: set true only if payment must wait for final work.
   PAYMENT_REQUIRES_FINAL_WORK=false
   ```

3. In Razorpay, configure `https://YOUR_DOMAIN/api/payments/webhook` for `payment.captured`, `order.paid`, `payment.failed`, and `refund.processed`.
4. **Money flow:** every poster payment settles in the platform's (admin's) Razorpay account. No money is ever sent to a student automatically — each payout is queued as a pending manual row, the admin transfers the solver's share from their own account and records the UTR on `/admin/payouts`. Mentors do not receive a commission.

## Local webhook check

Start the server, create a payment record using the normal checkout flow, then run:

```powershell
$env:RAZORPAY_WEBHOOK_SECRET='your-webhook-secret'
$env:RAZORPAY_TEST_ORDER_ID='order_from_your_payments_row'
$env:RAZORPAY_TEST_PAYMENT_ID='pay_test_id'
node scripts/test-webhook.js
```

For a real end-to-end test, use Razorpay's test-mode Checkout and webhook delivery tool; the fake script only verifies request signing and routing.
