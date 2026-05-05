# EzPay Payment Smoke Test Runbook

Manual end-to-end verification of the EzPay payment integration. Run this against the EzPay **sandbox** environment after deploying changes that touch the payment domain.

## Prerequisites

- Local Postgres running with all migrations applied (`npm run migration:run`).
- A user account with API access.
- EzPay **sandbox** credentials:
  - `EZPAY_BASE_URL` — sandbox API base URL.
  - `EZPAY_DEPARTMENT_API_KEYS` — JSON, e.g. `{"education":"sandbox-key","default":"sandbox-key"}`.
  - `EZPAY_WEBHOOK_SECRET` — optional, only required if `EZPAY_WEBHOOK_VERIFY_SIGNATURE=true`.
- The form renderer (web) running locally is **not** required — `curl` is sufficient.

## 1. Seed a payment-bearing form definition

Insert a form definition whose `processors` array includes a payment entry:

```json
{
  "type": "payment",
  "config": {
    "provider": "ezpay",
    "department": "education",
    "paymentCode": "TEST-001",
    "amount": 25,
    "description": "Smoke test fee",
    "customerEmailPath": "applicant.email",
    "customerNamePath": "applicant.name"
  }
}
```

Add an email processor too so you can verify the downstream listener fires after payment confirms.

## 2. Submit the form

```bash
curl -X POST http://localhost:3001/submissions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-$(date +%s)" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "idempotencyKey":"smoke-1",
    "formId":"test",
    "formVersion":"1.0.0",
    "draftId":"d-1",
    "values":{"applicant":{"email":"a@b.c","name":"Smoke User"}}
  }'
```

**Expected:**
- HTTP 200 with `data` containing the submission entity and `meta.deferred = { paymentUrl, paymentId, amount: 25, description: "Smoke test fee" }`.
- `form_submissions` row has `status='pending_payment'` and `submitted_at IS NULL`.
- `payments` row created with the same `submission_id`, `status='initiated'`, and a populated `provider_token` / `provider_url`.

## 3. Compute and fire the webhook

Read the `reference_number` of the payment row:

```bash
REF=$(psql -tA -c "SELECT reference_number FROM payments ORDER BY created_at DESC LIMIT 1;")
BODY="{\"_reference\":\"$REF\",\"_status\":\"Success\",\"_transaction_number\":\"smoke-tx-1\",\"_amount\":\"25\"}"
```

If `EZPAY_WEBHOOK_VERIFY_SIGNATURE=true`:

```bash
SIG=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "$EZPAY_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST http://localhost:3001/payments/ezpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-ezpay-signature: $SIG" \
  -d "$BODY"
```

Otherwise (default):

```bash
curl -X POST http://localhost:3001/payments/ezpay/webhook \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

**Expected:**
- HTTP 200 `{ "acknowledged": true }`.
- API logs show: `verifyPayment` called, payment status flipped to `success`, submission transitioned `pending_payment → submitted`, `submission.created` event emitted, EmailProcessor stub fires.
- `form_submissions` row now has `status='submitted'` and `submitted_at` populated.
- `payment_transactions` row inserted with `status='success'`, `transaction_number='smoke-tx-1'`.

## 4. Verify idempotency

Re-fire the same webhook (same body, same signature). **Expected:**
- HTTP 200 `{ "acknowledged": true }`.
- No second `EmailProcessor` log line.
- Submission status remains `submitted`.
- `payment_transactions` row updated in-place (same `id`, refreshed `raw_response`) — NOT duplicated.

## 5. Verify amount-mismatch hard-fail

Insert another payment, fire a webhook with a wrong `_amount`:

```bash
BODY='{"_reference":"<ref>","_status":"Success","_transaction_number":"tx-bad","_amount":"5"}'
```

(Where `<ref>` is from a fresh `payments` row with `expected_amount = '25.00'`.)

**Expected:**
- HTTP 200 `{ "acknowledged": true }`.
- `payments.status='mismatched'` for that row.
- `form_submissions.status` stays `pending_payment` (NOT transitioned).
- No `submission.created` emit, no email log.
- API logs show an error line referencing the mismatch.

## 6. Verify signature failure (when verification enabled)

If `EZPAY_WEBHOOK_VERIFY_SIGNATURE=true`, repeat step 3 with a wrong signature:

```bash
curl -X POST http://localhost:3001/payments/ezpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-ezpay-signature: deadbeef" \
  -d "$BODY"
```

**Expected:** HTTP 403, no DB writes.

## 7. Verify forms without payment are unaffected

Submit a form whose `processors` array contains only `email` and `opencrvs` (no payment). **Expected:**
- HTTP 201 `{ outcome: "created", ... }` — no `meta.deferred`.
- Submission saved as `status='submitted'` immediately, with `submitted_at` populated.
- `submission.created` emits synchronously, listener processors run.
- No `payments` row created.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| App refuses to boot, complains about `EZPAY_BASE_URL` / `EZPAY_DEPARTMENT_API_KEYS` | Env validation — set the vars or use `.env`. |
| `EZPAY_DEPARTMENT_API_KEYS shape invalid` at startup | JSON malformed or values not strings. Must be `{"<dept>":"<key>"}` format. |
| Webhook returns 500 with "rawBody not configured" | `main.ts` missing `{ rawBody: true }`. Check the `NestFactory.create` call. |
| Webhook returns 403 in default mode | Verification is enabled and signature failed. Check `EZPAY_WEBHOOK_VERIFY_SIGNATURE` and `EZPAY_WEBHOOK_SECRET`. |
| Submission stuck in `pending_payment` after a successful sandbox payment | Webhook didn't reach the API. Check EzPay-side webhook URL config and any local tunnelling (e.g. ngrok) used to expose port 3001. |
| Listener doesn't fire after webhook | The `submission.created` emit happens inside a transaction; check that `@OnEvent("submission.created", { async: true })` is intact in `submission-processor.listener.ts`. |
