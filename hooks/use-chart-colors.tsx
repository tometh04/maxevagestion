"use client"

import * as React from "react"
import { useTheme } from "next-themes"

// Colores amber para gráficos
const amberChartColors = {
  light: {
    "1": "hsl(45, 93%, 47%)",
    "2": "hsl(43, 96%, 56%)",
    "3": "hsl(37, 92%, 50%)",
    "4": "hsl(48, 96%, 53%)",
    "5": "hsl(50, 95%, 58%)",
    "6": "hsl(35, 90%, 55%)",
  },
  dark: {
    "1": "hsl(45, 93%, 65%)",
    "2": "hsl(43, 96%, 70%)",
    "3": "hsl(37, 92%, 63%)",
    "4": "hsl(48, 96%, 68%)",
    "5": "hsl(50, 95%, 73%)",
    "6": "hsl(35, 90%, 68%)",
  },
}

export function useChartColors() {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = React.useMemo(() => {
    if (!mounted) return "light"
    return resolvedTheme || theme || "light"
  }, [theme, resolvedTheme, mounted])

  const colors = React.useMemo(() => {
    return amberChartColors[currentTheme === "dark" ? "dark" : "light"]
  }, [currentTheme])

  return colors
}

