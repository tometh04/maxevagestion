# Respuesta a Vico Travel — Sesión 2026-05-22

Sobre los 14 puntos que Andrés mandó por WhatsApp el 22/05. Algunos eran
bugs, otros eran malentendidos de cómo funciona el sistema. Acá va el
detalle de cada uno: qué hicimos del lado del código y qué hay que
explicarle al equipo de Vico.

Los cambios que tocaron código van a producción con el deploy de hoy. Si
hay algo que falta explicar mejor o algún caso que se nos haya escapado,
me avisás.

---

## 1) Dashboard / Resumen — "no identifica fechas anteriores"

**Lo que pasaba**: el filtro de fechas del Dashboard decía "Operación"
pero internamente filtraba por *fecha de carga al sistema* (`created_at`).
Si cargabas hoy una venta con fecha de operación del mes pasado, la
venta aparecía en el rango "hoy" en vez de en su mes real.

**Fix**: ahora el filtro tiene tres opciones explícitas:

- **Fecha de Carga** — cuándo se cargó la venta al sistema (= comportamiento anterior, default).
- **Fecha de Venta** — cuándo se cerró la operación con el cliente.
- **Fecha de Salida** — cuándo viaja el cliente.

Eligen el corte que necesiten desde el dropdown que está arriba del
dashboard. Los números actuales no cambian salvo que cambien el tipo de
fecha — preservamos el default para que no haya sorpresas contables.

---

## 2) Resumen — "Deudores varía a veces" + "qué significa cada cuadro"

**Lo que pasaba**: dos cosas distintas mezcladas.

a) La variación entre cargas. Podía ser cache del browser o un deploy en
   curso al momento. **Si vuelven a verlo, decime con captura y revisamos.**

b) Sobre el significado de los cuadros: cada card tiene un ícono de
   help (?) al lado del título. Pasando el mouse aparece el detalle del
   cálculo.

**Fix**: el tooltip ahora es más visible y más claro. Por ejemplo:

> **Deudores** = Lo que tus clientes te deben. Suma de ventas pendientes
> de cobrar (monto vendido − pagos ya recibidos), convertido a USD con
> tipo de cambio histórico de cada operación.

> **Deuda** = Lo que vos le debés a tus operadores. Suma de pagos
> pendientes a operadores (monto de la deuda − parte ya pagada),
> convertido a USD. Para ver el desglose, entrá a Operadores y abrí
> cualquiera de la lista.

---

## 3) CRM Ventas — "que nos expliquen todo"

**No es un bug, es training.** Resumen rápido del flujo:

**De dónde viene la info**:
- Webhook de **Manychat** (Instagram/WhatsApp): cada vez que un cliente
  arranca un chat con un flow de Manychat configurado, llega un lead
  nuevo al CRM con teléfono, email, destino y región pre-cargados.
- Webhook de **Callbell**: similar, para WhatsApp/Instagram desde la
  herramienta Callbell. Cuando alguien escribe un mensaje nuevo, el lead
  se crea.
- **Manual**: cualquier vendedor puede crear un lead a mano con el botón
  "Nuevo Lead".

**Cómo se organiza**:
- **Columnas del Kanban** = listas. Cada vendedor puede tener su lista
  personal. Las columnas se pueden reordenar y crear nuevas.
- **Arrastrar lead entre columnas** = mover el lead a esa lista
  (típicamente lo "agarra" el vendedor de esa lista).
- **Filtros de arriba**: status del lead, región del destino, vendedor
  asignado.

**Estados de un lead**: `NEW → IN_PROGRESS → QUOTED → WON | LOST`.
Cuando pasa a `WON`, el botón "Convertir en operación" arma una
operación a partir de ese lead y la mueve a la sección Operaciones.

**Variables que afectan el orden**: `updated_at` (el último que se
movió arriba). Por eso si tocás un lead, sube en su columna.

---

## 4) Cliente — "que permita repetir número de teléfono"

**Lo que pasaba**: el sistema bloquea crear un cliente si ya hay otro
con el mismo teléfono (o email, o número de documento) en la misma
agencia. Es para evitar duplicados. Pero el mensaje era genérico
("ya existe un cliente con estos datos") y no decía *cuál* cliente ni
*qué campo* matcheó.

**Fix**:

- El mensaje ahora dice **qué campo** matcheó y **el nombre** del
  cliente existente. Ejemplo: *"Ya existe un cliente con el mismo
  teléfono: Juan Pérez. Editá ese cliente o desactivá la validación de
  duplicados en Configuración → Clientes."*
- **Bonus**: si querés permitir duplicados (caso pareja/familia con el
  mismo teléfono), se puede desactivar la validación desde Configuración
  → Clientes → "Validar duplicados" (toggle).

