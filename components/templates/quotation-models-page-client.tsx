"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Check, Eye, FileClock, Loader2, Palette, Save, Send, Settings2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  createDefaultManifest,
  cloneQuotationJson,
  type QuotationBlockKind,
  type QuotationModelManifestV1,
} from "@/lib/quotation-documents"

interface Agency { id: string; name: string }
interface Layout { key: string; version: number; name: string; description: string; supports: QuotationBlockKind[] }
interface Revision {
  id: string
  model_id: string
  revision_number: number
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  manifest: QuotationModelManifestV1
  published_at: string | null
  updated_at: string
}
interface Model {
  id: string
  key: string
  name: string
  revisions: Revision[]
}
interface Workspace {
  agencies: Agency[]
  layouts: Layout[]
  models: Model[]
  activeRevisionId: string | null
}

const BLOCK_LABELS: Record<QuotationBlockKind, string> = {
  hero: "Portada y título",
  "trip-summary": "Resumen del viaje",
  "flight-options": "Opciones de vuelos",
  "hotel-options": "Opciones de alojamiento",
  "services-included": "Servicios incluidos",
  pricing: "Precios",
  itinerary: "Itinerario",
  recommendations: "Recomendaciones",
  restrictions: "Restricciones",
  "legal-terms": "Condiciones",
  "payment-schedule": "Cronograma de pagos",
  "advisor-signature": "Datos del asesor",
}

function selectEditableModel(workspace: Workspace) {
  const active = workspace.models.find(model => model.revisions.some(revision => revision.id === workspace.activeRevisionId))
  return active || workspace.models.find(model => model.revisions.some(revision => revision.status === "DRAFT")) || workspace.models[0] || null
}

function selectEditableRevision(model: Model | null, activeRevisionId: string | null) {
  if (!model) return null
  return model.revisions.find(revision => revision.status === "DRAFT")
    || model.revisions.find(revision => revision.id === activeRevisionId)
    || model.revisions[0]
    || null
}

async function responseJson(response: Response) {
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error || "No se pudo completar la operación")
  return json
}

