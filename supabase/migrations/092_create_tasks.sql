-- ============================================================
-- MIGRACIÓN: Crear tabla de tareas (Task Manager)
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),

  -- Personas
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Fechas
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Recordatorio (minutos antes de due_date)
  reminder_minutes INT,
  reminder_sent BOOLEAN DEFAULT FALSE,

  -- Vínculos opcionales
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- Agencia
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries frecuentes
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_agency ON tasks(agency_id);
CREATE INDEX idx_tasks_operation ON tasks(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX idx_tasks_priority_status ON tasks(priority, status);

-- RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
