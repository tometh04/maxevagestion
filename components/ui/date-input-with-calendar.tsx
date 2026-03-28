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

  // Manejar cambio en el input manual
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^\d/]/g, "") // Solo números y /

    // Limitar longitud
    if (rawValue.length > 10) return

    setInputValue(rawValue)

    // Intentar parsear cuando tenga formato completo (10 caracteres: dd/MM/yyyy)
    if (rawValue.length === 10) {
      try {
        const parsedDate = parse(rawValue, "dd/MM/yyyy", new Date())
        if (isValid(parsedDate)) {
          if (minDate && parsedDate < minDate) return
          if (maxDate && parsedDate > maxDate) return
          onChange(parsedDate)
        }
      } catch (error) {
        // Ignorar errores de parseo
      }
    } else if (rawValue.length === 0) {
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

  // Formatear automáticamente mientras se tipea (agregar / automáticamente)
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (/\d/.test(e.key) && inputValue.length === 2 && !inputValue.includes("/")) {
      e.preventDefault()
      setInputValue(inputValue + "/" + e.key)
      return
    }
    if (/\d/.test(e.key) && inputValue.length === 5 && inputValue.charAt(4) !== "/") {
      e.preventDefault()
      setInputValue(inputValue + "/" + e.key)
      return
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
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={10}
          className={cn(
            "flex-1 bg-transparent border-0 outline-none text-xs px-3 h-full",
            "placeholder:text-muted-foreground min-w-[80px] w-[88px]"
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
