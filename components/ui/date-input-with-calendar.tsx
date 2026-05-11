"use client"

import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateInputWithCalendarProps {
  value?: Date
  onChange: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  className?: string
}

export function DateInputWithCalendar({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  disabled = false,
  minDate,
  maxDate,
  className,
}: DateInputWithCalendarProps) {
  const [inputValue, setInputValue] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)

  // Actualizar input cuando cambia el valor (desde el calendario o externamente)
  React.useEffect(() => {
    if (value) {
      setInputValue(format(value, "dd/MM/yyyy"))
    } else {
      setInputValue("")
    }
  }, [value])

  // Auto-format dd/MM/yyyy: agrega "/" después de pos 2 y 5 mientras el
  // user tipea solo números. Se hace en onChange (no keyDown) para evitar
  // desync entre DOM nativo y state React.
  function applyAutoSlash(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 8) // ddmmyyyy max 8
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  }

  // Bug fix 2026-05-06: la versión previa tenía dos bugs:
  // 1) Si la fecha tipeada estaba fuera de minDate/maxDate, hacíamos
  //    `return` sin llamar onChange — el input mostraba el valor pero
  //    el state quedaba vacío. El user pensaba que ingresó la fecha pero
  //    nunca se guardó (silent failure visible solo al submit).
  // 2) handleInputKeyDown hacía preventDefault + setInputValue manual,
  //    lo cual desincroniza React state con el DOM nativo en algunos
  //    teclados/IME y causa que parts de la fecha se pierdan.
  // Fix: aplicamos auto-slash dentro de handleInputChange (sync con
  // React state). Si la fecha completa está fuera de rango, llamamos
  // onChange igualmente para que el form muestre el error de validación
  // en lugar de fallar silenciosamente.
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = applyAutoSlash(e.target.value)
    setInputValue(formatted)

    if (formatted.length === 10) {
      const parsedDate = parse(formatted, "dd/MM/yyyy", new Date())
      if (isValid(parsedDate)) {
        // Llamamos onChange aunque esté fuera de rango — el form muestra
        // mensaje de error si corresponde. Antes hacíamos return silencioso.
        onChange(parsedDate)
      }
    } else if (formatted.length === 0) {
      onChange(undefined)
    }
  }

  // Manejar cambio desde el calendario
  const handleCalendarSelect = (date: Date | undefined) => {
    onChange(date)
    if (date) {
      setIsOpen(false)
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          "flex items-center border border-border/60 bg-background overflow-hidden",
          "h-8 rounded-full",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={10}
          className={cn(
            "flex-1 bg-transparent border-0 outline-none text-xs px-3 h-full",
            "placeholder:text-muted-foreground min-w-[80px] w-[100px]"
          )}
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex items-center justify-center h-full px-2 hover:bg-muted/50 transition-colors",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleCalendarSelect}
          initialFocus
          disabled={(date) => {
            if (minDate && date < minDate) return true
            if (maxDate && date > maxDate) return true
            return false
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
