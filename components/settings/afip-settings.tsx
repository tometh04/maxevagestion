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
  Circle,
  ExternalLink,
} from "lucide-react"

// Schema fijo con cuit y password como strings (pueden estar vacíos).
// Si el sistema tiene env vars configuradas no son requeridos;
// esa validación se hace en runtime en onSubmit.
const afipSchema = z.object({
  agency_id: z.string().min(1, "Seleccioná una agencia"),
  cuit: z.string(),
  password: z.string(),
  punto_venta: z.coerce.number().min(1, "Mínimo 1").max(9999, "Máximo 9999"),
  environment: z.enum(["production", "sandbox"]),
})

type AfipFormValues = z.infer<typeof afipSchema>

type SetupStep =
  | "creating_cert"
  | "waiting_cert"
  | "authorizing"
  | "waiting_auth"
  | "saving"
  | null

const STEP_LABELS: Record<NonNullable<SetupStep>, string> = {
  creating_cert: "Iniciando creación de certificado...",
  waiting_cert: "Creando certificado digital en AFIP (puede tardar hasta 2 min)...",
  authorizing: "Iniciando autorización del Web Service...",
  waiting_auth: "Autorizando WSFE en AFIP (puede tardar hasta 2 min)...",
  saving: "Guardando configuración...",
}

interface AfipStatus {
  configured: boolean
  has_cert?: boolean
  config?: {
    cuit: string
    environment: string
    punto_venta: number
  }
}

interface PointOfSale {
  numero: number
  tipo: string
}

interface PosStatus {
  checking: boolean
  // null = aún no chequeado, true = habilitados, false = ninguno habilitado
  has_ws_points: boolean | null
  points: PointOfSale[]
  // Error "técnico" (no la ausencia de POS). Ej. cert inválido, timeout.
  error: string | null
}

interface AfipSettingsProps {
  agencies: Array<{ id: string; name: string }>
  defaultAgencyId: string | null
}

