-- Expande el CHECK constraint de quotation_items.cost_currency para soportar
-- monedas que Emilia / HOTELBEDS / TVC pueden devolver en sus resultados.
--
-- Antes: solo 'ARS' y 'USD'.
-- Ahora: monedas comunes en el negocio de viajes.
--
-- El default sigue siendo 'USD'. El vendedor puede normalizar la moneda real
-- en el QuotationBuilder al ajustar precios definitivos con el operador.

DO $$
BEGIN
  -- Drop el check constraint viejo si existe (puede tener distintos nombres)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotation_items_cost_currency_check'
  ) THEN
    ALTER TABLE quotation_items DROP CONSTRAINT quotation_items_cost_currency_check;
  END IF;
END $$;

ALTER TABLE quotation_items
  ADD CONSTRAINT quotation_items_cost_currency_check
  CHECK (cost_currency IN ('ARS', 'USD', 'EUR', 'BRL', 'GBP', 'CLP', 'MXN', 'COP', 'PEN', 'UYU'));

COMMENT ON CONSTRAINT quotation_items_cost_currency_check ON quotation_items IS
  'Monedas aceptadas en quotation_items. Ampliado en mayo 2026 para soportar resultados de Emilia (HOTELBEDS devuelve EUR, etc.).';
