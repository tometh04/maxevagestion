-- ===========================================
-- TABLA DE LOGS DE AUDITORÍA
-- ===========================================

-- Crear tabla de audit_logs si no existe
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- Comentarios descriptivos
COMMENT ON TABLE audit_logs IS 'Registro de todas las acciones importantes realizadas en el sistema';
COMMENT ON COLUMN audit_logs.action IS 'Tipo de acción: LOGIN, LOGOUT, CREATE_*, UPDATE_*, DELETE_*, INVITE_USER, etc.';
COMMENT ON COLUMN audit_logs.entity_type IS 'Tipo de entidad afectada: user, lead, operation, payment, etc.';
COMMENT ON COLUMN audit_logs.entity_id IS 'ID de la entidad afectada';
COMMENT ON COLUMN audit_logs.details IS 'Detalles adicionales en formato JSON';

-- RLS Policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Solo SUPER_ADMIN y ADMIN pueden ver los logs
CREATE POLICY "audit_logs_select_admin" ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_id = auth.uid()
      AND users.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- Solo el sistema puede insertar logs (a través de service role)
CREATE POLICY "audit_logs_insert_system" ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Función para registrar acciones automáticamente
CREATE OR REPLACE FUNCTION log_audit_action(
  p_user_id UUID,
  p_action VARCHAR(100),
  p_entity_type VARCHAR(50) DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_details)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para registrar cambios en usuarios
CREATE OR REPLACE FUNCTION audit_user_changes() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_active != NEW.is_active THEN
      PERFORM log_audit_action(
        NULL,
        CASE WHEN NEW.is_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
        'user',
        NEW.id,
        jsonb_build_object('email', NEW.email, 'name', NEW.name)
      );
    END IF;
    
    IF OLD.role != NEW.role THEN
      PERFORM log_audit_action(
        NULL,
        'USER_ROLE_CHANGED',
        'user',
        NEW.id,
        jsonb_build_object('email', NEW.email, 'old_role', OLD.role, 'new_role', NEW.role)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar trigger a la tabla users
DROP TRIGGER IF EXISTS trigger_audit_user_changes ON users;
CREATE TRIGGER trigger_audit_user_changes
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION audit_user_changes();

