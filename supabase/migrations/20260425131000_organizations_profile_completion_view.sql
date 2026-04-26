-- =====================================================
-- Migración 164: VIEW organizations_with_profile_completion
-- =====================================================
-- Suma los 9 campos del perfil (excluyendo internal_notes y
-- address_country que tiene default) y expone profile_completion 0-9.
-- Usada por el listado /admin/orgs para sort/filter por completitud.

CREATE OR REPLACE VIEW organizations_with_profile_completion AS
SELECT
  o.*,
  (
    (CASE WHEN o.contact_name        IS NOT NULL AND o.contact_name        <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.contact_phone       IS NOT NULL AND o.contact_phone       <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.cuit                IS NOT NULL AND o.cuit                <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.tax_category        IS NOT NULL                                 THEN 1 ELSE 0 END) +
    (CASE WHEN o.billing_email       IS NOT NULL AND o.billing_email       <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_street      IS NOT NULL AND o.address_street      <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_city        IS NOT NULL AND o.address_city        <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_province    IS NOT NULL AND o.address_province    <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN o.address_postal_code IS NOT NULL AND o.address_postal_code <> '' THEN 1 ELSE 0 END)
  ) AS profile_completion
FROM organizations o;

COMMENT ON VIEW organizations_with_profile_completion IS
  'Wrapper de organizations con profile_completion 0-9 calculado. RLS herendada de la tabla base.';
