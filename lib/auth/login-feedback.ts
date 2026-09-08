import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Ingresá tu email.").email("Ingresá un email válido, por ejemplo nombre@agencia.com."),
  // Login must accept existing passwords, independently of registration rules.
  password: z.string().min(1, "Ingresá tu contraseña."),
})

export class LoginProfileError extends Error {}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof LoginProfileError) return error.message
  const details = error && typeof error === "object"
    ? error as { code?: string; status?: number; name?: string }
    : {}

  if (details.status === 429 || details.code === "over_request_rate_limit" || details.code === "over_email_send_rate_limit") {
    return "Demasiados intentos. Esperá unos minutos y volvé a intentar."
  }
  if (details.code === "invalid_credentials") {
    return "El email o la contraseña son incorrectos. Revisalos y volvé a intentar."
  }
  if (details.code === "email_not_confirmed") {
    return "Confirmá tu email desde el enlace que te enviamos. Revisá también la carpeta de spam."
  }
  if (details.code === "user_banned") {
    return "Tu cuenta no tiene acceso en este momento. Contactá al administrador de tu agencia."
  }
  if (details.name === "AuthRetryableFetchError" ||
    (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))) {
    return "No pudimos conectarnos. Revisá tu conexión a internet y volvé a intentar."
  }
  return "No pudimos iniciar sesión en este momento. Volvé a intentar en unos minutos."
}
