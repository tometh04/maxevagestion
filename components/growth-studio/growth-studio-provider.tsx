"use client"

import * as React from "react"
import type { GrowthStudioAgency } from "@/lib/growth-studio/access"

const GrowthStudioContext = React.createContext<{
  agencies: GrowthStudioAgency[]
} | null>(null)

export function GrowthStudioProvider({
  agencies,
  children,
}: {
  agencies: GrowthStudioAgency[]
  children: React.ReactNode
}) {
  return (
    <GrowthStudioContext.Provider value={{ agencies }}>
      {children}
    </GrowthStudioContext.Provider>
  )
}

export function useGrowthStudio() {
  const context = React.useContext(GrowthStudioContext)
  if (!context) {
    throw new Error("useGrowthStudio debe usarse dentro de GrowthStudioProvider")
  }
  return context
}
