/**
 * Script para mapear miembros de Trello a vendedores
 * Crea un mapeo que se usará en la sincronización
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error("Missing Trello environment variables (TRELLO_API_KEY, TRELLO_TOKEN)")
  process.exit(1)
}
const BOARD_ID = "kZh4zJ0J"

// Mapeo manual de nombres de Trello a nombres de vendedores en la BD
const MEMBER_NAME_MAPPING: Record<string, string> = {
  "Ramiro": "Ramiro",
  "Pau": "Pau",
  "Candela": "Candela",
  "Josefina": "Josefina",
  "Micaela": "Micaela",
  "Nazarena": "Nazarena",
  "Santiago": "Santiago",
  "Emilia": "Emilia",
  "Maximiliano": "Maximiliano",
  "Julieta": "Julieta",
}

async function mapMembers() {
  console.log("🔄 Mapeando miembros de Trello a vendedores...")
  console.log("")

  // 1. Obtener miembros de Trello
  console.log("1. Obteniendo miembros del board...")
  const membersResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID}/members?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,username,fullName,email`
  )

  if (!membersResponse.ok) {
    console.error("❌ Error obteniendo miembros")
    process.exit(1)
  }

  const trelloMembers = await membersResponse.json()
  console.log(`   ✓ ${trelloMembers.length} miembros encontrados en Trello`)

  // 2. Obtener vendedores de la BD
  console.log("")
  console.log("2. Obteniendo vendedores de la base de datos...")
  const { data: sellers } = await supabase
    .from("users")
    .select("id, name, email")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)

  if (!sellers || sellers.length === 0) {
    console.error("❌ No se encontraron vendedores")
    process.exit(1)
  }

  console.log(`   ✓ ${sellers.length} vendedores encontrados`)

  // 3. Crear mapeo
  console.log("")
  console.log("3. Creando mapeo...")
  const memberToSellerMap = new Map<string, string>()

  trelloMembers.forEach((member: any) => {
    const trelloName = (member.fullName || member.username || "").trim()
    const normalizedTrelloName = trelloName.toLowerCase().replace(/\s+/g, "")

    // Buscar vendedor por nombre exacto o parcial
    const seller = sellers.find((s: any) => {
      const sellerName = s.name.toLowerCase().replace(/\s+/g, "")
      return sellerName === normalizedTrelloName || 
             sellerName.includes(normalizedTrelloName) ||
             normalizedTrelloName.includes(sellerName)
    })

    if (seller) {
      memberToSellerMap.set(member.id, seller.id)
      console.log(`   ✓ ${trelloName} → ${seller.name} (${seller.email})`)
    } else {
      // Intentar mapeo manual
      const mappedName = MEMBER_NAME_MAPPING[trelloName]
      if (mappedName) {
        const mappedSeller = sellers.find((s: any) => 
          s.name.toLowerCase().includes(mappedName.toLowerCase())
        )
        if (mappedSeller) {
          memberToSellerMap.set(member.id, mappedSeller.id)
          console.log(`   ✓ ${trelloName} → ${mappedSeller.name} (mapeo manual)`)
        } else {
          console.log(`   ⚠️  ${trelloName} → No encontrado`)
        }
      } else {
        console.log(`   ⚠️  ${trelloName} → No encontrado`)
      }
    }
  })

  console.log("")
  console.log(`✅ Mapeo completado: ${memberToSellerMap.size} miembros mapeados`)
  console.log("")
  console.log("💡 Este mapeo se usará automáticamente en la sincronización")
}

mapMembers().catch(console.error)

