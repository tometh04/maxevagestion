"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, X, ClipboardList, Brain, HelpCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface TaskFABProps {
  onClick: () => void
  onHelpClick?: () => void
}

const ACTIONS = [
  {
    id: "task",
    label: "Nueva tarea",
    icon: ClipboardList,
    color: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  {
    id: "cerebro",
    label: "Cerebro IA",
    icon: Brain,
    color: "bg-purple-600 hover:bg-purple-700 text-white",
  },
  {
    id: "ayuda",
    label: "Centro de Ayuda",
    icon: HelpCircle,
    color: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
] as const

export function TaskFAB({ onClick, onHelpClick }: TaskFABProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Cerrar con click afuera
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open])

  const handleAction = (id: string) => {
    setOpen(false)
    switch (id) {
      case "task":
        onClick()
        break
      case "cerebro":
        router.push("/tools/cerebro")
        break
      case "ayuda":
        if (onHelpClick) {
          onHelpClick()
        } else {
          router.push("/ayuda")
        }
        break
    }
  }

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3">
      {/* Main FAB button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "h-14 w-14 rounded-full shadow-lg flex items-center justify-center",
          "bg-primary text-primary-foreground",
          "hover:scale-105 active:scale-95 transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
          open && "rotate-45"
        )}
        style={{ transition: "transform 0.2s ease" }}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>

      {/* Action buttons */}
      {open && (
        <>
          {ACTIONS.map((action, i) => {
            const Icon = action.icon
            return (
              <div
                key={action.id}
                className="flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}
              >
                {/* Label */}
                <span className="px-3 py-1.5 rounded-lg bg-popover text-popover-foreground text-sm font-medium shadow-md border whitespace-nowrap">
                  {action.label}
                </span>
                {/* Icon button */}
                <button
                  onClick={() => handleAction(action.id)}
                  className={cn(
                    "h-11 w-11 rounded-full shadow-md flex items-center justify-center",
                    "transition-transform hover:scale-110 active:scale-95",
                    "focus:outline-none focus:ring-2 focus:ring-offset-2",
                    action.color
                  )}
                  aria-label={action.label}
                >
                  <Icon className="h-5 w-5" />
                </button>
              </div>
            )
          })}
        </>
      )}

      {/* Backdrop sutil */}
      {open && (
        <div
          className="fixed inset-0 -z-10"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
