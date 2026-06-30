-- Persistencia del progreso de onboarding por usuario.
--
-- Contexto: el tour/checklist de bienvenida guardaba su estado solo en
-- localStorage, así que el progreso se perdía al cambiar de dispositivo o
-- limpiar el navegador, y el gating estaba hardcodeado a un email de prueba.
-- Ahora el progreso vive en la DB (sobrevive cross-device/sesión) y la
-- elegibilidad se decide por antigüedad de la cuenta (<30 días) + rol.
--
-- Shape de onboarding_state (jsonb):
--   { "completedSteps": string[], "dismissed": boolean, "completedAt": string|null }
-- NULL = usuario sin progreso (estado fresco).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb;

COMMENT ON COLUMN public.users.onboarding_state IS
  'Progreso del onboarding de bienvenida: { completedSteps, dismissed, completedAt }. NULL = fresco.';
