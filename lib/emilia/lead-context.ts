/**
 * Helper para construir el contexto del lead que se usa:
 *   1. Como input para gpt-4o-mini que sugiere un prompt para Emilia.
 *   2. Como fallback determinístico si OpenAI falla / timeout / no hay key.
 *
 * Función pura: sin I/O. La llamada a OpenAI vive en el endpoint
 * /api/leads/[id]/emilia que es quien decide cuándo usar uno u otro.
 */

export interface LeadInput {
  contact_name: string
  destination: string | null
  region: string | null
  notes: string | null
  /**
   * Prompt configurado en la columna del Kanban donde está el lead
   * (manychat_list_order.prompt). Se incorpora al prompt sugerido para que
   * el contexto de la lista viaje a Emilia junto con el pedido.
   */
  list_prompt?: string | null
}

const REGION_LABEL: Record<string, string> = {
  ARGENTINA: "Argentina",
  CARIBE: "Caribe",
  BRASIL: "Brasil",
  EUROPA: "Europa",
  EEUU: "EEUU",
  CRUCEROS: "Cruceros",
  OTROS: "Otros",
}

/**
 * Prompt fallback determinístico cuando OpenAI no está disponible o falla.
 * Siempre devuelve algo accionable que el vendedor puede ajustar y enviar.
 */
export function buildFallbackPrompt(lead: LeadInput): string {
  const hasDest = !!lead.destination && lead.destination.trim() !== "" && lead.destination !== "Sin destino"
  const hasRegion = !!lead.region && lead.region in REGION_LABEL && lead.region !== "OTROS"
  const regionLabel = hasRegion ? REGION_LABEL[lead.region as keyof typeof REGION_LABEL] : null

  const base = hasDest
    ? `Cotizar viaje a ${regionLabel ? `${lead.destination} (${regionLabel})` : lead.destination} para ${lead.contact_name}. Necesito fechas y cantidad de pasajeros.`
    : `Cotizar viaje para ${lead.contact_name}. Necesito destino, fechas y cantidad de pasajeros.`

  const listPrompt = lead.list_prompt?.trim()
  return listPrompt ? `${base} ${listPrompt}` : base
}

/**
 * Arma el prompt-system para gpt-4o-mini que extrae datos estructurados
 * de las notas del lead y genera un prompt natural en español para Emilia.
 */
export function buildOpenAIInstructions(lead: LeadInput): { system: string; user: string } {
  const system = [
    "Sos un asistente que ayuda a vendedores de viajes a armar pedidos de cotización para una API externa llamada Emilia.",
    "Recibís los datos de un lead (contacto + notas libres del CRM) y generás UN solo mensaje en español argentino, dirigido a Emilia, listo para enviar tal cual.",
    "Reglas del mensaje generado:",
    "- Empezá con 'Cotizar viaje a {destino}' (incluí región si se conoce).",
    "- Inferí del texto libre: cantidad de adultos/niños, fechas o mes preferido, duración, tipo de hospedaje (all-inclusive, hostel, hotel), categoría preferida y presupuesto si aparece.",
    "- Si las notas no aclaran algo, NO inventes valores: omití el dato.",
    "- Si no hay destino, pedí explícitamente el destino al vendedor.",
    "- Si `list_prompt` está presente, son instrucciones de la lista del CRM donde está el lead: incorporá esas preferencias al mensaje (origen, tipo de hospedaje, duración, etc.). Ante conflicto con las notas, priorizá `list_prompt`.",
    "- Máximo 2 frases. Sin saludos. Sin firma. Sin emojis.",
    "Devolvé SOLO el texto del mensaje, sin envoltorios.",
  ].join("\n")

  const user = JSON.stringify({
    contact_name: lead.contact_name,
    destination: lead.destination,
    region: lead.region,
    notes: lead.notes,
    list_prompt: lead.list_prompt?.trim() || null,
  })

  return { system, user }
}
