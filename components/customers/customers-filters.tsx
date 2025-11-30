"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { X } from "lucide-react"

interface CustomersFiltersProps {
  onFilterChange: (filters: { search: string }) => void
}

export function CustomersFilters({ onFilterChange }: CustomersFiltersProps) {
  const [search, setSearch] = useState("")

  const handleApplyFilters = () => {
    onFilterChange({ search })
  }

  const handleClearFilters = () => {
    setSearch("")
    onFilterChange({ search: "" })
  }

  const hasActiveFilters = search !== ""

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex gap-4 items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="search">Buscar</Label>
            <Input
              id="search"
              placeholder="Nombre, teléfono, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleApplyFilters()
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleApplyFilters}>Buscar</Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={handleClearFilters}>
                <X className="mr-2 h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

