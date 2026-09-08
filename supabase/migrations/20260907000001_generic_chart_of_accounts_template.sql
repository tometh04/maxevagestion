-- El plan de cuentas de una agencia nueva sale de una plantilla, no de otra agencia
--
-- QUE PASABA
-- ----------
-- `seed_chart_of_accounts_for_org()` —y su gemela en TypeScript
-- `lib/accounting/seed-chart-of-accounts.ts`— armaban el plan de una
-- organizacion nueva COPIANDO las cuentas de una organizacion real usada como
-- template: `lozada-viajes`. El alta de un tenant leia datos de otro tenant.
--
-- Tres problemas concretos:
--
--   1. Cualquier cuenta que esa agencia agregue a mano desde Contabilidad >
--      Plan de Cuentas (un banco propio, la cuenta de un socio, un rubro que
--      solo le sirve a ellos) se le copia a la proxima agencia que se registre.
--      Hoy no hay ninguna: las 27 orgs tienen exactamente el mismo plan de 67
--      cuentas. Es cuestion de tiempo, y cuando pase nadie se entera.
--   2. Si esa org no esta en la base —development, staging, un restore
--      parcial— la funcion devuelve 0 y la agencia arranca sin plan. Sin plan,
--      las cuentas financieras quedan sin vincular y la org no genera un solo
--      asiento, en silencio.
--   3. Renombrar o dar de baja esa agencia rompe el alta de todas las demas.
--
-- QUE HACE ESTA MIGRACION
-- -----------------------
-- Reemplaza el cuerpo de la funcion por la plantilla generica escrita a mano,
-- que es el mismo plan que hoy tienen las 27 organizaciones. No cambia ninguna
-- cuenta existente: solo cambia de donde salen las cuentas de las orgs futuras.
-- El trigger `trg_seed_chart_of_accounts` sobre `organizations` sigue igual.
--
-- La misma plantilla vive en `lib/accounting/default-chart-of-accounts.ts`, que
-- es por donde pasa el alta normal. Las dos listas tienen que decir lo mismo;
-- agregar una cuenta al plan implica tocar las dos MAS una migracion que la
-- inserte en las orgs que ya existen (ver 20260902000001).

BEGIN;

CREATE OR REPLACE FUNCTION seed_chart_of_accounts_for_org(target_org uuid)
RETURNS integer AS $$
DECLARE
  creadas integer;
