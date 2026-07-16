"use client"

import { Building2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GrowthStudioAgency } from "@/lib/growth-studio/access"

export function AgencyContextSelector({
  agencies,
  value,
  onValueChange,
  disabled = false,
}: {
  agencies: GrowthStudioAgency[]
  value?: string
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="min-w-0 space-y-1.5 sm:w-72">
      <Label htmlFor="growth-studio-agency" className="text-xs text-muted-foreground">
        Agencia
      </Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id="growth-studio-agency" className="w-full bg-background">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <SelectValue placeholder="Seleccioná una agencia" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {agencies.map((agency) => (
            <SelectItem key={agency.id} value={agency.id}>
              {agency.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
