---
paths:
  - "app/(dashboard)/**"
  - "app/admin/**"
  - "app/onboarding/**"
  - "app/paywall/**"
  - "app/cotizacion/**"
  - "components/**"
  - "app/globals.css"
  - "tailwind.config.js"
---

# Claude Rule: Frontend And UI

Use this rule for dashboard UI, app shell, admin UI, onboarding, forms, tables,
dialogs, filters, responsive states, visual polish, and interaction design.

## Architecture Boundaries

- UI must not own critical business rules, authorization, financial math, ledger
  state, or service-role access.
- Use Server Components, Server Actions, or API routes for protected data and
  writes. Client Components can orchestrate interaction, not bypass guards.
- Actions that mutate data should refresh visible state without requiring F5.
- Sidebar and visible actions must match backend permissions; hiding a button is
  not authorization.

## UI System

- Prefer `components/ui` primitives and established domain components.
- Do not create a new primitive if a shadcn/Radix primitive already exists.
- Native markup is acceptable when it matches local patterns and does not fork
  the design system.
- Use semantic tokens from `app/globals.css` and `tailwind.config.js`; avoid
  hardcoded palettes.
- Admin may use `.light-force`; otherwise preserve dark-mode compatibility.
- Dashboards should be dense, scannable, operational, and clear rather than
  marketing-style.

## Skill

- Use `impeccable` for design, redesign, UI audit, polish, responsive behavior,
  accessibility, visual hierarchy, UX copy, forms, dashboards, and product UI.
- If using `impeccable`, follow its `SKILL.md` and relevant reference file.

## Verification

- Check loading, empty, error, disabled, success, and permission-denied states.
- For visible UI changes, verify text fit and responsive behavior.
- Use focused component/route tests only when the UI change affects logic or
  data contracts.
