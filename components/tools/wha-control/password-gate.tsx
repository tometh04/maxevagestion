"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Lock, ShieldCheck } from "lucide-react"

// Toggle this to false to disable password protection
const PASSWORD_ENABLED = true
const PASSWORD = "0423"
const STORAGE_KEY = "wha_control_auth"

interface PasswordGateProps {
  children: React.ReactNode
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!PASSWORD_ENABLED) {
      setIsAuthenticated(true)
      setIsLoading(false)
      return
    }
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored === "true") {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "true")
      setIsAuthenticated(true)
      setError(false)
    } else {
      setError(true)
      setPassword("")
    }
  }

  if (isLoading) return null

  if (isAuthenticated) return <>{children}</>

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm rounded-xl border border-border/40">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <Lock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">WHA Control</CardTitle>
          <CardDescription>Ingresá el PIN para acceder</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            <Input
              type="password"
              placeholder="••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(false)
              }}
              maxLength={4}
              className={`text-center text-2xl tracking-[0.5em] ${error ? "border-red-500" : ""}`}
              autoFocus
            />
            {error && (
              <p className="text-center text-sm text-red-500">PIN incorrecto</p>
            )}
            <Button type="submit" className="w-full" disabled={password.length < 4}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Acceder
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
