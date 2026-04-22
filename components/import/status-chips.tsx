"use client"

import { Badge } from "@/components/ui/badge"

interface ChipData { label: string; count: number }

export function StatusChips({ items }: { items: ChipData[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Badge key={i.label} variant="outline" className="px-3 py-1">
          {i.label}: <span className="ml-1 tabular-nums font-semibold">{i.count}</span>
        </Badge>
      ))}
    </div>
  )
}
