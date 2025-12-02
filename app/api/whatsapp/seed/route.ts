import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

const defaultTemplates = [
  {
    name: "Cotización Enviada",
    description: "Se envía cuando se crea una cotización para el cliente",
    category: "QUOTATION",
    trigger_type: "QUOTATION_SENT",
    template: `Hola {nombre}! 👋

Te enviamos la cotización para tu viaje a *{destino}*.

💰 Total: {moneda} {monto}
📅 Válida hasta: {fecha_validez}

¿Tenés alguna duda? Estamos para ayudarte! 📲`,
    emoji_prefix: "📄",
    is_active: true,
  },
  {
    name: "Recordatorio de Pago (3 días)",
    description: "Se envía 3 días antes del vencimiento de una cuota",
    category: "PAYMENT",
    trigger_type: "PAYMENT_DUE_3D",
    template: `👋 Hola {nombre}!

Te recordamos que el *{fecha_vencimiento}* vence tu cuota de *{moneda} {monto}* para el viaje a {destino}.

¿Necesitás los datos para transferir? 📲`,
    emoji_prefix: "💰",
    is_active: true,
  },
  {
    name: "Pago Recibido",
    description: "Se envía cuando se registra un pago del cliente",
    category: "PAYMENT",
    trigger_type: "PAYMENT_RECEIVED",
    template: `✅ *¡Recibimos tu pago!*

Hola {nombre}, confirmamos la recepción de *{moneda} {monto}*.

{mensaje_cuotas}

¡Gracias por confiar en nosotros! 🙌`,
    emoji_prefix: "✅",
    is_active: true,
  },
  {
    name: "Viaje Próximo (7 días)",
    description: "Se envía 7 días antes de la fecha de salida",
    category: "TRIP",
    trigger_type: "TRIP_7D_BEFORE",
    template: `🌴 *¡{nombre}, tu viaje está cerca!*

En *7 días* arranca tu aventura a *{destino}*.

📋 Ya preparaste todo?
✈️ Fecha de salida: {fecha_salida}

Cualquier duda, estamos para ayudarte 📲`,
    emoji_prefix: "✈️",
    is_active: true,
  },
  {
    name: "Feliz Cumpleaños",
    description: "Se envía el día del cumpleaños del cliente",
    category: "BIRTHDAY",
    trigger_type: "BIRTHDAY",
    template: `🎂 *¡Feliz Cumpleaños {nombre}!*

Que este nuevo año venga con muchos viajes y aventuras increíbles ✨

¡Te esperamos pronto para planear tu próximo destino! 🌎`,
    emoji_prefix: "🎂",
    is_active: true,
  },
  {
    name: "Post-Viaje",
    description: "Se envía el día de regreso del cliente",
    category: "TRIP",
    trigger_type: "TRIP_RETURN",
    template: `🏠 *¡Bienvenido {nombre}!*

¿Cómo estuvo {destino}? Esperamos que hayas disfrutado cada momento 🌟

Nos encantaría saber tu experiencia. ¿Nos contás cómo te fue? ⭐`,
    emoji_prefix: "🏠",
    is_active: true,
  },
  {
    name: "Pago Vencido",
    description: "Se envía cuando un pago pasa su fecha de vencimiento",
    category: "PAYMENT",
    trigger_type: "PAYMENT_OVERDUE",
    template: `⚠️ Hola {nombre},

Tu cuota de *{moneda} {monto}* para el viaje a {destino} venció el {fecha_vencimiento}.

¿Necesitás ayuda para regularizarla? Estamos para ayudarte 📲`,
    emoji_prefix: "⚠️",
    is_active: true,
  },
  {
    name: "Viaje Mañana",
    description: "Se envía 1 día antes del viaje",
    category: "TRIP",
    trigger_type: "TRIP_1D_BEFORE",
    template: `✈️ *¡{nombre}, mañana arranca tu aventura!*

Tu viaje a *{destino}* comienza mañana.

🎒 ¿Tenés todo listo?
📱 Cualquier cosa, estamos disponibles.

¡Buen viaje! 🌟`,
    emoji_prefix: "✈️",
    is_active: true,
  },
  {
    name: "Plan de Pagos Creado",
    description: "Se envía cuando se genera un plan de cuotas",
    category: "PAYMENT",
    trigger_type: "PAYMENT_PLAN_CREATED",
    template: `Hola {nombre}! 📋

Te armamos el plan de pagos para tu viaje a *{destino}*:

💰 Total: {moneda} {monto}

Te iremos avisando antes de cada vencimiento. ¡Gracias por confiar! 🙌`,
    emoji_prefix: "📋",
    is_active: true,
  },
  {
    name: "Seguimiento Post-Viaje",
    description: "Se envía 7 días después del regreso",
    category: "TRIP",
    trigger_type: "TRIP_POST_7D",
    template: `Hola {nombre}! 🌎

Ya pasó una semana desde que volviste de {destino}. ¿Ya estás pensando en el próximo destino?

Tenemos ofertas increíbles esperándote ✨

¡Contanos qué tenés en mente!`,
    emoji_prefix: "🌎",
    is_active: true,
  },
]

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Solo SUPER_ADMIN puede hacer seed
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // Verificar si ya existen templates
    const { data: existingTemplates } = await (supabase.from("message_templates") as any)
      .select("id")
      .limit(1)

    if (existingTemplates && existingTemplates.length > 0) {
      return NextResponse.json({ 
        message: "Ya existen templates, no se insertaron nuevos",
        existing: true 
      })
    }

    // Insertar templates por defecto (sin agency_id = globales)
    const { data, error } = await (supabase.from("message_templates") as any)
      .insert(defaultTemplates.map(t => ({
        ...t,
        agency_id: null, // Templates globales
        created_by: user.id,
      })))
      .select()

    if (error) {
      console.error("Error seeding templates:", error)
      return NextResponse.json({ error: "Error al crear templates" }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Se crearon ${data.length} templates`,
      templates: data 
    })
  } catch (error: any) {
    console.error("Error in seed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}

