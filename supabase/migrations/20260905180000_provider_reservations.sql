BEGIN;
ALTER TABLE public.quotation_provider_bookings DROP CONSTRAINT quotation_provider_bookings_status_check;
ALTER TABLE public.quotation_provider_bookings ADD CONSTRAINT quotation_provider_bookings_status_check
  CHECK (status IN ('QUEUED','PROCESSING','PENDING','CONFIRMED','PRICE_CHANGED','PARTIAL','FAILED'));
ALTER TABLE public.quotation_provider_bookings
  ADD COLUMN request_snapshot jsonb,
  ADD COLUMN synced_at timestamptz,
  ADD COLUMN sync_attempted_at timestamptz,
  ADD CONSTRAINT provider_booking_request_object CHECK (request_snapshot IS NULL OR jsonb_typeof(request_snapshot) = 'object');

-- Passenger documents are available only through server-side permission checks.
DROP POLICY IF EXISTS quotation_provider_bookings_select ON public.quotation_provider_bookings;
REVOKE ALL ON public.quotation_provider_bookings FROM anon, authenticated;
CREATE INDEX quotation_provider_bookings_sync_idx ON public.quotation_provider_bookings(sync_attempted_at NULLS FIRST);

CREATE FUNCTION public.validate_provider_booking_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM operations o JOIN quotations q ON q.id=NEW.quotation_id
    WHERE o.id=NEW.operation_id AND o.org_id=NEW.org_id AND o.agency_id=NEW.agency_id
      AND q.org_id=NEW.org_id AND q.agency_id=NEW.agency_id AND q.operation_id=o.id)
    OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id=NEW.created_by AND u.org_id=NEW.org_id) THEN
    RAISE EXCEPTION 'provider booking scope mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER provider_booking_scope BEFORE INSERT OR UPDATE OF org_id,agency_id,quotation_id,operation_id,created_by
ON public.quotation_provider_bookings FOR EACH ROW EXECUTE FUNCTION public.validate_provider_booking_scope();

CREATE VIEW public.provider_reservations WITH (security_invoker=true) AS
SELECT md5(b.id::text || ':' || COALESCE(i.item->>'client_item_id','pending'))::uuid AS id,
  b.id AS booking_id, b.org_id, b.agency_id, b.quotation_id, b.operation_id, o.seller_id,
  o.file_code, a.name AS agency_name, u.name AS seller_name,
  b.status AS job_status, b.created_at, b.updated_at, b.synced_at,
  'DELFOS'::text AS wholesaler,
  i.item->>'client_item_id' AS item_id, i.item->>'product' AS product,
  i.item->>'booking_id' AS external_id,
  COALESCE(i.item#>>'{detail,locator}',i.item->>'locator') AS locator,
  COALESCE(i.item#>>'{detail,status}',i.item->>'provider_status',
    CASE WHEN i.item->>'booking_id' IS NOT NULL THEN 'CREATED' ELSE UPPER(COALESCE(i.item->>'status',b.status)) END) AS status,
  i.item#>>'{detail,reference}' AS reference,
  COALESCE(i.item#>>'{detail,contactName}', b.request_snapshot#>>'{holder,name}') AS contact_name,
  COALESCE(i.item#>>'{detail,hotelName}', i.item#>>'{detail,itinerary,segments,0,dest}') AS destination,
  COALESCE(i.item#>>'{detail,checkIn}',i.item#>>'{detail,itinerary,segments,0,departureDateTime}') AS travel_date,
  i.item#>>'{detail,priceTotal}' AS price_total, i.item#>>'{detail,priceCurrency}' AS price_currency,
  i.item#>>'{detail,lastTicketDate}' AS last_ticket_date,
  NULLIF(pax.passenger_count,0) AS passenger_count, pax.passengers_summary,
  concat_ws(' ',i.item->>'booking_id',i.item->>'locator',i.item#>>'{detail,locator}',
    i.item#>>'{detail,reference}',i.item#>>'{detail,contactName}',b.request_snapshot#>>'{holder,name}',
    i.item#>>'{detail,hotelName}',i.item#>>'{detail,itinerary,segments,0,dest}',o.file_code,pax.passengers_summary) AS search_text,
  i.item AS item, b.request_snapshot
FROM public.quotation_provider_bookings b
JOIN public.operations o ON o.id=b.operation_id AND o.org_id=b.org_id AND o.agency_id=b.agency_id
JOIN public.agencies a ON a.id=b.agency_id AND a.org_id=b.org_id
LEFT JOIN public.users u ON u.id=o.seller_id AND u.org_id=b.org_id
LEFT JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(b.result->'items')='array' AND jsonb_array_length(b.result->'items')>0 THEN b.result->'items'
       WHEN jsonb_typeof(b.request_snapshot->'items')='array' THEN b.request_snapshot->'items'
       ELSE '[]'::jsonb END) i(item) ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS passenger_count,
    string_agg(concat_ws(' ',p->>'name',p->>'surname',
      CASE WHEN jsonb_typeof(p->'surnames')='array' THEN (SELECT string_agg(s,' ') FROM jsonb_array_elements_text(p->'surnames') s) END), ', ') AS passengers_summary
  FROM jsonb_array_elements(COALESCE(i.item#>'{detail,travellersRequest}',i.item#>'{detail,travellersEcho}',
    i.item#>'{detail,guestsRequest}',i.item#>'{detail,guests}',b.request_snapshot->'travellers','[]'::jsonb)) p
) pax ON true;
REVOKE ALL ON public.provider_reservations FROM anon,authenticated;
GRANT SELECT ON public.provider_reservations TO service_role;
COMMIT;