BEGIN
  -- No pisa nada: si la org ya tiene aunque sea una cuenta, no toca la tabla.
  -- Una agencia que armo su plan a mano no puede perderlo por correr esto.
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE org_id = target_org) THEN
    RETURN 0;
  END IF;

  -- Primer paso: insertar todo plano, con parent_id en NULL. En SQL no hay
  -- forma de referenciar dentro del mismo INSERT los ids que ese INSERT esta
  -- generando, asi que la jerarquia se resuelve despues, por account_code.
  INSERT INTO chart_of_accounts (
    org_id, account_code, account_name, category, subcategory, account_type,
    level, parent_id, is_movement_account, is_active, display_order, description
  )
  SELECT
    target_org, p.account_code, p.account_name, p.category, p.subcategory,
    p.account_type, p.level, NULL, p.is_movement_account, true,
    p.display_order, p.description
  FROM (VALUES
    ('1.1', 'ACTIVO CORRIENTE', 'ACTIVO', 'CORRIENTE', NULL::text, 1, NULL::text, false, 1, 'Activos que se espera convertir en efectivo en menos de un año'),
    ('1.1.01', 'Caja', 'ACTIVO', 'CORRIENTE', 'CAJA', 2, '1.1', true, 1, 'Efectivo en caja'),
    ('1.1.02', 'Bancos', 'ACTIVO', 'CORRIENTE', 'BANCO', 2, '1.1', true, 2, 'Cuentas bancarias'),
    ('1.1.03', 'Cuentas por Cobrar', 'ACTIVO', 'CORRIENTE', 'CUENTAS_POR_COBRAR', 2, '1.1', true, 3, 'Deudas de clientes'),
    ('1.1.04', 'Mercado Pago', 'ACTIVO', 'CORRIENTE', 'MERCADO_PAGO', 2, '1.1', true, 4, 'Saldo en Mercado Pago'),
    ('1.1.05', 'Activos en Stock', 'ACTIVO', 'CORRIENTE', 'ACTIVOS_STOCK', 2, '1.1', true, 5, 'Vouchers, cupos, hoteles en stock'),
    ('1.1.06', 'Anticipos a Proveedores', 'ACTIVO', 'CORRIENTE', 'ANTICIPOS_PROVEEDORES', 2, '1.1', true, 6, 'Anticipos entregados a operadores/proveedores'),
    ('1.1.07', 'IVA Crédito Fiscal', 'ACTIVO', 'CORRIENTE', 'IVA_CREDITO', 2, '1.1', true, 7, 'IVA pagado en compras (crédito fiscal a favor)'),
    ('1.1.08', 'Otros Créditos', 'ACTIVO', 'CORRIENTE', 'OTROS_CREDITOS', 2, '1.1', true, 8, 'Otros créditos a cobrar'),
    ('1.1.09', 'Valores a Depositar', 'ACTIVO', 'CORRIENTE', 'CAJA', 2, '1.1', true, 9, 'Cheques de terceros recibidos y todavia no depositados. No son dinero disponible: pueden rebotar o endosarse.'),
    ('1.2', 'ACTIVO NO CORRIENTE', 'ACTIVO', 'NO_CORRIENTE', NULL::text, 1, NULL::text, false, 2, 'Activos a largo plazo'),
    ('1.2.01', 'Inversiones', 'ACTIVO', 'NO_CORRIENTE', 'INVERSIONES', 2, '1.2', true, 1, 'Inversiones a largo plazo'),
    ('2.1', 'PASIVO CORRIENTE', 'PASIVO', 'CORRIENTE', NULL::text, 1, NULL::text, false, 1, 'Obligaciones a pagar en menos de un año'),
    ('2.1.01', 'Cuentas por Pagar', 'PASIVO', 'CORRIENTE', 'CUENTAS_POR_PAGAR', 2, '2.1', true, 1, 'Deudas con operadores y proveedores'),
    ('2.1.02', 'IVA Débito Fiscal', 'PASIVO', 'CORRIENTE', 'IVA_PAGAR', 2, '2.1', true, 2, 'IVA pendiente de pago'),
    ('2.1.03', 'Sueldos a Pagar', 'PASIVO', 'CORRIENTE', 'SUELDOS_PAGAR', 2, '2.1', true, 3, 'Sueldos pendientes de pago'),
    ('2.1.04', 'Percepciones a depositar AFIP', 'PASIVO', 'CORRIENTE', 'PERCEPCIONES_AFIP', 2, '2.1', true, 4, 'Percepciones cobradas a clientes pendientes de depósito a AFIP (RG 5617, RG 3819, etc.)'),
    ('2.1.05', 'Retenciones a Depositar', 'PASIVO', 'CORRIENTE', 'RETENCIONES', 2, '2.1', true, 5, 'Retenciones practicadas pendientes de depósito a AFIP'),
    ('2.1.06', 'Cargas Sociales a Pagar', 'PASIVO', 'CORRIENTE', 'CARGAS_SOCIALES', 2, '2.1', true, 6, 'Aportes y contribuciones patronales pendientes'),
    ('2.1.07', 'Anticipos de Clientes', 'PASIVO', 'CORRIENTE', 'ANTICIPOS_CLIENTES', 2, '2.1', true, 7, 'Cobros anticipados de clientes por servicios no prestados'),
    ('2.1.08', 'IIBB a Pagar', 'PASIVO', 'CORRIENTE', 'IIBB', 2, '2.1', true, 8, 'Ingresos Brutos pendientes de pago'),
    ('2.1.09', 'Impuesto a las Ganancias a Pagar', 'PASIVO', 'CORRIENTE', 'GANANCIAS', 2, '2.1', true, 9, 'Impuesto a las Ganancias pendiente de pago'),
    ('2.2', 'PASIVO NO CORRIENTE', 'PASIVO', 'NO_CORRIENTE', NULL::text, 1, NULL::text, false, 2, 'Obligaciones a largo plazo'),
    ('2.2.01', 'Préstamos a Largo Plazo', 'PASIVO', 'NO_CORRIENTE', 'PRESTAMOS', 2, '2.2', true, 1, 'Préstamos bancarios a largo plazo'),
    ('3.1', 'PATRIMONIO NETO', 'PATRIMONIO_NETO', NULL::text, NULL::text, 1, NULL::text, false, 1, 'Capital y reservas'),
    ('3.1.01', 'Capital Social', 'PATRIMONIO_NETO', 'CAPITAL', 'CAPITAL_SOCIAL', 2, '3.1', true, 1, 'Capital aportado por socios'),
    ('3.1.02', 'Reservas', 'PATRIMONIO_NETO', 'RESERVAS', 'RESERVAS', 2, '3.1', true, 2, 'Reservas legales y voluntarias'),
    ('3.1.03', 'Resultados Acumulados', 'PATRIMONIO_NETO', 'RESULTADOS', 'RESULTADOS_ACUMULADOS', 2, '3.1', true, 3, 'Ganancias retenidas'),
    ('3.1.04', 'Resultado del Ejercicio', 'PATRIMONIO_NETO', 'RESULTADOS', 'RESULTADO_EJERCICIO', 2, '3.1', true, 4, 'Resultado del ejercicio económico en curso'),
    ('4.1', 'INGRESOS', 'RESULTADO', 'INGRESOS', NULL::text, 1, NULL::text, false, 1, 'Ingresos del negocio'),
    ('4.1.01', 'Ventas de Viajes', 'RESULTADO', 'INGRESOS', 'VENTAS', 2, '4.1', true, 1, 'Ingresos por venta de paquetes turísticos'),
    ('4.1.02', 'Otros Ingresos', 'RESULTADO', 'INGRESOS', 'OTROS_INGRESOS', 2, '4.1', true, 2, 'Ingresos no operativos'),
    ('4.1.03', 'Comisiones Ganadas', 'RESULTADO', 'INGRESOS', 'COMISIONES_GANADAS', 2, '4.1', true, 3, 'Comisiones ganadas por intermediación'),
    ('4.1.04', 'Intereses Ganados', 'RESULTADO', 'INGRESOS', 'INTERESES_GANADOS', 2, '4.1', true, 4, 'Intereses por inversiones o plazos fijos'),
    ('4.1.05', 'Diferencia de Cambio Positiva', 'RESULTADO', 'INGRESOS', 'DIF_CAMBIO_POS', 2, '4.1', true, 5, 'Ganancia por variación de tipo de cambio'),
    ('4.1.06', 'Ajuste de Liquidación de Operadores (ganancia)', 'RESULTADO', 'INGRESOS', 'AJUSTE_LIQ_POS', 2, '4.1', true, 6, 'Ganancia por diferencia entre el costo estimado del operador y su liquidación definitiva'),
    ('4.2', 'COSTOS', 'RESULTADO', 'COSTOS', NULL::text, 1, NULL::text, false, 2, 'Costos directos'),
    ('4.2.01', 'Costo de Operadores', 'RESULTADO', 'COSTOS', 'COSTO_OPERADORES', 2, '4.2', true, 1, 'Costo de servicios de operadores'),
    ('4.2.02', 'Otros Costos', 'RESULTADO', 'COSTOS', 'OTROS_COSTOS', 2, '4.2', true, 2, 'Otros costos directos'),
    ('4.2.03', 'Costo de Hotelería', 'RESULTADO', 'COSTOS', 'COSTO_HOTELERIA', 2, '4.2', true, 3, 'Costos de alojamiento'),
    ('4.2.04', 'Costo de Aéreos', 'RESULTADO', 'COSTOS', 'COSTO_AEREOS', 2, '4.2', true, 4, 'Costos de pasajes aéreos'),
    ('4.2.05', 'Costo de Transfers', 'RESULTADO', 'COSTOS', 'COSTO_TRANSFERS', 2, '4.2', true, 5, 'Costos de traslados'),
    ('4.2.06', 'Costo de Seguros', 'RESULTADO', 'COSTOS', 'COSTO_SEGUROS', 2, '4.2', true, 6, 'Costos de seguros de viaje (assist card, etc.)'),
    ('4.2.07', 'Costo de Excursiones', 'RESULTADO', 'COSTOS', 'COSTO_EXCURSIONES', 2, '4.2', true, 7, 'Costos de excursiones y actividades'),
    ('4.3', 'GASTOS', 'RESULTADO', 'GASTOS', NULL::text, 1, NULL::text, false, 3, 'Gastos operativos'),
    ('4.3.01', 'Gastos Administrativos', 'RESULTADO', 'GASTOS', 'GASTOS_ADMIN', 2, '4.3', true, 1, 'Gastos de administración'),
    ('4.3.02', 'Gastos de Comercialización', 'RESULTADO', 'GASTOS', 'GASTOS_COMERC', 2, '4.3', true, 2, 'Gastos de marketing y ventas'),
    ('4.3.03', 'Comisiones de Vendedores', 'RESULTADO', 'GASTOS', 'COMISIONES', 2, '4.3', true, 3, 'Comisiones pagadas a vendedores'),
    ('4.3.04', 'Gastos Financieros', 'RESULTADO', 'GASTOS', 'GASTOS_FINANCIEROS', 2, '4.3', true, 4, 'Intereses y gastos financieros'),
    ('4.3.05', 'Sueldos y Jornales', 'RESULTADO', 'GASTOS', 'SUELDOS', 2, '4.3', true, 5, 'Sueldos y salarios del personal'),
    ('4.3.06', 'Cargas Sociales', 'RESULTADO', 'GASTOS', 'CARGAS_SOCIALES_GASTO', 2, '4.3', true, 6, 'Aportes y contribuciones patronales'),
    ('4.3.07', 'Alquileres', 'RESULTADO', 'GASTOS', 'ALQUILERES', 2, '4.3', true, 7, 'Alquiler de oficinas y locales'),
    ('4.3.08', 'Servicios (Luz, Gas, Internet)', 'RESULTADO', 'GASTOS', 'SERVICIOS', 2, '4.3', true, 8, 'Servicios públicos y de comunicaciones'),
    ('4.3.09', 'Impuestos y Tasas', 'RESULTADO', 'GASTOS', 'IMPUESTOS', 2, '4.3', true, 9, 'Impuestos y tasas municipales/provinciales'),
    ('4.3.10', 'Seguros', 'RESULTADO', 'GASTOS', 'SEGUROS_GASTO', 2, '4.3', true, 10, 'Seguros de la empresa (responsabilidad civil, etc.)'),
    ('4.3.11', 'Amortizaciones', 'RESULTADO', 'GASTOS', 'AMORTIZACIONES', 2, '4.3', true, 11, 'Amortización de bienes de uso'),
    ('4.3.12', 'Gastos Bancarios', 'RESULTADO', 'GASTOS', 'GASTOS_BANCARIOS', 2, '4.3', true, 12, 'Comisiones y mantenimiento bancario'),
    ('4.3.13', 'Diferencia de Cambio Negativa', 'RESULTADO', 'GASTOS', 'DIF_CAMBIO_NEG', 2, '4.3', true, 13, 'Pérdida por variación de tipo de cambio'),
    ('4.3.14', 'Gastos de Sistemas / Software', 'RESULTADO', 'GASTOS', 'GASTOS_SISTEMAS', 2, '4.3', true, 14, 'Licencias, hosting, herramientas digitales'),
    ('4.3.15', 'Otros Gastos', 'RESULTADO', 'GASTOS', 'OTROS_GASTOS', 2, '4.3', true, 15, 'Gastos varios no clasificados'),
    ('4.3.16', 'Ajuste de Liquidación de Operadores (pérdida)', 'RESULTADO', 'GASTOS', 'AJUSTE_LIQ_NEG', 2, '4.3', true, 16, 'Pérdida por diferencia entre el costo estimado del operador y su liquidación definitiva'),
    ('5.1', 'CUENTAS DE ORDEN DEUDORAS', 'ORDEN', 'DEUDORAS', NULL::text, 1, NULL::text, false, 1, 'Compromisos y contingencias que no son activo, pasivo ni resultado. Se presentan al pie del balance.'),
    ('5.1.01', 'Ventas Pendientes de Facturar', 'ORDEN', 'DEUDORAS', NULL::text, 2, '5.1', true, 1, 'Ventas devengadas cuyo comprobante todavía no se emitió.'),
    ('5.1.02', 'Facturas a Recibir de Operadores', 'ORDEN', 'DEUDORAS', NULL::text, 2, '5.1', true, 2, 'Costo comprometido con operadores sin factura de compra recibida.'),
    ('5.2', 'CUENTAS DE ORDEN ACREEDORAS', 'ORDEN', 'ACREEDORAS', NULL::text, 1, NULL::text, false, 2, 'Contrapartida de las cuentas de orden deudoras, para que se cancelen entre sí y no distorsionen el balance.'),
    ('5.2.01', 'Ventas Pendientes de Facturar por Contra', 'ORDEN', 'ACREEDORAS', NULL::text, 2, '5.2', true, 1, 'Contrapartida de 5.1.01.'),
    ('5.2.02', 'Facturas a Recibir de Operadores por Contra', 'ORDEN', 'ACREEDORAS', NULL::text, 2, '5.2', true, 2, 'Contrapartida de 5.1.02.')
  ) AS p(account_code, account_name, category, subcategory, account_type,
         level, parent_code, is_movement_account, display_order, description)
  ON CONFLICT (org_id, account_code) DO NOTHING;

  GET DIAGNOSTICS creadas = ROW_COUNT;

  -- Segundo paso: cada subcuenta cuelga del rubro cuyo account_code declara la
  -- plantilla. Se relee de la propia org, no de ningun template externo.
  UPDATE chart_of_accounts destino
  SET parent_id = padre.id
  FROM (VALUES
    ('1.1.01', '1.1'), ('1.1.02', '1.1'), ('1.1.03', '1.1'), ('1.1.04', '1.1'),
    ('1.1.05', '1.1'), ('1.1.06', '1.1'), ('1.1.07', '1.1'), ('1.1.08', '1.1'),
    ('1.1.09', '1.1'), ('1.2.01', '1.2'),
    ('2.1.01', '2.1'), ('2.1.02', '2.1'), ('2.1.03', '2.1'), ('2.1.04', '2.1'),
    ('2.1.05', '2.1'), ('2.1.06', '2.1'), ('2.1.07', '2.1'), ('2.1.08', '2.1'),
    ('2.1.09', '2.1'), ('2.2.01', '2.2'),
    ('3.1.01', '3.1'), ('3.1.02', '3.1'), ('3.1.03', '3.1'), ('3.1.04', '3.1'),
    ('4.1.01', '4.1'), ('4.1.02', '4.1'), ('4.1.03', '4.1'), ('4.1.04', '4.1'),
    ('4.1.05', '4.1'), ('4.1.06', '4.1'),
    ('4.2.01', '4.2'), ('4.2.02', '4.2'), ('4.2.03', '4.2'), ('4.2.04', '4.2'),
    ('4.2.05', '4.2'), ('4.2.06', '4.2'), ('4.2.07', '4.2'),
    ('4.3.01', '4.3'), ('4.3.02', '4.3'), ('4.3.03', '4.3'), ('4.3.04', '4.3'),
    ('4.3.05', '4.3'), ('4.3.06', '4.3'), ('4.3.07', '4.3'), ('4.3.08', '4.3'),
    ('4.3.09', '4.3'), ('4.3.10', '4.3'), ('4.3.11', '4.3'), ('4.3.12', '4.3'),
    ('4.3.13', '4.3'), ('4.3.14', '4.3'), ('4.3.15', '4.3'), ('4.3.16', '4.3'),
    ('5.1.01', '5.1'), ('5.1.02', '5.1'),
    ('5.2.01', '5.2'), ('5.2.02', '5.2')
  ) AS j(hijo, padre_code)
  JOIN chart_of_accounts padre
    ON padre.org_id = target_org
   AND padre.account_code = j.padre_code
  WHERE destino.org_id = target_org
    AND destino.account_code = j.hijo;

  RETURN creadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION seed_chart_of_accounts_for_org(uuid) IS
  'Siembra el plan de cuentas default (plantilla generica hardcodeada, espejo de lib/accounting/default-chart-of-accounts.ts) en una org que no tenga ninguna cuenta. Devuelve cuantas creo, o 0 si la org ya tenia plan. Ya no clona de una org template: el alta de un tenant no depende de los datos de otro.';

COMMIT;
