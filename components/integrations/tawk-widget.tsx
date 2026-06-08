"use client"

import Script from "next/script"

/**
 * Tawk.to live chat widget — scoped a un user específico.
 *
 * 2026-05-19 (Tomi): habilitar Tawk solo para el user de pruebas
 * (mypupybox@gmail.com). El resto de los users del SaaS NO cargan el JS
 * del widget — cero impacto en performance, privacy ni UX para tenants
 * reales.
 *
 * Cuando querramos abrir Tawk a más users:
 *   - Para todos los users de una org → cambiar el filtro a user.org_id
 *   - Para todo el sistema → quitar la condición
 *   - Para una lista de emails → cambiar a `ALLOWED_EMAILS.includes(userEmail)`
 *   - Para un feature flag → leer de organizations.config o users.features
 */

const ALLOWED_EMAILS = new Set<string>([
  "mypupybox@gmail.com",
])

export function isTawkUser(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.has(email.trim().toLowerCase())
}

export function TawkWidget({ userEmail }: { userEmail: string | null | undefined }) {
  if (!isTawkUser(userEmail)) {
    // Resto de users: el componente NO renderiza nada, así que el JS de
    // Tawk.to ni siquiera se descarga del CDN. Garantizado por React/Next.
    return null
  }

  // Tawk_API se setea acá para que el cliente lo tenga inicializado antes
  // de que cargue el script principal (espejo del snippet oficial).
  // Reemplazo del `s0.parentNode.insertBefore(s1, s0)` original por
  // `<Script>` de next/script con strategy="afterInteractive": inyecta
  // el script asíncrono después de que la página esté interactiva.
  //
  // 2026-05-19 (Tomi): la esquina bottom-right ya la usan otros widgets
  // del sistema (notificaciones push, etc). Forzamos el bubble de Tawk
  // al centro inferior. Tawk no soporta "bottom-center" como preset, así
  // que usamos CSS global + repositioning en onLoad (defensive: a veces
  // Tawk re-renderiza y pierde el override).
  return (
    <>
      <style jsx global>{`
        /* Reposicionar el wrapper que Tawk inyecta. Selectores múltiples
           porque Tawk no expone un id estable — el iframe puede aparecer
           con distintos selectores según versión del widget. */
        iframe[title*="chat" i][src*="tawk.to"],
        iframe[id^="tawkchat"],
        iframe[id*="tawkchat-minified"] {
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%) !important;
        }
      `}</style>
      <Script
        id="tawk-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.Tawk_API = window.Tawk_API || {};
            window.Tawk_LoadStart = new Date();

            // Reposicionar el bubble al centro inferior cuando Tawk carga.
            // Defensive: el CSS global ya intenta esto, pero Tawk a veces
            // re-renderiza el wrapper y pierde el override. El JS recorre
            // todos los iframes de Tawk y los empuja al centro.
            function repositionTawkToCenter() {
              try {
                var iframes = document.querySelectorAll(
                  'iframe[src*="tawk.to"], iframe[id^="tawkchat"], iframe[id*="tawkchat-minified"]'
                );
                iframes.forEach(function(el) {
                  // El wrapper que Tawk posiciona puede ser el iframe directo
                  // o un div padre. Intentamos ambos.
                  [el, el.parentElement].forEach(function(target) {
                    if (target && target.style) {
                      target.style.setProperty('left', '50%', 'important');
                      target.style.setProperty('right', 'auto', 'important');
                      target.style.setProperty('transform', 'translateX(-50%)', 'important');
                    }
                  });
                });
              } catch (e) {
                console.warn('[tawk] reposition failed:', e);
              }
            }

            window.Tawk_API.onLoad = function() {
              repositionTawkToCenter();
              // Reaplicar tras maximizar/minimizar (Tawk re-monta el iframe)
              window.Tawk_API.onChatMinimized = repositionTawkToCenter;
              window.Tawk_API.onChatMaximized = repositionTawkToCenter;
              // Triple-tap defensivo por las dudas
              setTimeout(repositionTawkToCenter, 500);
              setTimeout(repositionTawkToCenter, 2000);
            };
          `,
        }}
      />
      <Script
        id="tawk-embed"
        strategy="afterInteractive"
        src="https://embed.tawk.to/6a0cfd9677f0641c3293d280/1jp1bt5db"
        crossOrigin="anonymous"
      />
    </>
  )
}
