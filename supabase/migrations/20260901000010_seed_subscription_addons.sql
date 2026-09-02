-- Seed del catálogo de complementos + backfill de quienes YA los usan.
--
-- Todo entra inerte:
--   * `active = false`     ⇒ no se ofrece todavía en el panel del cliente.
--   * `enforcement = 'OFF'` ⇒ los gates dejan pasar a todos.
--   * `price_ars_monthly = NULL` ⇒ sin precio cargado.
--
-- El backfill da de alta a las agencias que hoy usan cada cosa, con
-- `price_ars_monthly_snapshot = 0`: nadie que hoy lo tiene gratis empieza a
-- pagar por este cambio. Ponerles precio es una decisión comercial posterior,
-- complemento por complemento, desde /admin/orgs/[id].
--
-- El criterio del backfill es "evidencia de uso real", no "podría entrar":
-- así, cuando se pase el enforcement a ON, nadie que lo estuviera usando lo
-- pierde, y los que nunca lo tocaron quedan como candidatos a venderles.

BEGIN;

-- ── Catálogo ────────────────────────────────────────────────────────────────
INSERT INTO public.subscription_addons (addon_key, sort_order) VALUES
  ('agente_blanco', 10),
  ('emilia', 20),
  ('growth_studio', 30),
  ('wha_control', 40),
  ('library', 50),
  ('referrals', 60),
  ('monthly_commissions', 70),
  ('cerebro', 80)
ON CONFLICT (addon_key) DO NOTHING;

-- ── Emilia: reproducir la promoción vigente ─────────────────────────────────
-- Hoy Emilia es gratis para todos hasta el 11/11/2026 y sin límite para
-- ENTERPRISE / custom plan (ver lib/emilia/access.ts). Sin estas filas, activar
-- el enforcement le cortaría Emilia a todos los tenants de golpe.
--
-- Al vencer la inclusión, Emilia se apaga para los planes STARTER/PRO sin
-- cobrarles de sorpresa: nadie autorizó ese cargo. Hay un aviso en
-- /admin/billing de las inclusiones que vencen en los próximos 30 días.
INSERT INTO public.subscription_addon_plan_inclusions (addon_key, plan_id, included_until) VALUES
  ('emilia', 'STARTER',    '2026-11-11T19:32:31Z'),
  ('emilia', 'PRO',        '2026-11-11T19:32:31Z'),
  ('emilia', 'ENTERPRISE', NULL),
  ('emilia', 'CUSTOM',     NULL)
ON CONFLICT (addon_key, plan_id) DO NOTHING;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Agente Blanco: las orgs que ya tienen el identificador cargado.
INSERT INTO public.organization_addons
  (org_id, addon_key, status, price_ars_monthly_snapshot, price_source, activated_at, billable_from, notes)
SELECT o.id, 'agente_blanco', 'ACTIVE', 0, 'ADMIN_OVERRIDE', now(), now(),
       'Backfill: ya tenia agente_blanco_org_slug cargado. Bonificado.'
FROM public.organizations o
WHERE o.agente_blanco_org_slug IS NOT NULL
ON CONFLICT (org_id, addon_key) DO NOTHING;

-- Comisiones mensuales: las orgs con el feature flag prendido.
INSERT INTO public.organization_addons
  (org_id, addon_key, status, price_ars_monthly_snapshot, price_source, activated_at, billable_from, notes)
SELECT DISTINCT s.org_id, 'monthly_commissions', 'ACTIVE', 0, 'ADMIN_OVERRIDE', now(), now(),
       'Backfill: tenia features.monthly_commissions_module prendido. Bonificado.'
FROM public.organization_settings s
WHERE s.key = 'features.monthly_commissions_module'
  AND lower(s.value) IN ('true', '1', 'yes')
  AND s.org_id IS NOT NULL
ON CONFLICT (org_id, addon_key) DO NOTHING;

-- WHA Control: las orgs que tienen dispositivos vinculados.
INSERT INTO public.organization_addons
  (org_id, addon_key, status, price_ars_monthly_snapshot, price_source, activated_at, billable_from, notes)
SELECT DISTINCT d.org_id, 'wha_control', 'ACTIVE', 0, 'ADMIN_OVERRIDE', now(), now(),
       'Backfill: ya tenia dispositivos vinculados. Bonificado.'
FROM public.wa_devices d
WHERE d.org_id IS NOT NULL
ON CONFLICT (org_id, addon_key) DO NOTHING;

-- Referidos: las orgs que ya cargaron referidores.
INSERT INTO public.organization_addons
  (org_id, addon_key, status, price_ars_monthly_snapshot, price_source, activated_at, billable_from, notes)
SELECT DISTINCT p.org_id, 'referrals', 'ACTIVE', 0, 'ADMIN_OVERRIDE', now(), now(),
       'Backfill: ya tenia referidores cargados. Bonificado.'
FROM public.referral_partners p
WHERE p.org_id IS NOT NULL
ON CONFLICT (org_id, addon_key) DO NOTHING;

-- Biblioteca: las orgs con material cargado.
INSERT INTO public.organization_addons
  (org_id, addon_key, status, price_ars_monthly_snapshot, price_source, activated_at, billable_from, notes)
SELECT DISTINCT r.org_id, 'library', 'ACTIVE', 0, 'ADMIN_OVERRIDE', now(), now(),
       'Backfill: ya tenia material en la biblioteca. Bonificado.'
FROM public.library_resources r
WHERE r.org_id IS NOT NULL
ON CONFLICT (org_id, addon_key) DO NOTHING;

-- Growth Studio: las orgs que ya lo usaron.
INSERT INTO public.organization_addons
  (org_id, addon_key, status, price_ars_monthly_snapshot, price_source, activated_at, billable_from, notes)
SELECT DISTINCT e.org_id, 'growth_studio', 'ACTIVE', 0, 'ADMIN_OVERRIDE', now(), now(),
       'Backfill: ya venia usando Growth Studio. Bonificado.'
FROM public.growth_studio_events e
WHERE e.org_id IS NOT NULL
ON CONFLICT (org_id, addon_key) DO NOTHING;

-- Cerebro: las orgs con uso registrado de IA.
INSERT INTO public.organization_addons
  (org_id, addon_key, status, price_ars_monthly_snapshot, price_source, activated_at, billable_from, notes)
SELECT DISTINCT u.org_id, 'cerebro', 'ACTIVE', 0, 'ADMIN_OVERRIDE', now(), now(),
       'Backfill: ya venia usando Cerebro. Bonificado.'
FROM public.usage_events u
WHERE u.module = 'ai' AND u.org_id IS NOT NULL
ON CONFLICT (org_id, addon_key) DO NOTHING;

COMMIT;