**Heads-up técnico**: aprovechamos para arreglar un leak entre orgs en
el dedup (antes consultaba clientes de todas las orgs en vez de solo
la propia). Ahora cada org ve solo sus propios duplicados.

---

## 5) "En lugares donde tocás Ver o Editar suele correrse una fecha"

**Lo que pasaba**: bug de timezone. Las fechas tipo "fecha de salida",
"fecha de pago" se guardan en la base de datos como YYYY-MM-DD sin hora.
Cuando JavaScript las leía con `new Date("2026-06-08")`, lo interpretaba
como medianoche UTC. Al renderear en zona Argentina (UTC-3), mostraba
**el día anterior**.

Lo habíamos fixeado parcialmente la semana pasada en el dialog de
editar operación, pero quedaron muchos otros lugares vulnerables.

**Fix**: barrido completo. Aplicamos el helper de parseo seguro en 11
componentes más:

- Detalle de cliente (operaciones y pagos del cliente)
- Cuenta corriente del cliente
- Tabla de clientes deudores
- Pagos a operadores (lista, KPIs, badges de vencido)
- Pago masivo (dialog y display de vencimientos)
- Deudas por ventas (tabla)
- Comisiones (vista admin, vista vendedor, tabla)
- Diálogo "Marcar como pagado"
- Diálogo "Nuevo pago" (display + envío al backend)

Las fechas ya no se corren. Si encuentran algún lugar específico donde
todavía falla, avísenme con captura y lo cubrimos.

---

## 6) Nueva Operación — "que permita poner la fecha de la venta"

**Lo que pasaba**: el campo "fecha de venta" (distinta a la fecha de
salida del viaje) existía en el dialog de **editar** operación pero no
en el de **crear**. Había que crear la operación primero y editar
después para setearla. Inconsistente.

**Fix**: ahora el dialog de "Nueva Operación" tiene el campo "Fecha de
Venta" — al lado de "Otro Localizador (ITR)". Si lo dejan vacío, el
sistema usa la fecha de hoy como default (igual que antes).

---

## 7) Nueva Operación — "que permita cargar el otro localizador"

**Lo que pasaba**: mismo problema que el #6. El campo `itr_localizador`
("otro localizador" del operador, distinto al PNR del aéreo) estaba en
el edit pero no en el create.

**Fix**: agregado al dialog de "Nueva Operación".

---

## 8) Operaciones / Estadísticas — "qué refleja, de dónde trae los números"

