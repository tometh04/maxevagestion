-- Las agencias que se registran solas siguen arrancando sin plan de cuentas
--
-- QUE PASO
-- --------
-- El 25/08 se agrego el sembrado del plan a `POST /api/onboarding`, con el
-- diagnostico de que "ninguna agencia que se registro sola tenia contabilidad".
-- Ese arreglo esta en main desde entonces y NO alcanzo: tres organizaciones
-- creadas despues siguen con la tabla vacia.
--
--   AP Turismo                              25/08 11:11  (54 min despues del fix)
--   Emilia uriza, franquicia de lozada       26/08 10:48
--   AOCA                                     28/08 02:02
--
-- La causa es que el alta publica NO pasa por `/api/onboarding`. Pasa por
-- `POST /api/auth/register`, que crea organizations + agencies + users +
-- organization_members + user_agencies y nunca sembro el plan. Habia tres
-- caminos de alta y el arreglo tapo uno solo.
--
-- POR QUE ESTO VA EN LA BASE Y NO EN LA RUTA
-- ------------------------------------------
-- Ya nos paso identico con `lead_regions`: las orgs nuevas arrancaban sin
-- regiones y no podian crear un solo lead. La migracion
-- 20260821000002_lead_regions_seed_new_orgs lo resolvio poniendo un trigger
-- AFTER INSERT sobre `organizations`, y dejo escrito por que: "el trigger es
-- red de seguridad para cualquier org creada por fuera de esas rutas".
--
-- Es exactamente el caso. Agregarle la llamada a la tercera ruta arregla las
-- tres que conocemos hoy; el trigger arregla tambien la cuarta que aparezca.
-- Se hacen las dos cosas, con el mismo reparto que las regiones: el codigo es
-- la fuente de verdad y esto es la red.
--
-- QUE SE PIERDE SIN PLAN
-- ----------------------
-- Todo, en silencio. Al crear su primera caja o banco, el alta busca la cuenta
-- contable que corresponde al tipo, no encuentra ninguna y deja la cuenta
-- financiera sin vincular. Sin ese vinculo el motor saltea cada uno de sus
-- movimientos: la agencia opera normal y no genera un solo asiento. Nadie se
-- entera hasta que alguien abre Contabilidad y la ve vacia.

BEGIN;

-- ============================================================
-- 1. La funcion de clonado
-- ============================================================
-- Copia el plan de la org template resolviendo la jerarquia por `account_code`,
-- que es el mismo criterio que usa `lib/accounting/seed-chart-of-accounts.ts`:
-- los `parent_id` del template son ids de otra org y no sirven tal cual.
--
-- Se hace en dos pasos —insertar plano y despues resolver los padres— porque en
-- SQL no hay forma de referenciar dentro del mismo INSERT los ids que ese INSERT
-- esta generando.
--
-- No pisa nada: si la org ya tiene aunque sea una cuenta, no toca la tabla. Una
-- agencia que armo su plan a mano no puede perderlo por correr esto.
CREATE OR REPLACE FUNCTION seed_chart_of_accounts_for_org(target_org uuid)
RETURNS integer AS $$
DECLARE
  template_org uuid;
  creadas integer;
BEGIN
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE org_id = target_org) THEN
    RETURN 0;
  END IF;

  SELECT id INTO template_org FROM organizations WHERE slug = 'lozada-viajes';

  -- Sin template no hay nada que clonar. Pasa en bases de desarrollo recien
  -- creadas; no es motivo para romper el alta.
  IF template_org IS NULL OR template_org = target_org THEN
    RETURN 0;
  END IF;

  INSERT INTO chart_of_accounts (
    org_id, account_code, account_name, category, subcategory, account_type,
    level, parent_id, is_movement_account, is_active, display_order, description
  )
  SELECT
    target_org, t.account_code, t.account_name, t.category, t.subcategory,
    t.account_type, t.level, NULL, t.is_movement_account, true,
    t.display_order, t.description
  FROM chart_of_accounts t
  WHERE t.org_id = template_org
    AND t.is_active;

  GET DIAGNOSTICS creadas = ROW_COUNT;

  -- Segundo paso: cada cuenta nueva apunta al padre que en el template tenia
  -- ese mismo `account_code`.
  UPDATE chart_of_accounts destino
  SET parent_id = padre.id
  FROM chart_of_accounts tpl
  JOIN chart_of_accounts tpl_padre ON tpl_padre.id = tpl.parent_id
  JOIN chart_of_accounts padre
    ON padre.org_id = target_org
   AND padre.account_code = tpl_padre.account_code
  WHERE destino.org_id = target_org
    AND tpl.org_id = template_org
    AND tpl.account_code = destino.account_code
    AND tpl.parent_id IS NOT NULL;

  RETURN creadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION seed_chart_of_accounts_for_org(uuid) IS
  'Clona el plan de cuentas de la org template a una org que no tenga ninguna. Devuelve cuantas cuentas creo, o 0 si la org ya tenia plan. Sin plan, las cuentas financieras quedan sin vincular y la org no genera ningun asiento.';

-- ============================================================
-- 2. Backfill de las tres que quedaron colgadas
-- ============================================================
DO $$
DECLARE
  o RECORD;
  n integer;
BEGIN
  FOR o IN
    SELECT id, name FROM organizations
    WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.org_id = organizations.id)
  LOOP
    n := seed_chart_of_accounts_for_org(o.id);
    RAISE NOTICE 'Plan sembrado para "%": % cuentas', o.name, n;
  END LOOP;
END $$;

-- ============================================================
-- 3. La red: sembrar al crear la org, venga del camino que venga
-- ============================================================
-- El error se traga a proposito. Si el clonado falla, la organizacion se crea
-- igual y queda sin plan —que es lo que ya pasa hoy y se puede reparar despues
-- corriendo la funcion—. La alternativa seria abortar el INSERT, o sea que un
-- problema contable le impida registrarse a una agencia que esta pagando. El
-- WARNING queda en los logs de Postgres.
CREATE OR REPLACE FUNCTION trigger_seed_chart_of_accounts()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    PERFORM seed_chart_of_accounts_for_org(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo sembrar el plan de cuentas de la org % (%): %',
      NEW.id, NEW.name, SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seed_chart_of_accounts ON organizations;
CREATE TRIGGER trg_seed_chart_of_accounts
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_seed_chart_of_accounts();

COMMENT ON FUNCTION trigger_seed_chart_of_accounts() IS
  'Red de seguridad: siembra el plan de cuentas al crear una org. Existe porque el alta ocurre en tres rutas distintas (/api/auth/register, /api/onboarding, /api/admin/orgs) y agregar el sembrado a una sola ya fallo.';

COMMIT;
