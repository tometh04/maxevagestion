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
   * Navegacion DURA y no `router.push`.
   *
   * `signOut()` con el scope default (global) revoca todos los refresh tokens
   * del usuario, pero un `router.push` es navegacion blanda: el cliente
   * Supabase es un singleton a nivel modulo y sobrevive con sus timers de
   * auto-refresh, su handler de visibilitychange y cualquier refresh en vuelo.
   *
   * Si el usuario vuelve a loguearse enseguida, ese refresh viejo falla — su
   * token ya esta revocado — y gotrue-js, en el handler de error, llama
   * `_removeSession()`: borra las cookies de auth, que a esa altura son las de
   * la sesion NUEVA. El primer render server-side no encuentra sesion y manda
   * al login. Reproducible: cerrar sesion y volver a entrar en el acto.
   *
   * Recargar de verdad destruye el contexto JS, o sea el singleton, sus timers
   * y todo lo que este en vuelo. No queda nada de la sesion vieja que pueda
   * pisar a la nueva.
   */
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
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
