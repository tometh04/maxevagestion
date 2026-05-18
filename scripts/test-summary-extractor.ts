import { extractBotSummary } from "@/lib/integrations/callbell/summary-extractor"

// Texto EXACTO del mensaje-resumen que mandó el bot v50.2 en la conversación de Tomi
const realBotMessage = `Perfecto, aquí tienes un resumen de los datos que me pasaste:

🌍 Ciudad de salida: [pendiente]
🌴 Ciudad de destino: Cancún
📆 Fechas: Primera semana de septiembre (aproximado, 7 noches)
👥 Cantidad de pasajeros: 3 personas
💵 Presupuesto por persona: $1000

Para continuar, ¿podés confirmarme desde qué ciudad salís? Te transfiero a un agente que te responderá a la brevedad.`

console.log("===== Test 1: Real bot summary =====")
console.log(JSON.stringify(extractBotSummary(realBotMessage), null, 2))

console.log("\n===== Test 2: Normal conversational =====")
console.log(extractBotSummary("Hola, queria info"))

console.log("\n===== Test 3: Pesos argentinos =====")
const arsMsg = `Perfecto, acá tenés un resumen de los datos que me pasaste:
🌍 Ciudad de salida: Buenos Aires
🌴 Ciudad de destino: Bariloche
📆 Fechas: Marzo, 5 noches
👥 Cantidad de pasajeros: 2
💵 Presupuesto por persona: $500.000 ARS
Te transfiero a un agente que te responderá a la brevedad.`
console.log(JSON.stringify(extractBotSummary(arsMsg), null, 2))

console.log("\n===== Test 4: Solo placeholders =====")
const placeholderMsg = `Perfecto, acá tenés un resumen:
🌍 Ciudad de salida: [pendiente]
🌴 Ciudad de destino: [pendiente]
📆 Fechas: [pendiente]
👥 Cantidad de pasajeros: [pendiente]
💵 Presupuesto por persona: [pendiente]`
console.log(extractBotSummary(placeholderMsg))
