-- VIB-140 — Cuentas de orden (C2 y C3)
--
-- QUÉ SON Y POR QUÉ HACEN FALTA
-- -----------------------------
-- Una cuenta de orden registra un compromiso o una contingencia que NO es
-- todavía un activo, un pasivo ni un resultado, pero que un contador necesita
-- ver. Las dos que pide el análisis:
--
--   - **Ventas pendientes de facturar**: la agencia vendió y cobró, pero
--     todavía no emitió la factura. La venta ya está devengada; lo que falta es
--     el comprobante.
--   - **Facturas a recibir de operadores**: el costo está comprometido y hasta
--     pagado, pero el operador todavía no mandó su factura. Importa
--     fiscalmente: es costo computado sin respaldo documental.
--
-- El plan solo tenía las familias 1 a 4 (Activo, Pasivo, Patrimonio, Resultado)
-- y el CHECK de `category` no admitía otra cosa, así que no había dónde
-- registrarlas.
--
-- POR QUÉ VAN DE A PARES
-- ----------------------
-- Una cuenta de orden siempre tiene su contrapartida, deudora contra acreedora,
-- justamente para que se cancelen entre sí y NO distorsionen el balance. Se
-- presentan al pie, aparte del Activo, Pasivo y Patrimonio.
--
-- Eso además las hace inofensivas para lo que ya existe: `armarBalance` agrupa
-- por categoría ACTIVO/PASIVO/PATRIMONIO_NETO y `armarEstadoDeResultados`
-- filtra por los códigos 4.x, así que una cuenta con categoría ORDEN no entra
-- en ninguno de los dos por construcción.
--
-- Se crean para TODAS las organizaciones que ya tienen plan. Las nuevas las
-- heredan solas: `seedChartOfAccountsForOrg` copia el plan de una org template.

-- 1. La categoría nueva
ALTER TABLE chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_category_check;

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_category_check
  CHECK (category = ANY (ARRAY['ACTIVO', 'PASIVO', 'PATRIMONIO_NETO', 'RESULTADO', 'ORDEN']));

-- 2. Los rubros (nivel 1), para cada org que ya tenga plan
INSERT INTO chart_of_accounts (
  org_id, account_code, account_name, category, subcategory,
  level, parent_id, is_movement_account, is_active, display_order, description
)
SELECT o.id, v.code, v.name, 'ORDEN', v.subcat, 1, NULL, false, true, v.orden, v.descripcion
FROM organizations o
CROSS JOIN (VALUES
  ('5.1', 'CUENTAS DE ORDEN DEUDORAS', 'DEUDORAS', 1,
   'Compromisos y contingencias que no son activo, pasivo ni resultado. Se presentan al pie del balance.'),
  ('5.2', 'CUENTAS DE ORDEN ACREEDORAS', 'ACREEDORAS', 2,
   'Contrapartida de las cuentas de orden deudoras, para que se cancelen entre sí y no distorsionen el balance.')
) AS v(code, name, subcat, orden, descripcion)
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.org_id = o.id)
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts c2 WHERE c2.org_id = o.id AND c2.account_code = v.code
  );

-- 3. Las cuentas imputables (nivel 2), colgando de su rubro
INSERT INTO chart_of_accounts (
  org_id, account_code, account_name, category, subcategory,
  level, parent_id, is_movement_account, is_active, display_order, description
)
SELECT
  padre.org_id, v.code, v.name, 'ORDEN', padre.subcategory, 2, padre.id, true, true, v.orden, v.descripcion
FROM chart_of_accounts padre
CROSS JOIN (VALUES
  ('5.1', '5.1.01', 'Ventas Pendientes de Facturar', 1,
   'Ventas devengadas cuyo comprobante todavía no se emitió.'),
  ('5.1', '5.1.02', 'Facturas a Recibir de Operadores', 2,
   'Costo comprometido con operadores sin factura de compra recibida.'),
  ('5.2', '5.2.01', 'Ventas Pendientes de Facturar por Contra', 1,
   'Contrapartida de 5.1.01.'),
  ('5.2', '5.2.02', 'Facturas a Recibir de Operadores por Contra', 2,
   'Contrapartida de 5.1.02.')
) AS v(padre_code, code, name, orden, descripcion)
WHERE padre.account_code = v.padre_code
  AND padre.category = 'ORDEN'
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts c WHERE c.org_id = padre.org_id AND c.account_code = v.code
  );
