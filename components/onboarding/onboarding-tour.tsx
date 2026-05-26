"use client"

import { useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { X, ChevronRight, ChevronLeft, Rocket, PartyPopper } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ONBOARDING_STEPS, useOnboarding } from "./use-onboarding"

const ALLOWED_EMAILS = ["mypupybox@gmail.com"]

export function OnboardingTour({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ob = useOnboarding()

  if (!ALLOWED_EMAILS.includes(userEmail)) return null
  if (!ob.mounted) return null

  return (
    <>
      <WelcomeModal ob={ob} />
      <TourCoach ob={ob} router={router} pathname={pathname} searchParams={searchParams} />
      <CompletionModal ob={ob} router={router} />
    </>
  )
}

function WelcomeModal({ ob }: { ob: ReturnType<typeof useOnboarding> }) {
  if (!ob.showWelcome) return null

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/60 animate-in fade-in duration-300" />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] rounded-2xl border border-border/50 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <div className="px-7 pt-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-purple-500 shadow-lg shadow-primary/20">
              <Rocket className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Bienvenido a <span className="text-primary">Vibook</span>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Te guiamos paso a paso para configurar tu agencia. Solo toma unos minutos.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 px-7 py-5">
            {ONBOARDING_STEPS.map((step, i) => (
              <div
                key={step.key}
                className="flex items-center gap-3.5 rounded-lg bg-muted/50 px-4 py-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{step.title}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-border/50 px-7 py-5">
            <Button variant="ghost" size="sm" onClick={ob.dismissWelcome}>
              Lo hago después
            </Button>
            <Button onClick={ob.startTour} size="sm">
              Empezar <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function TourCoach({
  ob,
  router,
  pathname,
  searchParams,
}: {
  ob: ReturnType<typeof useOnboarding>
  router: ReturnType<typeof useRouter>
  pathname: string
  searchParams: ReturnType<typeof useSearchParams>
}) {
  const step = ob.currentStep

  useEffect(() => {
    if (!ob.tourActive || !step) return
    const currentUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "")
    const targetUrl = step.route
    if (!currentUrl.includes(targetUrl.split("?")[0])) {
      router.push(targetUrl)
    }
  }, [ob.tourActive, step, pathname, searchParams, router])

  if (!ob.tourActive || !step) return null

  const stepIndex = ob.tourStepIndex
  const isFirst = stepIndex === 0
  const isCompleted = ob.isStepCompleted(step.key)

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-[380px] max-w-[calc(100vw-48px)] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-2xl border border-border/50 bg-card shadow-2xl">
        {/* Progress bar */}
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              Paso {stepIndex + 1} de {ob.totalSteps}
            </span>
            <button
              onClick={ob.closeTour}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            {ONBOARDING_STEPS.map((s, i) => (
              <div
                key={s.key}
                className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                  ob.isStepCompleted(s.key)
                    ? "bg-green-500"
                    : i === stepIndex
                      ? "bg-primary"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-2xl">{step.icon}</span>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold leading-snug">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-border/50 px-5 py-3.5">
          <div className="flex gap-1.5">
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={ob.prevStep}>
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Atrás
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={ob.skipStep}>
              Omitir
            </Button>
          </div>
          <Button
            size="sm"
            onClick={ob.completeCurrentStep}
            className={isCompleted ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {isCompleted ? "Siguiente" : "Listo, siguiente"}
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function CompletionModal({
  ob,
  router,
}: {
  ob: ReturnType<typeof useOnboarding>
  router: ReturnType<typeof useRouter>
}) {
  if (!ob.showCompletion) return null

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/60 animate-in fade-in duration-300" />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="w-full max-w-[400px] rounded-2xl border border-border/50 bg-card p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-green-500/10">
            <PartyPopper className="h-9 w-9 text-green-500" />
          </div>
          <h2 className="text-xl font-bold">¡Tu agencia está lista!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Completaste la configuración inicial. Ya podés empezar a operar.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => {
                ob.closeCompletion()
                router.push("/operations")
              }}
              className="flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="text-lg">✈️</span>
              <span className="flex-1 font-medium">Crear primera operación</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => {
                ob.closeCompletion()
                router.push("/dashboard")
              }}
              className="flex items-center gap-3 rounded-lg border border-border/50 px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="text-lg">📊</span>
              <span className="flex-1 font-medium">Ir al dashboard</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
