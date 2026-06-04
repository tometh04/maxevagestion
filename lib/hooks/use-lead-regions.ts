"use client"

import { useCallback, useEffect, useState } from "react"

export interface LeadRegion {
  id: string
  code: string
  name: string
  position: number
  is_active: boolean
}

interface UseLeadRegionsResult {
  regions: LeadRegion[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const FALLBACK_REGIONS: LeadRegion[] = [
  { id: "fallback-arg", code: "ARGENTINA", name: "Argentina", position: 0, is_active: true },
  { id: "fallback-car", code: "CARIBE", name: "Caribe", position: 1, is_active: true },
  { id: "fallback-bra", code: "BRASIL", name: "Brasil", position: 2, is_active: true },
  { id: "fallback-eur", code: "EUROPA", name: "Europa", position: 3, is_active: true },
  { id: "fallback-eeuu", code: "EEUU", name: "EEUU", position: 4, is_active: true },
  { id: "fallback-cru", code: "CRUCEROS", name: "Cruceros", position: 5, is_active: true },
  { id: "fallback-otr", code: "OTROS", name: "Otros", position: 6, is_active: true },
]

export function useLeadRegions(options?: { includeInactive?: boolean }): UseLeadRegionsResult {
  const includeInactive = options?.includeInactive ?? false
  const [regions, setRegions] = useState<LeadRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRegions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/lead-regions")
      if (!res.ok) throw new Error("Error al cargar regiones")
      const data = await res.json()
      const rows: LeadRegion[] = Array.isArray(data?.regions) ? data.regions : []
      const filtered = includeInactive ? rows : rows.filter((r) => r.is_active)
      setRegions(filtered.length > 0 ? filtered : FALLBACK_REGIONS)
    } catch (e: any) {
      setError(e?.message || "Error al cargar regiones")
      setRegions(FALLBACK_REGIONS)
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  useEffect(() => {
    fetchRegions()
  }, [fetchRegions])

  return { regions, loading, error, refetch: fetchRegions }
}
