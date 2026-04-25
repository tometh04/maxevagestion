# Pending Smoke Tests — AFIP Sprint

Tests manuales que quedaron sin ejecutar end-to-end contra AFIP real. El código está deployed y unit-tested, pero falta validación real del flujo completo con CAE real.

## SP-2 Ganancia Facturación — E2E pendiente

**Cuándo:** cuando Maxi tenga un cliente "sacrificable" para emitir una factura real de prueba (la factura NO es reversible — solo se anula con NC).

**Pasos:**

1. Operación real con margen > 0 y cliente asignado (ej. `bcb5d72c-60ac-49a3-8f30-e4e8d7f99744` — Willemstad, $1.500 margen, HERNAN MARTINEZ DNI 30838187).
2. Tab Contabilidad → Click "Facturar ganancia".
3. Form precarga 1 ítem "Comisión por intermediación turística" con precio = margen restante. ✓ verificado visualmente.
4. **Pendiente de probar submit:**
   - [ ] Click "Crear y Autorizar con AFIP" → esperar CAE.
   - [ ] Toast verde con nro `0005-000000XX` + CAE.
   - [ ] Volver a operación → box muestra: margen $1.500, ya facturado $1.500 (100%), restante $0, botón disabled "Ya facturada completa".
   - [ ] Lista en box muestra la nueva factura con badge "✓ Verificada AFIP" (SP-1a verification read-back).
   - [ ] Section "Facturas Emitidas al Cliente" también la lista (mismo `operation_id`).
5. **Pendiente listado global:**
   - [ ] Sidebar → Operaciones → Facturación → buscar la factura.
   - [ ] Columna estado: Badge "authorized" + "✓ Verificada AFIP".
6. **Pendiente PDF + QR:**
   - [ ] Descargar PDF de la factura.
   - [ ] Footer muestra box verde "COMPROBANTE AUTORIZADO POR AFIP" + QR.
   - [ ] Scanear QR con iPhone → AFIP validator muestra los datos reales.
7. **Pendiente validación backend cap:**
   - [ ] `curl -X POST app.vibook.ai/api/invoices` con mismo `operation_id` + monto >0 → debería devolver 400 con `max_remaining: 0`.

## SP-1c PDF Downloads — smoke completado ✓

Validado 2026-04-24 con factura real CAE 86139389743826 (AFIP confirmó "Los datos ingresados coinciden con una autorización otorgada por la ARCA").

## SP-1a AFIP Hardening — smoke completado ✓

Deployed 2026-04-23. 3 crons verificados, verification_status en prod.

## SP-6 Purchase Invoices multi-tenant — smoke parcial ✓

Deployed 2026-04-25 (commit `d2e96c3`). Maxi cargó factura de prueba en Lozada — `org_id` autopobló correcto, RLS ok, listado funciona. Borrar la factura `dfb8c37e-6788-45e9-8329-a9d97bae364c` cuando se haga el smoke completo de otros pendientes.

## SP-6.5 Percepciones automáticas — E2E pendiente

Deployed 2026-04-25 (commit `45dc79b`). Lo que hay que probar cuando Maxi tenga tiempo:

1. Andá a `/operations/<id>` con operador con CUIT cargado → tab Contabilidad → "Cargar Manual" en Facturas de Compra.
2. Seleccionar operador → ingresar Neto Gravado (ej. 100000) → esperar 500ms.
3. **Verificar**:
   - [ ] Inputs `Percepción IVA` y `Percepción IIBB` con badge `auto` y fondo gris (read-only).
   - [ ] Banner azul: "Calculado automático según reglas de la agencia: IVA 3%, IIBB 2.5%".
   - [ ] Click "Editar manualmente" → inputs editables, banner amarillo "Modo manual".
   - [ ] Click "Volver a auto" → recalcula con valores correctos.
4. **Casos edge**:
   - [ ] Net 5000 (debajo del mínimo de IIBB 10k) → banner: "No aplica ninguna percepción".
   - [ ] Net 30000 (debajo del mínimo de IVA 50k pero arriba de IIBB 10k) → solo aplica IIBB.
   - [ ] Ir a `/finances/settings` → desactivar `withholdings_enabled` → volver al form → banner gris "Cálculo automático desactivado", inputs editables.
5. **Multi-tenant**: cargar como otra org con reglas distintas (ej. otra agencia con tasas custom) — verificar que aplica las suyas, no las de Lozada.

## SP-3 Libro IVA Digital — E2E pendiente

Deployed 2026-04-25 (commit `9dceee6`). Cuando el contador de Lozada (o cualquier agencia con data del mes) tenga tiempo:

1. `/accounting/libro-iva` → seleccionar mes con facturas cargadas (ej. abril 2026).
2. Click "Libro IVA Digital (RG 4597)" (botón naranja primario, junto al CSV).
3. **Verificar**:
   - [ ] Descarga `libro-iva-digital-YYYY-MM.zip`.
   - [ ] ZIP contiene 4 archivos: `REGINFO_CV_VENTAS_CBTE.txt`, `..._ALICUOTAS.txt`, `..._COMPRAS_CBTE.txt`, `..._ALICUOTAS.txt`.
   - [ ] Largos por línea: VENTAS_CBTE=266, VENTAS_ALICUOTAS=62, COMPRAS_CBTE=325, COMPRAS_ALICUOTAS=73.
4. **Importar en AFIP** "Mis Aplicaciones Web → Libro IVA Digital" → abrir período → cargar archivos. Debería aceptar sin errores de formato.
5. **Si AFIP rechaza** (ej. "campo X formato inválido"): copiar mensaje de error, identificar archivo y campo, fix en el formatter correspondiente (`lib/accounting/libro-iva-digital/<archivo>.ts`), tests + commit + redeploy.
6. **Multi-tenant**: probar con 2 agencias distintas, cada una solo ve sus comprobantes.

**Bug conocido**: `compras-cbte.ts` parsea `invoice_number` asumiendo formato "0001-00000099". Si una factura tiene número raro (sin guión), parsea solo el último número. Si AFIP rechaza por ese motivo, agregar validación en el form de carga.
