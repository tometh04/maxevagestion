-- Documenta el uso real de users.onboarding_state.
--
-- La columna se creó en 20260630000002 pero quedó sin usar: el onboarding de
-- entonces terminó guardando su progreso en organization_settings, porque sus
-- pasos (datos de empresa, equipo, cuenta financiera, AFIP) son hechos de la
-- agencia y se comparten entre sus admins.
--
-- Las guías in-app por pantalla sí son de cada persona ("ya vi la guía de
-- operaciones"), así que ahora esta columna es su store. El progreso del setup
-- de la agencia sigue en organization_settings(key='onboarding_state').
--
-- No cambia schema, tipos ni RLS: solo deja escrito el contrato para el
-- próximo que abra la tabla.

COMMENT ON COLUMN public.users.onboarding_state IS
  'Guías in-app por usuario (v1): { version, seenTours: { [tourId]: { status, lastStepIndex, startedAt, completedAt, dismissedAt } }, toursDisabled }. NULL = usuario sin guías vistas. El setup ORG de la agencia vive en organization_settings(key=''onboarding_state'').';
