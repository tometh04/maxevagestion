"use client"

import * as React from "react"
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { type DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateRangePickerProps {
  dateFrom?: string
  dateTo?: string
  onChange: (dateFrom: string, dateTo: string) => void
  placeholder?: string
  disabled?: boolean
}

// Helper function to parse date string safely (YYYY-MM-DD format)
function parseDateString(dateStr: string | undefined): Date | undefined {
  if (!dateStr || dateStr.trim() === "") return undefined
  const parts = dateStr.split("-")
  if (parts.length !== 3) return undefined
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return undefined
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined
  }
  return date
}

// Helper function to format date to YYYY-MM-DD
function formatDateString(date: Date | undefined): string {
  if (!date || isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Preset options
const presets = [
  {
    label: "Hoy",
    getValue: () => {
      const today = startOfDay(new Date())
      return {
        from: today,
        to: endOfDay(today),
      }
    },
  },
  {
    label: "Ayer",
    getValue: () => {
      const yesterday = subDays(new Date(), 1)
      return {
        from: startOfDay(yesterday),
        to: endOfDay(yesterday),
      }
    },
  },
  {
    label: "Esta semana",
    getValue: () => {
      const today = new Date()
      return {
        from: startOfWeek(today, { locale: es }),
        to: endOfWeek(today, { locale: es }),
      }
    },
  },
  {
    label: "Semana pasada",
    getValue: () => {
      const today = new Date()
      const lastWeek = subDays(today, 7)
      return {
        from: startOfWeek(lastWeek, { locale: es }),
        to: endOfWeek(lastWeek, { locale: es }),
      }
    },
  },
  {
    label: "Este mes",
    getValue: () => {
      const today = new Date()
      return {
        from: startOfMonth(today),
        to: endOfMonth(today),
      }
    },
  },
  {
    label: "Mes pasado",
    getValue: () => {
      const today = new Date()
      const lastMonth = subMonths(today, 1)
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
      }
    },
  },
  {
    label: "Últimos 7 días",
    getValue: () => {
      const today = new Date()
      return {
        from: startOfDay(subDays(today, 6)),
        to: endOfDay(today),
      }
    },
  },
  {
    label: "Últimos 30 días",
    getValue: () => {
      const today = new Date()
      return {
        from: startOfDay(subDays(today, 29)),
        to: endOfDay(today),
      }
    },
  },
]

export function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
  placeholder = "Seleccionar rango de fechas",
  disabled = false,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  
  // Parse props to get the current range
  const currentRange = React.useMemo(() => {
    const from = parseDateString(dateFrom)
    const to = parseDateString(dateTo)
    if (!from && !to) return undefined
    return { from, to }
  }, [dateFrom, dateTo])

  // Internal range for selection - starts with current range when opening
  const [internalRange, setInternalRange] = React.useState<DateRange | undefined>(currentRange)

  // Reset internal range when opening popover
  React.useEffect(() => {
    if (isOpen) {
      setInternalRange(currentRange)
    }
  }, [isOpen, currentRange])

  const handleSelect = (range: DateRange | undefined) => {
    setInternalRange(range)
    
    // When both dates are selected, update parent and close
    if (range?.from && range?.to) {
      onChange(formatDateString(range.from), formatDateString(range.to))
      // Close after a brief delay to show the selection
      setTimeout(() => {
        setIsOpen(false)
      }, 150)
    }
  }

  const handlePresetClick = (preset: typeof presets[0]) => {
    const range = preset.getValue()
    onChange(formatDateString(range.from), formatDateString(range.to))
    setIsOpen(false)
  }

  // Display current range from props (not internal state when closed)
  const displayRange = currentRange

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          id="date"
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !displayRange?.from && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayRange?.from && displayRange?.to ? (
            <>
              {format(displayRange.from, "LLL dd, y", { locale: es })} -{" "}
              {format(displayRange.to, "LLL dd, y", { locale: es })}
            </>
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          <div className="p-3 border-r">
            <div className="space-y-1">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  className="w-full justify-start text-left font-normal"
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="p-3">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={internalRange?.from || currentRange?.from || new Date()}
              selected={internalRange}
              onSelect={handleSelect}
              numberOfMonths={1}
              locale={es}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
