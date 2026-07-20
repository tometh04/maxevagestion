"use client"

import { HelpCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface TaskFABProps {
  onClick: () => void
  open?: boolean
}

/**
 * Botón flotante de "Soporte y ayuda".
 *
 * VIB-53: antes era un speed-dial con 3 acciones (Nueva tarea, Cerebro IA,
 * Centro de Ayuda). Se dejó una sola acción, que abre directo el panel de
 * soporte. Las tareas (Ctrl+Shift+T / Ctrl+Shift+J) y Cerebro siguen accesibles
 * por atajos de teclado y navegación normal (ver task-shortcut-provider.tsx).
 */
export function TaskFAB({ onClick, open }: TaskFABProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center",
        "bg-primary text-primary-foreground",
        "hover:scale-105 active:scale-95 transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
      )}
      style={{ transition: "transform 0.2s ease" }}
      aria-label={open ? "Cerrar soporte y ayuda" : "Soporte y ayuda"}
      title="Soporte y ayuda"
    >
      {open ? <X className="h-6 w-6" /> : <HelpCircle className="h-6 w-6" />}
    </button>
  )
}
