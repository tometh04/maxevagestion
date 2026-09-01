-- Cuentas financieras huérfanas del plan de cuentas
--
-- QUÉ PROBLEMA RESUELVE
-- --------------------
-- Una cuenta financiera sin `chart_account_id` no puede generar asientos: el
-- sistema no sabe contra qué cuenta del plan registrar el movimiento. Cuando
-- alguien cobra en una de ellas, el asiento queda a medias o directamente no se
-- crea.
--
-- Medido en producción: 32 cuentas activas sin mapear, y de los 926 asientos de
-- una sola línea que existen hoy, **609 vienen de esto**. Concentrado en tres
-- organizaciones: VICO (20 cuentas), Gualeguaychú y AP Turismo.
--
-- POR QUÉ EXISTEN
-- ---------------
-- No es un error de nadie: el alta de cuentas asigna la cuenta contable sola
-- desde hace un tiempo (`app/api/accounting/financial-accounts/route.ts`), pero
-- las cuentas creadas ANTES de eso quedaron en NULL y no había forma de
-- rescatarlas: la pantalla mostraba el problema con un ícono y no ofrecía
-- ningún control para arreglarlo.
--
-- EL CRITERIO: EL MISMO QUE EL ALTA
-- ---------------------------------
-- Se replica exactamente el mapeo por tipo que aplica el alta hoy. El argumento
-- es de consistencia: una cuenta creada hoy con ese tipo recibiría esta misma
-- cuenta contable, así que las viejas quedan como si se hubieran creado ahora.
--
-- QUÉ NO SE TOCA, A PROPÓSITO
-- ---------------------------
-- Las que se llaman "cuenta corriente ...". En vibook hay cuentas financieras
-- que no son plata de la agencia sino la cuenta corriente de un operador
-- —Coris, HotelDO, Assistcard, Mitika—. Mapearlas a Bancos inflaría el saldo
-- bancario de los libros con dinero que no existe.
--
-- Esas quedan sin mapear y las resuelve la agencia desde la pantalla, que ahora
-- sí tiene el selector. Es la clase de decisión que ningún automatismo puede
-- tomar: hay que saber qué es cada cuenta.
--
-- No toca ninguna cuenta que YA tenga mapeo, ni ningún movimiento ni saldo.

UPDATE financial_accounts fa
SET chart_account_id = coa.id
FROM chart_of_accounts coa
WHERE fa.chart_account_id IS NULL
  AND fa.is_active
  AND coa.org_id = fa.org_id
  AND coa.is_active
  AND coa.account_code = CASE fa.type
    WHEN 'CASH_ARS'     THEN '1.1.01'
    WHEN 'CASH_USD'     THEN '1.1.01'
    WHEN 'CHECKING_ARS' THEN '1.1.02'
    WHEN 'CHECKING_USD' THEN '1.1.02'
    WHEN 'SAVINGS_ARS'  THEN '1.1.02'
    WHEN 'SAVINGS_USD'  THEN '1.1.02'
    WHEN 'CREDIT_CARD'  THEN '1.1.04'
    WHEN 'ASSETS'       THEN '1.1.05'
    WHEN 'PARTNER'      THEN '3.1.01'
  END
  -- La cuenta corriente de un operador no es una cuenta de plata. Se deja para
  -- que la agencia elija, porque solo ella sabe de quién es.
  AND fa.name NOT ILIKE '%cuenta corriente%';

COMMENT ON COLUMN financial_accounts.chart_account_id IS
  'Cuenta del plan contra la que se registran los asientos de esta cuenta financiera. Sin esto, sus movimientos no generan asiento. El alta la asigna sola según el tipo; se puede corregir desde la pantalla cuando el tipo no alcanza (por ejemplo, una cuenta corriente de operador que no es un banco).';
