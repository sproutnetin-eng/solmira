# Razorpay Test Mode walkthrough

## Prerequisites

- `RAZORPAY_KEY_ID` begins with `rzp_test_`.
- `RAZORPAY_KEY_SECRET` is the matching Test Mode secret.
- The payments migration `supabase/migrations/20261108_payments.sql` has been applied.
- Payouts are always manual: money settles in the platform (admin) account and the admin releases it to students from `/admin/payouts`.

## Run the checkout

```powershell
npm run serve:dev
```

Sign in at `http://localhost:3001/login/poster` with the local seeded poster account:

```text
Email: poster@solmira.test
Password: Test@123
```

Open `http://localhost:3001/poster/solutions`, approve a submission, and choose **Pay**. Razorpay Checkout opens with a Test Mode order.

Use one of these simulated UPI IDs:

| What to demonstrate | Test UPI ID |
| --- | --- |
| Successful payment | `success@razorpay` |
| Failed payment | `failure@razorpay` |

Successful test payments are visible in Razorpay Dashboard after switching the dashboard to **Test Mode**. They do not debit an account or trigger a real payout.

## Optional: webhook test

The Checkout callback is verified directly by `POST /api/payments/verify`; a webhook is not required to show the successful-payment screen. To test reconciliation too, set `RAZORPAY_WEBHOOK_SECRET`, create a local payment first, and run:

```powershell
$env:RAZORPAY_WEBHOOK_SECRET='your-webhook-secret'
$env:RAZORPAY_TEST_ORDER_ID='order_id_from_payments_table'
$env:RAZORPAY_TEST_PAYMENT_ID='pay_id_from_razorpay_dashboard'
node scripts/test-webhook.js
```
