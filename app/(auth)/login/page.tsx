import { GalleryVerticalEnd } from "lucide-react"

import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
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
      <div className="bg-muted relative hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1488646953014-85cb44e25828?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2000&q=80"
          alt="Viajes"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  )
}