/** Polling de una automatización AFIP SDK desde el cliente */
async function pollAutomation(
  automationId: string,
  maxAttempts = 80,
  intervalMs = 3000
): Promise<{ success: boolean; result?: any; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))
    try {
      const res = await fetch(`/api/settings/afip/automation?automation_id=${automationId}`)
      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error || `Error ${res.status}` }
      if (data.status === "completed") return { success: true, result: data.result }
      if (data.status === "failed")
        return { success: false, error: data.error || "La automatización falló en AFIP" }
      // pending / in_process → seguir esperando
    } catch {
      // error transitorio, seguir intentando
    }
  }
  return { success: false, error: "Tiempo de espera agotado (4 minutos). Verificá tu CUIT y Clave Fiscal." }
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
  const [setupError, setSetupError] = useState<{ message: string; isWsfe?: boolean } | null>(null)
  const [setupStep, setSetupStep] = useState<SetupStep>(null)
  const [certStepDone, setCertStepDone] = useState(false)
  const [posStatus, setPosStatus] = useState<PosStatus>({
    checking: false,
    has_ws_points: null,
    points: [],
    error: null,
  })

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

  // Chequea puntos de venta habilitados para WSFE contra AFIP (via SDK).
  // Llamarlo cuando la agencia tenga cert instalado. Resultado determina si
  // mostramos el banner-tutorial "habilitá WSFE en afip.gob.ar" o el estado
  // "Activo".
  //
  // Bug #18: si el PV persistido (default 1 al setup) NO está en la lista
  // que devuelve FEParamGetPtosVenta pero hay alguno detectado, lo alineamos
  // automáticamente al primero detectado para que "Probar Conexión" funcione
  // sin que el usuario tenga que reconfigurar manualmente.
  const checkPointsOfSale = useCallback(async (agencyId: string) => {
    if (!agencyId) return
    setPosStatus(prev => ({ ...prev, checking: true, error: null }))
    try {
      const res = await fetch(`/api/invoices/points-of-sale?agencyId=${agencyId}`)
      const data = await res.json()
      if (!res.ok) {
        setPosStatus({
          checking: false,
          has_ws_points: null,
          points: [],
          error: data.error || `Error ${res.status}`,
        })
        return
      }
      const agencyData = ((data.pointsOfSale as any[]) || []).find(
        (p: any) => p.agency_id === agencyId
      )
      if (!agencyData) {
        setPosStatus({ checking: false, has_ws_points: null, points: [], error: null })
        return
      }
      const detectedPoints = (agencyData.points_of_sale || []) as PointOfSale[]
      const persistedPv = agencyData.default_point_of_sale as number | null | undefined

      // Bug #18: auto-fix mismatch entre PV guardado y PVs detectados
      if (
        detectedPoints.length > 0 &&
        persistedPv != null &&
        !detectedPoints.some((p) => p.numero === persistedPv)
      ) {
        const newPv = detectedPoints[0].numero
        try {
          const fixRes = await fetch("/api/settings/afip/update-punto-venta", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agency_id: agencyId, punto_venta: newPv }),
          })
          if (fixRes.ok) {
            toast({
              title: "Punto de venta alineado",
              description: `AFIP solo habilita el #${newPv} para WSFE — actualizamos tu config (antes #${persistedPv}).`,
            })
            // Refrescar status para que la UI muestre el nuevo PV
            await loadStatus(agencyId)
          }
        } catch {
          // No bloqueamos si falla el auto-fix; el usuario puede reconfigurar
        }
      }

      setPosStatus({
        checking: false,
        has_ws_points: !!agencyData.has_ws_points,
        points: detectedPoints,
        error: agencyData._debug_error || null,
      })
    } catch (err: any) {
      setPosStatus({
        checking: false,
        has_ws_points: null,
        points: [],
        error: err?.message || "Error de red al chequear puntos de venta",
      })
    }
  }, [loadStatus, toast])

  useEffect(() => {
    if (selectedAgencyId) {
      loadStatus(selectedAgencyId)
      form.setValue("agency_id", selectedAgencyId)
    }
  }, [selectedAgencyId, loadStatus, form])

  // Auto-chequear POS cuando la agencia ya tiene cert instalado. Si el tenant
  // cerró la pestaña entre "setup" y "habilitar WSFE en afip.gob.ar", al volver
  // vemos configured=true pero sin POS WSFE → mostramos el banner-tutorial.
  useEffect(() => {
    if (
      selectedAgencyId &&
      afipStatus?.configured &&
      afipStatus?.has_cert &&
      !showReconfigureForm
    ) {
      checkPointsOfSale(selectedAgencyId)
    }
  }, [selectedAgencyId, afipStatus?.configured, afipStatus?.has_cert, showReconfigureForm, checkPointsOfSale])

  const onSubmit = async (values: AfipFormValues) => {
    // Validación runtime de campos requeridos (siempre, post-SaaS)
    if (!values.cuit?.trim()) {
      form.setError("cuit", { message: "El CUIT es requerido" })
      return
    }
    if (!values.password?.trim()) {
      form.setError("password", { message: "La Clave Fiscal es requerida" })
      return
    }

    setIsLoading(true)
    setSetupError(null)
    setCertStepDone(false)

    const cuitForParams = (values.cuit || "").replace(/\D/g, "")
    const alias = `cert${cuitForParams}`.replace(/[^a-zA-Z0-9]/g, "")
    const certType = values.environment === "sandbox" ? "create-cert-dev" : "create-cert-prod"
    const authType =
      values.environment === "sandbox" ? "auth-web-service-dev" : "auth-web-service-prod"

    try {
      // ── PASO 1: Iniciar creación de certificado ──────────────────────
      setSetupStep("creating_cert")
      const certStartRes = await fetch("/api/settings/afip/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation: certType,
          params: {
            // Enviamos los valores del form; el backend los sobreescribe con env vars si existen
            cuit: cuitForParams,
            username: cuitForParams,
            password: values.password || "",
            alias,
          },
        }),
      })
      const certStart = await certStartRes.json()
      if (!certStartRes.ok) {
        throw new Error(certStart.error || "Error al crear certificado")
      }

      // ── PASO 2: Esperar que el certificado esté listo ────────────────
      setSetupStep("waiting_cert")
      const certResult = await pollAutomation(certStart.automation_id)
      if (!certResult.success) {
        throw new Error(certResult.error || "Error al crear certificado")
      }
      setCertStepDone(true)

      // ── PASO 3: Iniciar autorización del Web Service ─────────────────
      setSetupStep("authorizing")
      const authStartRes = await fetch("/api/settings/afip/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation: authType,
          params: {
            cuit: cuitForParams,
            username: cuitForParams,
            password: values.password || "",
            alias,
            service: "wsfe",
          },
        }),
      })
      const authStart = await authStartRes.json()
      if (!authStartRes.ok) {
        throw new Error(authStart.error || "Error al autorizar servicio")
      }

      // ── PASO 4: Esperar autorización ─────────────────────────────────
      setSetupStep("waiting_auth")
      const authResult = await pollAutomation(authStart.automation_id)
      if (!authResult.success) {
        // Si AFIP devuelve un error relacionado a WSFE (servicio no adherido,
        // permisos faltantes), mostramos el banner-tutorial para que la agencia
        // lo habilite en afip.gob.ar y vuelva con "Volver a chequear".
        const errMsg = authResult.error || "Error al autorizar WSFE en AFIP"
        const isWsfeIssue = /wsfe|web\s*service|servicio|autoriz|adher|relaci|permiso/i.test(errMsg)
        if (isWsfeIssue) {
          setSetupError({ message: errMsg, isWsfe: true })
          // Simulamos estado "cert creado pero WSFE pendiente" para que el
          // banner-tutorial se renderice igual que cuando la pestaña se cierra
          // y se vuelve. Guardamos la config parcial (sin cert del WS aún no
          // se puede facturar, pero el tenant ve el estado correcto).
          setPosStatus({ checking: false, has_ws_points: false, points: [], error: null })
          return
        }
        throw new Error(errMsg)
      }

      // ── PASO 5: Guardar config en DB ─────────────────────────────────
      setSetupStep("saving")
      // afipsdk.com puede devolver cert en result.cert_data, result, o directamente
      const certData = certResult.result?.cert_data || certResult.result
      const saveRes = await fetch("/api/settings/afip/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_id: values.agency_id,
          cuit: cuitForParams,
          punto_venta: values.punto_venta,
          environment: values.environment,
          cert_id: certData?.cert_id || certData?.id,
          // Pasar cert y key para que el SDK pueda autenticar con AFIP
          cert: certData?.cert || certData?.certificate || undefined,
          key: certData?.key || certData?.private_key || undefined,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) {
        throw new Error(saveData.error || "Error al guardar configuración")
      }

      toast({
        title: "AFIP configurado exitosamente ✓",
        description: "Certificado creado y WSFE autorizado correctamente.",
      })
      setShowReconfigureForm(false)
      form.reset()
      await loadStatus(values.agency_id)

      // Post-setup: chequear POS habilitados. Si no hay ninguno WSFE, el
      // banner-tutorial se encarga de guiar al tenant a afip.gob.ar — es
      // el mismo componente que se muestra al volver de habilitar WSFE.
      await checkPointsOfSale(values.agency_id)
    } catch (err: any) {
      setSetupError({ message: err.message || "Error desconocido" })
    } finally {
      setIsLoading(false)
      setSetupStep(null)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    try {
      const response = await fetch(`/api/settings/afip/test?agencyId=${selectedAgencyId}`)
      const data = await response.json()
      if (data.success) {
        toast({ title: "Conexión exitosa ✓", description: data.message || "AFIP responde correctamente" })
      } else {
        toast({
          title: "Error de conexión",
          description: data.error || data.message || "No se pudo conectar con AFIP",
          variant: "destructive",
        })
      }
    } catch {
      toast({ title: "Error", description: "No se pudo probar la conexión", variant: "destructive" })
    } finally {
      setIsTesting(false)
    }
  }

  // Cert is needed if configured but has_cert is explicitly false
  const needsRecert = afipStatus?.configured && afipStatus?.has_cert === false && !showReconfigureForm
  // WSFE pendiente = cert listo en nuestra DB pero el CUIT no tiene punto de venta
  // habilitado para Web Service en AFIP. El tenant tiene que habilitarlo en
  // afip.gob.ar y después tocar "Volver a chequear".
  const needsWsfe =
    (afipStatus?.configured && afipStatus?.has_cert && posStatus.has_ws_points === false) ||
    (setupError?.isWsfe === true)
  const showForm = (!afipStatus?.configured || showReconfigureForm) && !needsWsfe

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
          <Settings2 className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Facturación Electrónica AFIP</h2>
          <p className="text-sm text-muted-foreground">
            Conectá tu CUIT con el sistema de facturación electrónica de AFIP para emitir facturas
            directamente desde las operaciones.
          </p>
        </div>
      </div>

      {/* Selector de agencia */}
      {agencies.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Agencia:</label>
          <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agencies.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Estado actual */}
      {isLoadingStatus ? (
        <div className="rounded-xl border border-border/40 bg-muted/20 p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Verificando configuración...</span>
          </div>
        </div>
      ) : needsWsfe ? (
        <WsfePendingBanner
          cuit={afipStatus?.config?.cuit || form.getValues("cuit") || ""}
          errorHint={setupError?.isWsfe ? setupError.message : posStatus.error}
          checking={posStatus.checking}
          onRecheck={() => {
            setSetupError(null)
            checkPointsOfSale(selectedAgencyId)
          }}
          onReconfigure={() => {
            setSetupError(null)
            setPosStatus({ checking: false, has_ws_points: null, points: [], error: null })
            setShowReconfigureForm(true)
          }}
        />
      ) : afipStatus?.configured && !showReconfigureForm ? (
        <div className={`rounded-xl border p-4 space-y-4 ${needsRecert
          ? "border-accent-coral bg-accent-coral/10"
          : "border-success/15 bg-success/50 dark:border-success dark:bg-success/20"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {needsRecert
                ? <AlertCircle className="h-5 w-5 text-accent-coral" />
                : <CheckCircle2 className="h-5 w-5 text-success" />
              }
              <h4 className={`text-sm font-semibold ${needsRecert ? "text-accent-coral" : "text-success"}`}>
                {needsRecert ? "AFIP: Certificado pendiente" : "AFIP Configurado"}
              </h4>
            </div>
            <Badge
              variant="outline"
              className={needsRecert
                ? "border-accent-coral text-accent-coral"
                : "border-success text-success"
              }
            >
              {needsRecert ? "Incompleto" : "Activo"}
            </Badge>
          </div>
            {needsRecert && (
              <Alert className="border-accent-coral bg-accent-coral/10">
                <AlertCircle className="h-4 w-4 text-accent-coral" />
                <AlertDescription className="text-accent-coral text-sm">
                  Falta el certificado digital. Hacé clic en <strong>Reconfigurar</strong> para crear el certificado e ingresar tu Clave Fiscal.
                </AlertDescription>
              </Alert>
            )}
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
                <p className="font-medium mt-0.5 capitalize">
                  {afipStatus.config?.environment === "production" ? "Producción" : "Sandbox"}
                </p>
              </div>
            </div>
            {/* Lista de puntos de venta WSFE detectados en AFIP (cuando los hay) */}
            {posStatus.has_ws_points && posStatus.points.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Puntos de venta WSFE detectados: </span>
                {posStatus.points.map(p => `#${p.numero} (${p.tipo})`).join(", ")}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              {!needsRecert && (
                <>
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
                    variant="outline"
                    size="sm"
                    onClick={() => checkPointsOfSale(selectedAgencyId)}
                    disabled={posStatus.checking}
                  >
                    {posStatus.checking ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Re-chequear puntos de venta
                  </Button>
                </>
              )}
              <Button
                variant={needsRecert ? "default" : "ghost"}
                size="sm"
                onClick={() => setShowReconfigureForm(true)}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Reconfigurar
              </Button>
            </div>
        </div>
      ) : null}

      {/* Formulario de configuración */}
      {showForm && (
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
              {showReconfigureForm ? "Reconfigurar AFIP" : "Configurar AFIP"}
            </h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Ingresá los datos de AFIP. La Clave Fiscal se usa solo para crear el certificado y no se almacena.
          </p>
            <Alert className="mb-6 border-accent-teal bg-accent-teal/10">
              <Info className="h-4 w-4 text-accent-teal" />
              <AlertDescription className="text-accent-teal text-sm">
                El proceso crea automáticamente un certificado digital y autoriza el Web Service de
                Facturación (WSFE) en AFIP. Puede tardar hasta 2 minutos.
              </AlertDescription>
            </Alert>

            {/* Progreso del setup */}
            {isLoading && setupStep && (
              <div className="mb-6 p-4 rounded-lg border bg-muted/30 space-y-3">
                <p className="text-sm font-medium">Configurando AFIP...</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    {certStepDone ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    ) : setupStep === "creating_cert" || setupStep === "waiting_cert" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={certStepDone ? "text-success line-through" : ""}>
                      Crear certificado digital
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {setupStep === "waiting_auth" || setupStep === "saving" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span>Autorizar Web Service WSFE</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{STEP_LABELS[setupStep]}</p>
              </div>
            )}

            {/* Error inline */}
            {setupError && (
              <Alert className="mb-6 border-destructive bg-destructive/10">
                <XCircle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-destructive text-sm space-y-1">
                  <p className="font-medium">Error al configurar AFIP:</p>
                  <p className="font-mono text-xs bg-destructive/10 p-2 rounded break-all">
                    {setupError.message}
                  </p>
                  {certStepDone && (
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-success">✓ Certificado creado</span>
                      <span className="text-destructive">✗ Web Service</span>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {/* Agency (oculto) */}
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
                  <FormField
                    control={form.control}
                    name="cuit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CUIT de la Empresa</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="20-12345678-9" className="font-mono" />
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
                          <Input {...field} type="number" min={1} max={9999} placeholder="1" />
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
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
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
                      {/* Bug #13b: tenía defaultValue={field.value} que hacía
                          al Select uncontrolled — el valor visual cambiaba
                          pero form.state seguía en "production", así que al
                          submit se mandaba siempre Producción aunque el user
                          hubiera elegido Sandbox. Cambiado a controlled. */}
                      <Select onValueChange={field.onChange} value={field.value}>
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
                        Configurando AFIP...
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
        </div>
      )}

    </div>
  )
}

/**
 * Banner persistente para cuando el cert está listo pero falta habilitar un
 * punto de venta WSFE en afip.gob.ar. Sustituye al toast efímero anterior: el
 * tenant puede cerrar la pestaña, ir a AFIP (puede tardar minutos), volver, y
 * este banner sigue acá con los pasos + botón "Volver a chequear".
 */
interface WsfePendingBannerProps {
  cuit: string
  errorHint: string | null
  checking: boolean
  onRecheck: () => void
  onReconfigure: () => void
}

function WsfePendingBanner({
  cuit,
  errorHint,
  checking,
  onRecheck,
  onReconfigure,
}: WsfePendingBannerProps) {
  return (
    <div className="rounded-xl border border-accent-coral bg-accent-coral/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-accent-coral" />
          <h4 className="text-sm font-semibold text-accent-coral">
            Falta habilitar WSFE en AFIP
          </h4>
        </div>
        <Badge variant="outline" className="border-accent-coral text-accent-coral">
          Paso 2 de 2
        </Badge>
      </div>

      <p className="text-sm text-foreground/80">
        El certificado digital se creó correctamente. Para poder facturar, tu CUIT{" "}
        {cuit && <span className="font-mono font-medium">{cuit}</span>} necesita tener un
        <strong> punto de venta habilitado para Web Services (WSFE)</strong> en AFIP.
        Seguí estos pasos y después volvé acá.
      </p>

      {errorHint && (
        <div className="text-xs bg-destructive/5 border border-destructive/30 rounded p-2 text-destructive font-mono break-all">
          {errorHint}
        </div>
      )}

      <ol className="space-y-3 text-sm list-decimal ml-5 marker:text-accent-coral marker:font-semibold">
        <li>
          Entrá a{" "}
          <a
            href="https://auth.afip.gob.ar/contribuyente_/login.xhtml"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline inline-flex items-center gap-1"
          >
            auth.afip.gob.ar <ExternalLink className="h-3 w-3" />
          </a>{" "}
          con tu CUIT y Clave Fiscal.
        </li>
        <li>
          Si no lo adheriste nunca: <strong>Administrador de Relaciones de Clave Fiscal</strong>{" "}
          → <strong>Nueva Relación</strong> → buscá y adherí{" "}
          <em>&quot;Administración de Puntos de Venta y Domicilios&quot;</em>.
        </li>
        <li>
          Entrá al servicio <strong>Administración de Puntos de Venta y Domicilios</strong>,
          seleccioná tu empresa y hacé clic en <strong>A/B/M de Puntos de Venta</strong>.
        </li>
        <li>
          <strong>Agregar</strong> → elegí un tipo que incluya &quot;Web Services&quot; (p.ej.{" "}
          <em>&quot;RECE para aplicativo y web services&quot;</em> o{" "}
          <em>&quot;Factura Electrónica Monotributo - Web Services&quot;</em> según tu régimen).
          Completá los datos del domicilio fiscal y confirmá.
        </li>
        <li>
          Volvé acá y tocá <strong>Volver a chequear</strong>. Si el punto de venta aparece,
          la agencia ya puede facturar.
        </li>
      </ol>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={onRecheck} disabled={checking}>
          {checking ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Volver a chequear
        </Button>
        <Button variant="ghost" onClick={onReconfigure} disabled={checking}>
          <Settings2 className="h-4 w-4 mr-2" />
          Reconfigurar desde cero
        </Button>
      </div>
    </div>
  )
}
