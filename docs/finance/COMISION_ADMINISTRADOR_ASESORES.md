# Comisión del administrador de asesores independientes (VIB-102)

Pedido de Lozada Rosario. Un asesor de viajes independiente (AVI, "free")
comisiona sobre sus ventas, y alguien del equipo lo administra y cobra un
porcentaje de cada una de esas ventas.

> "un free que comisiona el 50% a su vez tiene quien lo administra (que es
> alguien del equipo, por ahora mica o rama) y ellos comisionan un 5% de cada
> venta de ellos. Entonces la ganancia neta se reparte 45% agencia, 50% free y
> 5% administrador."

## Reparto

Todo se calcula sobre el **margen de la operación** (`margin_amount`, venta −
costo del operador), que es la base de toda comisión del sistema.

| Quién | De dónde sale |
|---|---|
| Free | `users.default_commission_percentage` (o `commission_rules`) |
| Administrador | `users.advisor_manager_percentage` del free |
| Agencia | El residuo: `100 − free − administrador` |

**La parte de la agencia no se guarda en ningún lado.** Es lo que queda.
Modelarla como un tercer porcentaje sería un número más que puede quedar
desincronizado de los otros dos.

## Configuración

`Configuración → Usuarios → (menú de un vendedor) → Administrador de ventas`.

Se guarda en la fila del **vendedor administrado**, no en la del administrador:

- `users.advisor_manager_id`: quién lo administra.
- `users.advisor_manager_percentage`: qué porcentaje cobra.

El vínculo aplica a cualquier `SELLER`, no solo a los que tienen
`is_independent_advisor = true`. Es deliberado: si dependiera además del flag,
apagar el modo asesor independiente cortaría una comisión que nadie pidió
cortar.

Validaciones (`lib/commissions/advisor-manager-link.ts`):

- El administrador tiene que ser de la misma organización. Se verifica contra la
  base: termina con filas de comisión en las ventas del vendedor, así que un id
  de otro tenant es plata y datos cruzándose.
- No puede ser un asesor independiente: vería comisiones de ventas ajenas, que
  es exactamente lo que ese modo existe para impedir.
- No puede ser el propio vendedor.
- El id y el porcentaje se guardan o se limpian juntos.

## Cálculo

`lib/commissions/advisor-manager.ts` (puro) resuelve quién cobra y cuánto;
`lib/commissions/calculate.ts` lo suma al plan de la operación.

- El porcentaje se aplica sobre el **margen completo**, también en ventas
  compartidas: el reparto entre los dos vendedores no cambia lo que cobra el
  administrador.
- Sin porcentaje configurado **no se cobra nada** y queda un warning. No hay
  default: sería plata que nadie eligió.
- Un administrador cobra **una sola vez por operación**, aunque administre a los
  dos vendedores de una venta compartida.
- Aplica también con `commission_split_mode = 'MANUAL'`: ese modo congela el
  reparto entre vendedores, no el trato con el administrador.
- El resultado no depende de quién quedó cargado como vendedor principal.

## Persistencia

La comisión del administrador es un `commission_records` más, con:

- `kind = 'ADVISOR_MANAGER'`
- `source_seller_id` = el vendedor administrado que la generó

No es una tabla aparte (a diferencia de `referral_commissions`) porque el
administrador **sí es un usuario del tenant**: tiene que cobrar por el mismo
circuito que cualquier comisión —pago, pago parcial, saldado, reporte de
comisiones, societario— y duplicar ese circuito sería la fuente de divergencia
más probable.

El constraint `unique (operation_id, seller_id)` (migración 119) se mantiene: si
el administrador **además vendió** esa operación, los dos porcentajes se acumulan
en su única fila y esta conserva `kind = 'SELLER'`.

`operations.commission_pct_primary` / `commission_pct_secondary` siguen
describiendo solo el reparto **entre vendedores**. Si el porcentaje del
administrador se filtrara ahí, `splitModeForUpdate` vería un valor distinto del
que manda el formulario y congelaría la operación en `MANUAL`.

## Impacto en reportes

- **Reporte de Comisiones**: la fila aparece con rol `advisor_manager` y la
  etiqueta "Administra a X". Sin `kind`, se leería como comisión huérfana, que es
  la marca que el reporte usa para señalar datos inconsistentes. El total por
  vendedor separa `advisorManagerTotal` de lo que cobró por vender.
- **Societario**: entra como comisión del período, así que reduce la ganancia de
  la agencia sin necesidad de tocar el reporte.
- **Objetivos de vendedores**: no se ven afectados, se calculan sobre
  `operations`, no sobre comisiones.

## Retroactividad

No es retroactivo. Aplica a las operaciones que se recalculen después de
configurar el vínculo (alta o edición de la operación). Las comisiones ya
pagadas, parcialmente pagadas o saldadas nunca se pisan.

## Orden de despliegue

La migración `20260805000001_advisor_manager_commission.sql` tiene que correr
antes o junto con el código. `resolveSellerCommissionProfiles` degrada por
escalones si faltan columnas (para no dejar todas las comisiones en cero), pero
la lectura del Reporte de Comisiones sí pide `kind` y `source_seller_id`
directamente.
