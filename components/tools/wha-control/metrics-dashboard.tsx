"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, MessageCircle, MessageSquareText, Clock, Users, AlertCircle, UserPlus, Send, FileText } from "lucide-react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts"

interface Device {
  id: string
  display_name: string
  is_active?: boolean
}

interface Summary {
  inbound_count: number
  outbound_count: number
  active_chats_count: number
  new_chats_count: number
  responded_chats_count: number
  unanswered_chats_count: number
  avg_first_response_seconds: number | null
  initiated_count: number
  pdfs_sent_count: number
}

interface TimeseriesPoint {
  date: string
  inbound: number
  outbound: number
  pdfs: number
  initiated: number
  avg_response: number | null
}

export function MetricsDashboard() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Only show active devices in the dropdown
    fetch("/api/wha-control/devices")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices || []))
      .catch(console.error)
  }, [])

  const fetchMetrics = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (selectedDeviceId !== "all") params.set("deviceId", selectedDeviceId)

      const [summaryRes, timeseriesRes] = await Promise.all([
        fetch(`/api/wha-control/metrics/summary?${params}`),
        fetch(`/api/wha-control/metrics/timeseries?${params}`),
      ])

      if (summaryRes.ok) {
        const data = await summaryRes.json()
        setSummary(data.summary || null)
      }
      if (timeseriesRes.ok) {
        const data = await timeseriesRes.json()
        setTimeseries(data.timeseries || [])
      }
    } catch (err) {
      console.error("Error fetching metrics:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedDeviceId, dateFrom, dateTo])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  const formatResponseTime = (seconds: number | null) => {
    if (!seconds) return "—"
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
  }

  const kpis = summary
    ? [
        { label: "Mensajes Recibidos", value: summary.inbound_count, icon: MessageCircle, color: "text-blue-600" },
        { label: "Mensajes Enviados", value: summary.outbound_count, icon: MessageSquareText, color: "text-green-600" },
        { label: "Conversaciones Iniciadas", value: summary.initiated_count, icon: Send, color: "text-cyan-600" },
        { label: "Cotizaciones (PDFs)", value: summary.pdfs_sent_count, icon: FileText, color: "text-rose-600" },
        { label: "Tiempo Resp. Promedio", value: formatResponseTime(summary.avg_first_response_seconds), icon: Clock, color: "text-orange-600" },
        { label: "Chats Activos", value: summary.active_chats_count, icon: Users, color: "text-purple-600" },
        { label: "Sin Responder", value: summary.unanswered_chats_count, icon: AlertCircle, color: "text-red-600" },
        { label: "Chats Nuevos", value: summary.new_chats_count, icon: UserPlus, color: "text-indigo-600" },
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Dispositivo</Label>
          <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label} className="rounded-xl border border-border/40">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                    <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cotizaciones + Iniciados chart */}
          <Card className="rounded-xl border border-border/40">
            <CardHeader>
              <CardTitle className="text-sm">Cotizaciones (PDFs) e Iniciadas por día</CardTitle>
            </CardHeader>
            <CardContent>
              {timeseries.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={timeseries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="pdfs" name="Cotizaciones (PDFs)" fill="#e11d48" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="initiated" name="Conv. Iniciadas" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                  Sin datos para el rango seleccionado
                </div>
              )}
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Messages per day */}
            <Card className="rounded-xl border border-border/40">
              <CardHeader>
                <CardTitle className="text-sm">Mensajes por día</CardTitle>
              </CardHeader>
              <CardContent>
                {timeseries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={timeseries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="inbound" name="Recibidos" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="outbound" name="Enviados" stroke="#22c55e" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                    Sin datos para el rango seleccionado
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Response time per day */}
            <Card className="rounded-xl border border-border/40">
              <CardHeader>
                <CardTitle className="text-sm">Tiempo de respuesta promedio (min)</CardTitle>
              </CardHeader>
              <CardContent>
                {timeseries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={timeseries.map((t) => ({ ...t, avg_response_min: t.avg_response ? Math.round(t.avg_response / 60) : 0 }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="avg_response_min" name="Tiempo resp. (min)" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                    Sin datos para el rango seleccionado
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
