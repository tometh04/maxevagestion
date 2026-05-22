"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

type Category = {
  id: string
  name: string
  color: string | null
  tags: Array<{ id: string; label: string }>
}

type Props = {
  categories: Category[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}

export function TagFilter({ categories, selected, onChange }: Props) {
  function toggle(tagId: string) {
    const next = new Set(selected)
    if (next.has(tagId)) {
      next.delete(tagId)
    } else {
      next.add(tagId)
    }
    onChange(next)
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {categories.map((category) => {
        const count = category.tags.filter((t) => selected.has(t.id)).length
        return (
          <Popover key={category.id}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                {category.name}
                {count > 0 && ` (${count})`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 max-h-80 overflow-y-auto">
              <div className="flex flex-col gap-1">
                {category.tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggle(tag.id)}
                    className={
                      "text-left px-2 py-1 rounded text-sm hover:bg-muted " +
                      (selected.has(tag.id) ? "bg-muted font-medium" : "")
                    }
                  >
                    {tag.label}
                  </button>
                ))}
                {category.tags.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Sin etiquetas</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
    </div>
  )
}
