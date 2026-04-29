-- Migration 154: Legal acceptance tracking on users.
--
-- Agrega tracking de aceptación de legales al momento del signup.
-- Queda como info auditable + base para re-aceptación cuando publiquemos
-- una nueva versión de los términos.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legal_version TEXT;

COMMENT ON COLUMN public.users.legal_accepted_at IS
  'Fecha/hora en que el user aceptó los Términos, Privacidad y Cookies. NULL = nunca aceptó (user pre-migración o fallback).';

COMMENT ON COLUMN public.users.legal_version IS
  'Versión de los docs legales aceptados (ej: "2026-04-20"). Cuando publiquemos una nueva versión, comparamos con este valor para forzar re-aceptación.';

-- Backfill: users existentes quedan con NULL (signup pre-feature).
-- No los forzamos a re-aceptar retroactivamente; se captura la aceptación
-- al próximo signup o al prompt de nueva versión que hagamos a futuro.
