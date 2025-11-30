"use client"

import * as React from "react"
import { format } from "date-fns"
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
  // Parse YYYY-MM-DD format without timezone issues
  const parts = dateStr.split("-")
  if (parts.length !== 3) return undefined
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return undefined
  // Validate date
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

  // Internal range for selection (only used when popover is open)
  const [internalRange, setInternalRange] = React.useState<DateRange | undefined>(() => currentRange)

  // Sync internal range with props when popover opens or when props change (if closed)
  React.useEffect(() => {
    if (isOpen) {
      // When opening, sync with current props
      setInternalRange(currentRange)
    } else {
      // When closed, keep internal range in sync with props
      setInternalRange(currentRange)
    }
  }, [isOpen, currentRange])

  // When popover closes, handle the selection
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      // Popover is closing - commit selection if complete, otherwise revert
      if (internalRange?.from && internalRange?.to) {
        // Complete range selected - ensure it's committed
        onChange(formatDateString(internalRange.from), formatDateString(internalRange.to))
      } else {
        // Incomplete selection - revert to current props
        setInternalRange(currentRange)
      }
    }
  }

  const handleSelect = (range: DateRange | undefined) => {
    setInternalRange(range)
    
    // Only update parent when both dates are selected
    if (range?.from && range?.to) {
      onChange(formatDateString(range.from), formatDateString(range.to))
    }
  }

  // For display: use currentRange (from props) when closed, internalRange when open
  const displayRange = isOpen ? internalRange : currentRange

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
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
          ) : displayRange?.from && isOpen ? (
            <>
              {format(displayRange.from, "LLL dd, y", { locale: es })} - ...
            </>
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={internalRange?.from || currentRange?.from || new Date()}
          selected={internalRange}
          onSelect={handleSelect}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}

