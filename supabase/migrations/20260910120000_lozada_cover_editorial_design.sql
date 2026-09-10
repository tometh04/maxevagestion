-- Asigna a Lozada el modelo "Portada editorial" (layout cover-editorial-v1).
--
-- ORDEN OBLIGATORIO: aplicar SOLO despues de desplegar la aplicacion que
-- registra `cover-editorial-v1`. Si el binding apunta a un layout que el
-- servidor desplegado no conoce, `getQuotationLayout` lanza
-- "Layout de cotizacion no soportado" y ninguna cotizacion de la agencia
-- puede emitir su documento.
--
-- Los documentos ya emitidos NO cambian: cada uno conserva su snapshot de
-- manifiesto y su HTML. El cambio rige para las emisiones nuevas.
--
-- Reversion: volver a apuntar el binding a la revision del modelo
-- 'lozada-presupuesto-2026' (travel-summary-v1), que no se borra.
DO $migration$
DECLARE
  v_agency record;
  v_model_id uuid;
  v_revision_id uuid;
  v_manifest jsonb := $manifest${
  "schemaVersion": 1,
  "documentKind": "quotation",
  "layoutKey": "cover-editorial-v1",
  "layoutVersion": 1,
  "locale": "es-AR",
  "theme": {
    "primaryColor": "#0E2A47",
    "secondaryColor": "#6B7A89",
    "accentColor": "#D99A16",
    "paperColor": "#FFFFFF",
    "textColor": "#243746",
    "fontFamily": "OPEN_SANS"
  },
  "assets": {
    "logoPath": "/lozada-logo.png"
  },
  "branding": {
    "displayName": "Lozada Viajes Rosario",
    "phone": "+54 341 424 0000",
    "email": "rosario@lozadaviajes.com",
    "website": "https://www.lozadaviajes.com",
    "instagram": "@lozadaviajes",
    "address": "Corrientes 631, piso 1, oficina F",
    "legalName": "Lozada Viajes S.R.L.",
    "travelLicense": "Leg. 15.234"
  },
  "copy": {
    "documentTitle": "Presupuesto de viaje",
    "availabilityNote": "Cotización sujeta a disponibilidad al momento de reservar.",
    "priceDisclaimer": "Los importes y condiciones se confirman al momento de reservar."
  },
  "blocks": [
    { "kind": "hero", "visible": true, "emptyPolicy": "reject" },
    { "kind": "trip-summary", "visible": true, "emptyPolicy": "reject" },
    { "kind": "flight-options", "visible": true, "emptyPolicy": "hide" },
    { "kind": "hotel-options", "visible": true, "emptyPolicy": "hide" },
    { "kind": "services-included", "visible": true, "emptyPolicy": "hide" },
    { "kind": "pricing", "visible": true, "emptyPolicy": "reject" },
    { "kind": "itinerary", "visible": false, "emptyPolicy": "hide", "pageBreakBefore": true },
    { "kind": "recommendations", "visible": true, "emptyPolicy": "hide" },
    { "kind": "restrictions", "visible": true, "emptyPolicy": "hide" },
    { "kind": "legal-terms", "visible": false, "emptyPolicy": "hide" },
    { "kind": "payment-schedule", "visible": false, "emptyPolicy": "hide" },
    { "kind": "advisor-signature", "visible": true, "emptyPolicy": "hide" }
  ]
}$manifest$::jsonb;
BEGIN
  -- Identificadores verificados de Madero y Rosario dentro de Lozada Rosario.
  -- El nombre se vuelve a exigir para no reasignar una agencia renombrada.
  FOR v_agency IN
    SELECT id, org_id FROM public.agencies
    WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
      AND ((id = 'fabbc2e7-81d8-4ca1-85b2-7809c5f88e75' AND name = 'Madero')
        OR (id = '66563aeb-4e8b-40ee-a622-b39defb380dd' AND name = 'Rosario'))
  LOOP
    SELECT id INTO v_model_id FROM public.quotation_document_models
    WHERE org_id = v_agency.org_id AND agency_id = v_agency.id
      AND document_kind = 'quotation' AND key = 'lozada-portada-editorial';

    IF v_model_id IS NULL THEN
      INSERT INTO public.quotation_document_models (org_id, agency_id, key, name, document_kind)
      VALUES (v_agency.org_id, v_agency.id, 'lozada-portada-editorial',
              'Lozada - Portada editorial', 'quotation')
      RETURNING id INTO v_model_id;
    END IF;

    SELECT id INTO v_revision_id FROM public.quotation_document_revisions
    WHERE model_id = v_model_id AND revision_number = 1;

    IF v_revision_id IS NULL THEN
      INSERT INTO public.quotation_document_revisions
        (model_id, org_id, agency_id, revision_number, status, layout_key, layout_version,
         schema_version, manifest, manifest_checksum, published_at)
      VALUES (v_model_id, v_agency.org_id, v_agency.id, 1, 'PUBLISHED', 'cover-editorial-v1', 1,
        1, v_manifest, encode(digest(v_manifest::text, 'sha256'), 'hex'), now())
      RETURNING id INTO v_revision_id;
    END IF;

    -- Ambas agencias YA tienen un binding activo (travel-summary-v1), asi que
    -- este paso actualiza en lugar de insertar. La migracion anterior solo
    -- insertaba cuando no existia ninguno.
    -- No se usa ON CONFLICT: el indice unico es PARCIAL
    -- (WHERE agency_id IS NOT NULL) y la inferencia no lo alcanza.
    UPDATE public.quotation_document_bindings
    SET revision_id = v_revision_id, updated_at = now()
    WHERE org_id = v_agency.org_id
      AND agency_id = v_agency.id
      AND document_kind = 'quotation';

    IF NOT FOUND THEN
      INSERT INTO public.quotation_document_bindings (org_id, agency_id, document_kind, revision_id)
      VALUES (v_agency.org_id, v_agency.id, 'quotation', v_revision_id);
    END IF;
  END LOOP;
END;
$migration$;
