-- =====================================================
-- Migración 072: Equipos de Ventas
-- Sistema de equipos con líderes y miembros
-- =====================================================

-- Tabla de equipos
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  
  -- Líder del equipo
  leader_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Estado
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de miembros de equipo
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Rol en el equipo
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  
  -- Fechas
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  
  -- Unique constraint
  UNIQUE(team_id, user_id)
);

-- Tabla de metas de equipo
CREATE TABLE IF NOT EXISTS team_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  
  -- Período
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Metas
  target_operations INTEGER, -- Cantidad de operaciones
  target_revenue NUMERIC(18,2), -- Ingresos objetivo
  target_margin NUMERIC(18,2), -- Margen objetivo
  target_new_customers INTEGER, -- Nuevos clientes
  
  -- Progreso actual (calculado)
  current_operations INTEGER DEFAULT 0,
  current_revenue NUMERIC(18,2) DEFAULT 0,
  current_margin NUMERIC(18,2) DEFAULT 0,
  current_new_customers INTEGER DEFAULT 0,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  
  -- Notas
  notes TEXT,
  
  -- Auditoría
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de metas individuales
CREATE TABLE IF NOT EXISTS user_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_goal_id UUID REFERENCES team_goals(id) ON DELETE SET NULL,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  
  -- Período
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Metas
  target_operations INTEGER,
  target_revenue NUMERIC(18,2),
  target_margin NUMERIC(18,2),
  target_new_customers INTEGER,
  
  -- Progreso actual
  current_operations INTEGER DEFAULT 0,
  current_revenue NUMERIC(18,2) DEFAULT 0,
  current_margin NUMERIC(18,2) DEFAULT 0,
  current_new_customers INTEGER DEFAULT 0,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_teams_agency ON teams(agency_id);
CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams(leader_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_goals_team ON team_goals(team_id);
CREATE INDEX IF NOT EXISTS idx_team_goals_period ON team_goals(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_user_goals_user ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_period ON user_goals(period_start, period_end);

-- Comentarios
COMMENT ON TABLE teams IS 'Equipos de ventas';
COMMENT ON TABLE team_members IS 'Miembros de equipos';
COMMENT ON TABLE team_goals IS 'Metas de equipos';
COMMENT ON TABLE user_goals IS 'Metas individuales de usuarios';

-- RLS (Row Level Security)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;

-- Eliminar policies existentes si existen
DROP POLICY IF EXISTS "Users can view teams for their agencies" ON teams;
DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
DROP POLICY IF EXISTS "Users can view team members" ON team_members;
DROP POLICY IF EXISTS "Leaders can manage team members" ON team_members;
DROP POLICY IF EXISTS "Users can view team goals" ON team_goals;
DROP POLICY IF EXISTS "Leaders can manage team goals" ON team_goals;
DROP POLICY IF EXISTS "Users can view own goals" ON user_goals;
DROP POLICY IF EXISTS "Users can manage own goals" ON user_goals;

-- Políticas para teams
CREATE POLICY "Users can view teams for their agencies"
  ON teams
  FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage teams"
  ON teams
  FOR ALL
  USING (
    agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Políticas para team_members
CREATE POLICY "Users can view team members"
  ON team_members
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM teams 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Leaders can manage team members"
  ON team_members
  FOR ALL
  USING (
    team_id IN (
      SELECT id FROM teams 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
      AND (
        leader_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN'))
      )
    )
  );

-- Políticas para team_goals
CREATE POLICY "Users can view team goals"
  ON team_goals
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM teams 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Leaders can manage team goals"
  ON team_goals
  FOR ALL
  USING (
    team_id IN (
      SELECT id FROM teams 
      WHERE agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid())
      AND (
        leader_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN'))
      )
    )
  );

-- Políticas para user_goals
CREATE POLICY "Users can view own goals"
  ON user_goals
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN', 'MANAGER'))
    )
  );

CREATE POLICY "Users can manage own goals"
  ON user_goals
  FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN'))
  );

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_team_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trigger_update_team_updated_at ON teams;
CREATE TRIGGER trigger_update_team_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_team_updated_at();

DROP TRIGGER IF EXISTS trigger_update_team_goal_updated_at ON team_goals;
CREATE TRIGGER trigger_update_team_goal_updated_at
  BEFORE UPDATE ON team_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_team_updated_at();

DROP TRIGGER IF EXISTS trigger_update_user_goal_updated_at ON user_goals;
CREATE TRIGGER trigger_update_user_goal_updated_at
  BEFORE UPDATE ON user_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_team_updated_at();
