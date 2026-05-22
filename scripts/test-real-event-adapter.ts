/**
 * Testea el adapter con el payload EXACTO capturado del evento real de
 * Callbell (que está retornando unrecognized_payload en prod).
 */
import { adaptCallbellWebhook } from "@/lib/integrations/callbell/payload-adapter"

const realPayload = {
  to: "5492954602920",
  from: "5492617255027",
  text: "Perfecto, aquí tienes un resumen de los datos que me pasaste:\n\n🌍 Ciudad de salida: [pendiente]  \n🌴 Ciudad de destino: Cancún  \n📆 Fechas: Primera semana de septiembre (aproximado, 7 noches)  \n👥 Cantidad de pasajeros: 3 personas  \n💵 Presupuesto por persona: $1000\n\nPara continuar, ¿podés confirmarme desde qué ciudad salís? Te transfiero a un agente que te responderá a la brevedad.\n",
  uuid: "46c43fc6e28e42e5bf7091865147ba00",
  status: "sent",
  channel: "whatsapp",
  contact: {
    href: "https://dash.callbell.eu/contacts/191f377a5ff146f3948f7c97b250d23b",
    name: "Tomas",
    tags: [],
    team: {
      name: "General",
      uuid: "8e9ca2e6e30d41ac8730a4c6bd6c1958",
      default: true,
      members: 9,
      createdAt: "2025-05-12T16:28:07Z",
    },
    uuid: "191f377a5ff146f3948f7c97b250d23b",
    source: "whatsapp",
    channel: {
      main: false,
      type: "whatsapp",
      uuid: "1c8416aee2cf416bb6489620728b9c63",
      title: "WhatsApp Emilia VICO",
      discardedAt: null,
    },
    phoneNumber: "5492954602920",
    assignedUser: null,
    createdAt: "2026-05-16T19:56:01Z",
  },
}

const result = adaptCallbellWebhook(realPayload)
console.log("Result:", JSON.stringify(result, null, 2))
