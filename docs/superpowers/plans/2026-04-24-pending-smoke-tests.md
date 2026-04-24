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
