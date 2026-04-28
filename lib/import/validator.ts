export interface FieldError {
  field: string
  message: string
}

export function validateRequiredFields(
  row: Record<string, string | undefined>,
  required: string[]
): FieldError[] {
  const errors: FieldError[] = []
  for (const field of required) {
    const value = row[field]
    if (!value || !value.trim()) {
      errors.push({ field, message: `El campo "${field}" es requerido` })
    }
  }
  return errors
}

export function validateEmailFormat(email: string): string | null {
  if (!email || !email.trim()) return null
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!re.test(email)) return "Email inválido"
  return null
}

export function validatePositiveAmount(amount: number): string | null {
  if (amount < 0) return "El monto no puede ser negativo"
  return null
}
