import { FlaskConical } from "lucide-react"
import { isMpSandbox } from "@/lib/billing/mercadopago"

/**
 * Banner que avisa cuando la integración Mercado Pago está corriendo contra
 * sandbox (MP_USE_SANDBOX=true). Pensado para Bug #20 — sin esto era imposible
 * saber de un vistazo si los flows de billing iban contra cuentas reales o de
 * prueba.
 *
 * Server component: lee env vars directo, sin shipping al cliente.
 */
export function MpSandboxBanner() {
  if (!isMpSandbox()) return null

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-primary">
      <div className="flex items-start gap-2">
        <FlaskConical className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-xs space-y-1">
          <div className="font-medium">Mercado Pago: modo SANDBOX activo</div>
          <div className="opacity-80">
            Las suscripciones, checkouts y webhooks van contra la cuenta MP
            sandbox. Las tarjetas y pagos no son reales. Para ver actividad real
            sacá <code className="text-[10px]">MP_USE_SANDBOX</code> de las env
            vars de Railway y reiniciá.
          </div>
        </div>
      </div>
    </div>
  )
}
