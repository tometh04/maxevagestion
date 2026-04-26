import { cn } from "@/lib/utils"

type ShellProps = {
  children: React.ReactNode
  className?: string
}

export function DataTableShell({ children, className }: ShellProps) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-slate-800/80", className)}>
      <table className="min-w-full divide-y divide-slate-800/60 text-sm">
        {children}
      </table>
    </div>
  )
}

export function DataTableHead({ children, className }: ShellProps) {
  return (
    <thead className={cn("bg-slate-900/60 text-xs font-medium uppercase tracking-wider text-slate-500", className)}>
      {children}
    </thead>
  )
}

export function DataTableBody({ children, className }: ShellProps) {
  return (
    <tbody className={cn("divide-y divide-slate-800/40 bg-slate-950/40", className)}>
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
        "transition odd:bg-slate-950/40 even:bg-slate-900/20 hover:bg-slate-800/40",
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
