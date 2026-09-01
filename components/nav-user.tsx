"use client"

import { useRouter } from "next/navigation"
import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconUserCircle,
} from "@tabler/icons-react"
import { supabase } from "@/lib/supabase/client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

function getInitials(name: string | null | undefined): string {
  if (!name) return "?"
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar?: string
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()

  /**
   * `scope: "local"` y navegacion DURA. Las dos cosas importan.
   *
   * El default de `signOut()` es `scope: "global"`, que borra los refresh
   * tokens de TODAS las sesiones del usuario, en todos sus dispositivos y
   * pestañas. Medido contra nuestro propio proyecto: despues de un signOut
   * global, el refresh de otra sesion viva devuelve
   * `400 refresh_token_not_found`. Y peor: un signOut global que llega tarde
   * mata incluso a una sesion creada DESPUES.
   *
   * Eso convierte cada pestaña abierta en una mina. Su cliente Supabase
   * intenta refrescar, recibe un error no retryable, y `_recoverAndRefresh`
   * llama `_removeSession()` — que borra la cookie de auth. La cookie es
   * compartida entre pestañas, asi que si eso pasa despues de que volviste a
   * entrar, se borra la sesion NUEVA. Sintoma: cerras sesion, entras de nuevo,
   * y no tenes sesion en ninguna pantalla.
   *
   * Con `local` se revoca solo esta sesion: las demas siguen refrescando bien
   * y nadie borra la cookie de nadie. Es tambien la semantica correcta para un
   * boton "Cerrar sesion" del navegador.
   *
   * La navegacion dura completa el arreglo: recargar destruye el contexto JS,
   * o sea el cliente singleton de `lib/supabase/client.ts`, sus timers de
   * auto-refresh y cualquier request en vuelo. Con `router.push` todo eso
   * sobrevivia a la navegacion.
   */
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" })
    } catch (error) {
      // Si el signOut no sale (red caida), igual hay que sacar al usuario de
      // la app. El `finally` navega siempre.
      console.error("[auth] signOut fallo, se sale igual:", error)
    } finally {
      window.location.assign("/login")
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-7 w-7 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg text-xs">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs opacity-70">
                  {user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <IconUserCircle />
                Cuenta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings/subscription")}>
                <IconCreditCard />
                Suscripción
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <IconLogout />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
