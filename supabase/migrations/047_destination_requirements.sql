-- =====================================================
-- MIGRACIÓN: Sistema de Requisitos por Destino
-- Fecha: 2025-12-05
-- Descripción: Alertas sobre vacunas, visas, formularios por destino
-- =====================================================

-- Tabla de requisitos por destino
CREATE TABLE IF NOT EXISTS destination_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  destination_code TEXT NOT NULL, -- "BR", "CO", "US", "EU", "MX", etc.
  destination_name TEXT NOT NULL, -- "Brasil", "Colombia", "Estados Unidos"
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('VACCINE', 'FORM', 'VISA', 'INSURANCE', 'DOCUMENT', 'OTHER')),
  requirement_name TEXT NOT NULL, -- "Fiebre Amarilla", "ESTA", "Formulario Migratorio"
  is_required BOOLEAN DEFAULT true,
  description TEXT, -- Detalles adicionales
  url TEXT, -- Link a más info o formulario
  days_before_trip INTEGER DEFAULT 30, -- Cuántos días antes alertar
  valid_from DATE,
  valid_to DATE, -- NULL si vigente indefinidamente
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_destination_requirements_code ON destination_requirements(destination_code);
CREATE INDEX IF NOT EXISTS idx_destination_requirements_active ON destination_requirements(is_active);
CREATE INDEX IF NOT EXISTS idx_destination_requirements_type ON destination_requirements(requirement_type);

-- Datos iniciales - Requisitos comunes para destinos populares
INSERT INTO destination_requirements (destination_code, destination_name, requirement_type, requirement_name, is_required, description, url, days_before_trip) VALUES
-- Brasil
('BR', 'Brasil', 'VACCINE', 'Fiebre Amarilla', true, 'Vacuna obligatoria para ingresar a Brasil. Debe aplicarse al menos 10 días antes del viaje.', 'https://www.gov.br/anvisa/pt-br', 30),
('BR', 'Brasil', 'FORM', 'Declaración de Salud del Viajero', false, 'Formulario de salud (puede ser requerido en algunas épocas)', NULL, 7),

-- Colombia  
('CO', 'Colombia', 'VACCINE', 'Fiebre Amarilla', true, 'Obligatoria si se visitan zonas selváticas o se viene de países con riesgo', NULL, 30),

-- Estados Unidos
('US', 'Estados Unidos', 'VISA', 'ESTA o Visa B1/B2', true, 'Argentinos requieren Visa de turista B1/B2. ESTA solo para países del Visa Waiver Program.', 'https://esta.cbp.dhs.gov/', 90),
('US', 'Estados Unidos', 'FORM', 'Formulario I-94', false, 'Se completa al ingresar (electrónico o en papel)', NULL, 7),
('US', 'Estados Unidos', 'INSURANCE', 'Seguro de Viaje', false, 'Altamente recomendado por costos médicos elevados', NULL, 14),

-- Europa (Schengen)
('EU', 'Europa (Schengen)', 'FORM', 'ETIAS', false, 'A partir de 2025, argentinos necesitarán autorización ETIAS para ingresar a Schengen', 'https://www.etiasvisa.com/', 90),
('EU', 'Europa (Schengen)', 'INSURANCE', 'Seguro de Viaje', true, 'Obligatorio con cobertura mínima de 30.000 EUR', NULL, 14),

-- México
('MX', 'México', 'FORM', 'Forma Migratoria Múltiple', false, 'Se obtiene al llegar o en línea previamente', 'https://www.inm.gob.mx/', 7),

-- Cuba
('CU', 'Cuba', 'VISA', 'Tarjeta de Turista', true, 'Visa de turista obligatoria, se puede obtener en aerolínea o consulado', NULL, 30),
('CU', 'Cuba', 'INSURANCE', 'Seguro de Viaje', true, 'Obligatorio para ingresar a Cuba', NULL, 14),

-- República Dominicana
('DO', 'República Dominicana', 'FORM', 'E-Ticket', true, 'Formulario electrónico obligatorio de entrada y salida', 'https://eticket.migracion.gob.do/', 7),

-- Tailandia
('TH', 'Tailandia', 'VISA', 'Visa on Arrival / eVisa', false, 'Argentinos pueden obtener visa al llegar (30 días) o eVisa', 'https://www.thaievisa.go.th/', 30),

-- Australia
('AU', 'Australia', 'VISA', 'eVisitor o ETA', true, 'Visa electrónica obligatoria', 'https://immi.homeaffairs.gov.au/', 60),

-- Egipto
('EG', 'Egipto', 'VISA', 'Visa on Arrival', true, 'Se puede obtener al llegar o eVisa previamente', 'https://www.egyptvisa.net/', 30);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_destination_requirements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_destination_requirements_updated_at ON destination_requirements;
CREATE TRIGGER trigger_update_destination_requirements_updated_at
  BEFORE UPDATE ON destination_requirements
  FOR EACH ROW
  EXECUTE FUNCTION update_destination_requirements_updated_at();

-- Agregar tipo de alerta DESTINATION_REQUIREMENT si no existe
DO $$ 
BEGIN
  -- Verificar si existe el constraint y actualizarlo
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'alerts_type_check' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
  END IF;
  
  -- Crear nuevo constraint con DESTINATION_REQUIREMENT
  ALTER TABLE alerts ADD CONSTRAINT alerts_type_check 
    CHECK (type IN ('PAYMENT_DUE', 'PAYMENT_OVERDUE', 'UPCOMING_TRIP', 'DOCUMENT_MISSING', 'DOCUMENT_EXPIRING', 'BIRTHDAY', 'PASSPORT_EXPIRY', 'DESTINATION_REQUIREMENT', 'OTHER'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Error actualizando constraint: %', SQLERRM;
END $$;

-- Comentarios
COMMENT ON TABLE destination_requirements IS 'Requisitos por destino (vacunas, visas, formularios, etc.)';
COMMENT ON COLUMN destination_requirements.destination_code IS 'Código ISO del país o región (BR, US, EU, etc.)';
COMMENT ON COLUMN destination_requirements.requirement_type IS 'Tipo: VACCINE, FORM, VISA, INSURANCE, DOCUMENT, OTHER';
COMMENT ON COLUMN destination_requirements.days_before_trip IS 'Días antes del viaje para generar la alerta';

