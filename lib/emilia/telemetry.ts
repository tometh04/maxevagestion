/**
 * Sistema de telemetría para medir performance de Emilia
 * Mide TTFI (Time-to-First-Interaction) y otros KPIs
 */

interface PerfMetrics {
  t0_click?: number           // Click event
  t1_post_start?: number      // POST request sent
  t2_post_end?: number        // POST response received
  t3_state_updated?: number   // Conversation selected
  t4_get_start?: number       // GET messages request sent (si aplica)
  t5_get_end?: number         // GET messages response received (si aplica)
  t6_chat_rendered?: number   // Chat UI interactive (TTFI)
}

export class ConversationTelemetry {
  private metrics: PerfMetrics = {}
  private enabled: boolean = process.env.NODE_ENV === 'development'

  constructor(enabled?: boolean) {
    if (enabled !== undefined) {
      this.enabled = enabled
    }
  }

  mark(event: keyof PerfMetrics) {
    if (!this.enabled) return
    this.metrics[event] = performance.now()
  }

  report(conversationId?: string) {
    if (!this.enabled) return

    const { t0_click, t1_post_start, t2_post_end, t3_state_updated, t4_get_start, t5_get_end, t6_chat_rendered } = this.metrics

    if (!t0_click) {
      console.warn('[Emilia Telemetry] No t0_click marked')
      return
    }

    console.group(`[Emilia Performance] ${conversationId || 'New Conversation'}`)

    // TTFI (métrica más importante)
    if (t6_chat_rendered) {
      const ttfi = t6_chat_rendered - t0_click
      console.log(`✅ TTFI (Time to First Interaction): ${ttfi.toFixed(2)}ms`)

      if (ttfi < 100) {
        console.log('   🚀 EXCELENTE - Percepción de 0 lag')
      } else if (ttfi < 300) {
        console.log('   ✅ BUENO - Lag aceptable')
      } else {
        console.log('   ⚠️ LENTO - Mejorable')
      }
    }

    // Network POST time
    if (t1_post_start && t2_post_end) {
      const networkPost = t2_post_end - t1_post_start
      console.log(`📡 Network POST: ${networkPost.toFixed(2)}ms`)
    }

    // Network GET time (si aplicó)
    if (t4_get_start && t5_get_end) {
      const networkGet = t5_get_end - t4_get_start
      console.log(`📡 Network GET: ${networkGet.toFixed(2)}ms`)
    }

    // State update time
    if (t2_post_end && t3_state_updated) {
      const stateUpdate = t3_state_updated - t2_post_end
      console.log(`⚛️ State update: ${stateUpdate.toFixed(2)}ms`)
    }

    // UI optimistic time
    if (t0_click && t3_state_updated) {
      const uiOptimistic = t3_state_updated - t0_click
      console.log(`⚡ UI Optimistic (click → UI update): ${uiOptimistic.toFixed(2)}ms`)

      if (uiOptimistic < 50) {
        console.log('   ✅ Instantáneo')
      }
    }

    console.groupEnd()
  }

  reset() {
    this.metrics = {}
  }
}

// Singleton para uso global
export const conversationTelemetry = new ConversationTelemetry()
