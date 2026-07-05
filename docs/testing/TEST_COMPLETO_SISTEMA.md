# Test completo del sistema

**Primero lo corro yo** (script automático). **Después lo probás vos** (checklist en la app).

1. **Test automático:** `npm run test:run-completo`  
   Crea lead → operación → cliente → pago cliente (mark paid) → pago operador y verifica que los saldos suban/bajen bien. Si todo pasa, seguís con el punto 2.

2. **Checklist manual:** Los pasos de abajo, en la app. Los vas siguiendo y marcando. Si algo no pasa como se dice, lo anotás y lo vemos.

---

## Antes de arrancar

- Entrás al sistema (login OK).
- Usuario **ADMIN** o **SUPER_ADMIN**.
- Tenés al menos **una agencia** y **un operador** cargados.

---

## 1. Crear un lead

1. Andá a **Ventas → Leads**.
2. Clic en **"+ Nuevo Lead"**.
3. Completá: agencia, nombre del contacto (ej. "Juan Pérez Test"), teléfono, destino (ej. "Punta Cana"), región.
4. Clic en **Crear Lead**.

**Verificá:** Que aparezca el lead en la lista/Kanban y un cartel de éxito.

---

## 2. Pasar a operación

1. Abrí ese lead (clic en la fila o en el detalle).
2. Clic en **"Convertir a Operación"** (o similar).
3. Completá: operador, precio total, moneda (**ARS** o **USD**), fecha de viaje.
4. Clic en **Crear Operación**.

**Verificá:** Que se cree la operación, que tengas código (ej. OP-…), que el lead pase a "ganado" y te lleve al detalle de la operación.

---

## 3. Cliente en la operación

1. En el detalle de la operación, buscá la parte de **clientes/pasajeros**.
2. Si al convertir el lead ya se creó un cliente, verificá que aparezca.
3. Si podés **agregar otro cliente** (ej. para un viaje grupal), agregalo y guardá.

**Verificá:** Que se vea el cliente (y el adicional si lo agregaste), con nombre y datos correctos.

---

## 4. Pagos del cliente (ingresos)

1. En la misma operación, andá a la sección **Pagos** (o "Pagos de Cliente").
2. Clic en **Agregar pago** / **Nuevo pago**.
3. Cargá: monto, moneda (idealmente la misma que la operación), fecha de vencimiento, método.
4. Guardá el pago.
5. **Marcar como pagado**: clic en "Marcar pagado" o similar.

**Al marcar pagado te tiene que pedir:**

- **Cuenta financiera:** tenés que elegir **en qué caja/cuenta** entra el dinero (ej. Caja ARS, Mercado Pago, etc.). No puede seguir sin elegir cuenta.
- **Tipo de cambio:** si la operación es en **USD** y pagás desde una cuenta en **ARS** (o al revés), tiene que pedir **tipo de cambio**. No tiene que dejar guardar sin ponerlo.

**Verificá:**

- Que no te deje marcar pagado sin elegir **cuenta financiera**.
- Que si hay mezcla de monedas, pida **tipo de cambio**.
- Que el pago figure como "Pagado" y que el "pagado" de la operación se actualice.

---

## 5. Cajas y saldos (resumen)

1. Andá a **Finanzas → Caja → Resumen** (o "Caja" → "Resumen").
2. Revisá la lista de **cuentas** (Caja ARS, Caja USD, bancos, etc.) con sus **saldos**.

**Verificá:**

- Que **se vean los saldos** de cada cuenta.
- Que la cuenta en la que ingresaste el pago del paso 4 **haya aumentado** el saldo (en la moneda que corresponda).
- Si hay filtro por **agencia**, probalo y confirmá que filtra bien.

---

## 6. Movimientos de caja

1. Andá a **Caja → Movimientos** (o similar).
2. Filtrá por **fecha de hoy** (o la fecha en que hiciste el pago).
3. Buscá el movimiento del **ingreso** que generaste al marcar pagado.

**Verificá:**

- Que aparezca el movimiento con el monto correcto.
- Que el **concepto** tenga algo claro (ej. nombre del pasajero + código de operación), no solo un código suelto.
- Que se pueda identificar la **cuenta** y la **operación**.

---

## 7. Pago a proveedores / operadores

1. Andá a **Contabilidad → Pagos a Operadores** (o "Pago a Operadores").
2. Buscá una deuda pendiente del operador de la operación que usaste (o cualquiera que tengas).
3. Iniciá el **pago** (o "Pagar", "Pago masivo", según lo que uses).
4. Elegí **cuenta financiera** desde la cual sale el dinero.
5. Si la deuda es en **USD** y pagás desde cuenta en **ARS** (o al revés), tiene que pedir **tipo de cambio**.

**Verificá:**

- Que **siempre** te pida **cuenta financiera** para pagar.
- Que **siempre** pida **tipo de cambio** cuando hay diferencia de monedas.
- Que al confirmar, la deuda baje (o se marque como pagada) y que **no** te deje pagar si la cuenta **no tiene saldo suficiente** (tiene que mostrar error de saldo insuficiente).

---

## 8. Que los saldos se muevan bien

1. Volvé a **Caja → Resumen**.
2. Fijate la cuenta desde la cual **pagaste** al operador en el paso 7.

**Verificá:**

- Que el **saldo de esa cuenta haya bajado** según el monto que pagaste.
- Que en **Movimientos** aparezca el **egreso** con monto y concepto correctos.

---

## 9. Tipo de cambio siempre que haga falta

Por lo que probaste arriba, confirmá:

