-- Migration 155: Toggle master para desactivar todas las retenciones/percepciones.
--
-- Caso de uso: agencias monotributistas o de prueba que no aplican ninguna
-- retención/percepción. Antes la única forma de saltear era setear cada regla
-- en is_active=false individualmente (confuso y error-prone).
--
-- Flag simple: cuando withholdings_enabled = false, el motor saltea TODO el
-- cálculo automático de retenciones. Las reglas individuales se mantienen
-- intactas en financial_settings.withholding_rules — solo se pausa su
-- ejecución. Al re-habilitar, todo vuelve al comportamiento anterior.

ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS withholdings_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.financial_settings.withholdings_enabled IS
  'Master toggle. Si es false, el motor de retenciones/percepciones no genera NINGUNA entrada automática (ni PERCEPCION_IVA, IIBB, RG 5617, RG 3819, etc.). Útil para monotributistas o agencias que no retienen. Las reglas individuales se preservan para cuando se reactive.';
