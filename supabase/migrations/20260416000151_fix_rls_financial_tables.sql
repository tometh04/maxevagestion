-- =====================================================
-- SECURITY FIX: endurecer RLS en tablas financieras y sensibles
-- Migración 20260416000151
--
-- Motivación (ver auditoría de seguridad):
--   V3: conversations / messages con RLS deshabilitado → cross-tenant leak
--   V4: iva_sales, iva_purchases, commission_records con USING(true)
--       → SELLER podía leer datos de otros
--   V6: wa_devices, wa_messages, wa_chats y demás wa_* con USING(true)
--       → sin aislamiento (no tienen agency_id aún, restringimos a admin)
--
-- Orden: DROP POLICY IF EXISTS + CREATE POLICY (idempotente).
-- =====================================================

-- Helper: verificar que auth_id resuelve a un usuario activo con rol admin.
-- (No creamos función para no expandir surface; usamos sub-SELECTs inline.)

-- =====================================================
-- 1) iva_sales — filtrar SELLER por operations.seller_id
-- =====================================================
DROP POLICY IF EXISTS "iva_sales_select" ON iva_sales;
DROP POLICY IF EXISTS "iva_sales_insert" ON iva_sales;
DROP POLICY IF EXISTS "iva_sales_update" ON iva_sales;
DROP POLICY IF EXISTS "iva_sales_delete" ON iva_sales;

CREATE POLICY "iva_sales_select" ON iva_sales FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
  OR EXISTS (
    SELECT 1 FROM operations o
    JOIN users u ON u.auth_id = auth.uid()
    WHERE o.id = iva_sales.operation_id
      AND o.seller_id = u.id
      AND u.is_active = true
  )
);

CREATE POLICY "iva_sales_insert" ON iva_sales FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "iva_sales_update" ON iva_sales FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "iva_sales_delete" ON iva_sales FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- 2) iva_purchases — mismo pattern
-- =====================================================
DROP POLICY IF EXISTS "iva_purchases_select" ON iva_purchases;
DROP POLICY IF EXISTS "iva_purchases_insert" ON iva_purchases;
DROP POLICY IF EXISTS "iva_purchases_update" ON iva_purchases;
DROP POLICY IF EXISTS "iva_purchases_delete" ON iva_purchases;

CREATE POLICY "iva_purchases_select" ON iva_purchases FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
  OR EXISTS (
    SELECT 1 FROM operations o
    JOIN users u ON u.auth_id = auth.uid()
    WHERE o.id = iva_purchases.operation_id
      AND o.seller_id = u.id
      AND u.is_active = true
  )
);

CREATE POLICY "iva_purchases_insert" ON iva_purchases FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "iva_purchases_update" ON iva_purchases FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "iva_purchases_delete" ON iva_purchases FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- 3) commission_records — SELLER solo sus propias comisiones
--    (tiene seller_id directo, más simple que joinar a operations)
-- =====================================================
DROP POLICY IF EXISTS "commission_records_select" ON commission_records;
DROP POLICY IF EXISTS "commission_records_insert" ON commission_records;
DROP POLICY IF EXISTS "commission_records_update" ON commission_records;
DROP POLICY IF EXISTS "commission_records_delete" ON commission_records;

CREATE POLICY "commission_records_select" ON commission_records FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_id = auth.uid()
      AND u.is_active = true
      AND u.id = commission_records.seller_id
  )
);

CREATE POLICY "commission_records_insert" ON commission_records FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "commission_records_update" ON commission_records FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN', 'CONTABLE')
  )
);

CREATE POLICY "commission_records_delete" ON commission_records FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- 4) conversations + messages — re-habilitar RLS (V3)
--    Cada usuario solo accede a sus propias conversaciones.
--    NOTA: conversations.user_id es TEXT (cambiado en migración 053
--    "fix_user_id_type") y guarda directamente auth.uid()::text.
--    Por eso comparamos auth.uid()::text = user_id (no joineamos a users).
-- =====================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_owner_all" ON conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON conversations;

CREATE POLICY "conversations_owner_all" ON conversations FOR ALL
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "messages_owner_all" ON messages;
DROP POLICY IF EXISTS "Users can view messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON messages;

CREATE POLICY "messages_owner_all" ON messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND auth.uid()::text = c.user_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND auth.uid()::text = c.user_id
  )
);

-- =====================================================
-- 5) wa_* tables — restringir a ADMIN / SUPER_ADMIN (V6)
--    Estas tablas no tienen agency_id todavía; cuando se agregue
--    se puede reemplazar por policy por agency.
--    El service role client (admin) sigue pasando siempre — RLS no aplica.
-- =====================================================

-- wa_devices
DROP POLICY IF EXISTS "wa_devices_full_access" ON wa_devices;
CREATE POLICY "wa_devices_admin_only" ON wa_devices FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_auth_credentials
DROP POLICY IF EXISTS "wa_auth_credentials_full_access" ON wa_auth_credentials;
CREATE POLICY "wa_auth_credentials_admin_only" ON wa_auth_credentials FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_auth_keys
DROP POLICY IF EXISTS "wa_auth_keys_full_access" ON wa_auth_keys;
CREATE POLICY "wa_auth_keys_admin_only" ON wa_auth_keys FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_chats
DROP POLICY IF EXISTS "wa_chats_full_access" ON wa_chats;
CREATE POLICY "wa_chats_admin_only" ON wa_chats FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_messages
DROP POLICY IF EXISTS "wa_messages_full_access" ON wa_messages;
CREATE POLICY "wa_messages_admin_only" ON wa_messages FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- wa_daily_metrics
DROP POLICY IF EXISTS "wa_daily_metrics_full_access" ON wa_daily_metrics;
CREATE POLICY "wa_daily_metrics_admin_only" ON wa_daily_metrics FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_id = auth.uid()
      AND users.is_active = true
      AND users.role IN ('ADMIN', 'SUPER_ADMIN')
  )
);

-- =====================================================
-- Notas de verificación:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('iva_sales','iva_purchases','commission_records',
--                       'conversations','messages',
--                       'wa_devices','wa_auth_credentials','wa_auth_keys',
--                       'wa_chats','wa_messages','wa_daily_metrics')
--   ORDER BY tablename, cmd;
-- =====================================================
