-- Referidores y Comisiones mensuales dejan de ser complementos facturables.
--
-- Vienen con el plan base: las usa la agencia que quiera y su único gate es el
-- permiso del módulo. El seed de 20260901000010 las había cargado en el catálogo
-- junto a las otras seis; esto las saca para que un entorno nuevo termine igual
-- que producción, donde ya se borraron a mano el 2026-09-07.
--
-- Las filas de `organization_addons` que se borran eran altas de backfill en $0
-- ("bonificado"): nadie estaba pagando por ellas, así que no hay nada que
-- devolver ni que dar de baja comercialmente. Perder esas filas no le saca el
-- acceso a nadie, justamente porque el módulo ya no se gatea por complemento.

BEGIN;

DELETE FROM public.organization_addons
WHERE addon_key IN ('referrals', 'monthly_commissions');

DELETE FROM public.subscription_addon_plan_inclusions
WHERE addon_key IN ('referrals', 'monthly_commissions');

DELETE FROM public.subscription_addons
WHERE addon_key IN ('referrals', 'monthly_commissions');

COMMIT;
