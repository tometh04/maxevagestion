"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Settings2,
  Shield,
  AlertCircle,
  Info,
} from "lucide-react"

const afipSchema = z.object({
  agency_id: z.string().min(1, "Seleccioná una agencia"),
  cuit: z.string()
    .min(10, "El CUIT debe tener al menos 10 dígitos")
    .max(13, "CUIT inválido")
    .transform(v => v.replace(/\D/g, ''))
    .refine(v => v.length === 11, "El CUIT debe tener 11 dígitos"),
  password: z.string().min(1, "La Clave Fiscal es requerida"),
  punto_venta: z.coerce.number().min(1, "Mínimo 1").max(9999, "Máximo 9999"),
  environment: z.enum(["production", "sandbox"]),
})

type AfipFormValues = z.infer<typeof afipSchema>

interface AfipStatus {
  configured: boolean
  config?: {
    cuit: string
    environment: string
    punto_venta: number
  }
}

interface AfipSettingsProps {
  agencies: Array<{ id: string; name: string }>
  defaultAgencyId: string | null
}

export function AfipSettings({ agencies, defaultAgencyId }: AfipSettingsProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [afipStatus, setAfipStatus] = useState<AfipStatus | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [showReconfigureForm, setShowReconfigureForm] = useState(false)
  const [selectedAgencyId, setSelectedAgencyId] = useState(defaultAgencyId || agencies[0]?.id || "")
  const [setupError, setSetupError] = useState<{ message: string; steps?: { certificate: boolean; service: boolean } } | null>(null)

  const form = useForm<AfipFormValues>({
    resolver: zodResolver(afipSchema),
    defaultValues: {
      agency_id: selectedAgencyId,
      cuit: "",
      password: "",
      punto_venta: 1,
      environment: "production",
    },
  })

  const loadStatus = useCallback(async (agencyId: string) => {
    if (!agencyId) return
    setIsLoadingStatus(true)
    try {
      const response = await fetch(`/api/settings/afip/status?agencyId=${agencyId}`)
      if (response.ok) {
        const data = await response.json()
        setAfipStatus(data)
      }
    } catch (error) {
      console.error("Error loading AFIP status:", error)
    } finally {
      setIsLoadingStatus(false)
    }
  }, [])

  useEffect(() => {
    if (selectedAgencyId) {
      loadStatus(selectedAgencyId)
      form.setValue("agency_id", selectedAgencyId)
    }
  }, [selectedAgencyId, loadStatus, form])

  const onSubmit = async (values: AfipFormValues) => {
    setIsLoading(true)
    setSetupError(null)
    try {
      const response = await fetch("/api/settings/afip/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_id: values.agency_id,
          cuit: values.cuit,
          password: values.password,
          punto_venta: values.punto_venta,
          environment: values.environment,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        setSetupError({ message: data.error || "Error desconocido", steps: data.steps })
        toast({
          title: "Error al configurar AFIP",
          description: data.error || "Verificá tus datos y volvé a intentar",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "AFIP configurado exitosamente ✓",
        description: `Certificado creado y web service autorizado para CUIT ${data.config?.cuit}`,
      })

      setShowReconfigureForm(false)
      form.reset()
      await loadStatus(values.agency_id)
    } catch (error: any) {
      toast({
        title: "Error de conexión",
        description: error.message || "No se pudo conectar con el servidor",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    try {
      const response = await fetch(`/api/settings/afip/test?agencyId=${selectedAgencyId}`)
      const data = await response.json()
      if (data.success) {
        toast({
          title: "Conexión exitosa ✓",
          description: data.message || "AFIP responde correctamente",
        })
      } else {
        toast({
          title: "Error de conexión",
          description: data.error || data.message || "No se pudo conectar con AFIP",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "No se pudo probar la conexión",
        variant: "destructive",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const showForm = !afipStatus?.configured || showReconfigureForm

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Facturación Electrónica AFIP</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Conectá tu CUIT con el sistema de facturación electrónica de AFIP para emitir facturas directamente desde las operaciones.
        </p>
      </div>

      {/* Selector de agencia (si hay más de una) */}
      {agencies.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Agencia:</label>
          <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agencies.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Estado actual */}
      {isLoadingStatus ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Verificando configuración...</span>
            </div>
          </CardContent>
        </Card>
      ) : afipStatus?.configured && !showReconfigureForm ? (
        /* --- ESTADO: YA CONFIGURADO --- */
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <CardTitle className="text-base text-green-700 dark:text-green-400">AFIP Configurado</CardTitle>
              </div>
              <Badge variant="outline" className="border-green-600 text-green-700 dark:text-green-400">
                Activo
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">CUIT</span>
                <p className="font-mono font-medium mt-0.5">{afipStatus.config?.cuit}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Punto de Venta</span>
                <p className="font-medium mt-0.5">{afipStatus.config?.punto_venta}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Entorno</span>
                <p className="font-medium mt-0.5 capitalize">{afipStatus.config?.environment === 'production' ? 'Producción' : 'Sandbox'}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Probar Conexión
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReconfigureForm(true)}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Reconfigurar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* --- FORMULARIO DE CONFIGURACIÓN --- */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {showReconfigureForm ? "Reconfigurar AFIP" : "Configurar AFIP"}
            </CardTitle>
            <CardDescription>
              Ingresá los datos de tu empresa en AFIP. La Clave Fiscal se usa para crear el certificado digital de forma automática y <strong>no se almacena</strong> en el sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-6 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700 dark:text-blue-400 text-sm">
                El proceso crea automáticamente un certificado digital y autoriza el Web Service de Facturación (WSFE) en AFIP. Puede tardar hasta 2 minutos.
              </AlertDescription>
            </Alert>

            {/* Error inline con detalle para debug */}
            {setupError && (
              <Alert className="mb-6 border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700 dark:text-red-400 text-sm space-y-1">
                  <p className="font-medium">Error al configurar AFIP:</p>
                  <p className="font-mono text-xs bg-red-100 dark:bg-red-950 p-2 rounded">{setupError.message}</p>
                  {setupError.steps && (
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className={setupError.steps.certificate ? "text-green-600" : "text-red-600"}>
                        {setupError.steps.certificate ? "✓" : "✗"} Certificado
                      </span>
                      <span className={setupError.steps.service ? "text-green-600" : "text-red-600"}>
                        {setupError.steps.service ? "✓" : "✗"} Web Service
                      </span>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {/* Agency (hidden si hay una sola) */}
                <FormField
                  control={form.control}
                  name="agency_id"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* CUIT */}
                  <FormField
                    control={form.control}
                    name="cuit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CUIT de la Empresa</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="20-12345678-9"
                            className="font-mono"
                          />
                        </FormControl>
                        <FormDescription>11 dígitos sin guiones</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Punto de Venta */}
                  <FormField
                    control={form.control}
                    name="punto_venta"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Punto de Venta</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={1}
                            max={9999}
                            placeholder="1"
                          />
                        </FormControl>
                        <FormDescription>El habilitado en Web Services de AFIP</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Clave Fiscal */}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clave Fiscal AFIP</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            placeholder="Tu clave fiscal de AFIP"
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormDescription className="flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Solo se usa para crear el certificado. No se almacena.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Entorno */}
                <FormField
                  control={form.control}
                  name="environment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Entorno</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="production">Producción (facturas reales)</SelectItem>
                          <SelectItem value="sandbox">Sandbox (pruebas)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Configurando AFIP... (puede tardar ~2 min)
                      </>
                    ) : (
                      "Configurar AFIP"
                    )}
                  </Button>
                  {showReconfigureForm && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowReconfigureForm(false)}
                      disabled={isLoading}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Info adicional */}
      {!showForm && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Para usar la facturación, asegurate de que el Punto de Venta esté habilitado en AFIP bajo{" "}
            <strong>Mis aplicaciones y accesorios → Administrador de relaciones de clave fiscal → WSFE</strong>.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
