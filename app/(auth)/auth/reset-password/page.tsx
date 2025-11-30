"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, KeyRound } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [validSession, setValidSession] = useState(false)

  useEffect(() => {
    async function handleReset() {
      try {
        // Verificar si hay un hash en la URL (token de reset)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")
        const type = hashParams.get("type")

        if (type === "recovery" && accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (error) {
            console.error("Set session error:", error)
            setError("El enlace de recuperación ha expirado o es inválido. Solicitá uno nuevo.")
            setLoading(false)
            return
          }

          if (data.session) {
            setValidSession(true)
          }
        } else {
          // Verificar si ya hay una sesión activa (usuario logueado quiere cambiar contraseña)
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            setValidSession(true)
          } else {
            setError("Enlace de recuperación inválido o expirado. Solicitá uno nuevo desde el login.")
          }
        }
        
        setLoading(false)
      } catch (err) {
        console.error("Error handling reset:", err)
        setError("Error al procesar la solicitud")
        setLoading(false)
      }
    }

    handleReset()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validaciones
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden")
      return
    }

    // Validar fortaleza
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumbers = /\d/.test(password)
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      setError("La contraseña debe contener mayúsculas, minúsculas y números")
      return
    }

    setSubmitting(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        console.error("Update password error:", updateError)
        setError(updateError.message || "Error al actualizar la contraseña")
        setSubmitting(false)
        return
      }

      setSuccess(true)
      
      // Redirigir al login después de 2 segundos
      setTimeout(() => {
        router.push("/login")
      }, 2000)
    } catch (err: any) {
      console.error("Error resetting password:", err)
      setError(err.message || "Error al actualizar la contraseña")
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Verificando enlace...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">¡Contraseña actualizada!</h2>
            <p className="text-muted-foreground text-center">
              Redirigiendo al login...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!validSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-5 w-5" />
              Enlace Inválido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 space-y-2">
              <Button onClick={() => router.push("/forgot-password")} className="w-full">
                Solicitar Nuevo Enlace
              </Button>
              <Button onClick={() => router.push("/login")} variant="outline" className="w-full">
                Volver al Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Nueva Contraseña</CardTitle>
          <CardDescription>
            Ingresá tu nueva contraseña
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetí la contraseña"
                required
              />
            </div>

            {/* Requisitos de contraseña */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p className={password.length >= 8 ? "text-green-500" : ""}>
                ✓ Mínimo 8 caracteres
              </p>
              <p className={/[A-Z]/.test(password) ? "text-green-500" : ""}>
                ✓ Al menos una mayúscula
              </p>
              <p className={/[a-z]/.test(password) ? "text-green-500" : ""}>
                ✓ Al menos una minúscula
              </p>
              <p className={/\d/.test(password) ? "text-green-500" : ""}>
                ✓ Al menos un número
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Actualizando...
                </>
              ) : (
                "Actualizar Contraseña"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

