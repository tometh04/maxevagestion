# 📄 Subida y Escaneo de Documentos en Leads

## Funcionalidad

Ahora puedes subir documentos directamente en la tarjeta del lead y el sistema los escaneará automáticamente con IA para extraer los datos.

## Tipos de Documentos Soportados

- **Pasaporte** - Extrae: número, nombre completo, fecha de nacimiento, nacionalidad, fecha de vencimiento, lugar de nacimiento, MRZ, etc.
- **DNI** - Extrae: número de documento, nombre, apellido, fecha de nacimiento, domicilio, número de trámite, etc.
- **Licencia de Conducir** - Extrae: número de licencia, nombre, dirección, fechas, clase, restricciones, etc.
- **Voucher** - Solo almacenamiento (sin escaneo automático)
- **Factura** - Solo almacenamiento (sin escaneo automático)
- **Comprobante de Pago** - Solo almacenamiento (sin escaneo automático)
- **Otro** - Solo almacenamiento (sin escaneo automático)

## Cómo Usar

### 1. Subir un Documento

1. Abre un lead desde la sección **Leads**
2. En el diálogo de detalles, verás la sección **"Documentos Escaneados"**
3. Haz clic en **"Subir Documento"**
4. Selecciona el tipo de documento
5. Selecciona el archivo (imagen o PDF, máximo 10MB)
6. Haz clic en **"Subir y Escanear"**

### 2. Escaneo Automático

Si subes un **Pasaporte**, **DNI** o **Licencia**, el sistema automáticamente:
- ✅ Escanea el documento con OpenAI Vision (GPT-4o)
- ✅ Extrae todos los datos disponibles
- ✅ Guarda los datos en formato JSON en el campo `scanned_data`
- ✅ Muestra los datos extraídos en la interfaz

### 3. Ver Datos Escaneados

Los datos extraídos se muestran automáticamente debajo de cada documento:
- Número de documento
- Nombre completo
- Fecha de nacimiento
- Nacionalidad
- Fecha de vencimiento
- Y más campos según el tipo de documento

### 4. Ver/Eliminar Documentos

- **Ver**: Haz clic en el icono de ojo para abrir el documento en una nueva pestaña
- **Eliminar**: Haz clic en el icono de basura para eliminar el documento

## Migración Requerida

Antes de usar esta funcionalidad, ejecuta la migración en Supabase:

### Opción 1: Desde Supabase Dashboard

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **SQL Editor**
3. Copia y pega el contenido de `supabase/migrations/027_add_lead_documents.sql`
4. Ejecuta la query

### Opción 2: Desde la línea de comandos

```bash
psql $DATABASE_URL -f supabase/migrations/027_add_lead_documents.sql
```

## Campos Agregados

- `lead_id` - Referencia al lead al que pertenece el documento
- `scanned_data` - JSONB con todos los datos extraídos por IA
- Tipo `LICENSE` agregado a los tipos de documentos

## Requisitos

- ✅ `OPENAI_API_KEY` configurada en las variables de entorno de Vercel
- ✅ Bucket `documents` creado en Supabase Storage
- ✅ Migración ejecutada en la base de datos

## Ejemplo de Datos Extraídos

```json
{
  "document_type": "PASSPORT",
  "document_number": "AB123456",
  "full_name": "JUAN PEREZ",
  "first_name": "JUAN",
  "last_name": "PEREZ",
  "date_of_birth": "1990-01-15",
  "nationality": "ARG",
  "expiration_date": "2030-01-15",
  "place_of_birth": "BUENOS AIRES",
  "scanned_at": "2024-01-15T10:30:00Z",
  "scanned_by": "openai_gpt4o"
}
```

## Notas

- Los documentos se almacenan en Supabase Storage en el bucket `documents`
- Los datos escaneados se guardan en formato JSONB para búsquedas rápidas
- Solo se escanean automáticamente documentos de tipo Pasaporte, DNI o Licencia
- El escaneo puede tardar unos segundos dependiendo del tamaño de la imagen

