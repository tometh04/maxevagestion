"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"

/**
 * DecimalInput — Input numérico tolerante a coma o punto como separador decimal.
 *
 * ## Por qué existe
 *
 * Bug reportado por Andres de VICO el 2026-05-17:
 * `<input type="number">` respeta el locale del navegador. Cuando Chrome detecta
 * locale inglés (frecuente en macOS aún con SO en español), el browser rechaza
 * la coma como separador decimal y a veces incluso se pone estricto con el punto.
 * El tooltip nativo "Ingresa un número" bloquea el input completamente.
 * Usuarios argentinos no pueden tipear ni "1,2" ni "1.2" según el caso.
 *
 * ## Solución
 *
 * Usamos `type="text"` + `inputMode="decimal"` (sigue mostrando teclado numérico
 * en mobile) + normalización coma→punto antes de pasar al onChange. El valor
 * que se entrega a react-hook-form/zod es siempre un string normalizado con
 * punto, así que `z.coerce.number()` lo parsea sin drama.
 *
 * ## Uso típico con react-hook-form
 *
 * ```tsx
 * <FormField
 *   control={form.control}
 *   name="amount"
 *   render={({ field }) => (
 *     <FormItem>
 *       <FormLabel>Monto</FormLabel>
 *       <FormControl>
 *         <DecimalInput placeholder="0.00" {...field} />
 *       </FormControl>
 *       <FormMessage />
 *     </FormItem>
 *   )}
 * />
 * ```
 *
 * El spread `{...field}` pasa `value`, `onChange`, `onBlur`, `name`, `ref`.
 * `DecimalInput` los maneja para integrarse con RHF.
 *
 * ## Props extra
 *
 * - `allowNegative` (default false): permite signo `-` al inicio
 * - `maxDecimals` (default ilimitado): limita cantidad de decimales
 */

type DecimalInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "inputMode" | "value" | "onChange"
> & {
  value?: string | number | null
  onChange?: (value: string) => void
  allowNegative?: boolean
  maxDecimals?: number
}

const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  (
    {
      value,
      onChange,
      allowNegative = false,
      maxDecimals,
      placeholder = "0.00",
      onBlur: onBlurProp,
      ...rest
    },
    ref,
  ) => {
    const buildRegex = React.useCallback((): RegExp => {
      const sign = allowNegative ? "-?" : ""
      if (typeof maxDecimals === "number" && maxDecimals >= 0) {
        return new RegExp(`^${sign}\\d*\\.?\\d{0,${maxDecimals}}$`)
      }
      return new RegExp(`^${sign}\\d*\\.?\\d*$`)
    }, [allowNegative, maxDecimals])

    const toStr = (v: string | number | null | undefined): string =>
      v === null || v === undefined ? "" : String(v)

    const [localValue, setLocalValue] = React.useState<string>(() => toStr(value))

    // While the user is typing, the parent often converts "3137." → Number(v) → 3137
    // and feeds 3137 back as the value prop — which would eat the decimal point.
    // We block external syncs during active editing to prevent this.
    const isTypingRef = React.useRef(false)

    React.useEffect(() => {
      if (isTypingRef.current) return
      setLocalValue(toStr(value))
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(",", ".")
      if (raw === "" || raw === "-" || buildRegex().test(raw)) {
        isTypingRef.current = true
        setLocalValue(raw)
        onChange?.(raw)
      }
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      isTypingRef.current = false
      // Normalize: strip trailing "." when user stops editing
      if (localValue.endsWith(".")) {
        const clean = localValue.slice(0, -1)
        setLocalValue(clean)
        onChange?.(clean)
      }
      onBlurProp?.(e)
    }

    return (
      <Input
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        ref={ref}
        {...rest}
      />
    )
  },
)
DecimalInput.displayName = "DecimalInput"

export { DecimalInput }
