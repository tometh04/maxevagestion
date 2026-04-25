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
  const activeOption = types.find((t) => t.value === value.type)
  const showDateInputs =
    value.type !== "" && value.type !== NONE_VALUE && Boolean(activeOption)

  const handleTypeChange = (newType: string) => {
    if (newType === NONE_VALUE) {
      onChange({ type: "", from: undefined, to: undefined })
    } else {
      onChange({ type: newType, from: value.from, to: value.to })
    }
  }

  const handleFromChange = (from: Date | undefined) => {
    if (from && value.to && value.to < from) {
      onChange({ type: value.type, from, to: undefined })
    } else {
      onChange({ type: value.type, from, to: value.to })
    }
  }

  const handleToChange = (to: Date | undefined) => {
    if (to && value.from && to < value.from) return
    onChange({ type: value.type, from: value.from, to })
  }

  return (
    <>
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
