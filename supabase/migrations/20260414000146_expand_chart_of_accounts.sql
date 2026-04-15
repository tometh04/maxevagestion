-- =====================================================
-- Migración 146: Expandir Plan de Cuentas
-- Agrega ~25 cuentas nuevas para partida doble profesional
-- =====================================================

-- Primero obtener los IDs de las cuentas padre existentes
-- y luego insertar las cuentas nuevas con parent_id correcto

-- =====================================================
-- ACTIVO CORRIENTE — Cuentas nuevas
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '1.1.06', 'Anticipos a Proveedores', 'ACTIVO', 'CORRIENTE', 'ANTICIPOS_PROVEEDORES', 2, p.id, true, 6, 'Anticipos entregados a operadores/proveedores'
FROM chart_of_accounts p WHERE p.account_code = '1.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '1.1.07', 'IVA Crédito Fiscal', 'ACTIVO', 'CORRIENTE', 'IVA_CREDITO', 2, p.id, true, 7, 'IVA pagado en compras (crédito fiscal a favor)'
FROM chart_of_accounts p WHERE p.account_code = '1.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '1.1.08', 'Otros Créditos', 'ACTIVO', 'CORRIENTE', 'OTROS_CREDITOS', 2, p.id, true, 8, 'Otros créditos a cobrar'
FROM chart_of_accounts p WHERE p.account_code = '1.1'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- PASIVO CORRIENTE — Cuentas nuevas
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.05', 'Retenciones a Depositar', 'PASIVO', 'CORRIENTE', 'RETENCIONES', 2, p.id, true, 5, 'Retenciones practicadas pendientes de depósito a AFIP'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.06', 'Cargas Sociales a Pagar', 'PASIVO', 'CORRIENTE', 'CARGAS_SOCIALES', 2, p.id, true, 6, 'Aportes y contribuciones patronales pendientes'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.07', 'Anticipos de Clientes', 'PASIVO', 'CORRIENTE', 'ANTICIPOS_CLIENTES', 2, p.id, true, 7, 'Cobros anticipados de clientes por servicios no prestados'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.08', 'IIBB a Pagar', 'PASIVO', 'CORRIENTE', 'IIBB', 2, p.id, true, 8, 'Ingresos Brutos pendientes de pago'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '2.1.09', 'Impuesto a las Ganancias a Pagar', 'PASIVO', 'CORRIENTE', 'GANANCIAS', 2, p.id, true, 9, 'Impuesto a las Ganancias pendiente de pago'
FROM chart_of_accounts p WHERE p.account_code = '2.1'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- PATRIMONIO NETO — Cuentas nuevas
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '3.1.04', 'Resultado del Ejercicio', 'PATRIMONIO_NETO', 'RESULTADOS', 'RESULTADO_EJERCICIO', 2, p.id, true, 4, 'Resultado del ejercicio económico en curso'
FROM chart_of_accounts p WHERE p.account_code = '3.1'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- RESULTADO — INGRESOS nuevos
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.1.03', 'Comisiones Ganadas', 'RESULTADO', 'INGRESOS', 'COMISIONES_GANADAS', 2, p.id, true, 3, 'Comisiones ganadas por intermediación'
FROM chart_of_accounts p WHERE p.account_code = '4.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.1.04', 'Intereses Ganados', 'RESULTADO', 'INGRESOS', 'INTERESES_GANADOS', 2, p.id, true, 4, 'Intereses por inversiones o plazos fijos'
FROM chart_of_accounts p WHERE p.account_code = '4.1'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.1.05', 'Diferencia de Cambio Positiva', 'RESULTADO', 'INGRESOS', 'DIF_CAMBIO_POS', 2, p.id, true, 5, 'Ganancia por variación de tipo de cambio'
FROM chart_of_accounts p WHERE p.account_code = '4.1'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- RESULTADO — COSTOS nuevos
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.03', 'Costo de Hotelería', 'RESULTADO', 'COSTOS', 'COSTO_HOTELERIA', 2, p.id, true, 3, 'Costos de alojamiento'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.04', 'Costo de Aéreos', 'RESULTADO', 'COSTOS', 'COSTO_AEREOS', 2, p.id, true, 4, 'Costos de pasajes aéreos'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.05', 'Costo de Transfers', 'RESULTADO', 'COSTOS', 'COSTO_TRANSFERS', 2, p.id, true, 5, 'Costos de traslados'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.06', 'Costo de Seguros', 'RESULTADO', 'COSTOS', 'COSTO_SEGUROS', 2, p.id, true, 6, 'Costos de seguros de viaje (assist card, etc.)'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.2.07', 'Costo de Excursiones', 'RESULTADO', 'COSTOS', 'COSTO_EXCURSIONES', 2, p.id, true, 7, 'Costos de excursiones y actividades'
FROM chart_of_accounts p WHERE p.account_code = '4.2'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- RESULTADO — GASTOS nuevos
-- =====================================================
INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.05', 'Sueldos y Jornales', 'RESULTADO', 'GASTOS', 'SUELDOS', 2, p.id, true, 5, 'Sueldos y salarios del personal'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.06', 'Cargas Sociales', 'RESULTADO', 'GASTOS', 'CARGAS_SOCIALES_GASTO', 2, p.id, true, 6, 'Aportes y contribuciones patronales'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.07', 'Alquileres', 'RESULTADO', 'GASTOS', 'ALQUILERES', 2, p.id, true, 7, 'Alquiler de oficinas y locales'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.08', 'Servicios (Luz, Gas, Internet)', 'RESULTADO', 'GASTOS', 'SERVICIOS', 2, p.id, true, 8, 'Servicios públicos y de comunicaciones'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.09', 'Impuestos y Tasas', 'RESULTADO', 'GASTOS', 'IMPUESTOS', 2, p.id, true, 9, 'Impuestos y tasas municipales/provinciales'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.10', 'Seguros', 'RESULTADO', 'GASTOS', 'SEGUROS_GASTO', 2, p.id, true, 10, 'Seguros de la empresa (responsabilidad civil, etc.)'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.11', 'Amortizaciones', 'RESULTADO', 'GASTOS', 'AMORTIZACIONES', 2, p.id, true, 11, 'Amortización de bienes de uso'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.12', 'Gastos Bancarios', 'RESULTADO', 'GASTOS', 'GASTOS_BANCARIOS', 2, p.id, true, 12, 'Comisiones y mantenimiento bancario'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.13', 'Diferencia de Cambio Negativa', 'RESULTADO', 'GASTOS', 'DIF_CAMBIO_NEG', 2, p.id, true, 13, 'Pérdida por variación de tipo de cambio'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.14', 'Gastos de Sistemas / Software', 'RESULTADO', 'GASTOS', 'GASTOS_SISTEMAS', 2, p.id, true, 14, 'Licencias, hosting, herramientas digitales'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO chart_of_accounts (account_code, account_name, category, subcategory, account_type, level, parent_id, is_movement_account, display_order, description)
SELECT '4.3.15', 'Otros Gastos', 'RESULTADO', 'GASTOS', 'OTROS_GASTOS', 2, p.id, true, 15, 'Gastos varios no clasificados'
FROM chart_of_accounts p WHERE p.account_code = '4.3'
ON CONFLICT (account_code) DO NOTHING;

-- =====================================================
-- Actualizar parent_id de cuentas existentes que no lo tienen
-- =====================================================
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1.1')
WHERE account_code IN ('1.1.01', '1.1.02', '1.1.03', '1.1.04', '1.1.05') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '1.2')
WHERE account_code = '1.2.01' AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2.1')
WHERE account_code IN ('2.1.01', '2.1.02', '2.1.03', '2.1.04') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2.2')
WHERE account_code = '2.2.01' AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '3.1')
WHERE account_code IN ('3.1.01', '3.1.02', '3.1.03') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4.1')
WHERE account_code IN ('4.1.01', '4.1.02') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4.2')
WHERE account_code IN ('4.2.01', '4.2.02') AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '4.3')
WHERE account_code IN ('4.3.01', '4.3.02', '4.3.03', '4.3.04') AND parent_id IS NULL;

-- Renombrar IVA a Pagar → IVA Débito Fiscal (más preciso contablemente)
UPDATE chart_of_accounts SET account_name = 'IVA Débito Fiscal' WHERE account_code = '2.1.02';
