# Enable all payment options by default (#936)

## Context

The EzPay payment processor config carried three optional booleans —
`allowCredit` / `allowDebit` / `allowPayce` — surfaced as checkboxes in the form
builder
([#936](https://github.com/govtech-bb/gov-bb/issues/936)). They were
**effectively no-ops**: the builder UI only ever wrote a flag as `true` or
deleted it (never `false`), and the EzPay client treated *absent* as enabled
(`p.allowCredit === false ? "0" : "1"`). So every form already offered all three
payment methods regardless of the toggles. The issue asked to make that explicit
— remove the toggles, enable everything by default. (An earlier version of the
issue also proposed removing the `customerEmailPath` / `customerNamePath` fields;
that was dropped — those source the EzPay reference email/name and were left
untouched.) Resolved on `enable-payment-options-default-936` (targets
`sandbox`).

## What we did

- **`packages/form-types/src/processor.type.ts`** — dropped `allowCredit` /
  `allowDebit` / `allowPayce` from both `paymentConfigAuthorSchema` and
  `paymentConfigResolvedSchema`.
- **`apps/form_builder/app/routes/builder/-processor-config-form.tsx`** — removed
  the three checkboxes and the `setBool` prune helper that backed them.
- **`apps/api/.../payment/ezpay/ezpay.types.ts`** — dropped the three optional
  flags from `CreatePaymentParams`.
- **`apps/api/.../payment/ezpay/ezpay.client.ts`** — `ez_allow_credit` /
  `ez_allow_debit` / `ez_allow_payce` are now unconditionally `"1"`.
- **`apps/api/.../payment/payment.processor.ts`** — stopped forwarding the flags
  into `createPayment`.
- Tests: new guard in `ezpay.client.spec.ts` asserting all three send `"1"`;
  removed the stale flags from the `serialization.spec.ts` fixture.

## Why we did it that way

- **Dropped the flags outright rather than keeping them defaulted-on.** The
  issue offered both options. Removing them is the smaller surface and matches
  the intent ("the toggles are no-ops, make it explicit"). It's safe against
  existing stored recipes because the schemas are plain `z.object` (not
  `.strict()`), so any persisted `allow*` key is silently stripped on parse —
  no migration needed.
- **Hardcoded `"1"` in the client, not a default in the schema.** With the flags
  gone from the type, the enabled-by-default decision lives in exactly one place
  — the EzPay wire call — which is also where the old `=== false` fallback
  already lived. The guard test pins it there.
- **Left `customerEmailPath` / `customerNamePath` alone** per the issue's
  scope reduction — they feed the EzPay reference and are unrelated to the
  payment-method toggles.

## Open questions

- None. Conditional/calculated payment amounts are tracked separately in
  [#937](https://github.com/govtech-bb/gov-bb/issues/937).
