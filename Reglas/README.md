# 🏥 FARMADATIX SaaS — CONTEXTO MAESTRO DEL PROYECTO

## ⚠️ REGLAS OBLIGATORIAS PARA AGENTES

### Backend y Base de Datos
- Leer SIEMPRE `supabase/migrations/` antes de modificar lógica.
- `supabase/migrations/` es la fuente oficial del backend.
- NO asumir columnas, funciones o tablas.
- NO usar información obsoleta de `.md` antiguos si contradicen migrations.
- Toda lógica crítica debe vivir en PostgreSQL/RPC, NO en React.
- Nunca romper:
  - multiempresa,
  - company_id,
  - RLS,
  - trazabilidad,
  - auditoría,
  - kardex.

---

# 🧠 ARQUITECTURA GENERAL

## Stack
- React + Vite
- Supabase
- PostgreSQL
- RPC SQL
- SaaS Multiempresa
- Esquema principal: `pharmacy`

## Arquitectura correcta
```text
Frontend React = UX
Backend PostgreSQL/RPC = autoridad legal y lógica real
Supabase = ejecución/datos en tiempo real
supabase/migrations = fuente oficial del backend

🏢 MULTITENANT SaaS
Seguridad obligatoria

Toda tabla crítica debe incluir:

company_id
created_by
updated_by
RLS

Las políticas RLS son obligatorias.
Ninguna empresa puede:

leer,
modificar,
consultar,
datos de otra empresa.
🏥 ARQUITECTURA FARMACIA
Esquema principal
pharmacy
Objetivo

Sistema farmacéutico SaaS orientado a:

ISP
MINSAL
trazabilidad
auditoría
escalabilidad enterprise
📦 TOPOLOGÍA WMS
Bodegas

Tabla:

warehouses
Ubicaciones

Tabla:

locations

Tipos:

QUARANTINE
STORAGE
SALES
Regla crítica

Solo SALES puede descontar stock en POS.

📦 INVENTARIO Y LOTES
ADN del stock

Tabla:

inventory_batches

Campos críticos:

batch_number
expiry_date
location_id
FEFO

La salida debe priorizar:

lote con vencimiento más cercano
Kardex

Tabla:

inventory_movements

Movement types válidos:

SALE
RECEIPT
TRANSFER
ADJUSTMENT
Importante

Usar SOLO:

from_location_id
to_location_id

NO usar:

source_location_id
destination_location_id
💊 RECETAS Y POS
Estados válidos receta
PENDING
PARTIAL
DISPENSED
EXPIRED
CANCELLED
Tipos receta
RECETA_SIMPLE
RECETA_RETENIDA
RECETA_CHEQUE
Condiciones venta
VD
R
RR
RCH
Reglas críticas
Backend valida TODO.
React solo mejora UX.
process_pharmacy_sale es autoridad final.
Validaciones obligatorias backend
stock,
receta válida,
receta vigente,
paciente correcto,
cantidad pendiente,
tipo receta correcto,
kardex,
auditoría,
FEFO.
🧾 TRANSACCIONALIDAD
RPC crítica
process_pharmacy_sale

Responsable de:

ventas,
stock,
kardex,
recetas,
quantity_dispensed,
auditoría.
Regla

Toda venta debe ocurrir en UNA transacción SQL.

NO duplicar lógica en frontend.

🔍 PERFORMANCE Y ESCALABILIDAD
Objetivo

Arquitectura SaaS para múltiples farmacias concurrentes.

Reglas
evitar sobreconsultas,
usar búsquedas optimizadas,
usar debounce,
limitar resultados,
evitar loops de queries,
preferir RPC batch.
Futuro

Preparar arquitectura para:

React Query,
cache,
lazy loading,
virtualización.
🎨 GUÍA UI/UX — DATIX
Estilo

Sobrio, ejecutivo, elegante.

NO:

animaciones excesivas,
degradados,
interfaces “divertidas”.
🎨 PALETA
Color principal
#4C3073
Fondo
#f8f9fa
Contenedores
blancos,
bordes suaves,
shadow-sm.
🧭 NAVEGACIÓN
Arquitectura

Document-Centric.

NO usar modales para CRUD complejos.

Usar:

LIST
FORM fullscreen
🧱 FORMULARIOS
Labels
uppercase
text-[11px]
text-gray-500
Inputs
sobrios,
simples,
text-sm
🧩 ICONOS

Usar SOLO:

Lucide React
⚡ MICROINTERACCIONES

NO usar:

animate-pulse
transiciones pesadas
efectos exagerados

Preferir:

instantáneo,
fade corto,
UI rápida.
🧠 RESPUESTAS DEL AGENTE
Obligatorio
máximo 100 palabras,
frases cortas,
directo,
no explicar de más,
esperar siguiente instrucción.
Formato
3 a 6 frases máximo,
usar viñetas solo si ayuda.
🚨 REGLA DE ORO

Si una validación afecta:

stock,
recetas,
auditoría,
legalidad,
multiempresa,
kardex,
trazabilidad,

ENTONCES:

la lógica debe implementarse en PostgreSQL/RPC
NO en React