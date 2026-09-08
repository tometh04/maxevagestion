-- Ejecutar después de desplegar el renderer travel-summary-v1.
-- Asignación explícita: únicamente Madero y Rosario de Lozada Rosario.
DO $migration$
DECLARE
  v_agency record;
  v_model_id uuid;
  v_revision_id uuid;
  v_manifest jsonb := $manifest${
  "schemaVersion": 1,
  "documentKind": "quotation",
  "layoutKey": "travel-summary-v1",
  "layoutVersion": 1,
  "locale": "es-AR",
  "theme": {
    "primaryColor": "#D99A16",
    "secondaryColor": "#526579",
    "accentColor": "#D99A16",
    "paperColor": "#FCFCFA",
    "textColor": "#25313C",
    "fontFamily": "INTER"
  },
  "assets": {
    "logoPath": "/lozada-logo.png"
  },
  "branding": {},
  "copy": {
    "documentTitle": "Presupuesto de viaje",
    "availabilityNote": "Cotización sujeta a disponibilidad al momento de reservar.",
    "priceDisclaimer": "Los importes y condiciones se confirman al momento de reservar."
  },
  "blocks": [
    {
      "kind": "hero",
      "visible": true,
      "emptyPolicy": "reject"
    },
    {
      "kind": "trip-summary",
      "visible": true,
      "emptyPolicy": "reject"
    },
    {
      "kind": "flight-options",
      "visible": true,
      "emptyPolicy": "hide"
    },
    {
      "kind": "hotel-options",
      "visible": true,
      "emptyPolicy": "hide"
    },
    {
      "kind": "services-included",
      "visible": true,
      "emptyPolicy": "hide"
    },
    {
      "kind": "pricing",
      "visible": true,
      "emptyPolicy": "reject"
    },
    {
      "kind": "itinerary",
      "visible": true,
      "emptyPolicy": "hide",
      "pageBreakBefore": true
    },
    {
      "kind": "recommendations",
      "visible": true,
      "emptyPolicy": "hide"
    },
    {
      "kind": "restrictions",
      "visible": true,
      "emptyPolicy": "hide"
    },
    {
      "kind": "legal-terms",
      "visible": true,
      "emptyPolicy": "hide"
    },
    {
      "kind": "payment-schedule",
      "visible": true,
      "emptyPolicy": "hide"
    },
    {
      "kind": "advisor-signature",
      "visible": true,
      "emptyPolicy": "hide"
    }
  ]
}$manifest$::jsonb;
BEGIN
  FOR v_agency IN
    SELECT id, org_id FROM public.agencies
    WHERE org_id = '1b326d20-d133-4112-a798-f54b5af7e7cb'
      AND ((id = 'fabbc2e7-81d8-4ca1-85b2-7809c5f88e75' AND name = 'Madero')
        OR (id = '66563aeb-4e8b-40ee-a622-b39defb380dd' AND name = 'Rosario'))
  LOOP
    SELECT id INTO v_model_id FROM public.quotation_document_models
    WHERE org_id = v_agency.org_id AND agency_id = v_agency.id
      AND document_kind = 'quotation' AND key = 'lozada-presupuesto-2026';
    IF v_model_id IS NULL THEN
      INSERT INTO public.quotation_document_models (org_id, agency_id, key, name, document_kind)
      VALUES (v_agency.org_id, v_agency.id, 'lozada-presupuesto-2026', 'Lozada - Presupuesto de viaje', 'quotation')
      RETURNING id INTO v_model_id;
    END IF;
    SELECT id INTO v_revision_id FROM public.quotation_document_revisions
    WHERE model_id = v_model_id AND revision_number = 1;
    IF v_revision_id IS NULL THEN
      INSERT INTO public.quotation_document_revisions
        (model_id, org_id, agency_id, revision_number, status, layout_key, layout_version,
         schema_version, manifest, manifest_checksum, published_at)
      VALUES (v_model_id, v_agency.org_id, v_agency.id, 1, 'PUBLISHED', 'travel-summary-v1', 1,
        1, v_manifest, encode(digest(v_manifest::text, 'sha256'), 'hex'), now())
      RETURNING id INTO v_revision_id;
    END IF;
    INSERT INTO public.quotation_document_bindings (org_id, agency_id, document_kind, revision_id)
    SELECT v_agency.org_id, v_agency.id, 'quotation', v_revision_id
    WHERE EXISTS (SELECT 1 FROM public.quotation_document_revisions WHERE id = v_revision_id AND status = 'PUBLISHED')
      AND NOT EXISTS (SELECT 1 FROM public.quotation_document_bindings
        WHERE org_id = v_agency.org_id AND agency_id = v_agency.id AND document_kind = 'quotation')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$migration$;
