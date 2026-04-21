-- Migration 156: Fix organizations.plan CHECK constraint.
--
-- La migration original (132) creó el constraint con 'PROFESSIONAL', pero el
-- catálogo de planes (lib/billing/plans.ts) y la landing (vibook.ai) usan
-- 'PRO'. Consecuencia: cualquier signup nuevo después de la actualización
-- del register API (commit f93cecd, "PRO con trial 7d") fallaba con
-- organizations_plan_check violated.
--
-- Fix:
-- 1. Actualizar orgs existentes con 'PROFESSIONAL' → 'PRO' (si las hay).
-- 2. Drop constraint viejo.
-- 3. Recrear con 'PRO' (nombre canonical) + 'PROFESSIONAL' como legacy alias.

-- Paso 1: normalizar datos pre-existentes.
UPDATE public.organizations
   SET plan = 'PRO'
 WHERE plan = 'PROFESSIONAL';

-- Paso 2: drop constraint viejo (nombre auto-asignado por Postgres).
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

-- Paso 3: recrear aceptando los 3 valores que el código usa hoy.
-- PROFESSIONAL queda permitido como alias legacy por si queda alguna fila
-- histórica — pero todo código nuevo escribe 'PRO'.
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('STARTER', 'PRO', 'PROFESSIONAL', 'ENTERPRISE'));

COMMENT ON CONSTRAINT organizations_plan_check ON public.organizations IS
  'Valores válidos para plan. PRO es el nombre canonical (lib/billing/plans.ts + landing). STARTER es legacy oculto en UI. PROFESSIONAL es alias legacy de PRO.';
