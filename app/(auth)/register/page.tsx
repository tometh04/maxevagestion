import { Suspense } from "react"
import { Globe, MapPin, GalleryVerticalEnd } from "lucide-react"
import Image from "next/image"

import { RegisterForm } from "@/components/register-form"

export default function RegisterPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="bg-signature-gradient relative hidden lg:flex lg:flex-col lg:items-center lg:justify-center p-12 overflow-hidden">
        {/* Vignette para legibilidad del texto blanco sobre los stops más claros */}
        <div className="absolute inset-0 bg-gradient-to-br from-ink/30 via-ink/10 to-transparent" />
        <div className="absolute inset-0 noise opacity-[0.06]" />
        <div className="relative z-10 text-center text-white space-y-10">
          <div className="flex justify-center">
            <Image
              src="/vibook-logo-white.png"
              alt="Vibook"
              width={480}
              height={144}
              priority
              className="h-auto w-auto max-h-52 object-contain"
            />
          </div>
          <div className="space-y-3">
            <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-white/70">
              Bienvenido
            </span>
            <p className="text-2xl font-semibold tracking-tight-h2 text-white text-balance max-w-md mx-auto leading-tight">
              Tu ERP de agencia de viajes, listo en 1 minuto
            </p>
          </div>
          <div className="flex justify-center gap-10 text-white/85">
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-elegant">
                <Globe className="size-6" />
              </div>
              <span className="text-sm">Operaciones</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-elegant">
                <MapPin className="size-6" />
              </div>
              <span className="text-sm">Destinos</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-elegant">
                <GalleryVerticalEnd className="size-6" />
              </div>
              <span className="text-sm">Reportes</span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center p-6 md:p-10 section-aura">
        <div className="w-full max-w-md relative z-10">
          {/* Suspense requerido por useSearchParams en el form (Next 15+). */}
          <Suspense fallback={null}>
            <RegisterForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
