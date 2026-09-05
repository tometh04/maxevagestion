# Borrado de borradores con opciones

El DELETE de cotizaciones mantiene el scope de organización, agencia y permisos,
el guard de estado DRAFT y el bloqueo de documentos emitidos.

PostgreSQL elimina el padre antes de ejecutar ON DELETE CASCADE sobre opciones e
ítems. El trigger `guard_closed_quotation_child_content` exigía encontrar ese padre
y lanzaba 23503. Ahora permite terminar únicamente un DELETE anidado cuyo padre
ya no existe. Las escrituras directas siguen comprobando existencia y estado;
las claves foráneas siguen impidiendo huérfanos y protegiendo documentos emitidos.

La API ya no interpreta todo error 23503 como evidencia de un documento emitido:
devuelve un conflicto por registros relacionados y deja el diagnóstico en servidor.

Prueba de regresión: `node scripts/test-quotation-cascade-delete.cjs <ruta a @electric-sql/pglite>`.
Con `--baseline` reproduce `quotation parent not found`; sin ese flag valida la
migración, el borrado en cascada y las protecciones de integridad existentes.
