"use client"

import * as React from "react"
import { AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  AGENTE_BLANCO_EMBED_SRC,
  describeAgenteBlancoError,
  isSilentAgenteBlancoError,
  type AgenteBlancoErrorCopy,
} from "@/lib/agente-blanco/config"

/**
 * Monta la bandeja de Agente Blanco (Instagram/WhatsApp) dentro del dashboard.
 *
 * Todo lo de adentro —lista de chats, mensajes, ficha del lead— corre en el
 * iframe de Agente Blanco. Acá solo vive el marco: el snippet, el token y los
 * estados de carga/error.
 *
 * El snippet se carga UNA vez por carga de página, sin `data-target` para que no
 * auto-monte, y el ciclo de vida lo manejamos con `mount()` / `destroy()`. Es el
 * camino que Agente Blanco recomienda para SPAs: reinyectar el `<script>` en
 * cada navegación reemplazaba `window.AgenteBlanco` y se llevaba puesto el
 * `onTokenNeeded` ya registrado.
 *
 * El token NO se cachea: `onTokenNeeded` se llama al montar y de nuevo cada vez
 * que la sesión vence (12 h), y cada token sirve una sola vez.
 */

interface AgenteBlancoApi {
  onTokenNeeded: (resolver: () => Promise<string>) => void
  on: (event: string, handler: (payload: any) => void) => void
  mount: (options: { clientId: string; org: string; target: string }) => void
  destroy: () => void
}

declare global {
  interface Window {
    AgenteBlanco?: AgenteBlancoApi
  }
}

/** Handlers de la bandeja montada ahora. Null entre navegaciones. */
interface InboxHandlers {
  requestToken: () => Promise<string>
  handleEvent: (event: string, payload: any) => void
}

let snippetPromise: Promise<AgenteBlancoApi> | null = null
let handlersWired = false
let currentInbox: InboxHandlers | null = null

function loadSnippet(): Promise<AgenteBlancoApi> {
  if (!snippetPromise) {
    snippetPromise = new Promise<AgenteBlancoApi>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = AGENTE_BLANCO_EMBED_SRC
      script.async = true
      script.dataset.agenteBlanco = "embed"
      script.addEventListener("load", () => {
        if (window.AgenteBlanco) resolve(window.AgenteBlanco)
        else reject(new Error("el snippet cargó sin exponer AgenteBlanco"))
      })
      script.addEventListener("error", () =>
        reject(new Error("no se pudo descargar el snippet"))
      )
      document.head.appendChild(script)
    }).catch((err) => {
      // Sin esto un fallo de red dejaría la promesa rechazada para siempre y la
      // sección no volvería a cargar hasta refrescar.
      snippetPromise = null
      throw err
    })
  }
  return snippetPromise
}

/**
 * `onTokenNeeded` y `on()` se registran una sola vez sobre la instancia del
 * snippet; los eventos se enrutan a la bandeja montada en ese momento.
 */
function wireHandlers(api: AgenteBlancoApi) {
  if (handlersWired) return
  handlersWired = true

  api.onTokenNeeded(async () => {
    if (!currentInbox) throw new Error("no hay bandeja montada")
    return currentInbox.requestToken()
  })

  for (const event of ["ready", "session", "error"]) {
    api.on(event, (payload: any) => currentInbox?.handleEvent(event, payload))
  }
}

/**
 * Si no llega ni `ready`/`session` ni `error`, mostramos algo accionable en vez
 * de dejar el spinner para siempre.
 *
 * Hace falta aunque usemos mount()/destroy(): verificado el 2026-08-30 contra
 * el embebido real, cuando el iframe no puede abrir la sesion pinta su propio
 * mensaje adentro y NO emite `error` al host. Nuestro overlay lo tapaba y la
 * pantalla quedaba en "Abriendo tus conversaciones..." indefinidamente.
 */
const MOUNT_TIMEOUT_MS = 10000

/**
 * Escala del iframe. La bandeja viene pensada para ocupar una pantalla entera y
 * dentro de nuestro shell queda grande: menos chats visibles y mucho aire.
 *
 * Agente Blanco no expone densidad ni zoom (no hay data-* ni opcion de mount()
 * para eso), asi que lo escalamos desde afuera. Con `zoom` el contenido se
 * re-renderiza a esa escala —queda nitido, a diferencia de transform: scale— y
 * el viewport interno del iframe pasa a ser mas ancho en px CSS, que es
 * justamente lo que hace entrar mas contenido.
 *
 * El alto y el ancho se compensan con el inverso para que el iframe siga
 * llenando el contenedor. Si se toca este numero, no hace falta tocar nada mas.
 */
