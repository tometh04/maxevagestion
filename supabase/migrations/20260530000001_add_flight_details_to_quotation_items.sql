-- Agrega flight_details (jsonb) a quotation_items para guardar el detalle
-- COMPLETO del vuelo que trae Emilia: legs (ida/vuelta) con horarios, ciudades,
-- duración y escalas (ciudad de conexión + tiempo de espera).
--
-- Los campos flat (airline, flight_route, flight_stops, flight_class,
-- flight_date, flight_return_date) se mantienen para compatibilidad y para el
-- builder manual. flight_details es el detalle rico que renderiza la cotización
-- pública cuando el vuelo viene de Emilia (sin screenshot).
--
-- Idempotente y nullable: cero riesgo, no toca datos existentes.

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS flight_details jsonb;

COMMENT ON COLUMN quotation_items.flight_details IS
  'Detalle rico del vuelo (legs con horarios/duración/escalas) para cotizaciones de Emilia. Shape: { legs: [{ departure:{city_code,city_name,time}, arrival:{...}, duration, flight_type, layovers:[{destination_city,destination_code,waiting_time}], arrival_next_day }] }';
