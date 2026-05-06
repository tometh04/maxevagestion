import Link from "next/link"
import { AlertTriangle, FileText, ShieldCheck } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { OrgAfipStatus } from "@/lib/afip/check-org-status"

/**
 * Gate full-screen para páginas de facturación cuando la org del usuario
 * todavía no tiene AFIP configurada en al menos una agencia.
 *
 * Pendientes 2026-05-06 (onboarding GTM): antes el user nuevo entraba a
 * /operations/billing/new y veía un dropdown vacío de Punto de Venta sin
 * pista de qué hacer. Después intentaba "Crear y Autorizar" y AFIP le
 * tiraba un error críptico. Ahora frenamos antes y le explicamos los
 * pasos + le pasamos un CTA directo a /settings/integrations donde está
 * el setup automático.
 *
 * El componente es Server-side: lee status server, renderiza el gate
 * sin flash. Si la org tiene al menos 1 agencia con AFIP, renderiza
 * `children` (la página normal).
 */
interface AfipSetupGateProps {
  status: OrgAfipStatus
  children: React.ReactNode
}

export function AfipSetupGate({ status, children }: AfipSetupGateProps) {
  if (status.configured) {
    return <>{children}</>
  }

  const hasMultipleAgencies = status.totalAgencies > 1

  return (
    <div className="space-y-6">
      <Card className="max-w-2xl mx-auto mt-8 border-accent-coral/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-5 w-5 text-accent-coral" />
            Configurá AFIP antes de facturar
          </CardTitle>
          <CardDescription className="pt-2">
            {status.totalAgencies === 0 ? (
              <>Primero necesitás crear una agencia en{" "}
                <Link href="/settings/agencies" className="underline font-medium">
                  Configuración → Agencias
                </Link>{" "}
                antes de poder configurar AFIP.
              </>
            ) : hasMultipleAgencies ? (
              <>Tu organización tiene {status.totalAgencies} agencia
                {status.totalAgencies === 1 ? "" : "s"} pero ninguna con AFIP
                configurado. Para emitir facturas electrónicas necesitás
                conectar al menos una.
              </>
            ) : (
              "Para emitir facturas electrónicas necesitás conectar AFIP. La configuración tarda menos de 1 minuto."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-medium">Vas a necesitar:</p>
            <ul className="text-sm space-y-2 list-disc pl-5 text-muted-foreground">
              <li>El <strong>CUIT</strong> de la empresa</li>
              <li>
                <strong>Usuario y Clave Fiscal de ARCA</strong> (los mismos
                que usás para entrar a afip.gob.ar)
              </li>
              <li>
                Un <strong>Punto de Venta autorizado</strong>. Si todavía no
                lo tenés, lo creás en AFIP web →
                Administración de Puntos de Venta y Domicilios.
              </li>
            </ul>
          </div>

          <div className="rounded-md border border-success/15 bg-success/5 p-3 text-xs flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-success">Setup automático</p>
              <p className="text-muted-foreground mt-1">
                Vibook crea el certificado AFIP y autoriza el servicio WSFE
                automáticamente. No tenés que generar nada en AFIP web.
              </p>
            </div>
          </div>

          {status.totalAgencies > 0 && (
            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild size="sm">
                <Link href="/settings/integrations">
                  <FileText className="h-4 w-4 mr-2" />
                  Configurar AFIP ahora
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
