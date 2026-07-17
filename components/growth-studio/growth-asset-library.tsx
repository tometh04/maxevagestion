"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Building2,
  Download,
  ImageIcon,
  ImagePlus,
  Loader2,
  Move,
  RefreshCw,
  Save,
  Sparkles,
  Upload,
} from "lucide-react"
import { AgencyContextSelector } from "@/components/growth-studio/agency-context-selector"
import { GenerationProgress } from "@/components/growth-studio/generation-progress"
import { useGrowthStudio } from "@/components/growth-studio/growth-studio-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { GrowthAssetDto, GrowthAssetLibraryDto } from "@/lib/growth-studio/asset-service"
import type { GrowthComposition } from "@/lib/growth-studio/composition-schema"

type LibraryState =
  | { status: "idle" | "loading"; data: GrowthAssetLibraryDto }
  | { status: "ready"; data: GrowthAssetLibraryDto }
  | { status: "error"; data: GrowthAssetLibraryDto; message: string }
type Format = "instagram_feed" | "instagram_story"
type Quality = "low" | "medium" | "high"
type OverlayKey = "headline" | "secondary" | "cta" | "logo"
type TextOverlayKey = Exclude<OverlayKey, "logo">

const emptyLibrary: GrowthAssetLibraryDto = { assets: [], logoUrl: null }
const defaultComposition: Omit<GrowthComposition, "backgroundAssetId"> = {
  format: "instagram_feed",
  overlays: {
    headline: { text: "Tu próxima aventura empieza acá", x: 0.08, y: 0.12, color: "#FFFFFF", size: "large", align: "left", visible: true },
    secondary: { text: "Descubrí una experiencia pensada para vos", x: 0.08, y: 0.32, color: "#FFFFFF", size: "medium", align: "left", visible: true },
    cta: { text: "Consultanos", x: 0.08, y: 0.78, color: "#FFFFFF", size: "medium", align: "left", visible: true },
  },
  logo: { assetId: null, x: 0.72, y: 0.08, size: "medium", visible: true },
}

