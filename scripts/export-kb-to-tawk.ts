#!/usr/bin/env tsx
/**
 * Export Knowledge Base de Vibook (tablas kb_categories + kb_articles) a:
 *
 *   - scripts/out/kb-export.json     → JSON estructurado, fácil de importar a Tawk via API
 *   - scripts/out/kb-export.csv      → CSV plano (1 fila por artículo) para inspección manual
 *   - scripts/out/kb-articles/*.md   → 1 archivo Markdown por artículo (importar manual)
 *
 * Uso (desde root del repo):
 *   bun scripts/export-kb-to-tawk.ts
 *   # o
 *   npx tsx scripts/export-kb-to-tawk.ts
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *
 * 2026-05-19 (Tomi): preparado para cuando decidamos migrar el centro de
 * ayuda a Tawk KB. Si decidimos NO migrar, este script no se ejecuta y
 * no pasa nada — es solo un dump read-only.
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "node:fs"
import * as path from "node:path"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

interface KbCategory {
  id: string
  name: string
  slug: string
  icon: string | null
  sort_order: number
}

interface KbArticle {
  id: string
  category_id: string
  title: string
  slug: string
  content: string
  summary: string | null
  video_url: string | null
  sort_order: number
  published: boolean
  created_at: string
  updated_at: string
}

interface ExportedArticle extends KbArticle {
  category_name: string
  category_slug: string
}

async function main() {
  const outDir = path.join(process.cwd(), "scripts", "out")
  const articlesDir = path.join(outDir, "kb-articles")
  fs.mkdirSync(articlesDir, { recursive: true })

  // 1) Cargar categorías
  console.log("📥 Fetching kb_categories...")
  const { data: categoriesRaw, error: catErr } = await admin
    .from("kb_categories")
    .select("*")
    .order("sort_order")
  if (catErr) {
    console.error("❌ Error fetching categories:", catErr)
    process.exit(1)
  }
  const categories = (categoriesRaw || []) as KbCategory[]
  console.log(`   → ${categories.length} categorías`)

  // 2) Cargar artículos (todos, published + draft, así no perdés nada al migrar)
  console.log("📥 Fetching kb_articles...")
  const { data: articlesRaw, error: artErr } = await admin
    .from("kb_articles")
    .select("*")
    .order("sort_order")
  if (artErr) {
    console.error("❌ Error fetching articles:", artErr)
    process.exit(1)
  }
  const articles = (articlesRaw || []) as KbArticle[]
  console.log(`   → ${articles.length} artículos (incluye drafts)`)

  // 3) Cruzar artículos con categorías
  const catById = new Map(categories.map((c) => [c.id, c]))
  const enriched: ExportedArticle[] = articles.map((a) => {
    const cat = catById.get(a.category_id)
    return {
      ...a,
      category_name: cat?.name ?? "(sin categoría)",
      category_slug: cat?.slug ?? "uncategorized",
    }
  })

  // 4) Output JSON (lo que Tawk consume via API)
  const jsonOut = {
    exported_at: new Date().toISOString(),
    categories,
    articles: enriched,
  }
  const jsonPath = path.join(outDir, "kb-export.json")
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), "utf-8")
  console.log(`✅ JSON → ${jsonPath} (${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`)

  // 5) Output CSV (inspección rápida en Excel/Sheets)
  const csvHeaders = [
    "category_slug",
    "category_name",
    "slug",
    "title",
    "summary",
    "published",
    "video_url",
    "sort_order",
    "created_at",
    "updated_at",
    "content_length",
  ]
  const csvRows = enriched.map((a) =>
    [
      a.category_slug,
      a.category_name,
      a.slug,
      a.title,
      a.summary ?? "",
      a.published ? "1" : "0",
      a.video_url ?? "",
      String(a.sort_order),
      a.created_at,
      a.updated_at,
      String((a.content || "").length),
    ]
      .map(csvEscape)
      .join(",")
  )
  const csv = "﻿" + [csvHeaders.join(","), ...csvRows].join("\n")
  const csvPath = path.join(outDir, "kb-export.csv")
  fs.writeFileSync(csvPath, csv, "utf-8")
  console.log(`✅ CSV  → ${csvPath} (${(fs.statSync(csvPath).size / 1024).toFixed(1)} KB)`)

  // 6) Markdown por artículo (importable a Tawk via su editor, o lectura)
  let written = 0
  for (const a of enriched) {
    const frontmatter = [
      "---",
      `id: ${a.id}`,
      `title: ${JSON.stringify(a.title)}`,
      `slug: ${a.slug}`,
      `category: ${a.category_slug}`,
      `category_name: ${JSON.stringify(a.category_name)}`,
      `published: ${a.published}`,
      `video_url: ${a.video_url ?? ""}`,
      `sort_order: ${a.sort_order}`,
      `created_at: ${a.created_at}`,
      `updated_at: ${a.updated_at}`,
      "---",
      "",
    ].join("\n")
    const body = a.summary ? `> ${a.summary}\n\n${a.content || ""}` : a.content || ""
    const mdPath = path.join(articlesDir, `${a.category_slug}__${a.slug}.md`)
    fs.writeFileSync(mdPath, frontmatter + body, "utf-8")
    written++
  }
  console.log(`✅ MD   → ${articlesDir}/ (${written} archivos)`)

  // 7) Resumen
  console.log("\n📊 Resumen del export:")
  const byCategory = new Map<string, number>()
  enriched.forEach((a) => {
    const k = a.category_name
    byCategory.set(k, (byCategory.get(k) || 0) + 1)
  })
  for (const [name, count] of Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`   • ${name}: ${count} artículos`)
  }
  const drafts = enriched.filter((a) => !a.published).length
  if (drafts > 0) {
    console.log(`   ⚠️  ${drafts} drafts incluidos (published=false) — revisar antes de subir a Tawk`)
  }
  console.log("\nListo. Para importar a Tawk:")
  console.log("  1. Logueate a Tawk dashboard → Knowledge Base → Articles")
  console.log("  2. Click '+ New Article' y pegá título + content uno por uno")
  console.log("     (Tawk no tiene bulk import directo, pero su API permite)")
  console.log("  3. O usar el endpoint de Tawk API:")
  console.log("       POST https://api.tawk.to/v3/kb/articles")
  console.log("     Body: { propertyId, title, body (HTML), categoryId, ... }")
  console.log("  4. Para automatizar el import, ver scripts/import-to-tawk-api.ts (TODO)")
}

function csvEscape(v: string): string {
  if (v == null) return ""
  const s = String(v)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

main().catch((err) => {
  console.error("❌ Export failed:", err)
  process.exit(1)
})
