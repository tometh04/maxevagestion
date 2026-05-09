import { createServerClient } from '@/lib/supabase/server'

// ─── Types ───────────────────────────────────────────────────────────
export interface KbCategory {
  id: string
  name: string
  slug: string
  icon: string
  sort_order: number
  article_count?: number
}

export interface KbArticle {
  id: string
  category_id: string
  title: string
  slug: string
  content: string
  summary: string
  sort_order: number
  published: boolean
  created_at: string
  updated_at: string
  category_name?: string
  category_slug?: string
  category_icon?: string
}

export interface KbSearchResult {
  id: string
  title: string
  slug: string
  summary: string
  category_name: string
  category_slug: string
  rank: number
}

// ─── Server helpers (for server components / API routes) ─────────────
// Nota: las tablas kb_* no están en los types generados hasta que se
// corra la migración + db:generate. Usamos cast a `any` para que compile.

export async function getCategories(): Promise<KbCategory[]> {
  const supabase = await createServerClient()
  const { data, error } = await (supabase as any)
    .from('kb_categories')
    .select('*, kb_articles(count)')
    .order('sort_order')

  if (error) {
    console.error('Error fetching KB categories:', error)
    return []
  }

  return (data || []).map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    icon: cat.icon,
    sort_order: cat.sort_order,
    article_count: cat.kb_articles?.[0]?.count ?? 0,
  }))
}

export async function getArticlesByCategory(categorySlug: string): Promise<KbArticle[]> {
  const supabase = await createServerClient()
  const { data, error } = await (supabase as any)
    .from('kb_articles')
    .select('*, kb_categories!inner(name, slug, icon)')
    .eq('kb_categories.slug', categorySlug)
    .eq('published', true)
    .order('sort_order')

  if (error) {
    console.error('Error fetching KB articles:', error)
    return []
  }

  return (data || []).map(mapArticle)
}

export async function getArticleBySlug(slug: string): Promise<KbArticle | null> {
  const supabase = await createServerClient()
  const { data, error } = await (supabase as any)
    .from('kb_articles')
    .select('*, kb_categories(name, slug, icon)')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (error) {
    console.error('Error fetching KB article:', error)
    return null
  }

  return mapArticle(data)
}

export async function getAllArticles(): Promise<KbArticle[]> {
  const supabase = await createServerClient()
  const { data, error } = await (supabase as any)
    .from('kb_articles')
    .select('*, kb_categories(name, slug, icon)')
    .eq('published', true)
    .order('sort_order')

  if (error) {
    console.error('Error fetching all KB articles:', error)
    return []
  }

  return (data || []).map(mapArticle)
}

export async function searchArticles(query: string): Promise<KbSearchResult[]> {
  const supabase = await createServerClient()
  const { data, error } = await (supabase as any).rpc('search_kb_articles', {
    search_query: query,
  })

  if (error) {
    console.error('Error searching KB articles:', error)
    return []
  }

  return data || []
}

export async function getRelatedArticles(
  categoryId: string,
  excludeId: string,
  limit = 5
): Promise<KbArticle[]> {
  const supabase = await createServerClient()
  const { data, error } = await (supabase as any)
    .from('kb_articles')
    .select('*, kb_categories(name, slug, icon)')
    .eq('category_id', categoryId)
    .eq('published', true)
    .neq('id', excludeId)
    .order('sort_order')
    .limit(limit)

  if (error) {
    console.error('Error fetching related articles:', error)
    return []
  }

  return (data || []).map(mapArticle)
}

// ─── Helpers ─────────────────────────────────────────────────────────

function mapArticle(row: any): KbArticle {
  return {
    id: row.id,
    category_id: row.category_id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    summary: row.summary,
    sort_order: row.sort_order,
    published: row.published,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category_name: row.kb_categories?.name,
    category_slug: row.kb_categories?.slug,
    category_icon: row.kb_categories?.icon,
  }
}
