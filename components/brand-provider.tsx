"use client"
import { useEffect } from "react"

export function BrandProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function loadBranding() {
      // First try localStorage for instant load (no flash)
      const cachedColor = localStorage.getItem("brand_color")
      if (cachedColor) {
        document.documentElement.style.setProperty("--primary", cachedColor)
      }

      // Then fetch from server to get the latest / shared org settings
      try {
        const res = await fetch("/api/settings/organization")
        if (res.ok) {
          const json = await res.json()
          // API returns { data: [{ key: "brand_color", value: "..." }, ...] }
          const settings: Record<string, string> = {}
          if (Array.isArray(json.data)) {
            json.data.forEach((item: { key: string; value: string }) => {
              settings[item.key] = item.value
            })
          }

          if (settings.brand_color) {
            document.documentElement.style.setProperty("--primary", settings.brand_color)
            localStorage.setItem("brand_color", settings.brand_color)
          }
          if (settings.brand_logo) {
            localStorage.setItem("brand_logo", settings.brand_logo)
          }
          if (settings.company_name) {
            localStorage.setItem("company_name", settings.company_name)
          }
        }
      } catch {
        // silent — use cached or default
      }
    }

    loadBranding()
  }, [])

  return <>{children}</>
}
