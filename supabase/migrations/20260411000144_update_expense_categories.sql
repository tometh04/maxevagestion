-- =====================================================
-- Migración 114: Actualizar categorías de gastos
-- Renombra/consolida las categorías predefinidas para reflejar
-- el esquema pedido por el cliente:
--   Gastos oficina, Sueldos, Impuestos, Marketing y sistemas, Varios, Otros
-- =====================================================

BEGIN;

-- Paso 1: Reasignar referencias a "Servicios" hacia el row de "Alquiler"
-- (que pasará a llamarse "Gastos oficina"). Esto consolida alquiler + servicios
-- básicos (luz, agua, internet) en una sola categoría "Gastos oficina".
UPDATE recurring_payments
SET category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Alquiler')
WHERE category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Servicios');

UPDATE cash_movements
SET category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Alquiler')
WHERE category_id = (SELECT id FROM recurring_payment_categories WHERE name = 'Servicios');

-- Paso 2: Renombrar categorías existentes (preservando UUID para no romper FKs)
UPDATE recurring_payment_categories
SET name = 'Gastos oficina',
    description = 'Alquileres, luz, agua, y gastos varios de oficina',
    updated_at = NOW()
WHERE name = 'Alquiler';

UPDATE recurring_payment_categories
SET name = 'Sueldos',
    description = 'Sueldos y honorarios de empleados',
    updated_at = NOW()
WHERE name = 'Salarios';

UPDATE recurring_payment_categories
SET name = 'Marketing y sistemas',
    description = 'Publicidad, redes sociales, software y sistemas',
    updated_at = NOW()
WHERE name = 'Marketing';

-- "Impuestos" y "Otros" se mantienen sin cambios.

-- Paso 3: Eliminar "Servicios" (ya no hay filas referenciándolo)
DELETE FROM recurring_payment_categories WHERE name = 'Servicios';

-- Paso 4: Insertar "Varios" (nueva categoría para gastos variables recurrentes)
INSERT INTO recurring_payment_categories (name, description, color)
VALUES ('Varios', 'Gastos variables recurrentes de bajo monto', '#64748b')
ON CONFLICT (name) DO NOTHING;

COMMIT;
