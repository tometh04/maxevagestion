/**
 * Aplicar una regla de comisión a lo que YA se calculó.
 *
 * QUÉ RESUELVE
 * ------------
 * Cambiar el porcentaje de un vendedor no toca las comisiones existentes: cada
 * `commission_record` guarda el `percentage` con el que se calculó en su
 * momento. Yamil puso 45% a Santi desde el 01/08 y las 23 comisiones de agosto
 * siguieron en 35%. Desde la pantalla no había forma de arrastrarlas: la
 * comisión sólo se recalcula cuando alguien edita la operación.
 *
 * POR QUÉ NO SIRVE EL RECÁLCULO GLOBAL QUE YA EXISTÍA
 * --------------------------------------------------
 * `POST /api/commissions/recalculate` recalcula TODAS las operaciones de la org
 * —- y nadie lo llamaba desde la UI, así que en la práctica no existía. Pero el
 * problema no es que sea grande: es que estaría mal.
 *
 * `resolveSellerCommissionProfiles` filtra las reglas por `valid_from <= HOY`.
 * O sea que `valid_from` responde "¿esta regla rige ahora?", no "¿a qué
 * operaciones les toca". Una regla vigente desde el 01/08 aplicada a un
 * recálculo global le pondría 45% también a las comisiones de julio. Medido en
 * Lozada al momento del cambio: Santi tenía **15 comisiones pendientes
 * anteriores a agosto**, Melani 3, Micaela 1, Julian 2 -- justo el mes que se
 * estaba por cerrar y pagar.
 *
 * Por eso el alcance no lo elige el usuario ni es "todo": sale de la vigencia
 * de la regla que se está aplicando. La ventana viene de la regla, no de una
 * fecha tipeada aparte, así que no hay forma de pedir un rango que contradiga
 * lo que la regla dice.
 *
 * QUÉ NO SE TOCA
 * --------------
 * Lo que ya tiene plata atrás: `applyCommissionPlan` saltea las comisiones
 * pagadas, las pagadas en parte y las saldadas. Acá se cuentan aparte para
 * poder decírselo al usuario ANTES de aplicar, en vez de que descubra después
 * que algunas no se movieron.
 */

/** Ventana de imputación (`accrual_date`) a la que alcanza una regla. */
export interface RuleWindow {
  /** Inclusive. Formato YYYY-MM-DD. */
  from: string
  /** Inclusive. `null` = sin límite. */
  to: string | null
}

export interface CommissionRuleForApply {
  seller_id: string | null
  valid_from: string | null
  valid_to: string | null
}

export type RuleApplicability =
  | { applicable: true; sellerId: string; window: RuleWindow }
  | { applicable: false; reason: string }

/** Recorta un timestamp a la parte de fecha, que es lo que guarda `accrual_date`. */
function soloFecha(valor: string): string {
  return valor.slice(0, 10)
}

/**
 * ¿Se puede arrastrar esta regla a las comisiones ya calculadas, y hasta dónde?
 *
 * Sólo las reglas de un vendedor concreto. La genérica de la org es el último
 * escalón de la precedencia: quiénes la están usando depende de que cada
 * vendedor no tenga porcentaje propio, y arrastrarla en bloque cambiaría
 * comisiones de gente que nadie nombró.
 */
export function ruleApplicability(rule: CommissionRuleForApply): RuleApplicability {
  if (!rule.seller_id) {
    return {
      applicable: false,
      reason:
        "La regla general no se puede arrastrar: alcanzaría a todos los que no tienen porcentaje propio.",
    }
  }

  if (!rule.valid_from) {
    return {
      applicable: false,
      reason: "La regla no tiene fecha de inicio, así que no hay período que recalcular.",
    }
  }

  const from = soloFecha(rule.valid_from)
  const to = rule.valid_to ? soloFecha(rule.valid_to) : null

  if (to && to < from) {
    return { applicable: false, reason: "La regla termina antes de empezar." }
  }

  return { applicable: true, sellerId: rule.seller_id, window: { from, to } }
}

export interface CommissionRecordState {
  status?: string | null
  amount_paid?: number | null
  settled_at?: string | null
  percentage?: number | null
}

export interface ApplyPreview {
  /** Comisiones en la ventana que se van a recalcular. */
  aRecalcular: number
  /** Comisiones que no se tocan porque ya tienen plata atrás. */
  bloqueadas: number
  /** De las recalculables, cuántas ya están en el porcentaje de la regla. */
  yaEnElPorcentaje: number
}

/**
 * Qué va a pasar si se aplica, contado antes de aplicar.
 *
 * El mismo criterio de bloqueo que `isLocked` en `calculate.ts`: un registro
 * pagado, pagado en parte o saldado no se pisa nunca de forma automática.
 */
export function previewApplication(
  records: CommissionRecordState[],
  rulePercentage: number
): ApplyPreview {
  let aRecalcular = 0
  let bloqueadas = 0
  let yaEnElPorcentaje = 0

  for (const record of records) {
    const bloqueada =
      (record.status ?? "PENDING") !== "PENDING" ||
      Number(record.amount_paid ?? 0) > 0 ||
      !!record.settled_at

    if (bloqueada) {
      bloqueadas++
      continue
    }

    aRecalcular++
    if (record.percentage != null && Number(record.percentage) === rulePercentage) {
      yaEnElPorcentaje++
    }
  }

  return { aRecalcular, bloqueadas, yaEnElPorcentaje }
}
