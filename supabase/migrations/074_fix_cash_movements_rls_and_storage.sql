-- ============================================================
-- Migration 074: Fix cash_movements RLS + ensure tables exist
-- Fixes: sync-movements 500, templates 500, comments 500, documents upload
-- ============================================================

-- ============================================================
-- 1. CASH_MOVEMENTS: Add RLS policies (may have been enabled from dashboard)
-- ============================================================

-- Enable RLS (idempotent)
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Agency members can view cash movements" ON cash_movements;
DROP POLICY IF EXISTS "Agency members can insert cash movements" ON cash_movements;
DROP POLICY IF EXISTS "Agency members can update cash movements" ON cash_movements;
DROP POLICY IF EXISTS "Agency members can delete cash movements" ON cash_movements;

-- SELECT: users can see movements from their agencies
CREATE POLICY "Agency members can view cash movements"
  ON cash_movements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM operations o
      JOIN user_agencies ua ON ua.agency_id = o.agency_id
      WHERE o.id = cash_movements.operation_id
      AND ua.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM cash_boxes cb
      JOIN user_agencies ua ON ua.agency_id = cb.agency_id
      WHERE cb.id = cash_movements.cash_box_id
      AND ua.user_id = auth.uid()
    )
    OR
    cash_movements.user_id = auth.uid()
  );

-- INSERT: users can create movements for their agencies
CREATE POLICY "Agency members can insert cash movements"
  ON cash_movements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cash_boxes cb
      JOIN user_agencies ua ON ua.agency_id = cb.agency_id
      WHERE cb.id = cash_movements.cash_box_id
      AND ua.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM operations o
      JOIN user_agencies ua ON ua.agency_id = o.agency_id
      WHERE o.id = cash_movements.operation_id
      AND ua.user_id = auth.uid()
    )
  );

-- UPDATE: users can update movements from their agencies
CREATE POLICY "Agency members can update cash movements"
  ON cash_movements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM cash_boxes cb
      JOIN user_agencies ua ON ua.agency_id = cb.agency_id
      WHERE cb.id = cash_movements.cash_box_id
      AND ua.user_id = auth.uid()
    )
    OR
    cash_movements.user_id = auth.uid()
  );

-- DELETE: users can delete movements from their agencies
CREATE POLICY "Agency members can delete cash movements"
  ON cash_movements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM cash_boxes cb
      JOIN user_agencies ua ON ua.agency_id = cb.agency_id
      WHERE cb.id = cash_movements.cash_box_id
      AND ua.user_id = auth.uid()
    )
    OR
    cash_movements.user_id = auth.uid()
  );

-- ============================================================
-- 2. CASH_BOXES: Add RLS policies
-- ============================================================
ALTER TABLE cash_boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view cash boxes" ON cash_boxes;
DROP POLICY IF EXISTS "Agency members can manage cash boxes" ON cash_boxes;

CREATE POLICY "Agency members can view cash boxes"
  ON cash_boxes FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Agency members can manage cash boxes"
  ON cash_boxes FOR ALL
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. PAYMENTS: Add RLS policies
-- ============================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view payments" ON payments;
DROP POLICY IF EXISTS "Agency members can manage payments" ON payments;

CREATE POLICY "Agency members can view payments"
  ON payments FOR SELECT
  USING (
    operation_id IN (
      SELECT o.id FROM operations o
      JOIN user_agencies ua ON ua.agency_id = o.agency_id
      WHERE ua.user_id = auth.uid()
    )
  );

CREATE POLICY "Agency members can manage payments"
  ON payments FOR ALL
  USING (
    operation_id IN (
      SELECT o.id FROM operations o
      JOIN user_agencies ua ON ua.agency_id = o.agency_id
      WHERE ua.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. PDF_TEMPLATES: Ensure table and policies exist (migration 065)
-- ============================================================
CREATE TABLE IF NOT EXISTS pdf_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL CHECK (template_type IN ('invoice', 'budget', 'voucher', 'itinerary', 'receipt', 'contract', 'general')),
  html_content TEXT NOT NULL,
  css_styles TEXT,
  page_size TEXT NOT NULL DEFAULT 'A4',
  page_orientation TEXT NOT NULL DEFAULT 'portrait' CHECK (page_orientation IN ('portrait', 'landscape')),
  page_margins JSONB,
  header_html TEXT,
  footer_html TEXT,
  show_page_numbers BOOLEAN NOT NULL DEFAULT true,
  available_variables JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_templates_agency_id ON pdf_templates(agency_id);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_type ON pdf_templates(template_type);

ALTER TABLE pdf_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view their templates" ON pdf_templates;
DROP POLICY IF EXISTS "Admins can manage their templates" ON pdf_templates;

CREATE POLICY "Agency members can view their templates"
  ON pdf_templates FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage their templates"
  ON pdf_templates FOR ALL
  USING (
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. LEAD_COMMENTS: Ensure table and policies exist (migration 066)
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_comments_lead_id ON lead_comments(lead_id);

ALTER TABLE lead_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can view lead comments" ON lead_comments;
DROP POLICY IF EXISTS "Agency members can create lead comments" ON lead_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON lead_comments;

CREATE POLICY "Agency members can view lead comments"
  ON lead_comments FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id FROM leads l
      JOIN user_agencies ua ON ua.agency_id = l.agency_id
      WHERE ua.user_id = auth.uid()
    )
  );

CREATE POLICY "Agency members can create lead comments"
  ON lead_comments FOR INSERT
  WITH CHECK (
    lead_id IN (
      SELECT l.id FROM leads l
      JOIN user_agencies ua ON ua.agency_id = l.agency_id
      WHERE ua.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own comments"
  ON lead_comments FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- 6. DOCUMENTS STORAGE BUCKET
-- (Must also be created from Supabase Dashboard: Storage > New Bucket > "documents" > Public)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for documents bucket
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their documents" ON storage.objects;

CREATE POLICY "Anyone can view documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete their documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND auth.uid() = owner
  );
