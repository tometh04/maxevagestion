# 20 Preguntas sobre la lógica financiera del sistema

Responde estas preguntas con **tu** forma de trabajar y reglas de negocio. Con eso ajustamos el código para que funcione como vos necesitás.

---

## Cuentas financieras

1. **¿Qué es una "cuenta financiera" en tu sistema?**  
   Ej: Caja, banco, Mercado Pago, cuenta virtual, etc. ¿Alguna otra?

2. **¿Una misma cuenta puede tener saldo en ARS y en USD, o siempre es una moneda por cuenta?**  
   Hoy el sistema asume: una cuenta = una moneda (ARS o USD).

3. **¿El "balance" de una cuenta es siempre `saldo inicial + ingresos - egresos` en esa moneda?**  
   ¿O usás otra regla (ej. por tipo de cuenta, por agencia)?

4. **¿Existen cuentas que sean "solo contables" (ej. Cuentas por Cobrar, Cuentas por Pagar) y que NO reciben transferencias desde caja/banco?**  
   ¿O toda cuenta que ves en "Cuentas financieras" puede recibir/enviar dinero?

---

## Ingresos y egresos

5. **Cuando registrás un INGRESO (ej. cobro de cliente):**  
   ¿Siempre debe elegirse la cuenta donde "entra" el dinero? ¿Esa cuenta incrementa su balance en el monto del ingreso?

6. **Cuando registrás un EGRESO (ej. pago a operador, gasto):**  
   ¿Siempre debe elegirse la cuenta de donde "sale" el dinero? ¿Esa cuenta disminuye su balance en el monto del egreso?

7. **¿Un mismo movimiento puede afectar a más de una cuenta?**  
   Ej: cobro en efectivo que va 50% a Caja y 50% a Mercado Pago. ¿O siempre es una sola cuenta por movimiento?

8. **¿Los ingresos/egresos vinculados a operaciones (ventas, pagos a operadores) siguen las mismas reglas que los movimientos manuales (caja, transferencias)?**  
   ¿O tenés reglas distintas?

---

## Transferencias

9. **¿Qué es una "transferencia" para vos?**  
   ¿Solo mover dinero de una cuenta a otra (ej. de Caja a Banco)? ¿O también incluye "cierre de cuenta" (eliminar cuenta y pasar el saldo a otra)?

10. **Cuando transferís de Cuenta A a Cuenta B:**  
    - ¿A debe disminuir y B debe aumentar exactamente el mismo monto?  
    - ¿Siempre en la misma moneda (ARS→ARS, USD→USD)?

11. **¿Existirán transferencias entre cuentas de distintas monedas (ARS↔USD)?**  
    Si sí, ¿cómo se define el tipo de cambio y quién lo fija?

12. **¿Las transferencias se registran como dos movimientos (egreso en origen, ingreso en destino) o como un solo tipo "TRANSFER"?**  
    Hoy usamos dos movimientos (EXPENSE + INCOME).

---

## Eliminación de cuentas y saldo

13. **Si una cuenta tiene saldo > 0 y la querés "eliminar":**  
    ¿Siempre hay que indicar otra cuenta a la que transferir ese saldo? ¿O a veces se permite "cerrar" sin transferir (y qué pasa con ese dinero)?

14. **Si una cuenta tiene saldo < 0 (en descubierto):**  
    ¿También hay que "transferir" esa deuda a otra cuenta al eliminarla? ¿La cuenta destino debería quedar con menos saldo (más deuda)?

15. **¿La "eliminación" de una cuenta es "para siempre" (no se usa más) o solo "archivar/ocultar"?**  
    Hoy hacemos soft-delete (`is_active = false`).

---

## Cálculo de balance y tipos de cuenta

16. **¿Todas las cuentas que ves en "Cuentas financieras" se comportan igual para el balance?**  
    Es decir: INCOME suma, EXPENSE resta.  
    ¿O tenés cuentas tipo "pasivo" donde la regla es al revés (ej. una deuda donde INCOME reduce lo que debés)?

17. **¿Usás "plan de cuentas" (chart of accounts) con categorías ACTIVO/PASIVO/RESULTADO?**  
    ¿Las cuentas financieras están ligadas a ese plan? Hoy el balance puede invertirse para cuentas PASIVO.

18. **Para cuentas en USD, ¿el balance se muestra y calcula siempre en USD?**  
    ¿O a veces en ARS usando un tipo de cambio? Hoy: USD → `amount_original`, ARS → `amount_ars_equivalent`.

---

## Libro mayor y movimientos

19. **¿Cada ingreso/egreso/transferencia debe quedar registrado en un "libro mayor" (ledger) con cuenta, tipo, monto, concepto?**  
    ¿O solo te importa el balance actual por cuenta?

20. **¿Hay otros flujos que muevan dinero (comisiones, ajustes, tipos de cambio, etc.) que deban seguir las mismas reglas de "siempre elegir cuenta" y "balance = inicial + ingresos - egresos"?**

---

## Cómo usar tus respuestas

- Copiá este archivo, respondé cada punto (aunque sea corto).
- Con eso se revisa:
  - Cálculo de balance (`getAccountBalance`).
  - Creación de movimientos en DELETE (transferencia al eliminar cuenta).
  - Reglas de ingresos/egresos y transferencias.
- Objetivo: que transferencias, pagos, ingresos y eliminación de cuentas se comporten **igual** a como vos los pensás.
