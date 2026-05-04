import Link from "next/link"
import { cn } from "@/lib/utils"

type Props = {
  page: number
  totalPages: number
  buildHref: (page: number) => string
}

export function OrgsPagination({ page, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null

  const pages = pageRange(page, totalPages)

  return (
    <nav className="flex items-center justify-center gap-1 py-4">
      <PageLink href={buildHref(Math.max(1, page - 1))} disabled={page <= 1} label="◀" />
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-2 text-muted-foreground">
            …
          </span>
        ) : (
          <PageLink
            key={p}
            href={buildHref(p)}
            label={String(p)}
            active={p === page}
          />
        ),
      )}
      <PageLink
        href={buildHref(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        label="▶"
      />
    </nav>
  )
}

function PageLink({
  href,
  label,
  active,
  disabled,
}: {
  href: string
  label: string
  active?: boolean
  disabled?: boolean
}) {
  const className = cn(
    "inline-flex h-8 min-w-8 items-center justify-center rounded border px-2 text-sm",
    active
      ? "border-primary/40 bg-primary/15 text-primary"
      : "border-muted-foreground text-muted-foreground hover:bg-ink",
    disabled && "pointer-events-none opacity-40",
  )
  if (disabled) return <span className={className}>{label}</span>
  return (
    <Link href={href} className={className} aria-current={active ? "page" : undefined}>
      {label}
    </Link>
  )
}

function pageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | "…")[] = []
  out.push(1)
  if (current > 3) out.push("…")
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) out.push(p)
  if (current < total - 2) out.push("…")
  out.push(total)
  return out
}
