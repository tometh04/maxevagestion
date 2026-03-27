"use client"
import { useEffect } from "react"

export function BrandProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const color = localStorage.getItem('brand_color')
    if (color) {
      document.documentElement.style.setProperty('--primary', color)
    }
  }, [])
  return <>{children}</>
}
