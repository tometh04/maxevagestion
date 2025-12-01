"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

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
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = async (data: LoginFormValues) => {
    setError(null)
    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) throw authError

      if (authData.user) {
        // Get user role from database
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role, is_active")
          .eq("auth_id", authData.user.id)
          .maybeSingle()

        if (userError) {
          // Check if the error is because the table doesn't exist
          if (userError.code === 'PGRST205' || userError.message?.includes("Could not find the table")) {
            throw new Error(
              "La tabla 'users' no existe en la base de datos. " +
              "Por favor ejecuta el SQL de migración en Supabase Dashboard: " +
              "https://supabase.com/dashboard/project/pmqvplyyxiobkllapgjp/sql/new"
            )
          }
          
          throw new Error(`Error al buscar usuario: ${userError.message}`)
        }

        if (!userData) {
          throw new Error("Usuario no encontrado en la base de datos. Contacta al administrador.")
        }

        const user = userData as { role: string; is_active: boolean }
        if (!user.is_active) {
          throw new Error("Tu cuenta está desactivada. Contacta al administrador.")
        }

        // Refresh to ensure cookies are set
        router.refresh()
        router.push("/dashboard")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={form.handleSubmit(onSubmit)} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Iniciar Sesión</h1>
          <p className="text-muted-foreground text-sm text-balance">
            Ingresa tus credenciales para acceder al sistema
          </p>
        </div>
        {error && (
          <Alert className="text-red-600">
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
            required 
          />
          {form.formState.errors.email && (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
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
            required 
          />
          {form.formState.errors.password && (
            <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
          )}
        </Field>
        <Field>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}

