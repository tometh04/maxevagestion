/**
 * Cuándo un anuncio se muestra como modal.
 *
 * Vive acá y no dentro del componente porque es la regla que decide si se le
 * frena la pantalla a alguien. Equivocarse por exceso molesta a toda la base de
 * usuarios; por defecto, el aviso no llega justo a quien tenía que actuar.
 *
 * Sin base de datos a propósito: se prueba entera.
 */

export interface CondicionesDelModal {
  /** Si el anuncio está marcado para mostrarse como modal. */
  modal: boolean
  /** Desde cuándo. Null = desde que se publicó. */
  modal_starts_at?: string | null
  /** Hasta cuándo. Null = no vence. */
  modal_ends_at?: string | null
  /** Roles que lo ven. Null o vacío = todos. */
  modal_roles?: string[] | null
}

export interface ContextoDelUsuario {
  /** Momento de la evaluación, en ISO. Se pasa, no se lee del reloj: así se testea. */
  ahora: string
  /** Roles efectivos del usuario (`role` + `additional_roles`, como arma getCurrentUser). */
  rolesDelUsuario: string[]
  /** Si ya tildó "no volver a mostrar". */
  descartado: boolean
}

/**
 * La ventana está abierta.
 *
 * Las dos puntas son opcionales y significan cosas distintas: sin inicio, el
 * modal corre desde que se publica; sin fin, no vence. Lo segundo es una
 * decisión válida —un aviso de configuración obligatoria puede tener que quedar
 * hasta que se configure— pero conviene que sea explícita.
 */
export function ventanaAbierta(
  c: Pick<CondicionesDelModal, "modal_starts_at" | "modal_ends_at">,
  ahora: string
): boolean {
  if (c.modal_starts_at && ahora < c.modal_starts_at) return false
  if (c.modal_ends_at && ahora > c.modal_ends_at) return false
  return true
}

/**
 * El rol alcanza.
 *
 * Con un usuario multi-rol basta que UNO de sus roles esté en la lista. El
 * criterio es el mismo que usa el resto del sistema para permisos: los roles
 * suman, no se intersectan.
 */
export function alcanzaElRol(
  rolesDelAnuncio: string[] | null | undefined,
  rolesDelUsuario: string[]
): boolean {
  if (!rolesDelAnuncio || rolesDelAnuncio.length === 0) return true
  return rolesDelUsuario.some((r) => rolesDelAnuncio.includes(r))
}

export function debeMostrarse(
  anuncio: CondicionesDelModal,
  ctx: ContextoDelUsuario
): boolean {
  if (!anuncio.modal) return false
  if (ctx.descartado) return false
  if (!ventanaAbierta(anuncio, ctx.ahora)) return false
  return alcanzaElRol(anuncio.modal_roles, ctx.rolesDelUsuario)
}

/**
 * De todos los que corresponden, cuál se muestra.
 *
 * Uno solo. Dos modales encimados al entrar es peor que no avisar nada: el
 * usuario cierra los dos sin leer ninguno. Gana el más reciente, que es el que
 * el equipo acaba de publicar.
 *
 * Los anuncios se esperan ya ordenados por `published_at` descendente, que es
 * como los devuelve la consulta; igual se ordena acá para no depender de eso.
 */
export function elegirModal<T extends CondicionesDelModal & { published_at?: string | null }>(
  anuncios: T[],
  ctx: ContextoDelUsuario,
  descartados: Set<string>,
  idDe: (a: T) => string
): T | null {
  const candidatos = anuncios.filter((a) =>
    debeMostrarse(a, { ...ctx, descartado: descartados.has(idDe(a)) })
  )
  if (candidatos.length === 0) return null

  return candidatos.sort((a, b) =>
    String(b.published_at ?? "").localeCompare(String(a.published_at ?? ""))
  )[0]
}