- **Pago de cliente en USD** con cuenta en ARS → pide tipo de cambio.
- **Pago de cliente en ARS** con cuenta en USD → pide tipo de cambio.
- **Pago a operador** en una moneda distinta a la cuenta → pide tipo de cambio.

**Verificá:** En ninguno de esos casos se puede confirmar sin cargar tipo de cambio.

---

## 10. Deudores por ventas y Libro Mayor

1. Andá a **Contabilidad → Deudores por Ventas**.
2. Buscá la operación que usaste (o alguna con deuda).
3. Verificá que se vea **código de operación** y **nombre del cliente**.

Luego:

1. Andá a **Contabilidad → Libro Mayor**.
2. Filtrá por fecha y/o cuenta.
3. Buscá movimientos de la operación que usaste.

**Verificá:** Que los movimientos tengan montos y conceptos coherentes con los pagos y egresos que hiciste.

---

## 11. Métricas y estadísticas

1. Andá a **Ventas → Estadísticas** (o **Operaciones → Estadísticas**, según tu menú).
2. Elegí rango de fechas que incluya la **fecha de salida** de la operación que creaste.
3. Revisá ventas totales, margen, operaciones confirmadas.

**Verificá:** Que la operación del test aparezca en las métricas (ventas, margen). Si marcaste pagos, que lo "cobrado" y la "deuda" cuadren.

4. Si tenés **Reportes** (cashflow, márgenes, ventas): abrilos y verificá que los números incluyan la operación y los movimientos que hiciste.

5. **Contabilidad → Posición mensual** (si aplica): que el mes actual refleje ingresos, costos y saldos de caja coherentes con los pagos y egresos del test.

---

## 12. Calendario

1. Andá a **Calendario**.
2. Buscá la **fecha de salida** de la operación que creaste.

**Verificá:** Que aparezca un evento tipo **"Salida: [destino]"** (o similar) con el código de la operación. Si la operación tiene check-in, que también aparezca el evento de check-in.

3. Si dejaste **pagos pendientes** (sin marcar pagados): buscá las **fechas de vencimiento** de esos pagos en el calendario.

**Verificá:** Que aparezcan eventos tipo **"Pago de cliente"** o **"Pago a operador"** en esas fechas. Cuando marques esos pagos como pagados, esos eventos ya no deberían figurar para ese pago (porque solo se muestran pagos PENDING).

---

## 13. Alertas

1. Andá a **Alertas** (o **Notificaciones**, según tu menú).
2. Revisá la lista.

**Verificá:** Si tu sistema genera alertas por pagos próximos a vencer o vencidos, que las que correspondan a la operación del test aparezcan (o hayan aparecido). Si usás alertas de documentación o viajes próximos, que tengan sentido con la operación creada.

*(La generación exacta depende de crons/config; si no ves alertas nuevas, no necesariamente está mal, pero si las hay, deberían ser coherentes.)*

---

## 14. Búsqueda global (lupa)

1. Usá la **búsqueda global** (Cmd+K o Ctrl+K, o el ícono de lupa).
2. Buscá por **código de la operación** (ej. OP-…).
3. Buscá por **nombre del cliente** que agregaste.
4. Buscá por **destino** de la operación.

**Verificá:** Que en todos los casos aparezcan resultados que lleven a la operación o al cliente correctos. Al elegir, que te lleve al detalle correspondiente.

---

## 15. Cerebro (consultas sobre datos)

1. Andá a **Herramientas → Cerebro** (o **Emilia** / **AI**, según cómo esté en tu app).
2. Hacé preguntas como:
   - *"¿Cuántas operaciones tenemos?"*
   - *"¿Qué ventas hay este mes?"*
   - *"¿Cuál es la deuda pendiente de clientes?"*
   - *"¿Cuánto hay en Caja ARS?"* / *"Saldo de [nombre de la cuenta que usaste]"*
   - *"¿Qué operaciones hay para [destino]?"*

**Verificá:** Que las respuestas incluyan o reflejen la operación que creaste, los pagos que cargaste y los saldos de las cuentas que usaste. Si algo no cuadra (ej. saldo, deuda, ventas), anotalo.

---

## Checklist final

Marcá cuando lo hayas probado:

- [ ] Lead creado y convertido a operación.
- [ ] Cliente visible y, si aplica, agregado a la operación.
- [ ] Pago de cliente: **siempre** pide cuenta financiera y tipo de cambio (cuando corresponde).
- [ ] Saldos de cajas **se ven** y **suben** con ingresos.
- [ ] Movimientos de caja muestran el ingreso con concepto claro.
- [ ] Pago a operador: **siempre** pide cuenta financiera y tipo de cambio (cuando corresponde).
- [ ] Saldos **bajan** cuando pagás a operador; **no** deja pagar con saldo insuficiente.
- [ ] Deudores por ventas y Libro Mayor se ven bien y cuadran con lo que hiciste.

---

## Si algo falla

Anotá:

- **Qué paso** (número de sección).
- **Qué hiciste** (clics, datos que cargaste).
- **Qué pasó** (error, lo que no se ve, etc.).
- Si podés, **captura de pantalla**.

Con eso lo revisamos y lo corregimos.

---

**En resumen:** seguís este documento de arriba a abajo en la app. Si todos los puntos se cumplen, el sistema está probado de punta a punta: flujo financiero (lead → operación → cliente → pagos → proveedores → cajas → tipo de cambio → saldos), más impacto en métricas, estadísticas, calendario, alertas, búsqueda y Cerebro. Si algo no se cumple, lo anotás y lo vemos.
