"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// CarouselSlide — wrapper unificado para cada card del carrusel.
// Ancho fijo (para el snap horizontal) pero ALTURA NATURAL: la card crece
// con su contenido. Una altura fija + overflow-hidden recortaba el vuelo de
// REGRESO, el "total" del hotel y el ring de selección (`ring-2 ring-primary`).
// 360px: con el modal ancho (max-w-7xl) entran ~3 cards y el contenido de la
// card (aerolínea, precio, horarios) respira sin envolver en 3 líneas.
// -------------------------------------------------------------------------
const SLIDE_WIDTH = 360

export function CarouselSlide({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-full shrink-0 snap-start [&>*]:w-full" style={{ width: `${SLIDE_WIDTH}px` }}>
      {children}
    </div>
  )
}

// -------------------------------------------------------------------------
// CardCarousel — banda horizontal con snap, flechas y contador.
// Reusada para vuelos y hoteles dentro del chat embebido.
// -------------------------------------------------------------------------
interface CardCarouselProps {
  count: number            // cantidad total de items (para el contador)
  ariaLabel: string
  children: React.ReactNode
  alignCards?: boolean
}

export function CardCarousel({ count, ariaLabel, children, alignCards = false }: CardCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const updateNav = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const itemWidth = (el.firstElementChild?.getBoundingClientRect().width || SLIDE_WIDTH) + 12
    const left = el.scrollLeft
    const max = el.scrollWidth - el.clientWidth - 1
    setCanLeft(left > 0)
    setCanRight(left < max)
    // index del card más cercano al borde izquierdo (con un pequeño offset)
    setActiveIndex(Math.min(count - 1, Math.max(0, Math.round(left / itemWidth))))
  }, [count])

  useEffect(() => {
    updateNav()
    window.addEventListener("resize", updateNav)
    return () => window.removeEventListener("resize", updateNav)
  }, [updateNav, count])

  function scrollBy(direction: 1 | -1) {
    const el = trackRef.current
    if (!el) return
    const itemWidth = (el.firstElementChild?.getBoundingClientRect().width || SLIDE_WIDTH) + 12
    el.scrollBy({ left: direction * itemWidth, behavior: "smooth" })
  }

  return (
    <div className="relative group/carousel" aria-roledescription="carousel" aria-label={ariaLabel}>
      {/* Sin margen negativo: con -mx-3 las cards sangraban sobre el padding
          del modal y el scroll container las recortaba contra el borde.
          px-1 deja lugar para el ring de selección de las cards. */}
      <div
        ref={trackRef}
        onScroll={updateNav}
        className={cn("flex gap-3 overflow-x-auto scroll-smooth scroll-px-1 snap-x snap-mandatory px-1 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden", alignCards ? "items-stretch" : "items-start")}
      >
        {children}
      </div>

      {/* Flechas — solo visibles cuando hay overflow + en hover/focus */}
      <button
        type="button"
        aria-label="Anterior"
        onClick={() => scrollBy(-1)}
        disabled={!canLeft}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 left-1 z-10 h-9 w-9 rounded-full",
          "bg-background/85 backdrop-blur-sm border shadow-md flex items-center justify-center",
          "text-foreground transition-all duration-150",
          "opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100",
          "disabled:cursor-not-allowed disabled:opacity-0",
          "hover:bg-background hover:scale-105"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => scrollBy(1)}
        disabled={!canRight}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 right-1 z-10 h-9 w-9 rounded-full",
          "bg-background/85 backdrop-blur-sm border shadow-md flex items-center justify-center",
          "text-foreground transition-all duration-150",
          "opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100",
          "disabled:cursor-not-allowed disabled:opacity-0",
          "hover:bg-background hover:scale-105"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Contador + dots */}
      {count > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1.5">
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === activeIndex
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-muted-foreground/30"
                )}
              />
            ))}
            {count > 8 && (
              <span className="text-[10px] text-muted-foreground/60 ml-1">+{count - 8}</span>
            )}
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {activeIndex + 1}/{count}
          </span>
        </div>
      )}
    </div>
  )
}

