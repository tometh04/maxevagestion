import { differenceInDays, differenceInMonths, startOfDay, endOfDay, eachDayOfInterval, format } from "date-fns"
import { es } from "date-fns/locale"

/**
 * Determina si un rango de fechas debe agruparse por días o por meses
 * @param dateFrom Fecha de inicio
 * @param dateTo Fecha de fin
 * @returns true si debe agruparse por días (rango <= 1 mes), false si por meses
 */
export function shouldGroupByDays(dateFrom: Date, dateTo: Date): boolean {
  const days = differenceInDays(endOfDay(dateTo), startOfDay(dateFrom))
  // Si el rango es menor o igual a 31 días, agrupar por días
  return days <= 31
}

/**
 * Genera etiquetas para el eje X basado en el rango de fechas
 * @param dateFrom Fecha de inicio
 * @param dateTo Fecha de fin
 * @returns Array de etiquetas formateadas (por día o por mes según el rango)
 */
export function generateXAxisLabels(dateFrom: Date, dateTo: Date): string[] {
  if (shouldGroupByDays(dateFrom, dateTo)) {
    // Generar días del intervalo
    const days = eachDayOfInterval({ start: startOfDay(dateFrom), end: endOfDay(dateTo) })
    return days.map(day => format(day, "dd/MM", { locale: es }))
  } else {
    // Generar meses del intervalo
    const months: string[] = []
    let current = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1)
    const endMonth = new Date(dateTo.getFullYear(), dateTo.getMonth(), 1)
    
    while (current <= endMonth) {
      months.push(format(current, "MMM yy", { locale: es }))
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    }
    
    return months
  }
}

/**
 * Formatea una fecha para mostrar en el eje X del gráfico
 * @param date Fecha a formatear
 * @param dateFrom Fecha de inicio del rango
 * @param dateTo Fecha de fin del rango
 * @returns String formateado según si es agrupación por días o meses
 */
export function formatChartDate(date: Date | string, dateFrom: Date, dateTo: Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (shouldGroupByDays(dateFrom, dateTo)) {
    return format(dateObj, "dd/MM", { locale: es })
  } else {
    return format(dateObj, "MMM yy", { locale: es })
  }
}

/**
 * Obtiene la clave de agrupación para datos del gráfico
 * @param date Fecha del dato
 * @param dateFrom Fecha de inicio del rango
 * @param dateTo Fecha de fin del rango
 * @returns String clave para agrupar (formato YYYY-MM-DD o YYYY-MM según el rango)
 */
export function getGroupingKey(date: Date | string, dateFrom: Date, dateTo: Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (shouldGroupByDays(dateFrom, dateTo)) {
    return format(dateObj, "yyyy-MM-dd")
  } else {
    return format(dateObj, "yyyy-MM")
  }
}
