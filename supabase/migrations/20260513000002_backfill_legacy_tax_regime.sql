-- Migración 2026-05-13: backfill tax_regime legacy 'TRAVEL_AGENCY'
--
-- PROBLEMA (reportado por Lozada Gualeguaychú):
--   Al cambiar la alícuota IIBB y guardar config financiera, tira
--   "Datos inválidos". El bug: el schema Zod del PUT solo acepta
--   tax_regime IN ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO',
--   'NO_RESPONSABLE'), pero la BD tiene rows con 'TRAVEL_AGENCY' (valor
--   legacy que quedó de una migración anterior y nunca se backfilleó).
--
--   Cuando el cliente hace GET, recibe ese valor, lo mete en el form
--   state, y al PUT lo manda de vuelta. Zod lo rechaza.
--
-- FIX:
--   UPDATE de todas las rows con tax_regime fuera del enum válido
--   (incluye NULL) a 'RESPONSABLE_INSCRIPTO' — el régimen estándar
--   para agencias de viaje en Argentina. Si alguna agencia es
--   monotributista o exenta, se cambia manualmente desde la UI
--   después de aplicar este backfill.
--
-- DEFENSE-IN-DEPTH:
--   Además del backfill, el GET endpoint /api/finances/settings
--   coerce el valor en runtime si vuelve a aparecer un legacy.

BEGIN;

-- Diagnóstico previo (no hace cambios, solo reporta)
DO $$
DECLARE
  legacy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM financial_settings
  WHERE tax_regime IS NULL
     OR tax_regime NOT IN ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'NO_RESPONSABLE');
  RAISE NOTICE 'Filas con tax_regime legacy/NULL a backfillear: %', legacy_count;
END $$;

-- Backfill
UPDATE financial_settings
SET tax_regime = 'RESPONSABLE_INSCRIPTO',
    updated_at = NOW()
WHERE tax_regime IS NULL
   OR tax_regime NOT IN ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'NO_RESPONSABLE');

-- Verificación: debe ser 0
DO $$
DECLARE
  still_invalid INTEGER;
BEGIN
  SELECT COUNT(*) INTO still_invalid
  FROM financial_settings
  WHERE tax_regime IS NULL
     OR tax_regime NOT IN ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'NO_RESPONSABLE');
  IF still_invalid > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % filas siguen con tax_regime inválido', still_invalid;
  END IF;
END $$;

COMMIT;
