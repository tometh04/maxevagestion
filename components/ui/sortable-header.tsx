"use client"

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useCallback, useMemo, useState } from "react"

// ─── Types ──────────────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc" | null

export interface SortConfig {
  key: string
  direction: SortDirection
}

// ─── Hook: useSortableData ──────────────────────────────────────────────────
// Drop-in hook that adds client-side sorting to any array of objects.
// Returns { sortedData, sortConfig, requestSort }

export function useSortableData<T>(
  data: T[],
  defaultSort?: SortConfig
) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(
    defaultSort ?? { key: "", direction: null }
  )

  const requestSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, direction: "asc" }
      if (prev.direction === "asc") return { key, direction: "desc" }
      if (prev.direction === "desc") return { key: "", direction: null }
      return { key, direction: "asc" }
    })
  }, [])

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return data

    const sorted = [...data].sort((a, b) => {
      const aVal = getNestedValue(a, sortConfig.key)
      const bVal = getNestedValue(b, sortConfig.key)

      // Handle nulls/undefined — push them to the end
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      // Numbers
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal
      }

      // Dates (ISO strings)
      const aDate = tryParseDate(aVal)
      const bDate = tryParseDate(bVal)
      if (aDate && bDate) {
        return sortConfig.direction === "asc"
          ? aDate.getTime() - bDate.getTime()
          : bDate.getTime() - aDate.getTime()
      }

      // Strings
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1
      if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1
      return 0
    })

    return sorted
  }, [data, sortConfig])

  return { sortedData, sortConfig, requestSort }
}

// ─── Component: SortableTableHead ───────────────────────────────────────────
// Drop-in replacement for <TableHead> that shows sort arrows on click.

interface SortableTableHeadProps {
  sortKey: string
  sortConfig: SortConfig
  onSort: (key: string) => void
  children: React.ReactNode
  className?: string
}

export function SortableTableHead({
  sortKey,
  sortConfig,
  onSort,
  children,
  className,
}: SortableTableHeadProps) {
  const isActive = sortConfig.key === sortKey
  const direction = isActive ? sortConfig.direction : null

  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none hover:bg-muted/50 transition-colors",
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
        <span className="inline-flex">
          {direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-foreground" />
          ) : direction === "desc" ? (
            <ArrowDown className="h-3.5 w-3.5 text-foreground" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </span>
      </div>
    </TableHead>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Access nested properties like "operations.destination" or "sellers.name" */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj)
}

/** Try to parse an ISO date string. Returns null if not a date. */
function tryParseDate(val: any): Date | null {
  if (val instanceof Date) return val
  if (typeof val !== "string") return null
  // Quick check: must look like an ISO date (starts with YYYY-)
  if (!/^\d{4}-\d{2}/.test(val)) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}
