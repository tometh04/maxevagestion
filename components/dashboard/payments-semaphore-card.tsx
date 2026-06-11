"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react"
import Link from "next/link"

interface Bucket {
  count: number
  totalUsd: number
}

interface SemaphoreData {
  customerPayments: { overdue: Bucket; near: Bucket; ok: Bucket }
  operatorPayments: { overdue: Bucket; near: Bucket; ok: Bucket }
}

interface PaymentsSemaphoreCardProps {
  agencyId?: string
}

function formatUsd(v: number) {
  if (v >= 1000) return `USD ${(v / 1000).toFixed(1)}k`
  return `USD ${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
}

function SemaphoreRow({
  label,
  color,
  dot,
  bucket,
}: {
  label: string
  color: string
  dot: string
  bucket: Bucket
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2 tabular-nums">
        <span className={`text-[11px] font-semibold ${color}`}>
          {bucket.count > 0 ? `${bucket.count}` : "—"}
        </span>
        {bucket.count > 0 && (
          <span className="text-[10px] text-muted-foreground">{formatUsd(bucket.totalUsd)}</span>
        )}
      </div>
    </div>
  )
}

export function PaymentsSemaphoreCard({ agencyId }: PaymentsSemaphoreCardProps = {}) {
  const [data, setData] = useState<SemaphoreData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (agencyId && agencyId !== "ALL") params.set("agencyId", agencyId)
      const res = await fetch(`/api/accounting/payments-semaphore?${params.toString()}`)
      if (!res.ok) return
      const json = await res.json()
      setData(json)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [agencyId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const hasUrgency =
    data &&
    (data.customerPayments.overdue.count > 0 ||
      data.operatorPayments.overdue.count > 0 ||
      data.customerPayments.near.count > 0 ||
      data.operatorPayments.near.count > 0)

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            {hasUrgency ? (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            )}
            Semáforo de Pagos
          </CardTitle>
          <CardDescription className="text-[10px]">Vencimientos de cobros y pagos</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-[11px] text-muted-foreground text-center py-3">Sin datos</p>
        ) : (
          <div className="space-y-3">
            {/* Cobros a clientes */}
            <div className="space-y-1.5">
              <Link href="/cash" className="group flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Cobros a Clientes
                </p>
                <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
              <SemaphoreRow label="Vencidos" color="text-destructive" dot="bg-destructive" bucket={data.customerPayments.overdue} />
              <SemaphoreRow label="Próximos (30 días)" color="text-amber-500" dot="bg-amber-500" bucket={data.customerPayments.near} />
              <SemaphoreRow label="Al día" color="text-success" dot="bg-success" bucket={data.customerPayments.ok} />
            </div>

            <div className="border-t" />

            {/* Pagos a operadores */}
            <div className="space-y-1.5">
              <Link href="/accounting/operator-payments" className="group flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Pagos a Operadores
                </p>
                <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
              <SemaphoreRow label="Vencidos" color="text-destructive" dot="bg-destructive" bucket={data.operatorPayments.overdue} />
              <SemaphoreRow label="Próximos (30 días)" color="text-amber-500" dot="bg-amber-500" bucket={data.operatorPayments.near} />
              <SemaphoreRow label="Al día" color="text-success" dot="bg-success" bucket={data.operatorPayments.ok} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
