---
paths:
  - "app/api/payments/**"
  - "app/api/accounting/**"
  - "app/api/cash/**"
  - "app/api/invoices/**"
  - "app/api/operators/**"
  - "app/api/operations/**"
  - "app/(dashboard)/cash/**"
  - "app/(dashboard)/accounting/**"
  - "app/(dashboard)/finances/**"
  - "app/(dashboard)/operators/**"
  - "app/(dashboard)/operations/**"
  - "lib/accounting/**"
  - "lib/payments/**"
  - "lib/invoices/**"
  - "lib/afip/**"
  - "lib/commissions/**"
  - "lib/billing/**"
---

# Claude Rule: Finance And Accounting

Use this rule for money, accounting, tax, billing, operator debt, commissions,
cash, invoices, AFIP, and payment state changes.

## Non-Negotiable Invariants

- Preserve the `AGENTS.md` architecture contract: tenant scope, permissions,
  no client-side secrets, and no service-role shortcuts in user-facing flows.
- `operator_payments` is the source of truth for operator debt when the feature
  flag `features.operator_debt_from_operator_payments` is enabled.
- Do not calculate operator debt from `operations.operator_cost` alone.
- Writes that affect money require idempotency, CAS guards, balance validation,
  and auditability.
- Never silently swallow critical accounting failures. Non-blocking
  notifications may fail; ledger, cash, counterparts, FX, operator payments,
  invoices, billing, and tax state may not fail invisibly.

## Required Review Questions

- Does every query use `org_id` or a validated org/agency scope?
- Does a state transition check the previous state before updating?
- Does a paid payment update all dependent ledgers, cash movements,
  counterparts, FX/perceptions, and operator-payment settlement?
- Are ARS/USD amounts and exchange rates explicit?
- Are financial side effects idempotent across retry, double-submit, webhook
  replay, and cron rerun?
- Is there a focused test for the touched invariant?

## Testing Guidance

- Prefer focused tests under `lib/accounting/**`, `lib/billing/**`,
  `lib/commissions/**`, or the nearest route tests.
- Run `npm run check:admin-client` if a change touches service-role usage.
- For docs-only changes in this area, no app test is required; still inspect
  references for stale financial rules.
