"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { cn } from "@/lib/utils"

export type DateTypeOption = {
  value: string
  label: string
  shortLabel: string
}

export interface DateTypeFilterValue {
  type: string
  from?: Date
  to?: Date
}

interface DateTypeFilterProps {
  types: DateTypeOption[]
  value: DateTypeFilterValue
  onChange: (value: DateTypeFilterValue) => void
  placeholder?: string
  includeNone?: boolean
  className?: string
}

const NONE_VALUE = "NONE"

export function DateTypeFilter({
  types,
  value,
  onChange,
  placeholder = "Fecha de...",
  includeNone = true,
  className,
}: DateTypeFilterProps) {
  // Cuando hay un solo tipo y no se ofrece "Ninguno", el dropdown es funcionless.
  // Se omite el Select y se muestran directo los date pickers con label del único tipo.
  const singleTypeMode = !includeNone && types.length === 1
  const activeOption = singleTypeMode
    ? types[0]
    : types.find((t) => t.value === value.type)
  const showDateInputs =
    singleTypeMode ||
    (value.type !== "" && value.type !== NONE_VALUE && Boolean(activeOption))

  const handleTypeChange = (newType: string) => {
    if (newType === NONE_VALUE) {
      onChange({ type: "", from: undefined, to: undefined })
    } else {
      onChange({ type: newType, from: value.from, to: value.to })
    }
  }

  // En single-type mode el type viene fijo del array, no del state del Select.
  const effectiveType = singleTypeMode ? types[0].value : value.type

  const handleFromChange = (from: Date | undefined) => {
    if (from && value.to && value.to < from) {
      onChange({ type: effectiveType, from, to: undefined })
    } else {
      onChange({ type: effectiveType, from, to: value.to })
    }
  }

  const handleToChange = (to: Date | undefined) => {
    if (to && value.from && to < value.from) return
    onChange({ type: effectiveType, from: value.from, to })
  }

  return (
    <>
      {!singleTypeMode && (
        <Select value={value.type || ""} onValueChange={handleTypeChange}>
          <SelectTrigger
            className={cn(
              "h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto",
              className
            )}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {includeNone && <SelectItem value={NONE_VALUE}>Ninguno</SelectItem>}
            {types.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showDateInputs && activeOption && (
        <>
          <DateInputWithCalendar
            value={value.from}
            onChange={handleFromChange}
            placeholder={`${activeOption.shortLabel} Desde`}
            className="h-8 text-xs rounded-full"
          />
          <DateInputWithCalendar
            value={value.to}
            onChange={handleToChange}
            placeholder={`${activeOption.shortLabel} Hasta`}
            minDate={value.from}
            className="h-8 text-xs rounded-full"
          />
        </>
      )}
    </>
  )
}