**Lo que pasaba**: Estadísticas filtra por **fecha de salida del viaje**
(no por fecha de carga). El Dashboard hasta hoy filtraba por fecha de
carga (ver #1). Por eso veían números muy distintos para "el mismo
período" entre ambas vistas.

Aparte, en la captura aparecía un rango "1/6/2025 al 31/6/2026" — junio
no tiene día 31. Si vuelven a verlo, **fijate si el input está mostrando
mal o si efectivamente aceptó la fecha inválida** y avísanos.

**Fix**:

- Tooltip de Estadísticas ahora aclara: *"El filtro usa la fecha de
  salida del viaje. Una operación cargada hoy con salida el mes que
  viene aparece en el rango del mes que viene, no en el de hoy. Esto
  es distinto al Dashboard, que por defecto filtra por fecha de carga."*
- Con la mejora del Dashboard (#1) ahora pueden elegir "Fecha de Salida"
  en el Dashboard para comparar manzanas con manzanas contra
  Estadísticas.

---

## 9) Pagos — "alarma automática 1 mes antes"

**Lo que pasaba**: el sistema YA genera alertas automáticamente a **30
días, 7 días, 3 días y el mismo día del vencimiento** de cada pago
pendiente. Pero Andrés no las estaba viendo porque:

- Las alertas viven en la sección **Alertas** (sidebar), no en el
  detalle de la operación.
- El cron que las genera corre una vez por día.

**No es bug, es comunicación.** Si quieren ver las alertas:

1. **Sidebar → Alertas** (o `/alerts`). Ahí están todas las alertas
   activas.
2. El umbral de "días antes" es configurable. Default 30 días (= 1 mes
   antes). Si quieren cambiarlo, decime y lo seteo per-tenant.

**Mejora futura propuesta**: generar el draft de la alerta cuando se
*crea* la operación, no esperando al cron. Lo dejo anotado para una
próxima iteración — no es bloqueante porque el cron corre todos los
días.

---

## 10) Movimientos financieros — "no se ven correlacionados"

**Lo que pasaba**: la vista `/cash/movements` muestra los movimientos
**de caja** (ingresos/egresos efectivos), no el asiento contable de
doble entrada (débito/crédito). Por eso parecía que no había
correlación.

La correlación que Andrés quería **ya existe** en otra vista:
**Contabilidad → Libro Mayor** (`/accounting/ledger`). Ahí cada
operación tiene dos filas con el mismo `ID OPERACIÓN`, uno como Crédito
y otro como Débito, sumando 0.

**Fix**: agregamos un link "Ver asiento contable" debajo del destino de
cada movimiento de caja. Click → te lleva directo al libro mayor
filtrado por esa operación, donde se ve la doble entrada.

**Nada cambia en el cálculo ni en la lógica**. Es solo el link que
faltaba para llegar de una vista a la otra.

---

## 11) Finanzas → Aprobaciones — "no entendemos cómo funciona"

**Lo que pasaba**: esta sección lista los pagos que necesitan
aprobación de un admin antes de imputarse. **No hay nada que ver porque
no tienen reglas de aprobación configuradas**. Por eso siempre muestra
"0 pagos pendientes".

**Cómo funciona**: pueden setear reglas como "los vendedores no pueden
aprobar pagos por más de ARS 50.000 sin que un admin apruebe primero".
Cuando alguien intenta cargar un pago por encima del límite, en vez de
imputarse directo, queda en estado `PENDING_APPROVAL` y aparece en
esta sección.

**Si quieren configurar reglas**, decime montos por rol (SELLER /
CONTABLE / ADMIN) y los seteamos. Si no las necesitan, queda vacío
porque todo se aprueba automático.

---

## 12) Contabilidad — "que nos expliquen todo"

**Resumen rápido del módulo**:

- **Libro Mayor** (`/accounting/ledger`) — todos los asientos de doble
  entrada. Cada movimiento financiero crea **dos** filas (débito + crédito)
  con el mismo `ID OPERACIÓN`. Es la fuente de verdad de la contabilidad.
- **Cuentas Financieras** — el plan de cuentas (caja, banco, mercado pago,
  etc.). Cada cuenta tiene saldo y se actualiza con los movimientos.
- **IVA** — registro de IVA ventas e IVA compras. Auto-poblado desde
  facturas (`/accounting/iva`). Hay un módulo aparte para generar el
  Libro IVA Digital de AFIP en TXT (resolución 4597).
- **Operator Payments** — la lista de pagos pendientes a operadores. Lo
  mismo que ven en la card "Deuda" del dashboard pero detallado por
  operación.
- **Pagos Recurrentes** — gastos fijos mensuales (alquiler, sueldos,
  servicios) que se generan automáticamente cada mes.
- **Retenciones** — IIBB, ganancias, impuestos sobre cheques que les
  retienen los clientes/operadores. Se cargan acá y se imputan al ledger.
- **Conciliación** — match de movimientos del banco con los del sistema.
- **Reportes** (`/accounting/monthly-position`) — informe mensual con
  ingresos, egresos, márgenes y saldo final.

**Documentación más detallada por sección**: si quieren un Loom guiado,
decime cuál es la prioridad y lo armamos.

---

## 13) Herramientas → Mensajes — "qué es"

Es el **control de WhatsApp**. Permite:

- Ver todos los chats activos con clientes (lista de conversaciones).
- Enviar mensajes individuales o de plantillas.
- Ver mensajes recibidos (entrantes desde Manychat o Callbell).
- Plantillas guardadas para respuestas rápidas.

Si no usan WhatsApp como canal principal, pueden ignorar esta sección.

---

## 14) Subir Documento — agregar tipo "Liquidación"

**Hecho.** El dropdown de "Tipo de Documento" ahora tiene la opción
**Liquidación** entre "Comprobante de Pago" y "Otro".

Sirve para subir las facturas/liquidaciones que les manda el operador
con el detalle de lo cobrado y comisionado por un periodo.

---

## Cómo seguir

- **Lo que cambió en producción hoy**: puntos 1, 2, 4, 5, 6, 7, 8, 10, 14.
- **Lo que es explicación**: puntos 3, 9, 11, 12, 13.
- **Lo que queda pendiente**:
  - **Mejora futura propuesta**: generar el draft de alerta de pago
    cuando se crea la operación (#9 — segunda parte). No es urgente
    porque el cron diario ya cubre la necesidad.
  - Si quieren configurar reglas de aprobación de pagos (#11), o cambiar
    el umbral de días para alertas de pago (#9), avisame los valores y
    los seteo per-tenant.
  - Si encuentran algún lugar donde la fecha se sigue corriendo (#5),
    captura + ubicación y lo cubrimos.

Cualquier cosa, me preguntás.
