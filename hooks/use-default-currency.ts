"use client"

import { useState, useEffect } from "react"

type Currency = "ARS" | "USD"

let cached: Currency | null = null
let inflight: Promise<Currency> | null = null

async function fetchDefaultCurrency(): Promise<Currency> {
  if (cached) return cached
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const res = await fetch("/api/settings/organization?key=default_currency")
      if (!res.ok) return "USD"
      const json = await res.json()
      const value = json?.data?.[0]?.value
      const currency: Currency = value === "ARS" ? "ARS" : "USD"
      cached = currency
      return currency
    } catch {
      return "USD"
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export function useDefaultCurrency(): { currency: Currency; loading: boolean } {
  const [currency, setCurrency] = useState<Currency>(cached ?? "USD")
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cached) return
    let alive = true
    fetchDefaultCurrency().then((c) => {
      if (alive) {
        setCurrency(c)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  return { currency, loading }
}
