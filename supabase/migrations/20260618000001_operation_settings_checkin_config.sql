-- Configuración de check-in por agencia: anticipación por defecto + overrides por aerolínea.
--
-- Contexto: la alerta CHECKIN_REMINDER (lib/alerts/checkin-alerts.ts) usaba una ventana
-- hardcodeada de ~48hs para todas las operaciones. Un cliente pidió poder configurar el
-- tiempo de anticipación según la aerolínea (algunas abren check-in 24hs antes, otras 72hs).
--
-- - checkin_enabled: permite desactivar por completo la generación de la alerta de check-in.
-- - checkin_default_hours: anticipación por defecto en HORAS (48 = comportamiento previo).
-- - checkin_airline_lead_times: array JSON de overrides [{ "airline": string, "hours": number }].
--   El match contra operations.airline_name es por texto normalizado (sin mayúsculas/acentos).
--
-- Nota: el cron de alertas corre 1x/día, así que la resolución efectiva es por día
-- (la lógica usa ceil(horas/24)).

ALTER TABLE operation_settings
  ADD COLUMN IF NOT EXISTS checkin_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS checkin_default_hours INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS checkin_airline_lead_times JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN operation_settings.checkin_enabled IS 'Si false, no se generan alertas de check-in para la agencia.';
COMMENT ON COLUMN operation_settings.checkin_default_hours IS 'Anticipación por defecto de la alerta de check-in, en horas.';
COMMENT ON COLUMN operation_settings.checkin_airline_lead_times IS 'Overrides por aerolínea: [{airline, hours}]. Match por airline_name normalizado.';
