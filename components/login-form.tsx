"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { loginSchema, loginErrorMessage, LoginProfileError } from "@/lib/auth/login-feedback"
import { supabase } from "@/lib/supabase/client"
import { trackEvent } from "@/lib/analytics/track"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const submitting = React.useRef(false)
  const errorRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  // Detectar tokens de invitación o recuperación en la URL y redirigir
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash
      if (hash && hash.includes("type=invite")) {
        // Redirigir a la página de aceptar invitación con el hash completo
        router.replace(`/auth/accept-invite${hash}`)
        return
      }
      if (hash && hash.includes("type=recovery")) {
        // Redirigir a la página de reset password
        router.replace(`/auth/reset-password${hash}`)
        return
      }
    }
  }, [router])

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = async (data: LoginFormValues) => {
    if (submitting.current) return
    submitting.current = true
    setError(null)
    setLoading(true)
    let authenticated = false

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) throw authError
      if (!authData.user) throw new Error("Missing auth user")
      authenticated = true

      if (authData.user) {
        // Get user role from database
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role, is_active")
          .eq("auth_id", authData.user.id)
          .maybeSingle()

        if (userError) {
          throw new LoginProfileError("No pudimos verificar tu cuenta. Volvé a intentar; si el problema continúa, contactá al administrador de tu agencia.")
        }

        if (!userData) {
          throw new LoginProfileError("No pudimos encontrar tu perfil. Contactá al administrador de tu agencia para revisar tu acceso.")
        }

        const user = userData as { role: string; is_active: boolean }
        if (!user.is_active) {
          throw new LoginProfileError("Tu cuenta está desactivada. Contactá al administrador de tu agencia.")
        }

        trackEvent("login", { method: "password" })

        // Navegacion DURA a /post-login (que decide server-side: platform admin
        // → /admin/orgs, resto → /dashboard).
        //
        // Antes era `router.refresh()` + `router.push()`, o sea navegacion
        // blanda. El problema es lo que sobrevive: el cliente Supabase es un
        // singleton a nivel modulo, y si en esta misma pagina hubo una sesion
        // anterior — el caso tipico es cerrar sesion y volver a entrar en el
        // acto — sus timers y refreshes en vuelo siguen vivos. Cuando uno de
        // esos falla con un token ya revocado, gotrue-js llama
        // `_removeSession()` y borra las cookies recien escritas por ESTE login.
        //
        // Recargar de verdad garantiza que el documento nuevo arranque con las
        // cookies de la sesion nueva y sin nada de la vieja en memoria. Cuesta
        // una carga completa, en la unica pantalla donde no importa.
        window.location.assign("/post-login")
        return
      }
    } catch (err) {
      if (authenticated) {
        try {
          await supabase.auth.signOut({ scope: "local" })
        } catch {
          // Preserve the original actionable error if session cleanup fails.
        }
      }
      setError(loginErrorMessage(err))
      // Solo se rehabilita el boton si el login fallo. En el camino feliz la
      // pagina ya esta recargando y volver a "Iniciar Sesión" es un parpadeo.
      setLoading(false)
      submitting.current = false
    }
  }

  return (
    <form {...props} className={cn("flex flex-col gap-6", className)} noValidate aria-busy={loading}
      onChange={(event) => { setError(null); props.onChange?.(event) }}
      onSubmit={form.handleSubmit(onSubmit, () => setError(null))}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-bold tracking-tighter-h2 leading-[1.1]">
            <span className="text-gradient-signature">Iniciar Sesión</span>
          </h1>
          <p className="text-muted-foreground text-sm text-balance">
            Ingresa tus credenciales para acceder al sistema
          </p>
        </div>
        {error && (
          <Alert ref={errorRef} tabIndex={-1} variant="destructive" className="bg-destructive/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input 
            id="email" 
            type="email" 
            placeholder="tu@email.com" 
            {...form.register("email")}
            disabled={loading}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!form.formState.errors.email}
            aria-describedby={form.formState.errors.email ? "email-error" : undefined}
            required 
          />
          {form.formState.errors.email && (
            <p id="email-error" className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          )}
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <a
              href="/forgot-password"
              className="ml-auto text-sm underline-offset-4 hover:underline text-primary"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          <Input 
            id="password" 
            type="password" 
            {...form.register("password")}
            disabled={loading}
            autoComplete="current-password"
            aria-invalid={!!form.formState.errors.password}
            aria-describedby={form.formState.errors.password ? "password-error" : undefined}
            required 
          />
          {form.formState.errors.password && (
            <p id="password-error" className="text-sm text-destructive">{form.formState.errors.password.message}</p>
          )}
        </Field>
        <Field>
          <Button type="submit" variant="cta" size="lg" disabled={loading} className="w-full">
            {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          ¿No tenés cuenta?{" "}
          <a href="/register" className="text-primary underline-offset-4 hover:underline">
            Crear cuenta gratis
          </a>
        </p>
      </FieldGroup>
    </form>
  )
}

