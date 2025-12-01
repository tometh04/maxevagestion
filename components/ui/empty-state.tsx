"use client"

import { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  className?: string
  size?: "sm" | "md" | "lg"
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizes = {
    sm: {
      container: "py-8",
      icon: "h-8 w-8",
      title: "text-base",
      description: "text-sm",
    },
    md: {
      container: "py-12",
      icon: "h-12 w-12",
      title: "text-lg",
      description: "text-sm",
    },
    lg: {
      container: "py-16",
      icon: "h-16 w-16",
      title: "text-xl",
      description: "text-base",
    },
  }

  const sizeConfig = sizes[size]

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizeConfig.container,
        className
      )}
    >
      {Icon && (
        <div className="rounded-full bg-muted p-4 mb-4">
          <Icon className={cn("text-muted-foreground", sizeConfig.icon)} />
        </div>
      )}
      
      <h3 className={cn("font-semibold text-foreground", sizeConfig.title)}>
        {title}
      </h3>
      
      {description && (
        <p className={cn("mt-2 text-muted-foreground max-w-sm", sizeConfig.description)}>
          {description}
        </p>
      )}
      
      {(action || secondaryAction) && (
        <div className="mt-6 flex gap-3">
          {action && (
            <Button onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// Variantes pre-configuradas para casos comunes
export function EmptyCustomers({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={require("lucide-react").Users}
      title="No hay clientes"
      description="Comienza agregando tu primer cliente para gestionar sus viajes y pagos."
      action={onAction ? { label: "Agregar Cliente", onClick: onAction } : undefined}
    />
  )
}

export function EmptyOperations({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={require("lucide-react").Plane}
      title="No hay operaciones"
      description="Crea tu primera operación para comenzar a gestionar viajes."
      action={onAction ? { label: "Nueva Operación", onClick: onAction } : undefined}
    />
  )
}

export function EmptyLeads({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={require("lucide-react").MessageSquare}
      title="No hay leads"
      description="Los leads son oportunidades de venta. Agrega uno para comenzar el seguimiento."
      action={onAction ? { label: "Nuevo Lead", onClick: onAction } : undefined}
    />
  )
}

export function EmptyOperators({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={require("lucide-react").Building2}
      title="No hay operadores"
      description="Los operadores son tus proveedores de servicios turísticos."
      action={onAction ? { label: "Agregar Operador", onClick: onAction } : undefined}
    />
  )
}

export function EmptyAlerts() {
  return (
    <EmptyState
      icon={require("lucide-react").Bell}
      title="Sin alertas"
      description="¡Excelente! No tienes alertas pendientes."
      size="sm"
    />
  )
}

export function EmptyPayments({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={require("lucide-react").DollarSign}
      title="Sin pagos registrados"
      description="Los pagos se crean automáticamente con las operaciones o puedes agregarlos manualmente."
      action={onAction ? { label: "Nuevo Pago", onClick: onAction } : undefined}
      size="sm"
    />
  )
}

export function EmptyDocuments({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={require("lucide-react").FileText}
      title="Sin documentos"
      description="Sube documentos relacionados con esta operación."
      action={onAction ? { label: "Subir Documento", onClick: onAction } : undefined}
      size="sm"
    />
  )
}

export function EmptySearchResults() {
  return (
    <EmptyState
      icon={require("lucide-react").Search}
      title="Sin resultados"
      description="No se encontraron resultados para tu búsqueda. Intenta con otros términos."
      size="sm"
    />
  )
}

