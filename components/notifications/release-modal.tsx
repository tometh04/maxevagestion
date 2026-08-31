"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Sparkles, TrendingUp, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * El aviso de release: interrumpe una vez, cuenta qué cambió y lleva al lugar.
 *
 * Existe porque la campana no alcanza para un release que además le PIDE algo al
 * usuario. La tanda contable no queda operativa hasta que cada agencia defina
 * desde cuándo lleva su contabilidad acá; un aviso que hay que ir a buscar no
 * mueve esa aguja.
 *
 * Es deliberadamente poco insistente. Si se cierra sin tildar nada, no vuelve a
 * aparecer en esa sesión del navegador: interrumpir una vez por ingreso es un
 * recordatorio, y en cada navegación sería un castigo.
 */

interface Anuncio {
  id: string
  title: string
  body: string
  type: "NEW" | "IMPROVEMENT" | "FIX"
  modal_cta_label: string | null
  modal_cta_href: string | null
}

// Mismo criterio visual que la campana, para que el usuario reconozca que es lo
// mismo en otro formato y no algo nuevo.
const tipo = {
  NEW: { label: "Novedad", Icono: Sparkles, className: "bg-success/10 text-success border-success/20" },
  IMPROVEMENT: {
    label: "Mejora",
    Icono: TrendingUp,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  FIX: {
    label: "Corrección",
    Icono: Wrench,
    className: "bg-accent-coral/10 text-accent-coral border-accent-coral/20",
  },
} as const

const claveDeSesion = (id: string) => `release-modal-cerrado:${id}`

export function ReleaseModal() {
  const [anuncio, setAnuncio] = useState<Anuncio | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [noMostrarMas, setNoMostrarMas] = useState(false)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch("/api/announcements/modal")
        if (!res.ok) return
        const json = await res.json()
        const a: Anuncio | null = json?.announcement ?? null
        if (!a || cancelado) return

        // Ya lo cerró en esta sesión: no se lo repetimos navegando.
        if (sessionStorage.getItem(claveDeSesion(a.id))) return

        // Le cede el paso a cualquier otro modal que ya esté abierto.
        //
        // El shell monta también el recordatorio de check-in, que aparece cada
        // vez que hay pasajeros por confirmar: es operativo y urgente, mientras
        // que un aviso de release puede esperar al próximo ingreso. Dos modales
        // encimados terminan en que el usuario cierra los dos sin leer ninguno.
        //
        // La espera es porque los dos consultan su API al montar y no hay orden
        // garantizado; un segundo alcanza para que el otro ya se haya abierto si
        // iba a abrirse.
        await new Promise((r) => setTimeout(r, 1000))
        if (cancelado) return
        if (document.querySelector('[role="dialog"][data-state="open"]')) return

        setAnuncio(a)
        setAbierto(true)
      } catch {
        // Un aviso que falla no puede molestar. Si no se pudo leer, no hay aviso.
      }
    })()
    return () => {
      cancelado = true
    }
  }, [])

  const cerrar = useCallback(async () => {
    setAbierto(false)
    if (!anuncio) return

    try {
      sessionStorage.setItem(claveDeSesion(anuncio.id), "1")
    } catch {
      // Navegación privada o storage bloqueado: se vuelve a mostrar, y está bien.
    }

    if (!noMostrarMas) return

    // El descarte definitivo es lo único que se persiste en el servidor. Si
    // falla, el usuario lo vuelve a ver: preferible a tragarse el error y que
    // crea que lo apagó.
    try {
      await fetch("/api/announcements/modal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: anuncio.id }),
      })
    } catch {
      /* se reintenta solo la próxima vez que lo vea */
    }
  }, [anuncio, noMostrarMas])

  if (!anuncio) return null

  const t = tipo[anuncio.type] ?? tipo.NEW
  const { Icono } = t

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <span
            className={`mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${t.className}`}
          >
            <Icono className="h-3.5 w-3.5" aria-hidden />
            {t.label}
          </span>
          <DialogTitle className="text-left text-lg leading-snug">{anuncio.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-left text-sm leading-relaxed">
            {anuncio.body}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-2 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={noMostrarMas}
              onCheckedChange={(v) => setNoMostrarMas(v === true)}
            />
            No volver a mostrar
          </label>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cerrar}>
              {anuncio.modal_cta_href ? "Ahora no" : "Entendido"}
            </Button>
            {anuncio.modal_cta_href && anuncio.modal_cta_label && (
              <Button asChild size="sm" onClick={cerrar}>
                <Link href={anuncio.modal_cta_href}>{anuncio.modal_cta_label}</Link>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
