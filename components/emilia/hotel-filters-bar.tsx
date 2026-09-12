"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { hasActiveHotelFilters, type HotelFilters, type HotelFilterOptions, type MealPlanFilter } from "@/lib/emilia/result-filters"

const ALL_SELECT_VALUE = "__all__"
function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

interface HotelFiltersBarProps {
  filters: HotelFilters
  options: HotelFilterOptions
  visibleCount: number
  totalCount: number
  onChange: (filters: HotelFilters) => void
  onClear: () => void
}

export function HotelFiltersBar({
  filters,
  options,
  visibleCount,
  totalCount,
  onChange,
  onClear,
}: HotelFiltersBarProps) {
  const active = hasActiveHotelFilters(filters)
  const priceCurrency = filters.currency || (options.currencies.length === 1 ? options.currencies[0].value : null)

  return (
    <div className="mb-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className="h-6 rounded-md bg-background text-[11px] font-medium">
          {visibleCount} visibles de {totalCount}
        </Badge>
        {active && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs">
            Limpiar filtros
          </Button>
        )}
      </div>
      <Input aria-label="Buscar hotel por nombre" placeholder="Buscar hotel por nombre" value={filters.name || ""}
        onChange={event => onChange({ ...filters, name: event.target.value })} className="mt-2 h-9 text-sm" />
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select
          value={filters.category ?? ALL_SELECT_VALUE}
          onValueChange={(value) => onChange({ ...filters, category: value === ALL_SELECT_VALUE ? null : value })}
          disabled={options.categories.length === 0}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar hoteles por categoría">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>Todas las categorías</SelectItem>
            {options.categories.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.mealPlan ?? "all"}
          onValueChange={(value) => onChange({ ...filters, mealPlan: value as MealPlanFilter })}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar hoteles por régimen">
            <SelectValue placeholder="Régimen" />
          </SelectTrigger>
          <SelectContent>
            {[{ value: "all", label: "Todos los regímenes" }, ...options.mealPlans].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.provider ?? ALL_SELECT_VALUE}
          onValueChange={(value) => onChange({ ...filters, provider: value === ALL_SELECT_VALUE ? null : value })}
          disabled={options.providers.length === 0}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Filtrar hoteles por mayorista">
            <SelectValue placeholder="Mayorista" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SELECT_VALUE}>Todos los mayoristas</SelectItem>
            {options.providers.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          min={0}
          inputMode="decimal"
          aria-label="Precio máximo de hotel"
          disabled={!priceCurrency}
          placeholder={priceCurrency ? `Total máx (${priceCurrency})` : "Elegí moneda"}
          value={filters.maxRoomTotal ?? ""}
          onChange={(event) => onChange({ ...filters, currency: priceCurrency, maxRoomTotal: parseOptionalNumber(event.target.value) })}
          className="h-8 text-xs"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Select value={filters.currency || ALL_SELECT_VALUE} onValueChange={value => onChange({ ...filters, currency: value === ALL_SELECT_VALUE ? null : value, maxRoomTotal: null })}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Moneda de hoteles"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL_SELECT_VALUE}>Todas las monedas</SelectItem>{options.currencies.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs"><Checkbox checked={Boolean(filters.freeCancellation)} onCheckedChange={checked => onChange({ ...filters, freeCancellation: checked === true })} />Cancelación gratuita</label>
        <label className="flex items-center gap-2 text-xs"><Checkbox checked={Boolean(filters.availableOnly)} onCheckedChange={checked => onChange({ ...filters, availableOnly: checked === true })} />Disponibles al consultar</label>
      </div>
    </div>
  )
}
