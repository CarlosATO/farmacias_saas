# 🏥 DOCUMENTO MAESTRO: ARQUITECTURA MÓDULO FARMACIA (SaaS)

## 1. OBJETIVO DEL SISTEMA
El módulo de Farmacia es un entorno clínico y logístico de alta restricción, diseñado para cumplir con la normativa del Instituto de Salud Pública de Chile (ISP) y MINSAL. Se aísla del resto del ERP utilizando el esquema de base de datos `pharmacy` (PostgreSQL).

## 2. TOPOLOGÍA FÍSICA (WMS - Warehouse Management System)
El inventario no flota en el vacío. Todo producto tiene una coordenada física exacta.
- **Bodegas (Warehouses):** Recintos principales (Ej: Local Central, Bodega Externa).
- **Ubicaciones (Locations):** Zonas específicas dentro de una bodega.
  - `CUARENTENA_RECEPCION`: Ingreso inicial por defecto.
  - `BODEGA_TRASTIENDA`: Almacenaje masivo.
  - `SALA_VENTAS`: Única ubicación desde la cual el Punto de Venta (POS) puede descontar stock directamente.
  - `CADENA_FRIO`: Exclusiva para insulinas/vacunas.
  - `CAJA_SEGURIDAD`: Exclusiva para controlados (Receta Retenida).

## 3. CATÁLOGO DE MEDICAMENTOS Y FRACCIONAMIENTO (UOM)
El catálogo (`pharmacy.products`) soporta la dualidad de empaque del mundo real (Ej: CENABAST).
- **Unidad de Compra:** Envase clínico o caja de distribución (Ej: Caja de 1000).
- **Unidad de Venta (Dispensación):** Unidad mínima transaccional en el POS (Ej: Tira de 10, Comprimido suelto).
- **Factor de Conversión:** Multiplicador logístico. (Si se recibe 1 Unidad de Compra con Factor 100, el sistema ingresa automáticamente 100 Unidades de Venta al inventario).
- **Códigos de Barras Duales:** `barcode_purchase` (Código de la caja mayor) y `barcode_sale` (Código de dispensación al paciente).

## 4. LOGÍSTICA DE ENTRADA (Órdenes de Compra y Recepción)
La gestión de adquisiciones (`pharmacy.purchase_orders` y `pharmacy.purchase_order_items`) maneja el caos real:
- **Transaccionalidad Multi-Estado:** `DRAFT` -> `PENDING` -> `PARTIAL` (Entregas incompletas / Backorders) -> `RECEIVED` -> `CANCELLED`.
- **Recepción Multi-Lote:** Una línea de pedido de 100 unidades puede recibirse dividida en múltiples lotes físicos (Ej: 50 Lote A + 50 Lote B).
- **Mapeo de Entidades:** Las OC se cruzan con `public.suppliers` para los datos del proveedor, pero viven enteramente en el esquema `pharmacy`.

## 5. TRAZABILIDAD (LOTES Y FEFO)
Requisito legal intransable del ISP:
- **Stock de 4 Dimensiones:** El inventario se mide por `[Producto] + [Ubicación] + [Lote] + [Fecha de Vencimiento]`. (Tabla: `pharmacy.inventory_batches`).
- **Movimientos Inmutables (Kardex):** No se "edita" el stock. Se crean registros en `pharmacy.inventory_movements` (`IN_PURCHASE`, `OUT_SALE`, `INTERNAL_TRANSFER`, `ADJUSTMENT`).
- **FEFO Guiado (First Expire, First Out):** En el POS, el sistema busca en la Sala de Ventas y *sugiere* automáticamente descontar el lote más próximo a vencer. El cajero debe confirmar o cambiar manualmente el lote si el producto físico en su mano difiere.

## 6. DISPENSACIÓN (POS) Y RECETAS
El motor de salida está atado a la Condición de Venta del catálogo:
- `VD` (Venta Directa): Sin fricción.
- `R` (Receta Simple): Requiere ingreso del RUT/Nombre del prescriptor antes de cobrar.
- `RR` / `RCH` (Receta Retenida/Cheque): Bloqueo duro. Requiere vincular un Folio de Receta Electrónica (`pharmacy.prescriptions`) en estado `PENDING` antes de dispensar.

## 7. REGLAS DE SEGURIDAD (RLS - Row Level Security)
- Todas las tablas del esquema `pharmacy` filtran la información usando la columna `company_id`.
- Los Agentes IA deben SIEMPRE inyectar `company_id = getMyCompanyId()` (función helper) en todo `INSERT`.
- Auditoría obligatoria: Todo `INSERT` lleva `created_by`, todo `UPDATE` lleva `updated_by`.