export function QuotationModelsPageClient() {
  const [workspace, setWorkspace] = useState<Workspace>({ agencies: [], layouts: [], models: [], activeRevisionId: null })
  const [agencyId, setAgencyId] = useState("")
  const [modelId, setModelId] = useState<string | undefined>()
  const [modelName, setModelName] = useState("Modelo de cotización")
  const [manifest, setManifest] = useState<QuotationModelManifestV1>(() => createDefaultManifest("vibook-standard-v1"))
  const [draftRevisionId, setDraftRevisionId] = useState<string | null>(null)
  const [editingRevisionId, setEditingRevisionId] = useState<string | null>(null)
  const [editingRevisionUpdatedAt, setEditingRevisionUpdatedAt] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState("")
  const [previewPages, setPreviewPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRequestRef = useRef(0)
  const workspaceRequestRef = useRef(0)
  const previewRequestRef = useRef(0)

  const selectedAgency = workspace.agencies.find(agency => agency.id === agencyId)
  const editorLocked = saving || publishing || importing

  useEffect(() => {
    importRequestRef.current += 1
    setImporting(false)
    return () => { importRequestRef.current += 1 }
  }, [agencyId])

  async function importDesign(file: File) {
    if (!agencyId || editorLocked) return
    if (file.size > 10 * 1024 * 1024) { toast.error("El PDF debe pesar hasta 10 MB."); return }
    const requestId = ++importRequestRef.current
    setImporting(true)
    try {
      const data = new FormData()
      data.set("agency_id", agencyId)
      data.set("file", file)
      const json = await responseJson(await fetch("/api/quotation-document-models/import", { method: "POST", body: data }))
      if (requestId !== importRequestRef.current) return
      updateManifest(() => json.manifest)
      toast.success("Diseño interpretado. Revisá la vista previa y guardá el borrador.")
    } catch (error) {
      if (requestId === importRequestRef.current) toast.error(error instanceof Error ? error.message : "No se pudo interpretar el PDF")
    } finally {
      if (requestId === importRequestRef.current) setImporting(false)
    }
  }

  const loadWorkspace = useCallback(async (selectedAgencyId?: string) => {
    const requestId = ++workspaceRequestRef.current
    setLoading(true)
    try {
      const query = selectedAgencyId ? `?agency_id=${encodeURIComponent(selectedAgencyId)}` : ""
      const json = await responseJson(await fetch(`/api/quotation-document-models${query}`, { cache: "no-store" }))
      if (requestId !== workspaceRequestRef.current) return
      const next = json.data as Workspace
      setWorkspace(next)
      if (selectedAgencyId) {
        const model = selectEditableModel(next)
        const revision = selectEditableRevision(model, next.activeRevisionId)
        setModelId(model?.id)
        setModelName(model?.name || "Modelo de cotización")
        setManifest(revision?.manifest || createDefaultManifest("vibook-standard-v1"))
        setDraftRevisionId(revision?.status === "DRAFT" ? revision.id : null)
        setEditingRevisionId(revision?.id || null)
        setEditingRevisionUpdatedAt(revision?.updated_at || null)
        setDirty(false)
      }
    } catch (error) {
      if (requestId !== workspaceRequestRef.current) return
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los modelos")
    } finally {
      if (requestId === workspaceRequestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void loadWorkspace() }, [loadWorkspace])

  const updateManifest = useCallback((change: (current: QuotationModelManifestV1) => QuotationModelManifestV1) => {
    // Una respuesta de preview iniciada con el manifiesto anterior ya no debe
    // reemplazar la vista correspondiente al estado que el usuario está viendo.
    previewRequestRef.current += 1
    setManifest(current => change(cloneQuotationJson(current)))
    setDirty(true)
  }, [])

  const generatePreview = useCallback(async () => {
    if (!agencyId) return
    const requestId = ++previewRequestRef.current
    setPreviewing(true)
    try {
      const json = await responseJson(await fetch("/api/quotation-document-models/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency_id: agencyId, manifest }),
      }))
      if (requestId !== previewRequestRef.current) return
      setPreviewHtml(json.document.html)
      setPreviewPages(json.document.pageCount)
    } catch (error) {
      if (requestId !== previewRequestRef.current) return
      setPreviewHtml("")
      toast.error(error instanceof Error ? error.message : "No se pudo generar la vista previa")
    } finally {
      if (requestId === previewRequestRef.current) setPreviewing(false)
    }
  }, [agencyId, manifest])

  useEffect(() => {
    if (!agencyId) return
    const timeout = window.setTimeout(() => { void generatePreview() }, 450)
    return () => window.clearTimeout(timeout)
  }, [agencyId, generatePreview])

  const activeRevision = useMemo(() => {
    return workspace.models.flatMap(model => model.revisions).find(revision => revision.id === workspace.activeRevisionId) || null
  }, [workspace])

  async function saveDraft() {
    if (!agencyId) return
    setSaving(true)
    try {
      const json = await responseJson(await fetch("/api/quotation-document-models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_id: agencyId,
          model_id: modelId,
          expected_revision_id: editingRevisionId,
          expected_revision_updated_at: editingRevisionUpdatedAt,
          name: modelName,
          manifest,
        }),
      }))
      setModelId(json.data.model.id)
      setDraftRevisionId(json.data.revision.id)
      setEditingRevisionId(json.data.revision.id)
      setEditingRevisionUpdatedAt(json.data.revision.updated_at)
      setDirty(false)
      toast.success("Borrador guardado")
      await loadWorkspace(agencyId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el borrador")
    } finally {
      setSaving(false)
    }
  }

  async function publishDraft() {
    if (!draftRevisionId || !editingRevisionUpdatedAt || dirty) return
    setPublishing(true)
    try {
      await responseJson(await fetch("/api/quotation-document-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision_id: draftRevisionId,
          expected_revision_updated_at: editingRevisionUpdatedAt,
        }),
      }))
      toast.success("Modelo publicado para la agencia")
      await loadWorkspace(agencyId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo publicar el modelo")
    } finally {
      setPublishing(false)
    }
  }

  function changeLayout(layoutKey: string) {
    const base = createDefaultManifest(layoutKey)
    updateManifest(current => ({
      ...base,
      theme: { ...base.theme, ...current.theme },
      assets: { ...base.assets, logoPath: current.assets.logoPath },
      branding: { ...current.branding },
      copy: { ...base.copy, ...current.copy },
    }))
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Modelos de cotización</h1>
          <p className="text-sm text-muted-foreground">Definí el PDF que reciben los clientes de cada agencia.</p>
        </div>
        <div className="w-full lg:w-80">
          <Label htmlFor="quotation-model-agency" className="mb-2 block">Agencia</Label>
          <Select
            value={agencyId}
            disabled={editorLocked}
            onValueChange={(value) => {
              if (dirty && !window.confirm("Hay cambios sin guardar. ¿Querés descartarlos y cambiar de agencia?")) {
                return
              }
              previewRequestRef.current += 1
              setPreviewHtml("")
              setPreviewPages(0)
              setAgencyId(value)
              void loadWorkspace(value)
            }}
          >
            <SelectTrigger id="quotation-model-agency"><SelectValue placeholder="Seleccioná una agencia" /></SelectTrigger>
            <SelectContent>{workspace.agencies.map(agency => <SelectItem key={agency.id} value={agency.id}>{agency.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!agencyId ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <Settings2 className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="font-medium">Elegí la agencia que querés configurar</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Cada agencia mantiene su propia publicación. Cambiar una no modifica el PDF de las demás.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="h-fit xl:sticky xl:top-20">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{selectedAgency?.name}</CardTitle>
                  <CardDescription className="mt-1">{activeRevision ? `Publicada: revisión ${activeRevision.revision_number}` : "Todavía sin modelo publicado"}</CardDescription>
                </div>
                <Badge variant={draftRevisionId ? "secondary" : activeRevision ? "default" : "outline"}>
                  {draftRevisionId ? "Borrador" : activeRevision ? "Publicado" : "Nuevo"}
                </Badge>
              </div>
            </CardHeader>
            <Separator />
            <ScrollArea className="h-[calc(100vh-280px)] min-h-[520px]">
              <fieldset disabled={editorLocked} className="contents">
                <CardContent className="space-y-6 pt-5">
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium"><FileClock className="h-4 w-4" /> Modelo</div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="quotation-design-pdf">Usar un PDF como modelo</Label>
                      <Input id="quotation-design-pdf" type="file" accept="application/pdf,.pdf" disabled={editorLocked} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importDesign(file) }} />
                      <p className="text-xs text-muted-foreground">{importing ? "Interpretando el diseño…" : "Adaptamos el diseño y los colores al formato disponible más cercano. El logo y los datos corresponden a la agencia elegida."}</p>
                    </div>
                    <div className="space-y-2"><Label htmlFor="model-name">Nombre interno</Label><Input id="model-name" value={modelName} onChange={event => { setModelName(event.target.value); setDirty(true) }} /></div>
                    <div className="space-y-2"><Label>Diseño base</Label><Select value={manifest.layoutKey} onValueChange={changeLayout}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{workspace.layouts.map(layout => <SelectItem key={layout.key} value={layout.key}>{layout.name}</SelectItem>)}</SelectContent></Select></div>
                  </section>

                  <Separator />
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium"><Palette className="h-4 w-4" /> Identidad</div>
                    <div className="space-y-2"><Label htmlFor="branding-display-name">Nombre visible</Label><Input id="branding-display-name" value={manifest.branding.displayName || ""} placeholder={selectedAgency?.name} onChange={event => updateManifest(current => { current.branding.displayName = event.target.value || undefined; return current })} /></div>
                    <div className="space-y-2">
                      <Label htmlFor="branding-logo-path">Logo del PDF</Label>
                      <Input id="branding-logo-path" value={manifest.assets.logoPath || ""} placeholder="/quotation-models/mi-agencia/logo.png" onChange={event => updateManifest(current => { current.assets.logoPath = event.target.value || undefined; return current })} />
                      <p className="text-xs text-muted-foreground">Ruta interna del logo publicado para esta agencia.</p>
                    </div>
                    <div className="space-y-2"><Label htmlFor="branding-legal-name">Razón social</Label><Input id="branding-legal-name" value={manifest.branding.legalName || ""} onChange={event => updateManifest(current => { current.branding.legalName = event.target.value || undefined; return current })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      {(["primaryColor", "secondaryColor", "accentColor", "textColor"] as const).map((key) => (
                        <div key={key} className="space-y-2"><Label>{key === "primaryColor" ? "Primario" : key === "secondaryColor" ? "Secundario" : key === "accentColor" ? "Acento" : "Texto"}</Label><div className="flex gap-2"><Input type="color" className="h-9 w-12 p-1" value={manifest.theme[key]} onChange={event => updateManifest(current => { current.theme[key] = event.target.value; return current })} /><Input value={manifest.theme[key]} onChange={event => updateManifest(current => { current.theme[key] = event.target.value; return current })} /></div></div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label htmlFor="branding-phone">Teléfono</Label><Input id="branding-phone" value={manifest.branding.phone || ""} onChange={event => updateManifest(current => { current.branding.phone = event.target.value || undefined; return current })} /></div>
                      <div className="space-y-2"><Label htmlFor="branding-email">Email</Label><Input id="branding-email" type="email" value={manifest.branding.email || ""} onChange={event => updateManifest(current => { current.branding.email = event.target.value || undefined; return current })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label htmlFor="branding-website">Sitio web</Label><Input id="branding-website" type="url" value={manifest.branding.website || ""} placeholder="https://…" onChange={event => updateManifest(current => { current.branding.website = event.target.value || undefined; return current })} /></div>
                      <div className="space-y-2"><Label htmlFor="branding-instagram">Instagram</Label><Input id="branding-instagram" value={manifest.branding.instagram || ""} placeholder="@agencia" onChange={event => updateManifest(current => { current.branding.instagram = event.target.value || undefined; return current })} /></div>
                    </div>
                    <div className="space-y-2"><Label htmlFor="branding-address">Dirección</Label><Input id="branding-address" value={manifest.branding.address || ""} onChange={event => updateManifest(current => { current.branding.address = event.target.value || undefined; return current })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label htmlFor="branding-license">Legajo</Label><Input id="branding-license" value={manifest.branding.travelLicense || ""} onChange={event => updateManifest(current => { current.branding.travelLicense = event.target.value || undefined; return current })} /></div>
                      <div className="space-y-2"><Label htmlFor="branding-tax-id">CUIT</Label><Input id="branding-tax-id" value={manifest.branding.taxId || ""} onChange={event => updateManifest(current => { current.branding.taxId = event.target.value || undefined; return current })} /></div>
                    </div>
                  </section>

                  <Separator />
                  <section className="space-y-3">
                    <div className="text-sm font-medium">Textos fijos</div>
                    <div className="space-y-2"><Label>Título del documento</Label><Input value={manifest.copy.documentTitle} onChange={event => updateManifest(current => { current.copy.documentTitle = event.target.value; return current })} /></div>
                    <div className="space-y-2"><Label>Aviso de disponibilidad</Label><Textarea rows={2} value={manifest.copy.availabilityNote} onChange={event => updateManifest(current => { current.copy.availabilityNote = event.target.value; return current })} /></div>
                    <div className="space-y-2"><Label>Aclaración de precios</Label><Textarea rows={2} value={manifest.copy.priceDisclaimer || ""} onChange={event => updateManifest(current => { current.copy.priceDisclaimer = event.target.value || undefined; return current })} /></div>
                  </section>

                  <Separator />
                  <section className="space-y-3">
                    <div className="text-sm font-medium">Secciones visibles</div>
                    {manifest.blocks.map((block, index) => (
                      <div key={block.kind} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <Label htmlFor={`block-${block.kind}`} className="font-normal">{BLOCK_LABELS[block.kind]}</Label>
                        <Switch id={`block-${block.kind}`} checked={block.visible} onCheckedChange={checked => updateManifest(current => { current.blocks[index].visible = checked; return current })} />
                      </div>
                    ))}
                  </section>
                </CardContent>
              </fieldset>
            </ScrollArea>
            <Separator />
            <div className="grid grid-cols-2 gap-2 p-4">
              <Button variant="outline" onClick={saveDraft} disabled={editorLocked || loading || !modelName.trim()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar</Button>
              <Button onClick={publishDraft} disabled={editorLocked || loading || !draftRevisionId || dirty}>{publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Publicar</Button>
              {dirty && draftRevisionId && <p className="col-span-2 text-center text-xs text-muted-foreground">Guardá los cambios antes de publicar.</p>}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/30 py-4">
              <div className="flex items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4" /> Vista previa</CardTitle><CardDescription>{previewPages ? `${previewPages} páginas A4 con datos de ejemplo` : "Generando documento…"}</CardDescription></div>{previewing ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : previewHtml ? <Check className="h-5 w-5 text-success" /> : null}</div>
            </CardHeader>
            <CardContent className="overflow-auto bg-muted p-4 lg:p-6">
              {previewHtml ? <iframe title="Vista previa del modelo de cotización" srcDoc={`<style>html,body{margin:0;background:#e5e7eb}</style>${previewHtml}`} className="mx-auto block h-[calc(100vh-210px)] min-h-[720px] w-full max-w-[830px] rounded-md border bg-white shadow-sm" /> : <div className="flex min-h-[720px] items-center justify-center text-sm text-muted-foreground">Preparando la vista previa…</div>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
