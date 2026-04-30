export default function OnboardingBillingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-ink overflow-hidden">
      {/* Glowing blur background — matchea estilo landing */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/15 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent-violet/15 rounded-full blur-[150px]" />
        <div className="absolute inset-0 grid-bg opacity-[0.04]" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  )
}
