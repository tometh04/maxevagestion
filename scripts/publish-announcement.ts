/**
 * Publicar una novedad (changelog global del producto) desde la terminal.
 *
 * Pensado para que Claude cargue anuncios como parte de una tarea de desarrollo
 * (y también a mano). Inserta directo en la tabla `announcements` con el
 * SERVICE_ROLE_KEY — no requiere server levantado ni ser platform admin.
 *
 * Uso:
 *   npm run announce -- --title "Nuevo módulo de reportes" \
 *     --body "Ahora podés exportar a Excel desde Reportes > Ventas." \
 *     --type NEW
 *
 * Flags:
 *   --title   <str>   Título (obligatorio)
 *   --body    <str>   Texto. Podés usar \n para saltos de línea.
 *   --body-file <path>  Alternativa a --body: lee el texto de un archivo.
 *   --type    <NEW|IMPROVEMENT|FIX>  Default NEW.
 *   --draft           Si está, la crea sin publicar (published=false).
 */
import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { readFileSync } from "fs"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const VALID_TYPES = ["NEW", "IMPROVEMENT", "FIX"] as const
type AnnouncementType = (typeof VALID_TYPES)[number]

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {}
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) {
      flags.add(key)
    } else {
      args[key] = next
      i++
    }
  }
  return { args, flags }
}

async function main() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
    process.exit(1)
  }

  const { args, flags } = parseArgs(process.argv.slice(2))

  const title = args.title?.trim()
  let body = args.body
  if (!body && args["body-file"]) {
    body = readFileSync(args["body-file"], "utf8")
  }
  body = body?.replace(/\\n/g, "\n").trim()

  const type = (args.type?.toUpperCase() as AnnouncementType) || "NEW"
  const published = !flags.has("draft")

  if (!title || !body) {
    console.error("❌ --title y --body (o --body-file) son obligatorios.")
    console.error('   Ej: npm run announce -- --title "..." --body "..." --type NEW')
    process.exit(1)
  }
  if (!VALID_TYPES.includes(type)) {
    console.error(`❌ --type inválido: ${type}. Usá NEW, IMPROVEMENT o FIX.`)
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await supabase
    .from("announcements")
    .insert({ title, body, type, published })
    .select("id, title, type, published, published_at")
    .single()

  if (error) {
    console.error("❌ Error al publicar la novedad:", error.message)
    process.exit(1)
  }

  console.log(`✅ Novedad ${published ? "publicada" : "guardada como borrador"}:`)
  console.log(`   [${data.type}] ${data.title}`)
  console.log(`   id: ${data.id}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
