-- =====================================================
-- SISTEMA DE MENSAJES WHATSAPP
-- Migración 040: Templates y cola de mensajes
-- =====================================================

-- Tabla de templates de mensajes
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Información básica
  name TEXT NOT NULL,                    -- "Recordatorio de Pago"
  description TEXT,                      -- Descripción del template
  category TEXT NOT NULL CHECK (category IN (
    'PAYMENT',      -- Pagos
    'TRIP',         -- Viajes
    'QUOTATION',    -- Cotizaciones
    'BIRTHDAY',     -- Cumpleaños
    'ANNIVERSARY',  -- Aniversario cliente
    'MARKETING',    -- Marketing general
    'CUSTOM'        -- Personalizado
  )),
  
  -- Trigger automático
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'MANUAL',                 -- Envío manual
    'QUOTATION_SENT',         -- Cotización enviada
    'QUOTATION_EXPIRING',     -- Cotización por vencer (2 días antes)
    'QUOTATION_APPROVED',     -- Cotización aprobada
    'PAYMENT_PLAN_CREATED',   -- Plan de pagos creado
    'PAYMENT_DUE_3D',         -- 3 días antes de vencimiento
    'PAYMENT_DUE_1D',         -- 1 día antes de vencimiento
    'PAYMENT_RECEIVED',       -- Pago recibido
    'PAYMENT_OVERDUE',        -- Pago vencido
    'PAYMENT_COMPLETE',       -- Todos los pagos completados
    'TRIP_7D_BEFORE',         -- 7 días antes del viaje
    'TRIP_1D_BEFORE',         -- 1 día antes del viaje
    'TRIP_RETURN',            -- Día de regreso
    'TRIP_POST_7D',           -- 7 días post-viaje
    'BIRTHDAY',               -- Cumpleaños
    'ANNIVERSARY_1Y'          -- 1 año desde primera operación
  )),
  
  -- Contenido del mensaje
  template TEXT NOT NULL,                -- "Hola {nombre}, te recordamos..."
  emoji_prefix TEXT,                     -- "💰" para mostrar en la lista
  
  -- Configuración
  is_active BOOLEAN DEFAULT true,
  send_hour_from INTEGER DEFAULT 9,      -- Hora mínima de envío (9am)
  send_hour_to INTEGER DEFAULT 21,       -- Hora máxima de envío (9pm)
  
  -- Relaciones
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,  -- NULL = template global
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Tabla de mensajes en cola
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Template usado
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  
  -- Destinatario
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  
  -- Contenido
  message TEXT NOT NULL,                 -- Mensaje ya armado con variables
  whatsapp_link TEXT,                    -- Link wa.me generado
  
  -- Contexto (opcional, para tracking)
  operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
  
  -- Estado
  status TEXT DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',      -- Pendiente de envío
    'SENT',         -- Enviado
    'SKIPPED',      -- Omitido por el usuario
    'FAILED'        -- Falló (sin teléfono, etc.)
  )),
  
  -- Programación
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Envío
  sent_at TIMESTAMP WITH TIME ZONE,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_message_templates_agency ON message_templates(agency_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_trigger ON message_templates(trigger_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(category);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_customer ON whatsapp_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_agency ON whatsapp_messages(agency_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_scheduled ON whatsapp_messages(scheduled_for) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_operation ON whatsapp_messages(operation_id) WHERE operation_id IS NOT NULL;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_message_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_message_templates_updated_at();

-- =====================================================
-- TEMPLATES POR DEFECTO
-- =====================================================

-- Template: Cotización enviada
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Cotización Enviada',
  'Se envía cuando se crea una cotización para el cliente',
  'QUOTATION',
  'QUOTATION_SENT',
  'Hola {nombre}! 👋

Te enviamos la cotización para tu viaje a *{destino}*.

💰 Total: {moneda} {monto}
📅 Válida hasta: {fecha_validez}

¿Tenés alguna duda? Estamos para ayudarte! 📲',
  '📄',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Recordatorio de pago (3 días)
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Recordatorio de Pago (3 días)',
  'Se envía 3 días antes del vencimiento de una cuota',
  'PAYMENT',
  'PAYMENT_DUE_3D',
  '👋 Hola {nombre}!

Te recordamos que el *{fecha_vencimiento}* vence tu cuota de *{moneda} {monto}* para el viaje a {destino}.

¿Necesitás los datos para transferir? 📲',
  '💰',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Pago recibido
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Pago Recibido',
  'Se envía cuando se registra un pago del cliente',
  'PAYMENT',
  'PAYMENT_RECEIVED',
  '✅ *¡Recibimos tu pago!*

Hola {nombre}, confirmamos la recepción de *{moneda} {monto}*.

{mensaje_cuotas}

¡Gracias por confiar en nosotros! 🙌',
  '✅',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Viaje próximo (7 días)
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Viaje Próximo (7 días)',
  'Se envía 7 días antes de la fecha de salida',
  'TRIP',
  'TRIP_7D_BEFORE',
  '🌴 *¡{nombre}, tu viaje está cerca!*

En *7 días* arranca tu aventura a *{destino}*.

📋 Ya preparaste todo?
✈️ Fecha de salida: {fecha_salida}

Cualquier duda, estamos para ayudarte 📲',
  '✈️',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Cumpleaños
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Feliz Cumpleaños',
  'Se envía el día del cumpleaños del cliente',
  'BIRTHDAY',
  'BIRTHDAY',
  '🎂 *¡Feliz Cumpleaños {nombre}!*

Que este nuevo año venga con muchos viajes y aventuras increíbles ✨

¡Te esperamos pronto para planear tu próximo destino! 🌎',
  '🎂',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Post-viaje
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Post-Viaje',
  'Se envía el día de regreso del cliente',
  'TRIP',
  'TRIP_RETURN',
  '🏠 *¡Bienvenido {nombre}!*

¿Cómo estuvo {destino}? Esperamos que hayas disfrutado cada momento 🌟

Nos encantaría saber tu experiencia. ¿Nos contás cómo te fue? ⭐',
  '🏠',
  NULL
) ON CONFLICT DO NOTHING;

-- Template: Pago vencido
INSERT INTO message_templates (name, description, category, trigger_type, template, emoji_prefix, agency_id)
VALUES (
  'Pago Vencido',
  'Se envía cuando un pago pasa su fecha de vencimiento',
  'PAYMENT',
  'PAYMENT_OVERDUE',
  '⚠️ Hola {nombre},

Tu cuota de *{moneda} {monto}* para el viaje a {destino} venció el {fecha_vencimiento}.

¿Necesitás ayuda para regularizarla? Estamos para ayudarte 📲',
  '⚠️',
  NULL
) ON CONFLICT DO NOTHING;

-- Comentarios
COMMENT ON TABLE message_templates IS 'Templates de mensajes WhatsApp configurables por agencia';
COMMENT ON TABLE whatsapp_messages IS 'Cola de mensajes WhatsApp pendientes y enviados';
COMMENT ON COLUMN message_templates.template IS 'Template con variables: {nombre}, {destino}, {monto}, {fecha}, etc.';
COMMENT ON COLUMN whatsapp_messages.whatsapp_link IS 'Link wa.me/?text=... generado para abrir WhatsApp';

