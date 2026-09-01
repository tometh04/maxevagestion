SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE public.quotation_price_refresh_runs
  ADD COLUMN IF NOT EXISTS remote_jobs JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotation_price_refresh_runs_remote_jobs_check'
      AND conrelid = 'public.quotation_price_refresh_runs'::regclass
  ) THEN
    ALTER TABLE public.quotation_price_refresh_runs
      ADD CONSTRAINT quotation_price_refresh_runs_remote_jobs_check
      CHECK (
        CASE
          WHEN jsonb_typeof(remote_jobs) = 'array'
            THEN jsonb_array_length(remote_jobs) <= 10
          ELSE false
        END
      )
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.quotation_price_refresh_runs
  VALIDATE CONSTRAINT quotation_price_refresh_runs_remote_jobs_check;

ALTER TABLE public.quotation_price_refresh_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_price_refresh_runs FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.quotation_price_refresh_runs
  FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.quotation_price_refresh_runs
  TO service_role;

COMMENT ON COLUMN public.quotation_price_refresh_runs.remote_jobs IS
  'Server-only Wholesale background job references. Contains no agency credential or provider-private payload.';
