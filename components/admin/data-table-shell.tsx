import { cn } from "@/lib/utils"

type ShellProps = {
  children: React.ReactNode
  className?: string
}

export function DataTableShell({ children, className }: ShellProps) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border", className)}>
      <table className="min-w-full divide-y divide-muted-foreground/60 text-sm">
        {children}
      </table>
    </div>
  )
}

export function DataTableHead({ children, className }: ShellProps) {
  return (
    <thead className={cn("bg-card text-xs font-medium uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </thead>
  )
}

export function DataTableBody({ children, className }: ShellProps) {
  return (
    <tbody className={cn("divide-y divide-border bg-muted/40", className)}>
      {children}
    </tbody>
  )
}

type RowProps = ShellProps & { onClick?: () => void; muted?: boolean }
export function DataTableRow({ children, className, onClick, muted }: RowProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition odd:bg-muted/40 even:bg-muted/30 hover:bg-muted/40",
        onClick && "cursor-pointer",
        muted && "opacity-70",
        className,
      )}
    >
      {children}
    </tr>
  )
}

type CellProps = ShellProps & { width?: string }
export function DataTableTh({ children, className, width }: CellProps) {
  return (
    <th
      style={width ? { width } : undefined}
      className={cn("px-3 py-2.5 text-left whitespace-nowrap", className)}
    >
      {children}
    </th>
  )
}

export function DataTableTd({ children, className }: ShellProps) {
  return (
    <td className={cn("px-3 py-2.5 align-middle", className)}>{children}</td>
  )
}