const EMBED_ZOOM = 0.85

export interface InboxNetwork {
  agencyId: string
  agencyName: string
}

export function AgenteBlancoInbox({
  clientId,
  orgSlug,
  networks,
}: {
  clientId: string
  orgSlug: string
  /** Agencias con red conectada. Vacío o de a una: no se elige nada. */
  networks: InboxNetwork[]
}) {
  const [agencyId, setAgencyId] = React.useState<string | null>(
    networks.length > 1 ? networks[0].agencyId : null
  )
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading")
  const [problem, setProblem] = React.useState<AgenteBlancoErrorCopy | null>(null)
  const [stalled, setStalled] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    let mounted = false
    let api: AgenteBlancoApi | null = null

    setStatus("loading")
    setProblem(null)
    setStalled(false)

    const handlers: InboxHandlers = {
      requestToken: async () => {
        const url = agencyId
          ? `/api/agente-blanco/token?agencyId=${encodeURIComponent(agencyId)}`
          : "/api/agente-blanco/token"
        const res = await fetch(url, { cache: "no-store" })
        if (!res.ok) throw new Error(`token ${res.status}`)
        const body = (await res.json()) as { token?: string }
        if (!body.token) throw new Error("token vacío")
        return body.token
      },
      handleEvent: (event, payload) => {
        if (cancelled) return
        window.clearTimeout(stallTimer)
        if (event === "error") {
          const code = (payload as { code?: string } | undefined)?.code
          // La sesión de 12 h vence sola y el snippet ya pidió otro token.
          if (isSilentAgenteBlancoError(code)) return
          console.error("[agente-blanco] error del embebido", { code })
          setProblem(describeAgenteBlancoError(code))
          setStatus("error")
          return
        }
        // `ready` (cargó el iframe) y `session` (abrió la sesión).
        setProblem(null)
        setStatus("ready")
      },
    }
    currentInbox = handlers

    const stallTimer = window.setTimeout(() => {
      if (!cancelled) setStalled(true)
    }, MOUNT_TIMEOUT_MS)

    loadSnippet()
      .then((loaded) => {
        if (cancelled) return
        api = loaded
        wireHandlers(loaded)
        loaded.mount({ clientId, org: orgSlug, target: "#ab-chats" })
        mounted = true
      })
      .catch((err) => {
        if (cancelled) return
        console.error("[agente-blanco] no se pudo cargar el snippet", {
          src: AGENTE_BLANCO_EMBED_SRC,
          cause: err instanceof Error ? err.message : String(err),
        })
        setProblem({
          title: "No pudimos cargar la bandeja",
          description:
            "No se pudo descargar el chat de Agente Blanco. Revisá tu conexión y volvé a intentar.",
          tone: "error",
        })
        setStatus("error")
      })

    return () => {
      cancelled = true
      window.clearTimeout(stallTimer)
      if (currentInbox === handlers) currentInbox = null
      if (mounted && api) {
        try {
          api.destroy()
        } catch {
          // no dejamos que un destroy roto rompa la navegación
        }
      }
    }
  }, [clientId, orgSlug, agencyId])

  const showOverlay = status !== "ready" || problem !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {networks.length > 1 && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Sucursal">
          {networks.map((network) => {
            const selected = network.agencyId === agencyId
            return (
              <button
                key={network.agencyId}
                type="button"
                onClick={() => setAgencyId(network.agencyId)}
                aria-pressed={selected}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {network.agencyName}
              </button>
            )
          })}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {/* El snippet monta el iframe acá adentro. */}
        <div
          id="ab-chats"
          style={{
            zoom: EMBED_ZOOM,
            width: `${100 / EMBED_ZOOM}%`,
            height: `${100 / EMBED_ZOOM}%`,
          }}
        />

        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-card p-6">
            {problem ? (
              <EmbedMessage copy={problem} />
            ) : stalled ? (
              <EmbedMessage
                copy={{
                  title: "La bandeja no terminó de abrir",
                  description:
                    "Probá recargar la página. Si sigue igual, avisale al equipo de Vibook.",
                  tone: "error",
                }}
                action={
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Recargar
                  </Button>
                }
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Abriendo tus conversaciones…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmbedMessage({
  copy,
  action,
}: {
  copy: AgenteBlancoErrorCopy
  action?: React.ReactNode
}) {
  const Icon = copy.tone === "error" ? AlertTriangle : Info
  return (
    <div className="max-w-sm text-center">
      <Icon
        className={`mx-auto h-6 w-6 ${
          copy.tone === "error" ? "text-destructive" : "text-muted-foreground"
        }`}
      />
      <p className="mt-3 text-sm font-medium text-foreground">{copy.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
