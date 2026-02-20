import { GalleryVerticalEnd, Plane, Globe, MapPin } from "lucide-react"

import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Panel izquierdo decorativo */}
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 relative hidden lg:flex lg:flex-col lg:items-center lg:justify-center p-12">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="relative z-10 text-center text-white space-y-8">
          <div className="flex justify-center">
            <div className="bg-white/10 backdrop-blur-sm rounded-full p-6">
              <Plane className="size-16 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight">MAXEVA GESTION</h1>
            <p className="mt-3 text-lg text-blue-200">Sistema de gestión para agencias de viajes</p>
          </div>
          <div className="flex justify-center gap-8 text-blue-300">
            <div className="flex flex-col items-center gap-2">
              <Globe className="size-8" />
              <span className="text-sm">Operaciones</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <MapPin className="size-8" />
              <span className="text-sm">Destinos</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <GalleryVerticalEnd className="size-8" />
              <span className="text-sm">Reportes</span>
            </div>
          </div>
        </div>
      </div>
      {/* Login centrado a la derecha */}
      <div className="flex flex-1 items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <div className="flex justify-center gap-2 mb-8">
            <a href="#" className="flex items-center gap-2 font-medium text-xl">
              <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-5" />
              </div>
              MAXEVA GESTION
            </a>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}

