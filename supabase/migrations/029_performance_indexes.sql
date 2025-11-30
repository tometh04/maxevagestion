-- =====================================================
-- Optimizaciones de Performance
-- Migración 029: Índices adicionales para mejorar rendimiento
-- =====================================================

-- Índices para leads (optimizar queries frecuentes)
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_trello_list_id ON leads(trello_list_id) WHERE trello_list_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_external_id ON leads(external_id) WHERE external_id IS NOT NULL;

-- Índices para operations (optimizar queries de analytics y listado)
CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_departure_date ON operations(departure_date);
CREATE INDEX IF NOT EXISTS idx_operations_currency ON operations(currency);

-- Índices para payments (optimizar queries de pagos pendientes y vencidos)
CREATE INDEX IF NOT EXISTS idx_payments_date_due ON payments(date_due);
CREATE INDEX IF NOT EXISTS idx_payments_direction ON payments(direction);
CREATE INDEX IF NOT EXISTS idx_payments_payer_type ON payments(payer_type);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Índice compuesto para payments (optimizar queries comunes)
CREATE INDEX IF NOT EXISTS idx_payments_status_direction ON payments(status, direction);
CREATE INDEX IF NOT EXISTS idx_payments_operation_status ON payments(operation_id, status);

-- Índices para customers (optimizar búsquedas)
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);

-- Índices para documents (optimizar queries de documentos)
CREATE INDEX IF NOT EXISTS idx_documents_operation ON documents(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_lead ON documents(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);

-- Índices para user_agencies (optimizar queries de permisos)
CREATE INDEX IF NOT EXISTS idx_user_agencies_user ON user_agencies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agencies_agency ON user_agencies(agency_id);

-- Comentarios
COMMENT ON INDEX idx_leads_trello_list_id IS 'Índice para filtrar leads por lista de Trello';
COMMENT ON INDEX idx_leads_created_at IS 'Índice para ordenar leads por fecha de creación';
COMMENT ON INDEX idx_operations_created_at IS 'Índice para ordenar operaciones por fecha de creación';
COMMENT ON INDEX idx_payments_status_direction IS 'Índice compuesto para queries de pagos por estado y dirección';