export function GrowthAssetLibrary() {
  const { agencies } = useGrowthStudio()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const requestedAgencyId = searchParams.get("agencyId")
  const requestedAssetId = searchParams.get("assetId")
  const agencyId = agencies.some((agency) => agency.id === requestedAgencyId)
    ? requestedAgencyId ?? undefined
    : agencies.length === 1
      ? agencies[0].id
      : undefined
  const [state, setState] = React.useState<LibraryState>({ status: "idle", data: emptyLibrary })
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(requestedAssetId)
  const [busy, setBusy] = React.useState<"upload" | "logo" | "generate" | "save" | "export" | null>(null)
  const [visualDirection, setVisualDirection] = React.useState("")
  const [format, setFormat] = React.useState<Format>("instagram_feed")
  const [quality, setQuality] = React.useState<Quality>("medium")

  const load = React.useCallback(async () => {
    if (!agencyId) {
      setState({ status: "idle", data: emptyLibrary })
      return
    }
    setState((current) => ({ status: "loading", data: current.data }))
    try {
      const response = await fetch(`/api/growth-studio/assets?agencyId=${encodeURIComponent(agencyId)}`)
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo cargar la biblioteca")
      setState({ status: "ready", data: body.data })
      setSelectedAssetId((current) => {
        const preferred = requestedAssetId || current
        if (preferred && body.data.assets.some((asset: GrowthAssetDto) => asset.id === preferred)) return preferred
        return body.data.assets.find((asset: GrowthAssetDto) => asset.source !== "logo")?.id ?? null
      })
    } catch (error) {
      setState({ status: "error", data: emptyLibrary, message: error instanceof Error ? error.message : "No se pudo cargar la biblioteca" })
    }
  }, [agencyId, requestedAssetId])

  React.useEffect(() => {
    void load()
  }, [load])

  function changeAgency(nextAgencyId: string) {
    setSelectedAssetId(null)
    router.replace(`/growth-studio/library?agencyId=${encodeURIComponent(nextAgencyId)}`)
  }

  async function uploadFile(file: File, source: "upload" | "logo") {
    if (!agencyId) return
    setBusy(source === "logo" ? "logo" : "upload")
    const form = new FormData()
    form.set("agencyId", agencyId)
    form.set("campaignId", "")
    form.set("source", source)
    form.set("file", file)
    try {
      const response = await fetch("/api/growth-studio/assets", { method: "POST", body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo subir la imagen")
      if (source !== "logo") setSelectedAssetId(body.data.asset.id)
      await load()
      toast({ title: source === "logo" ? "Logo de agencia actualizado" : "Imagen agregada a la biblioteca" })
    } catch (error) {
      toast({ title: "No pudimos guardar la imagen", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function generateImage() {
    if (!agencyId || visualDirection.trim().length < 5) {
      toast({ title: "Describí la imagen que necesitás", variant: "destructive" })
      return
    }
    setBusy("generate")
    try {
      const response = await fetch("/api/growth-studio/assets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, campaignId: null, visualDirection, format, quality, idempotencyKey: crypto.randomUUID() }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo generar la imagen")
      setSelectedAssetId(body.data.asset.id)
      setVisualDirection("")
      await load()
      toast({ title: "Imagen generada", description: `${body.data.remaining} generaciones de imagen disponibles en las próximas 24 horas.` })
    } catch (error) {
      toast({ title: "No pudimos generar la imagen", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const selectedAsset = state.data.assets.find((asset) => asset.id === selectedAssetId) ?? null
  const editableAssets = state.data.assets.filter((asset) => asset.source !== "logo")
  const agencyLogoAsset = state.data.assets.find((asset) => asset.source === "logo") ?? null

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><ImageIcon className="h-4 w-4" />Growth Studio</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Biblioteca</h1>
          <p className="mt-1 text-sm text-muted-foreground">Generá, subí y componé piezas visuales para tu agencia.</p>
        </div>
        <AgencyContextSelector agencies={agencies} value={agencyId} onValueChange={changeAgency} disabled={Boolean(busy)} />
      </header>

      {!agencyId && (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center"><Building2 className="mx-auto h-9 w-9 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">Elegí una agencia</h2><p className="mt-2 text-sm text-muted-foreground">Cada agencia tiene su propia biblioteca y logo.</p></div>
      )}

      {agencyId && (
        <>
          <section className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">Generar fondo</h2></div>
              <p className="mt-1 text-sm text-muted-foreground">La imagen sale sin texto, logos ni marcas de agua para que puedas componerla.</p>
              <Textarea value={visualDirection} onChange={(event) => setVisualDirection(event.target.value)} maxLength={1200} rows={3} className="mt-4" placeholder="Ej. Playa del Caribe al amanecer, estilo editorial cálido, espacio libre a la izquierda" />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <SelectField label="Formato" value={format} onChange={(value) => setFormat(value as Format)} options={[{ value: "instagram_feed", label: "Feed cuadrado" }, { value: "instagram_story", label: "Story vertical" }]} />
                <SelectField label="Calidad" value={quality} onChange={(value) => setQuality(value as Quality)} options={[{ value: "low", label: "Baja" }, { value: "medium", label: "Media" }, { value: "high", label: "Alta" }]} />
                <Button className="sm:ml-auto" disabled={Boolean(busy)} onClick={() => void generateImage()}>{busy === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}Generar imagen</Button>
              </div>
              {busy === "generate" && <GenerationProgress kind="image" className="mt-5" />}
            </div>
            <div className="grid gap-3 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <FileAction label="Subir imagen" detail="PNG, JPEG o WebP hasta 10 MB" icon={<Upload className="h-4 w-4" />} loading={busy === "upload"} disabled={Boolean(busy)} onFile={(file) => void uploadFile(file, "upload")} />
              <FileAction label="Logo de la agencia" detail={state.data.logoUrl ? "Reemplazar logo actual" : "Agregar logo para las piezas"} icon={<ImageIcon className="h-4 w-4" />} loading={busy === "logo"} disabled={Boolean(busy)} onFile={(file) => void uploadFile(file, "logo")} />
            </div>
          </section>

          {state.status === "loading" && state.data.assets.length === 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="aspect-square animate-pulse rounded-xl bg-muted" />)}</div>}
          {state.status === "error" && <div className="rounded-2xl border bg-card px-6 py-12 text-center"><p className="font-medium">No pudimos cargar la biblioteca</p><p className="mt-1 text-sm text-muted-foreground">{state.message}</p><Button variant="outline" className="mt-5" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button></div>}
          {state.status === "ready" && editableAssets.length === 0 && <div className="rounded-2xl border bg-card px-6 py-12 text-center"><ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">Todavía no hay imágenes</h2><p className="mt-2 text-sm text-muted-foreground">Generá un fondo o subí una imagen para empezar.</p></div>}

          {editableAssets.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Imágenes</h2><p className="mt-1 text-sm text-muted-foreground">Elegí una para editarla.</p></div><span className="text-sm tabular-nums text-muted-foreground">{editableAssets.length}</span></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {editableAssets.map((asset) => (
                  <button key={asset.id} type="button" onClick={() => setSelectedAssetId(asset.id)} className={cn("group relative aspect-square overflow-hidden rounded-xl border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", asset.id === selectedAssetId && "border-primary ring-2 ring-primary")}>
                    {/* Signed private URLs are short-lived and never persisted in compositions. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.url} alt={asset.originalFileName || "Imagen de la biblioteca"} className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-medium text-white">{assetSourceLabel(asset.source)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {selectedAsset && (
            <CompositionEditor
              key={selectedAsset.id}
              agencyId={agencyId}
              asset={selectedAsset}
              logoAsset={agencyLogoAsset}
              logoUrl={state.data.logoUrl}
              busy={busy}
              onBusy={setBusy}
              onSaved={async (asset) => { setSelectedAssetId(asset.id); await load() }}
            />
          )}
        </>
      )}
    </div>
  )
}

function CompositionEditor({ agencyId, asset, logoAsset, logoUrl, busy, onBusy, onSaved }: { agencyId: string; asset: GrowthAssetDto; logoAsset: GrowthAssetDto | null; logoUrl: string | null; busy: string | null; onBusy: (value: "save" | "export" | null) => void; onSaved: (asset: GrowthAssetDto) => Promise<void> }) {
  const { toast } = useToast()
  const canvasRef = React.useRef<HTMLDivElement>(null)
  const [composition, setComposition] = React.useState<Omit<GrowthComposition, "backgroundAssetId">>(() => ({ ...defaultComposition, logo: { ...defaultComposition.logo, assetId: logoAsset?.id ?? null } }))
  const [active, setActive] = React.useState<OverlayKey>("headline")

  const updateTextOverlay = (key: TextOverlayKey, patch: Partial<GrowthComposition["overlays"][TextOverlayKey]>) => setComposition((current) => ({ ...current, overlays: { ...current.overlays, [key]: { ...current.overlays[key], ...patch } } }))
  const updateLogo = (patch: Partial<GrowthComposition["logo"]>) => setComposition((current) => ({ ...current, logo: { ...current.logo, ...patch } }))

  function moveOverlay(key: OverlayKey, x: number, y: number) {
    if (key === "logo") updateLogo({ x, y })
    else updateTextOverlay(key, { x, y })
  }

  async function renderComposition(): Promise<HTMLCanvasElement> {
    const node = canvasRef.current
    if (!node) throw new Error("No se pudo preparar la pieza")
    const html2canvas = (await import("html2canvas")).default
    const targetWidth = 1080
    return html2canvas(node, {
      backgroundColor: null,
      useCORS: true,
      allowTaint: false,
      scale: targetWidth / node.offsetWidth,
      logging: false,
    })
  }

  async function recordEvent(eventType: "edited" | "exported", assetId: string) {
    await fetch("/api/growth-studio/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agencyId, campaignId: asset.campaignId, assetId, eventType, payload: { format: composition.format } }) }).catch(() => undefined)
  }

  async function exportPiece() {
    onBusy("export")
    try {
      const canvas = await renderComposition()
      const link = document.createElement("a")
      link.download = `pieza-${composition.format}-${Date.now()}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
      void recordEvent("exported", asset.id)
      toast({ title: "Pieza exportada" })
    } catch (error) {
      toast({ title: "No pudimos exportar la pieza", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      onBusy(null)
    }
  }

  async function saveComposition() {
    onBusy("save")
    try {
      const canvas = await renderComposition()
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) throw new Error("No se pudo preparar la imagen")
      const metadata: GrowthComposition = { backgroundAssetId: asset.id, ...composition }
      const form = new FormData()
      form.set("agencyId", agencyId)
      form.set("campaignId", asset.campaignId || "")
      form.set("source", "composition")
      form.set("metadata", JSON.stringify(metadata))
      form.set("file", new File([blob], `composicion-${Date.now()}.png`, { type: "image/png" }))
      const response = await fetch("/api/growth-studio/assets", { method: "POST", body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo guardar la composición")
      await recordEvent("edited", body.data.asset.id)
      await onSaved(body.data.asset)
      toast({ title: "Composición guardada en la biblioteca" })
    } catch (error) {
      toast({ title: "No pudimos guardar la composición", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      onBusy(null)
    }
  }

  const activeText = active === "logo" ? null : composition.overlays[active]

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Move className="h-4 w-4 text-primary" /><h2 className="font-semibold">Componer pieza</h2></div><p className="mt-1 text-sm text-muted-foreground">Seleccioná un elemento y arrastralo. También podés moverlo con las flechas del teclado.</p></div><div className="flex gap-2"><Button variant="outline" disabled={Boolean(busy)} onClick={() => void saveComposition()}>{busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar</Button><Button disabled={Boolean(busy)} onClick={() => void exportPiece()}>{busy === "export" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Exportar PNG</Button></div></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(320px,560px)_minmax(280px,1fr)]">
        <div className="flex justify-center rounded-xl bg-muted/40 p-3 sm:p-6">
          <div ref={canvasRef} className={cn("relative w-full max-w-[520px] overflow-hidden bg-black shadow-lg", composition.format === "instagram_feed" ? "aspect-square" : "aspect-[9/16] max-w-[360px]")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt="Fondo de la composición" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/20" />
            {(Object.keys(composition.overlays) as TextOverlayKey[]).map((key) => {
              const overlay = composition.overlays[key]
              if (!overlay.visible) return null
              return <DraggableOverlay key={key} overlayKey={key} x={overlay.x} y={overlay.y} active={active === key} onActivate={() => setActive(key)} onMove={(x, y) => moveOverlay(key, x, y)} className={cn("max-w-[78%] whitespace-pre-wrap font-semibold drop-shadow-md", sizeClass(overlay.size), alignmentClass(overlay.align))} style={{ color: overlay.color }}>{overlay.text || textPlaceholder(key)}</DraggableOverlay>
            })}
            {composition.logo.visible && logoUrl && (
              <DraggableOverlay
                overlayKey="logo"
                x={composition.logo.x}
                y={composition.logo.y}
                active={active === "logo"}
                onActivate={() => setActive("logo")}
                onMove={(x, y) => moveOverlay("logo", x, y)}
                className={logoSizeClass(composition.logo.size)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Logo de la agencia"
                  crossOrigin="anonymous"
                  className="h-auto w-full object-contain drop-shadow"
                />
              </DraggableOverlay>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["headline", "secondary", "cta", "logo"] as OverlayKey[]).map((key) => <Button key={key} type="button" variant={active === key ? "default" : "outline"} size="sm" onClick={() => setActive(key)}>{overlayLabel(key)}</Button>)}
          </div>
          <div className="rounded-xl border p-4 sm:p-5">
            {activeText ? (
              <div className="space-y-4">
                <div><Label htmlFor="overlayText">Texto</Label><Textarea id="overlayText" value={activeText.text} onChange={(event) => updateTextOverlay(active as TextOverlayKey, { text: event.target.value })} rows={active === "secondary" ? 3 : 2} maxLength={active === "headline" ? 160 : active === "cta" ? 120 : 300} className="mt-2" /></div>
                <div className="grid grid-cols-2 gap-4"><SelectField label="Tamaño" value={activeText.size} onChange={(value) => updateTextOverlay(active as TextOverlayKey, { size: value as "small" | "medium" | "large" })} options={[{ value: "small", label: "Chico" }, { value: "medium", label: "Mediano" }, { value: "large", label: "Grande" }]} /><div><Label htmlFor="overlayColor">Color</Label><div className="mt-2 flex gap-2"><Input id="overlayColor" type="color" value={activeText.color} onChange={(event) => updateTextOverlay(active as TextOverlayKey, { color: event.target.value })} className="h-10 w-14 p-1" /><Input value={activeText.color} onChange={(event) => /^#[0-9a-fA-F]{0,6}$/.test(event.target.value) && updateTextOverlay(active as TextOverlayKey, { color: event.target.value })} aria-label="Color hexadecimal" /></div></div></div>
                <div><Label>Alineación</Label><div className="mt-2 flex gap-2">{(["left", "center", "right"] as const).map((align) => <Button key={align} type="button" size="icon" variant={activeText.align === align ? "default" : "outline"} onClick={() => updateTextOverlay(active as TextOverlayKey, { align })} aria-label={`Alinear ${align}`}>{align === "left" ? <AlignLeft className="h-4 w-4" /> : align === "center" ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}</Button>)}</div></div>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={activeText.visible} onCheckedChange={(value) => updateTextOverlay(active as TextOverlayKey, { visible: value === true })} />Mostrar este texto</label>
              </div>
            ) : (
              <div className="space-y-4"><SelectField label="Tamaño del logo" value={composition.logo.size} onChange={(value) => updateLogo({ size: value as "small" | "medium" | "large" })} options={[{ value: "small", label: "Chico" }, { value: "medium", label: "Mediano" }, { value: "large", label: "Grande" }]} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={composition.logo.visible} onCheckedChange={(value) => updateLogo({ visible: value === true })} disabled={!logoUrl} />Mostrar logo de la agencia</label>{!logoUrl && <p className="text-sm text-muted-foreground">Subí un logo para poder incluirlo en la pieza.</p>}</div>
            )}
          </div>
          <SelectField label="Formato de salida" value={composition.format} onChange={(value) => setComposition((current) => ({ ...current, format: value as Format }))} options={[{ value: "instagram_feed", label: "Instagram feed 1:1" }, { value: "instagram_story", label: "Instagram Story 9:16" }]} />
          <p className="text-xs leading-5 text-muted-foreground">La pieza exportada contiene únicamente tu imagen, tus textos y el logo de la agencia. Vibook no se incluye en el archivo.</p>
        </div>
      </div>
    </section>
  )
}

function DraggableOverlay({ overlayKey, x, y, active, onActivate, onMove, className, style, children }: { overlayKey: OverlayKey; x: number; y: number; active: boolean; onActivate: () => void; onMove: (x: number, y: number) => void; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    onActivate()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const parent = target.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const initialX = x
    const initialY = y
    function move(moveEvent: PointerEvent) {
      onMove(clamp(initialX + (moveEvent.clientX - startX) / rect.width), clamp(initialY + (moveEvent.clientY - startY) / rect.height))
    }
    function end() {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
      target.removeEventListener("pointercancel", end)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
    target.addEventListener("pointercancel", end)
  }
  function keyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.05 : 0.01
    const changes: Partial<Record<string, [number, number]>> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const change = changes[event.key]
    if (!change) return
    event.preventDefault()
    onMove(clamp(x + change[0]), clamp(y + change[1]))
  }
  return <div role="button" tabIndex={0} aria-label={`Mover ${overlayLabel(overlayKey)}`} onPointerDown={pointerDown} onKeyDown={keyDown} onFocus={onActivate} className={cn("absolute z-10 cursor-move touch-none select-none rounded-sm outline-none", active && "ring-2 ring-white ring-offset-2 ring-offset-black/30", className)} style={{ left: `${x * 100}%`, top: `${y * 100}%`, ...style }}>{children}</div>
}

function FileAction({ label, detail, icon, loading, disabled, onFile }: { label: string; detail: string; icon: React.ReactNode; loading: boolean; disabled: boolean; onFile: (file: File) => void }) {
  const id = React.useId()
  return <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50", disabled && "pointer-events-none opacity-60")}><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}</span><span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span><input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = "" }} /></label>
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  const id = React.useId()
  return <div className="min-w-36"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id} className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
}

function clamp(value: number) { return Math.max(0.02, Math.min(0.92, value)) }
function overlayLabel(key: OverlayKey) { return ({ headline: "Título", secondary: "Texto", cta: "CTA", logo: "Logo" } as const)[key] }
function textPlaceholder(key: TextOverlayKey) { return ({ headline: "Título", secondary: "Texto secundario", cta: "CTA" } as const)[key] }
function assetSourceLabel(source: string) { return ({ generated: "Generada", upload: "Subida", composition: "Composición" } as Record<string, string>)[source] ?? source }
function sizeClass(size: "small" | "medium" | "large") { return size === "small" ? "text-sm sm:text-base" : size === "medium" ? "text-lg sm:text-2xl" : "text-2xl sm:text-4xl" }
function logoSizeClass(size: "small" | "medium" | "large") { return size === "small" ? "w-[14%]" : size === "medium" ? "w-[22%]" : "w-[30%]" }
function alignmentClass(align: "left" | "center" | "right") { return align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right" }
