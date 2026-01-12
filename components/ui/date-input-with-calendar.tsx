"use client"

import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  placeholder = "dd/MM/yyyy",
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
          // Validar fecha mínima si existe
          if (minDate && parsedDate < minDate) {
            return // No actualizar si es menor que minDate
          }
          // Validar fecha máxima si existe
          if (maxDate && parsedDate > maxDate) {
            return // No actualizar si es mayor que maxDate
          }
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
    // Si se presiona un número y ya hay 2 dígitos, agregar /
    if (/\d/.test(e.key) && inputValue.length === 2 && !inputValue.includes("/")) {
      e.preventDefault()
      setInputValue(inputValue + "/" + e.key)
      return
    }
    // Si se presiona un número y ya hay 5 caracteres (dd/MM), agregar /
    if (/\d/.test(e.key) && inputValue.length === 5 && inputValue.charAt(4) !== "/") {
      e.preventDefault()
      setInputValue(inputValue + "/" + e.key)
      return
    }
  }

  return (
    <div className={cn("relative flex gap-1", className)}>
      <Input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
        maxLength={10}
      />
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "h-10 w-10 flex-shrink-0",
              !value && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
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
    </div>
  )
}
