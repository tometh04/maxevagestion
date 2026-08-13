-- VIB-70 — Biblioteca (capacitaciones)
--
-- Seccion nueva por-tenant (por org) donde los administradores suben material de
-- capacitacion (PDF, imagenes, videos y links) para que vendedores y usuarios
-- consulten. Cada recurso tiene categoria y destinatarios por rol.
--
-- Alcance: SOLO org_id (no se segmenta por agencia en v1) -> modelo mas simple
-- que Growth Studio: sin agency_id, sin helper de acceso por agencia, RLS trivial
-- que reusa public.user_org_ids(). El filtro por rol (target_roles) es visibilidad
-- de negocio y se aplica en la capa de dominio/API, NO en RLS.

BEGIN;

-- ---------------------------------------------------------------------------
-- Trigger generico de updated_at para el modulo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_library_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- library_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.library_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_categories_name_length
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT library_categories_org_slug_unique
    UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_library_categories_org_sort
  ON public.library_categories (org_id, sort_order);

DROP TRIGGER IF EXISTS trg_library_categories_updated_at ON public.library_categories;
CREATE TRIGGER trg_library_categories_updated_at
  BEFORE UPDATE ON public.library_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_library_updated_at();

-- ---------------------------------------------------------------------------
-- library_resources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.library_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.library_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL,
  storage_path TEXT,
  file_mime_type TEXT,
  file_size BIGINT,
  original_file_name TEXT,
  external_url TEXT,
  target_roles TEXT[] NOT NULL DEFAULT '{}',
  published BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT library_resources_title_length
    CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT library_resources_type_check
    CHECK (resource_type IN ('file', 'link')),
  -- vacio = todos; sino subset de roles configurables (SUPER_ADMIN/ORG_OWNER
  -- siempre ven todo, no se listan como destinatarios).
  CONSTRAINT library_resources_target_roles_check
    CHECK (target_roles <@ ARRAY['ADMIN', 'CONTABLE', 'SELLER', 'VIEWER', 'POST_VENTA']::text[]),
  CONSTRAINT library_resources_kind_shape
    CHECK (
      (resource_type = 'file' AND storage_path IS NOT NULL AND external_url IS NULL)
      OR (resource_type = 'link' AND external_url IS NOT NULL AND storage_path IS NULL)
    ),
  CONSTRAINT library_resources_storage_path_unique
    UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_library_resources_org_category
  ON public.library_resources (org_id, category_id);

CREATE INDEX IF NOT EXISTS idx_library_resources_org_published
  ON public.library_resources (org_id, published, created_at DESC)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS trg_library_resources_updated_at ON public.library_resources;
CREATE TRIGGER trg_library_resources_updated_at
  BEFORE UPDATE ON public.library_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_library_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: aislamiento por tenant. El gate de "quien puede escribir" (write=admin)
-- NO va aca; se aplica en la API con canPerformAction(user,"library","write").
-- ---------------------------------------------------------------------------
ALTER TABLE public.library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_resources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS library_categories_tenant ON public.library_categories;
CREATE POLICY library_categories_tenant
  ON public.library_categories FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS library_resources_tenant ON public.library_resources;
CREATE POLICY library_resources_tenant
  ON public.library_resources FOR ALL TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_resources TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado (signed URLs). Path = ${org_id}/${uuid}.${ext}
-- (un solo segmento UUID = org_id, porque el alcance es por org).
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'library-assets',
  'library-assets',
  false,
  524288000, -- 500MB (los videos pueden ser pesados)
  ARRAY[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS library_assets_select ON storage.objects;
CREATE POLICY library_assets_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'library-assets'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 1)::UUID IN (SELECT public.user_org_ids())
  );

DROP POLICY IF EXISTS library_assets_insert ON storage.objects;
CREATE POLICY library_assets_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'library-assets'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 1)::UUID IN (SELECT public.user_org_ids())
  );

DROP POLICY IF EXISTS library_assets_delete ON storage.objects;
CREATE POLICY library_assets_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'library-assets'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 1)::UUID IN (SELECT public.user_org_ids())
  );

-- ---------------------------------------------------------------------------
-- Seed: 3 categorias base por cada org existente (idempotente). Las agencias
-- pueden crear/editar/borrar categorias despues desde el panel de admin.
-- ---------------------------------------------------------------------------
INSERT INTO public.library_categories (org_id, name, slug, icon, sort_order)
SELECT o.id, seed.name, seed.slug, seed.icon, seed.sort_order
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('Manuales de vendedores', 'manuales-vendedores', 'BookOpen', 0),
    ('Instrucciones del sistema', 'instrucciones-sistema', 'MonitorPlay', 1),
    ('Mejores prácticas', 'mejores-practicas', 'Sparkles', 2)
) AS seed(name, slug, icon, sort_order)
ON CONFLICT (org_id, slug) DO NOTHING;

COMMENT ON TABLE public.library_categories IS
  'VIB-70 Biblioteca: categorias de material de capacitacion por org.';
COMMENT ON TABLE public.library_resources IS
  'VIB-70 Biblioteca: recursos (file/link) de capacitacion por org, dirigidos por rol (target_roles).';

COMMIT;
