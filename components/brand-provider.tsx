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
          const data = await res.json()
          if (data.brand_color) {
            document.documentElement.style.setProperty("--primary", data.brand_color)
            localStorage.setItem("brand_color", data.brand_color)
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
