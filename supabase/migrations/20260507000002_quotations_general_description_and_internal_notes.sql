-- Migración 2026-05-07: cotizaciones — descripción general del paquete + notas internas
--
-- Feedback Yami (Lozada): el flujo de cotización tiene "descripción" en
-- cada item (vuelo, hotel, traslado) que se vuelve molesto y obliga a
-- duplicar info. La idea nueva:
--   - Una sola "descripción del paquete" a nivel cotización
--   - El "notes" actual queda como "notas para el cliente" (es lo que
--     se muestra hoy en /cotizacion/[token] como "Notas del asesor")
--   - Nuevo campo "internal_notes" para notas privadas del vendedor que
--     NO se muestran en la vista pública del cliente
--
-- Las descripciones individuales por item (`quotation_items.description`)
-- siguen existiendo pero se vuelven opcionales (puede quedar empty string).
-- No las dropeamos para no romper cotizaciones legacy que ya las tienen.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS package_description TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

COMMENT ON COLUMN quotations.package_description IS
  'Descripción general del paquete/servicios. Reemplaza la descripción individual por item.';
COMMENT ON COLUMN quotations.internal_notes IS
  'Notas internas del vendedor. NO se muestran en la vista pública /cotizacion/[token].';

-- Permitir descripción vacía por item (antes era NOT NULL). En vez de DROP NOT
-- NULL hacemos un CHECK que acepta NULL o string. Esto evita romper inserts
-- legacy que mandan "" como description.
ALTER TABLE quotation_items
  ALTER COLUMN description DROP NOT NULL;

COMMENT ON COLUMN quotation_items.description IS
  'Descripción del item. Opcional desde 2026-05-07 (la info contextual va en quotations.package_description).';
