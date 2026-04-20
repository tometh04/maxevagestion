"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"

const LANDING_BASE = process.env.NEXT_PUBLIC_LANDING_URL || "https://vibook.ai"
const LEGAL_VERSION = "2026-04-20"

const registerSchema = z.object({
  name: z.string().min(2, "Ingresá tu nombre completo"),
  companyName: z.string().min(2, "Ingresá el nombre de la empresa"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  legalAccepted: z.boolean().refine((v) => v === true, {
    message: "Tenés que aceptar los términos para continuar",
  }),
})

type RegisterFormValues = z.infer<typeof registerSchema>

export function RegisterForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // `?plan=pro` viene del CTA de la landing. Si está, tras el signup lanzamos
  // el checkout MP inmediatamente. Si no, flow normal al dashboard.
  const requestedPlan = (searchParams?.get("plan") || "").toUpperCase()
  const wantsPro = requestedPlan === "PRO"

  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      companyName: "",
      email: "",
      password: "",
      legalAccepted: false,
    },
  })

  const onSubmit = async (data: RegisterFormValues) => {
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          companyName: data.companyName,
          email: data.email,
          password: data.password,
          legalAccepted: data.legalAccepted,
          legalVersion: LEGAL_VERSION,
        }),
      })

      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error || "Error al registrar")

      // Auto-login tras registro
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (signInErr) throw new Error(signInErr.message)

      if (wantsPro) {
        // Viene del CTA PRO: lanzamos preapproval MP y mandamos al init_point.
        const checkoutRes = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "PRO" }),
        })
        const checkoutPayload = await checkoutRes.json().catch(() => ({}))
        if (checkoutRes.ok && checkoutPayload?.init_point) {
          window.location.href = checkoutPayload.init_point
          return
        }
        // Soft fail: dejamos al user en el dashboard con banner de pending.
        // Puede reintentar el checkout desde Settings → Subscription.
        console.error("checkout init failed", checkoutPayload)
        router.refresh()
        router.push("/dashboard?checkout=pending")
        return
      }

      router.refresh()
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar")
    } finally {
      setLoading(false)
    }
  }

  const legalAcceptedValue = form.watch("legalAccepted")

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={form.handleSubmit(onSubmit)}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Crear cuenta</h1>
          <p className="text-muted-foreground text-sm text-balance">
            {wantsPro
              ? "Probá Vibook PRO 7 días gratis. Conectás MercadoPago al terminar."
              : "Probá Vibook 7 días gratis. Sin cobro anticipado."}
          </p>
        </div>
        {error && (
          <Alert className="text-red-600">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="name">Nombre completo</FieldLabel>
          <Input
            id="name"
            type="text"
            placeholder="Juan Pérez"
            {...form.register("name")}
            disabled={loading}
            autoComplete="name"
            required
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="companyName">Nombre de la agencia</FieldLabel>
          <Input
            id="companyName"
            type="text"
            placeholder="Mi Agencia de Viajes"
            {...form.register("companyName")}
            disabled={loading}
            autoComplete="organization"
            required
          />
          {form.formState.errors.companyName && (
            <p className="text-sm text-destructive">{form.formState.errors.companyName.message}</p>
          )}
        </Field>
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
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input
            id="password"
            type="password"
            {...form.register("password")}
            disabled={loading}
            autoComplete="new-password"
            required
          />
          {form.formState.errors.password && (
            <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
          )}
        </Field>
        <Field>
          <div className="flex items-start gap-3">
            <Checkbox
              id="legalAccepted"
              checked={!!legalAcceptedValue}
              onCheckedChange={(v) =>
                form.setValue("legalAccepted", v === true, { shouldValidate: true })
              }
              disabled={loading}
              className="mt-0.5"
            />
            <label
              htmlFor="legalAccepted"
              className="text-sm leading-relaxed text-muted-foreground cursor-pointer"
            >
              Acepto los{" "}
              <a
                href={`${LANDING_BASE}/legal/terminos`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Términos y Condiciones
              </a>
              , la{" "}
              <a
                href={`${LANDING_BASE}/legal/privacidad`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Política de Privacidad
              </a>{" "}
              y la{" "}
              <a
                href={`${LANDING_BASE}/legal/cookies`}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Política de Cookies
              </a>
              .
            </label>
          </div>
          {form.formState.errors.legalAccepted && (
            <p className="text-sm text-destructive">
              {form.formState.errors.legalAccepted.message}
            </p>
          )}
        </Field>
        <Field>
          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? "Creando cuenta..."
              : wantsPro
                ? "Crear cuenta y conectar MercadoPago"
                : "Crear cuenta"}
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <a href="/login" className="text-primary underline-offset-4 hover:underline">
            Iniciar sesión
          </a>
        </p>
      </FieldGroup>
    </form>
  )
}
