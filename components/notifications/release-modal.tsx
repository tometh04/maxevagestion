"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Sparkles, TrendingUp, Wrench, ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { partirEnPaginas, etiquetasDePaginas } from "@/lib/announcements/modal-pages"

/**
 * El aviso de release: interrumpe una vez, cuenta qué cambió y lleva al lugar.
 *
 * Existe porque la campana no alcanza para un release que además le PIDE algo
 * al usuario. La tanda contable no queda operativa hasta que cada agencia
 * defina desde cuándo lleva su contabilidad acá.
 *
 * Está paginado y no es un bloque de texto. La primera versión metía cuatro
 * páginas de contenido en una sola pantalla scrolleable, y el efecto fue el
 * contrario del buscado: el pedido de configurar quedaba al fondo y el botón
 * que lleva a hacerlo no se veía sin scrollear hasta abajo.
 *
 * Poco insistente a propósito: si se cierra sin tildar nada, no vuelve en esa
 * sesión del navegador. Interrumpir una vez por ingreso es un recordatorio; en
 * cada navegación sería un castigo.
 */

interface Anuncio {
  id: string
  title: string
  body: string
  type: "NEW" | "IMPROVEMENT" | "FIX"
  published_at: string | null
  release_version: string | null
  modal_cta_label: string | null
  modal_cta_href: string | null
}

// Mismo vocabulario visual que la campana: es lo mismo en otro formato, no algo
// nuevo que el usuario tenga que aprender.
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

const fechaCorta = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
    : null

export function ReleaseModal() {
  const [anuncio, setAnuncio] = useState<Anuncio | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [noMostrarMas, setNoMostrarMas] = useState(false)
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch("/api/announcements/modal")
        if (!res.ok) return
        const json = await res.json()
        const a: Anuncio | null = json?.announcement ?? null
        if (!a || cancelado) return

        if (sessionStorage.getItem(claveDeSesion(a.id))) return

        // Le cede el paso a cualquier otro modal ya abierto.
        //
        // El shell monta también el recordatorio de check-in, que aparece cada
        // vez que hay pasajeros por confirmar: es operativo y urgente, mientras
        // que un aviso de release puede esperar al próximo ingreso. Dos modales
        // encimados terminan en que el usuario cierra los dos sin leer ninguno.
        await new Promise((r) => setTimeout(r, 1000))
        if (cancelado) return
        if (document.querySelector('[role="dialog"][data-state="open"]')) return

        setAnuncio(a)
        setAbierto(true)
      } catch {
        // Un aviso que falla no puede molestar. Sin diagnóstico, no hay aviso.
      }
    })()
    return () => {
      cancelado = true
    }
  }, [])

  const paginas = useMemo(() => partirEnPaginas(anuncio?.body ?? ""), [anuncio?.body])
  const etiquetas = useMemo(() => etiquetasDePaginas(paginas), [paginas])
  const ultima = pagina >= paginas.length - 1
  const paginado = paginas.length > 1

  const cerrar = useCallback(async () => {
    setAbierto(false)
    if (!anuncio) return

    try {
      sessionStorage.setItem(claveDeSesion(anuncio.id), "1")
    } catch {
      // Navegación privada o storage bloqueado: se vuelve a mostrar, y está bien.
    }

    if (!noMostrarMas) return

    try {
      await fetch("/api/announcements/modal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: anuncio.id }),
      })
    } catch {
      /* si falla, lo vuelve a ver: preferible a creer que lo apagó */
    }
  }, [anuncio, noMostrarMas])

  // Flechas para pasar de página: es un contenido secuencial y el teclado es la
  // forma natural de recorrerlo. Escape ya lo maneja el Dialog.
  useEffect(() => {
    if (!abierto || !paginado) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setPagina((p) => Math.min(p + 1, paginas.length - 1))
      if (e.key === "ArrowLeft") setPagina((p) => Math.max(p - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto, paginado, paginas.length])

  if (!anuncio || paginas.length === 0) return null

  const t = tipo[anuncio.type] ?? tipo.NEW
  const { Icono } = t
  const actual = paginas[pagina]
  const fecha = fechaCorta(anuncio.published_at)

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      {/* Sin `p-0`: DialogContent ya trae el `px-6` del cuerpo y Header/Footer
          usan `-mx-6` para que sus divisores lleguen a los bordes. Anularlo
          hacía que el header se saliera 24px por lado y dibujara un marco. */}
      <DialogContent className="max-w-xl">
        {/* Encabezado: identidad del release. Se mantiene en todas las páginas
            porque el usuario tiene que saber siempre qué está leyendo. */}
        <DialogHeader className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${t.className}`}
            >
              <Icono className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </span>
            {anuncio.release_version && (
              <span className="rounded-full border bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
                v{anuncio.release_version}
              </span>
            )}
            {fecha && <span className="text-xs text-muted-foreground">{fecha}</span>}
          </div>
          <DialogTitle className="text-left text-lg font-semibold leading-snug">
            {anuncio.title}
          </DialogTitle>
        </DialogHeader>

        {/* Progreso sin texto.
            La versión anterior repetía el título de la sección en la barra y
            otra vez como encabezado del cuerpo, a cuatro centímetros de
            distancia. Y con cinco columnas, "Clientes y operadores" se partía en
            dos líneas y desalineaba la fila entera.
            Las barras dicen dónde estás y cuánto falta; el título lo dice el
            encabezado del cuerpo, una sola vez. */}
        {paginado && (
          <div className="-mx-6 flex items-center gap-3 border-b border-border/30 px-6 pb-3 pt-3">
            <div className="flex flex-1 gap-1.5">
              {paginas.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPagina(i)}
                  aria-label={`Ir a ${etiquetas[i]}`}
                  aria-current={i === pagina ? "step" : undefined}
                  className="group flex-1 py-1.5"
                >
                  <span
                    className={`block h-1 rounded-full transition-colors duration-200 ${
                      i <= pagina
                        ? "bg-primary"
                        : "bg-border group-hover:bg-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {pagina + 1} de {paginas.length}
            </span>
          </div>
        )}

        <div className="min-h-[12rem] py-4">
          {actual.titulo && paginado && (
            <h3 className="mb-2 text-base font-semibold leading-snug">{actual.titulo}</h3>
          )}
          <DialogDescription className="whitespace-pre-line text-left text-sm leading-relaxed text-muted-foreground">
            {actual.cuerpo}
          </DialogDescription>
        </div>

        <div className="-mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/30 bg-muted/30 px-6 py-4">
          {/* Visible desde la primera página. Esconderlo hasta el final obliga a
              leer todo para poder salir, y eso genera rechazo. */}
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={noMostrarMas}
              onCheckedChange={(v) => setNoMostrarMas(v === true)}
            />
            No volver a mostrar
          </label>

          <div className="flex items-center gap-2">
            {paginado && pagina > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPagina((p) => p - 1)}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Anterior
              </Button>
            )}

            {!ultima ? (
              <Button size="sm" onClick={() => setPagina((p) => p + 1)}>
                Siguiente
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={cerrar}>
                  {anuncio.modal_cta_href ? "Ahora no" : "Entendido"}
                </Button>
                {anuncio.modal_cta_href && anuncio.modal_cta_label && (
                  <Button asChild size="sm" onClick={cerrar}>
                    <Link href={anuncio.modal_cta_href}>{anuncio.modal_cta_label}</Link>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
