"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Check,
  Copy,
  ImagePlus,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"
import { GenerationProgress } from "@/components/growth-studio/generation-progress"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import {
  campaignConceptsOutputSchema,
  channelAdaptationsSchema,
  type CampaignConcept,
  type ChannelAdaptations,
} from "@/lib/growth-studio/campaign-schema"
import type { CampaignDetailsDto } from "@/lib/growth-studio/campaign-service"

type LoadState =
  | { status: "loading"; campaign: null; message?: never }
  | { status: "ready"; campaign: CampaignDetailsDto; message?: never }
  | { status: "error"; campaign: null; message: string }

type PendingAction = "concepts" | "selection" | "channels" | "image" | null
type ImageQuality = "low" | "medium" | "high"

export function GrowthCampaignDetail({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const agencyId = searchParams.get("agencyId")
  const { toast } = useToast()
  const [state, setState] = React.useState<LoadState>({ status: "loading", campaign: null })
  const [pending, setPending] = React.useState<PendingAction>(null)
  const [quality, setQuality] = React.useState<ImageQuality>("medium")

  const load = React.useCallback(async () => {
    if (!agencyId) {
      setState({ status: "error", campaign: null, message: "Falta seleccionar la agencia" })
      return
    }
    try {
      const response = await fetch(
        `/api/growth-studio/campaigns/${campaignId}?agencyId=${encodeURIComponent(agencyId)}`
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo cargar la campaña")
      setState({ status: "ready", campaign: body.data.campaign })
    } catch (error) {
      setState({
        status: "error",
        campaign: null,
        message: error instanceof Error ? error.message : "No se pudo cargar la campaña",
      })
    }
  }, [agencyId, campaignId])

  React.useEffect(() => {
    void load()
  }, [load])

  async function postAction(path: string, action: Exclude<PendingAction, null>) {
    if (!agencyId) return
    setPending(action)
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, idempotencyKey: crypto.randomUUID() }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo completar la generación")
      await load()
      toast({
        title: action === "concepts" ? "Tres conceptos listos" : "Adaptaciones listas",
        description: `${body.data.remaining} generaciones de texto disponibles en las próximas 24 horas.`,
      })
    } catch (error) {
      toast({
        title: "No pudimos generar el contenido",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setPending(null)
    }
  }

  async function selectConcept(index: number) {
    if (!agencyId) return
    setPending("selection")
    try {
      const response = await fetch(`/api/growth-studio/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, conceptIndex: index }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo elegir el concepto")
      await load()
      toast({ title: `Concepto ${index} seleccionado` })
    } catch (error) {
      toast({
        title: "No pudimos guardar la selección",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
    } finally {
      setPending(null)
    }
  }

  async function generateImage(visualDirection: string, format: "instagram_feed" | "instagram_story") {
    if (!agencyId) return
    setPending("image")
    try {
      const response = await fetch("/api/growth-studio/assets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          campaignId,
          visualDirection,
          format,
          quality,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "No se pudo generar la imagen")
      router.push(
        `/growth-studio/library?agencyId=${encodeURIComponent(agencyId)}&assetId=${encodeURIComponent(body.data.asset.id)}`
      )
    } catch (error) {
      toast({
        title: "No pudimos generar la imagen",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      })
      setPending(null)
    }
  }

  async function recordEvent(eventType: "copied" | "rated", payload: Record<string, unknown>) {
    if (!agencyId) return
    await fetch("/api/growth-studio/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agencyId, campaignId, assetId: null, eventType, payload }),
    }).catch(() => undefined)
  }

  async function copyContent(channel: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      void recordEvent("copied", { channel })
      toast({ title: "Contenido copiado" })
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" })
    }
  }

  if (state.status === "loading") return <DetailSkeleton />
  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border bg-card px-6 py-14 text-center">
        <h1 className="text-lg font-semibold">No pudimos abrir la campaña</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <Button variant="outline" className="mt-5" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reintentar
        </Button>
      </div>
    )
  }

  const campaign = state.campaign
  const conceptRevision = [...campaign.revisions]
    .filter((revision) => revision.kind === "concepts")
    .sort((a, b) => b.version - a.version)[0]
  const conceptsResult = campaignConceptsOutputSchema.safeParse(conceptRevision?.payload)
  const concepts = conceptsResult.success ? conceptsResult.data.variants : []
  const channelRevision = [...campaign.revisions]
    .filter((revision) => revision.kind === "channels")
    .sort((a, b) => b.version - a.version)[0]
  const channelsResult = channelAdaptationsSchema.safeParse(channelRevision?.payload)
  const adaptations =
    campaign.status === "CHANNELS_READY" && channelsResult.success
      ? channelsResult.data
      : null

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href={`/growth-studio/campaigns?agencyId=${encodeURIComponent(agencyId ?? "")}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Campañas
            </Link>
          </Button>
          <p className="text-sm font-medium text-primary">Growth Studio</p>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{campaign.brief.objective}</p>
        </div>
        <div className="flex items-center gap-3">
          {adaptations && (
            <div className="w-36">
              <Label htmlFor="imageQuality" className="text-xs text-muted-foreground">Calidad de imagen</Label>
              <Select value={quality} onValueChange={(value) => setQuality(value as ImageQuality)}>
                <SelectTrigger id="imageQuality" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Baja</SelectItem><SelectItem value="medium">Media</SelectItem><SelectItem value="high">Alta</SelectItem></SelectContent>
              </Select>
            </div>
          )}
          <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium">{statusLabel(campaign.status)}</span>
        </div>
      </header>

      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <StepHeading step="1" title="Elegí un concepto" description="Generamos tres caminos distintos para la misma campaña." complete={Boolean(campaign.selectedConceptIndex)} />
        {pending === "concepts" && <GenerationProgress kind="concepts" className="mt-6" />}
        {concepts.length === 0 ? (
          <div className="mt-6 rounded-xl bg-muted/40 px-5 py-8 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-primary" />
            <h2 className="mt-3 font-semibold">Prepará tres variantes</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">La IA usará el perfil de marca, el objetivo y la fuente comercial de esta agencia.</p>
            <Button className="mt-5" disabled={pending !== null} onClick={() => void postAction(`/api/growth-studio/campaigns/${campaignId}/generate-concepts`, "concepts")}>
              {pending === "concepts" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generar conceptos
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {concepts.map((concept) => (
              <ConceptOption key={concept.index} concept={concept} selected={campaign.selectedConceptIndex === concept.index} disabled={pending !== null} onSelect={() => void selectConcept(concept.index)} />
            ))}
          </div>
        )}
        {concepts.length > 0 && (
          <div className="mt-5 flex justify-end">
            <Button variant="ghost" disabled={pending !== null} onClick={() => void postAction(`/api/growth-studio/campaigns/${campaignId}/generate-concepts`, "concepts")}>
              <RefreshCw className="mr-2 h-4 w-4" /> Regenerar tres variantes
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <StepHeading step="2" title="Adaptá a cada canal" description="Un mismo concepto con el formato y la extensión adecuados para cada medio." complete={Boolean(adaptations)} />
        {pending === "channels" && <GenerationProgress kind="channels" className="mt-6" />}
        {pending === "image" && <GenerationProgress kind="image" className="mt-6" />}
        {!campaign.selectedConceptIndex ? (
          <p className="mt-6 rounded-xl bg-muted/40 px-5 py-6 text-sm text-muted-foreground">Elegí uno de los tres conceptos para continuar.</p>
        ) : !adaptations ? (
          <div className="mt-6 rounded-xl bg-muted/40 px-5 py-8 text-center">
            <h2 className="font-semibold">El concepto está listo</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Ahora podés generar las versiones para {campaign.brief.channels.length} canal(es).</p>
            <Button className="mt-5" disabled={pending !== null} onClick={() => void postAction(`/api/growth-studio/campaigns/${campaignId}/generate-channels`, "channels")}>
              {pending === "channels" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Adaptar contenido
            </Button>
          </div>
        ) : (
          <ChannelOutputs
            adaptations={adaptations}
            pendingImage={pending === "image"}
            onCopy={copyContent}
            onGenerateImage={generateImage}
            onRate={(channel, rating) => void recordEvent("rated", { channel, rating })}
          />
        )}
      </section>
    </div>
  )
}

function ConceptOption({ concept, selected, disabled, onSelect }: { concept: CampaignConcept; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <article className={`relative flex min-h-full flex-col rounded-xl border p-5 transition-colors ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}>
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variante {concept.index}</span>{selected && <span className="flex items-center gap-1 text-xs font-medium text-primary"><Check className="h-3.5 w-3.5" /> Elegida</span>}</div>
      <h3 className="mt-3 text-lg font-semibold">{concept.title}</h3>
      <p className="mt-2 text-sm font-medium text-foreground/90">{concept.hook}</p>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{concept.angle}</p>
      <div className="mt-4 border-t pt-4"><p className="text-xs font-medium text-muted-foreground">CTA recomendado</p><p className="mt-1 text-sm">{concept.recommendedCta}</p></div>
      <Button className="mt-5 w-full" variant={selected ? "outline" : "default"} disabled={disabled || selected} onClick={onSelect}>{selected ? "Concepto seleccionado" : "Elegir esta variante"}</Button>
    </article>
  )
}

function ChannelOutputs({ adaptations, pendingImage, onCopy, onGenerateImage, onRate }: { adaptations: ChannelAdaptations; pendingImage: boolean; onCopy: (channel: string, value: string) => void; onGenerateImage: (visualDirection: string, format: "instagram_feed" | "instagram_story") => void; onRate: (channel: string, rating: "up" | "down") => void }) {
  return (
    <div className="mt-6 space-y-4">
      {adaptations.instagramFeed && (
        <OutputCard icon={<Sparkles className="h-4 w-4" />} title="Instagram feed" onCopy={() => onCopy("instagram_feed", `${adaptations.instagramFeed!.caption}\n\n${adaptations.instagramFeed!.hashtags.join(" ")}`)} onRate={(rating) => onRate("instagram_feed", rating)}>
          <p className="whitespace-pre-wrap text-sm leading-6">{adaptations.instagramFeed.caption}</p>
          {adaptations.instagramFeed.hashtags.length > 0 && <p className="mt-4 text-sm text-primary">{adaptations.instagramFeed.hashtags.join(" ")}</p>}
          <VisualAction direction={adaptations.instagramFeed.visualDirection} disabled={pendingImage} onClick={() => onGenerateImage(adaptations.instagramFeed!.visualDirection, "instagram_feed")} />
        </OutputCard>
      )}
      {adaptations.instagramStories && (
        <OutputCard icon={<Sparkles className="h-4 w-4" />} title="Instagram Stories" onCopy={() => onCopy("instagram_stories", adaptations.instagramStories!.screens.map((screen) => `Pantalla ${screen.screen}\n${screen.copy}\n${screen.cta}`).join("\n\n"))} onRate={(rating) => onRate("instagram_stories", rating)}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {adaptations.instagramStories.screens.map((screen) => (
              <div key={screen.screen} className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pantalla {screen.screen}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{screen.copy}</p>
                {screen.cta && <p className="mt-3 text-sm font-medium text-primary">{screen.cta}</p>}
                <Button size="sm" variant="outline" className="mt-4 w-full" disabled={pendingImage} onClick={() => onGenerateImage(screen.visualDirection, "instagram_story")}>
                  {pendingImage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />} Crear imagen
                </Button>
              </div>
            ))}
          </div>
        </OutputCard>
      )}
      {adaptations.whatsapp && (
        <OutputCard icon={<MessageCircle className="h-4 w-4" />} title="WhatsApp" onCopy={() => onCopy("whatsapp", adaptations.whatsapp!.message)} onRate={(rating) => onRate("whatsapp", rating)}>
          <p className="whitespace-pre-wrap text-sm leading-6">{adaptations.whatsapp.message}</p>
        </OutputCard>
      )}
      {adaptations.email && (
        <OutputCard icon={<Mail className="h-4 w-4" />} title="Email" onCopy={() => onCopy("email", `Asunto: ${adaptations.email!.subject}\nPreheader: ${adaptations.email!.preheader}\n\n${adaptations.email!.body}\n\n${adaptations.email!.cta}`)} onRate={(rating) => onRate("email", rating)}>
          <dl className="space-y-3 text-sm"><div><dt className="font-medium text-muted-foreground">Asunto</dt><dd className="mt-1">{adaptations.email.subject}</dd></div><div><dt className="font-medium text-muted-foreground">Preheader</dt><dd className="mt-1">{adaptations.email.preheader}</dd></div></dl>
          <p className="mt-5 whitespace-pre-wrap border-t pt-5 text-sm leading-6">{adaptations.email.body}</p>
          <p className="mt-4 text-sm font-medium text-primary">{adaptations.email.cta}</p>
        </OutputCard>
      )}
    </div>
  )
}

function OutputCard({ icon, title, onCopy, onRate, children }: { icon: React.ReactNode; title: string; onCopy: () => void; onRate: (rating: "up" | "down") => void; children: React.ReactNode }) {
  return <article className="rounded-xl border p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold">{icon}{title}</h3><div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label={`Me gusta ${title}`} onClick={() => onRate("up")}><ThumbsUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`No me gusta ${title}`} onClick={() => onRate("down")}><ThumbsDown className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={onCopy}><Copy className="mr-2 h-4 w-4" />Copiar</Button></div></div>{children}</article>
}

function VisualAction({ direction, disabled, onClick }: { direction: string; disabled: boolean; onClick: () => void }) {
  return <div className="mt-5 flex flex-col gap-3 rounded-xl bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium text-muted-foreground">Dirección visual</p><p className="mt-1 text-sm leading-5">{direction}</p></div><Button size="sm" variant="outline" className="shrink-0" disabled={disabled} onClick={onClick}>{disabled ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}Crear imagen</Button></div>
}

function StepHeading({ step, title, description, complete }: { step: string; title: string; description: string; complete: boolean }) {
  return <div className="flex gap-3"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${complete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{complete ? <Check className="h-4 w-4" /> : step}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div></div>
}

function statusLabel(status: string) {
  return ({ DRAFT: "Borrador", CONCEPTS_READY: "Conceptos listos", CONCEPT_SELECTED: "Concepto elegido", CHANNELS_READY: "Canales listos" } as Record<string, string>)[status] ?? status
}

function DetailSkeleton() {
  return <div className="mx-auto max-w-6xl space-y-7"><div><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-8 w-80 max-w-full" /><Skeleton className="mt-3 h-4 w-[34rem] max-w-full" /></div><Skeleton className="h-80 w-full rounded-2xl" /><Skeleton className="h-56 w-full rounded-2xl" /></div>
}
