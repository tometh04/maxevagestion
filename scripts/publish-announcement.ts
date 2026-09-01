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
 *
 * Modal (para releases grandes que además piden que el usuario configure algo):
 *   --modal              Se muestra como modal al entrar, además de en la campana.
 *   --version <str>      Número de release, ej "2026.09". Se muestra en el encabezado.
 *                        El texto se parte en páginas con una línea "---";
 *                        la primera línea de cada bloque es su título.
 *   --modal-from <fecha> Desde cuándo (YYYY-MM-DD). Default: ya.
 *   --modal-until <fecha> Hasta cuándo (YYYY-MM-DD). Sin esto no vence.
 *   --modal-roles <lista> Roles separados por coma que lo ven. Sin esto, todos.
 *                         Restringe la interrupción, no la información: la
 *                         novedad se sigue viendo en la campana para cualquiera.
 *   --cta-label <str>    Texto del botón.
 *   --cta-href  <ruta>   Destino, ruta interna (tiene que empezar con "/").
 *
 * Ej:
 *   npm run announce -- --type NEW --modal --modal-until 2026-09-15 \
 *     --modal-roles SUPER_ADMIN,ORG_OWNER,ADMIN,CONTABLE \
 *     --cta-label "Configurar contabilidad" --cta-href "/finances/settings" \
 *     --title "..." --body-file texto.txt
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

// Copiados de lib/permissions.ts (UserRole). No se importa para que el script
// siga corriendo sin el árbol de la app; si se agrega un rol, va acá también.
const VALID_ROLES = [
  "SUPER_ADMIN",
  "ORG_OWNER",
  "ADMIN",
  "CONTABLE",
  "SELLER",
  "VIEWER",
  "POST_VENTA",
] as const

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

  // ─── Modal ──────────────────────────────────────────────────
  const modal = flags.has("modal")
  const roles = args["modal-roles"]
    ? args["modal-roles"].split(",").map((r) => r.trim().toUpperCase()).filter(Boolean)
    : null

  if (roles) {
    const invalidos = roles.filter((r) => !VALID_ROLES.includes(r as any))
    if (invalidos.length > 0) {
      console.error(`❌ --modal-roles inválido: ${invalidos.join(", ")}`)
      console.error(`   Roles válidos: ${VALID_ROLES.join(", ")}`)
      process.exit(1)
    }
  }

  const ctaHref = args["cta-href"]?.trim() || null
  const ctaLabel = args["cta-label"]?.trim() || null

  // Ruta interna y no URL completa: es un destino administrable que termina en
  // un enlace que el usuario clickea. Aceptar cualquier host lo convertiría en
  // una redirección abierta cargable desde el panel.
  if (ctaHref && !/^\/[^/]/.test(ctaHref)) {
    console.error(`❌ --cta-href tiene que ser una ruta interna, ej "/finances/settings".`)
    process.exit(1)
  }
  if ((ctaHref && !ctaLabel) || (ctaLabel && !ctaHref)) {
    console.error("❌ --cta-label y --cta-href van juntos: un botón sin destino no sirve.")
    process.exit(1)
  }
  if (!modal && (ctaHref || roles || args["modal-until"] || args["modal-from"])) {
    console.error("❌ Pusiste opciones de modal pero falta --modal, así que no se mostraría.")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await (supabase.from("announcements") as any)
    .insert({
      title,
      body,
      type,
      published,
      modal,
      modal_starts_at: args["modal-from"] ? new Date(args["modal-from"]).toISOString() : null,
      modal_ends_at: args["modal-until"] ? new Date(`${args["modal-until"]}T23:59:59`).toISOString() : null,
      modal_roles: roles,
      modal_cta_label: ctaLabel,
      modal_cta_href: ctaHref,
      release_version: args.version?.trim() ?? null,
    })
    .select("id, title, type, published, published_at, modal, modal_ends_at, modal_roles")
    .single()

  if (error) {
    console.error("❌ Error al publicar la novedad:", error.message)
    process.exit(1)
  }

  console.log(`✅ Novedad ${published ? "publicada" : "guardada como borrador"}:`)
  console.log(`   [${data.type}] ${data.title}`)
  console.log(`   id: ${data.id}`)
  if (data.modal) {
    // En hora argentina y no cortando el ISO: el vencimiento se guarda como
    // 23:59:59 local, que en UTC ya es el día siguiente. Mostrar el ISO hacía
    // que un `--modal-until 2026-09-15` se confirmara como "hasta el 16".
    const vence = data.modal_ends_at
      ? new Date(data.modal_ends_at).toLocaleString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        })
      : null
    console.log(
      `   modal: sí — ${vence ? `hasta ${vence}` : "SIN VENCIMIENTO"}, roles: ${
        data.modal_roles?.join(", ") || "todos"
      }`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
