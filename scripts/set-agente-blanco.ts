#!/usr/bin/env tsx
/**
 * Carga (o borra) los identificadores del embebido de Conversaciones:
 * el slug de la empresa en Agente Blanco y la red de cada agencia.
 *
 * Por que existe: la UI para esto vive en `/admin/orgs/<id>` y exige platform
 * admin. En desarrollo con `DISABLE_AUTH=true` el usuario mock NO es platform
 * admin, asi que no hay forma de cargar el slug desde la app para probar. Este
 * script hace lo mismo con service role.
 *
 * Escribe en la base a la que apunte `.env.local` — en este repo eso es
 * PRODUCCION. Usar contra la org de testing.
 *
 * Uso:
 *   tsx scripts/set-agente-blanco.ts --org <uuid|slug>
 *   tsx scripts/set-agente-blanco.ts --org test-vibook --slug lozada-viajes
 *   tsx scripts/set-agente-blanco.ts --org test-vibook --slug x --network "Rosario=lozadarosario"
 *   tsx scripts/set-agente-blanco.ts --org test-vibook --clear
 *
 * Sin --slug ni --network ni --clear solo muestra el estado actual.
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

import {
  isValidAgenteBlancoNetwork,
  isValidAgenteBlancoOrgSlug,
} from "../lib/agente-blanco/config"

config({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function args(name: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

const orgRef = arg("org")
const slugArg = arg("slug")
const networkArgs = args("network")
const clear = process.argv.includes("--clear")

if (!orgRef) {
  console.error("Falta --org <uuid|slug de la org en Vibook>")
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

async function main() {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgRef)

  const { data: org, error: orgError } = await db
    .from("organizations")
    .select("id, name, slug, agente_blanco_org_slug")
    .eq(isUuid ? "id" : "slug", orgRef)
    .maybeSingle()

  if (orgError) {
    console.error("Error leyendo la organizacion:", orgError.message)
    process.exit(1)
  }
  if (!org) {
    console.error(`No existe una organizacion con ${isUuid ? "id" : "slug"} = ${orgRef}`)
    process.exit(1)
  }

  const orgId = (org as any).id as string

  if (clear) {
    const a = await db
      .from("organizations")
      .update({ agente_blanco_org_slug: null } as any)
      .eq("id", orgId)
    if (a.error) {
      console.error("Error borrando el slug:", a.error.message)
      process.exit(1)
    }
    const b = await db
      .from("agencies")
      .update({ agente_blanco_network: null } as any)
      .eq("org_id", orgId)
    if (b.error) {
      console.error("Error borrando las redes:", b.error.message)
      process.exit(1)
    }
    console.log("Listo: la seccion Conversaciones deja de existir para esta org.")
  } else {
    if (slugArg !== undefined) {
      const slug = slugArg.trim().toLowerCase()
      if (!isValidAgenteBlancoOrgSlug(slug)) {
        console.error(`Slug invalido: "${slug}". Solo minusculas, numeros y guiones internos.`)
        process.exit(1)
      }
      const { error } = await db
        .from("organizations")
        .update({ agente_blanco_org_slug: slug } as any)
        .eq("id", orgId)
      if (error) {
        console.error("Error guardando el slug:", error.message)
        process.exit(1)
      }
    }

    for (const pair of networkArgs) {
      const idx = pair.indexOf("=")
      if (idx < 0) {
        console.error(`--network espera "<nombre de agencia>=<red>", recibi: ${pair}`)
        process.exit(1)
      }
      const agencyName = pair.slice(0, idx).trim()
      const raw = pair.slice(idx + 1).trim()
      const network = raw === "" ? null : raw

      if (network !== null && !isValidAgenteBlancoNetwork(network)) {
        console.error(`Red invalida: "${network}". Sin espacios.`)
        process.exit(1)
      }

      const { data: agency } = await db
        .from("agencies")
        .select("id, name")
        .eq("org_id", orgId)
        .ilike("name", agencyName)
        .maybeSingle()

      if (!agency) {
        console.error(`No hay una agencia llamada "${agencyName}" en esta org.`)
        process.exit(1)
      }

      const { error } = await db
        .from("agencies")
        .update({ agente_blanco_network: network } as any)
        .eq("id", (agency as any).id)
      if (error) {
        console.error(`Error guardando la red de ${agencyName}:`, error.message)
        process.exit(1)
      }
    }
  }

  // Estado final
  const { data: finalOrg } = await db
    .from("organizations")
    .select("name, slug, agente_blanco_org_slug")
    .eq("id", orgId)
    .maybeSingle()

  const { data: agencies } = await db
    .from("agencies")
    .select("name, agente_blanco_network")
    .eq("org_id", orgId)
    .order("name")

  console.log("")
  console.log(`Org: ${(finalOrg as any)?.name} (${(finalOrg as any)?.slug})`)
  console.log(`  slug Agente Blanco: ${(finalOrg as any)?.agente_blanco_org_slug ?? "(sin configurar)"}`)
  for (const a of (agencies ?? []) as any[]) {
    console.log(`  red de "${a.name}": ${a.agente_blanco_network ?? "(sin configurar)"}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
