"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { ChevronLeft } from "lucide-react"
import scrollStyles from "./chat-scroll.module.css"
import { Button } from "@/components/ui/button"

/** Shared docked shell: beside the chat on desktop, full width on mobile. */
export function ResultDetailSidebar({ id, identity, label, closeLabel, title, subtitle, headerAction, children, onClose }: {
  id?: string; identity: string; label: string; closeLabel: string
  title: string; subtitle?: string; headerAction?: ReactNode; children: ReactNode; onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }) }, [identity])
  return <aside id={id} aria-label={label} className="flex h-full min-h-0 w-full shrink-0 flex-col border-l bg-background md:w-[420px] xl:w-[480px]"
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose() } }}>
    <div className="flex items-start justify-between gap-3 border-b p-4">
      <div className="min-w-0 space-y-1">
        <h2 className="break-words text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        {headerAction}
      </div>
      <Button ref={closeRef} className="order-first shrink-0" variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}><ChevronLeft className="h-4 w-4" /></Button>
    </div>
    <div className={`${scrollStyles.scroll} min-h-0 flex-1 overflow-y-auto overscroll-contain`}>{children}</div>
  </aside>
}
