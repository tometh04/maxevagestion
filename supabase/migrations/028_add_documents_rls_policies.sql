-- =====================================================
-- FASE 3: FACTURACIÓN Y DATOS DE CLIENTES
-- Migración 028: Agregar políticas RLS para documents
-- =====================================================

-- Habilitar RLS en la tabla documents (si no está habilitado)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Política para SELECT: usuarios autenticados pueden leer documentos
-- de leads/operations a los que tienen acceso a través de sus agencias
CREATE POLICY "Users can read documents from their agencies"
ON documents
FOR SELECT
TO authenticated
USING (
  -- Si el documento está asociado a un lead, verificar acceso a la agencia del lead
  (
    lead_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = documents.lead_id
      AND EXISTS (
        SELECT 1 FROM user_agencies
        WHERE user_agencies.user_id = auth.uid()::text::uuid
        AND user_agencies.agency_id = leads.agency_id
      )
    )
  )
  OR
  -- Si el documento está asociado a una operación, verificar acceso a la agencia de la operación
  (
    operation_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM operations
      WHERE operations.id = documents.operation_id
      AND EXISTS (
        SELECT 1 FROM user_agencies
        WHERE user_agencies.user_id = auth.uid()::text::uuid
        AND user_agencies.agency_id = operations.agency_id
      )
    )
  )
  OR
  -- Si el documento está asociado a un cliente, verificar acceso a través de operaciones
  (
    customer_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM operation_customers
      INNER JOIN operations ON operations.id = operation_customers.operation_id
      WHERE operation_customers.customer_id = documents.customer_id
      AND EXISTS (
        SELECT 1 FROM user_agencies
        WHERE user_agencies.user_id = auth.uid()::text::uuid
        AND user_agencies.agency_id = operations.agency_id
      )
    )
  )
  OR
  -- Si el usuario subió el documento, puede leerlo
  uploaded_by_user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )
);

-- Política para INSERT: usuarios autenticados pueden insertar documentos
-- siempre que estén asociados a un lead/operation/customer de su agencia
CREATE POLICY "Users can insert documents for their agencies"
ON documents
FOR INSERT
TO authenticated
WITH CHECK (
  -- Verificar que el usuario existe y está activo
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = documents.uploaded_by_user_id
    AND users.auth_id = auth.uid()
    AND users.is_active = true
  )
  AND
  (
    -- Si está asociado a un lead, verificar acceso a la agencia
    (
      lead_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM leads
        WHERE leads.id = documents.lead_id
        AND EXISTS (
          SELECT 1 FROM user_agencies
          WHERE user_agencies.user_id = (
            SELECT id FROM users WHERE auth_id = auth.uid()
          )
          AND user_agencies.agency_id = leads.agency_id
        )
      )
    )
    OR
    -- Si está asociado a una operación, verificar acceso a la agencia
    (
      operation_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM operations
        WHERE operations.id = documents.operation_id
        AND EXISTS (
          SELECT 1 FROM user_agencies
          WHERE user_agencies.user_id = (
            SELECT id FROM users WHERE auth_id = auth.uid()
          )
          AND user_agencies.agency_id = operations.agency_id
        )
      )
    )
    OR
    -- Si está asociado a un cliente, verificar acceso a través de operaciones
    (
      customer_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM operation_customers
        INNER JOIN operations ON operations.id = operation_customers.operation_id
        WHERE operation_customers.customer_id = documents.customer_id
        AND EXISTS (
          SELECT 1 FROM user_agencies
          WHERE user_agencies.user_id = (
            SELECT id FROM users WHERE auth_id = auth.uid()
          )
          AND user_agencies.agency_id = operations.agency_id
        )
      )
    )
  )
);

-- Política para UPDATE: usuarios autenticados pueden actualizar documentos que subieron
-- o documentos de sus agencias
CREATE POLICY "Users can update documents they uploaded or from their agencies"
ON documents
FOR UPDATE
TO authenticated
USING (
  -- Si el usuario subió el documento, puede actualizarlo
  uploaded_by_user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )
  OR
  -- O si tiene acceso a la agencia del lead/operation asociado
  (
    lead_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = documents.lead_id
      AND EXISTS (
        SELECT 1 FROM user_agencies
        WHERE user_agencies.user_id = (
          SELECT id FROM users WHERE auth_id = auth.uid()
        )
        AND user_agencies.agency_id = leads.agency_id
      )
    )
  )
  OR
  (
    operation_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM operations
      WHERE operations.id = documents.operation_id
      AND EXISTS (
        SELECT 1 FROM user_agencies
        WHERE user_agencies.user_id = (
          SELECT id FROM users WHERE auth_id = auth.uid()
        )
        AND user_agencies.agency_id = operations.agency_id
      )
    )
  )
)
WITH CHECK (
  -- Mismas condiciones para WITH CHECK
  uploaded_by_user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )
  OR
  (
    lead_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = documents.lead_id
      AND EXISTS (
        SELECT 1 FROM user_agencies
        WHERE user_agencies.user_id = (
          SELECT id FROM users WHERE auth_id = auth.uid()
        )
        AND user_agencies.agency_id = leads.agency_id
      )
    )
  )
  OR
  (
    operation_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM operations
      WHERE operations.id = documents.operation_id
      AND EXISTS (
        SELECT 1 FROM user_agencies
        WHERE user_agencies.user_id = (
          SELECT id FROM users WHERE auth_id = auth.uid()
        )
        AND user_agencies.agency_id = operations.agency_id
      )
    )
  )
);

-- Política para DELETE: usuarios autenticados pueden eliminar documentos que subieron
-- o documentos de sus agencias (solo SUPER_ADMIN y ADMIN)
CREATE POLICY "Users can delete documents they uploaded or from their agencies"
ON documents
FOR DELETE
TO authenticated
USING (
  -- Verificar que el usuario tiene rol apropiado
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
    AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    AND users.is_active = true
  )
  AND
  (
    -- Si el usuario subió el documento, puede eliminarlo
    uploaded_by_user_id = (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
    OR
    -- O si tiene acceso a la agencia del lead/operation asociado
    (
      lead_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM leads
        WHERE leads.id = documents.lead_id
        AND EXISTS (
          SELECT 1 FROM user_agencies
          WHERE user_agencies.user_id = (
            SELECT id FROM users WHERE auth_id = auth.uid()
          )
          AND user_agencies.agency_id = leads.agency_id
        )
      )
    )
    OR
    (
      operation_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM operations
        WHERE operations.id = documents.operation_id
        AND EXISTS (
          SELECT 1 FROM user_agencies
          WHERE user_agencies.user_id = (
            SELECT id FROM users WHERE auth_id = auth.uid()
          )
          AND user_agencies.agency_id = operations.agency_id
        )
      )
    )
  )
);

COMMENT ON POLICY "Users can read documents from their agencies" ON documents IS 
'Permite a usuarios autenticados leer documentos de leads/operations a los que tienen acceso a través de sus agencias';

COMMENT ON POLICY "Users can insert documents for their agencies" ON documents IS 
'Permite a usuarios autenticados insertar documentos asociados a leads/operations/customers de sus agencias';

COMMENT ON POLICY "Users can update documents they uploaded or from their agencies" ON documents IS 
'Permite a usuarios autenticados actualizar documentos que subieron o documentos de sus agencias';

COMMENT ON POLICY "Users can delete documents they uploaded or from their agencies" ON documents IS 
'Permite a SUPER_ADMIN y ADMIN eliminar documentos que subieron o documentos de sus agencias';

