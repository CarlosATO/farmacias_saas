# 🏥 DOCUMENTO MAESTRO: ARQUITECTURA MÓDULO FARMACIA (SaaS) - V3.0

## 1. OBJETIVO DEL SISTEMA
Entorno clínico-logístico de alta restricción para cumplimiento normativo ISP/MINSAL. Aislado en el esquema `pharmacy` (PostgreSQL). Diseñado para escalar como un WMS (Warehouse Management System) multitenant.

## 2. TOPOLOGÍA FÍSICA (WMS)
Todo stock tiene una coordenada física obligatoria:
- **Bodegas (`warehouses`):** Recintos principales por empresa.
- **Ubicaciones (`locations`):** Zonas con tipos específicos:
  - `QUARANTINE`: Ingreso inicial por defecto para recepciones de OC.
  - `STORAGE`: Almacenaje general (Trastienda).
  - `SALES`: Sala de ventas (Única ubicación habilitada para descuento en POS).

## 3. CATÁLOGO Y FRACCIONAMIENTO DINÁMICO (UOM)
Soporte para envases clínicos (CENABAST) y comerciales:
- **Unidades:** `purchase_uom` (Compra - Etiqueta referencial) vs `sale_uom` (Venta - Etiqueta referencial).
- **Factor de Conversión Sugerido:** El catálogo guarda un multiplicador por defecto, pero **no es absoluto**.
- **Códigos:** `barcode_purchase` (Caja) y `barcode` (Unidad/Tira).

## 4. LOGÍSTICA DE ENTRADA Y RECEPCIÓN
Proceso documental jerárquico para trazabilidad total:
1. **Orden de Compra (`purchase_orders`):** Contrato comercial con estados `DRAFT`, `PENDING`, `PARTIAL`, `RECEIVED`.
   - **UOM Override:** Cada línea de la OC guarda su propio `conversion_factor`, permitiendo comprar el mismo producto a distintos proveedores con diferentes formatos de embalaje sin alterar el catálogo.
2. **Recibo de Inventario (`inventory_receipts`):** Cabecera que vincula la recepción a un documento legal (`GUIA_DESPACHO`, `FACTURA`).
3. **Lotes (`inventory_batches`):** El "ADN" del stock. Registra `batch_number`, `expiry_date`, e ID del documento de entrada.

## 5. TRAZABILIDAD Y KARDEX
- **Movimientos Inmutables (`inventory_movements`):** Todo cambio de stock genera un registro con `movement_type` (`IN_PURCHASE`, `OUT_SALE`, `INTERNAL_TRANSFER`, `ADJUSTMENT`).
- **FEFO Guiado:** El sistema prioriza la salida del lote con vencimiento más cercano en la ubicación `SALES`.
- **Vínculo Documental:** Cada movimiento de entrada DEBE estar vinculado a un `receipt_id` y registrar el costo unitario real.

## 6. PATRONES DE INTERFAZ (UI/UX)
- **Vistas Master-Detail:** El sistema evita modales para información compleja, utilizando `setView('detail')` para mantener la navegación limpia.
- **Tarjetas por Ítem (WMS Style):** Para procesos de Data Entry complejos (como la recepción), se agrupa la información en tarjetas inmutables en la cabecera, permitiendo expandir sub-líneas (lotes) debajo de cada una sin perder el contexto.
- **Auditoría:** Todas las tablas incluyen `company_id` (aislamiento SaaS), `created_by` y `updated_by`.

## 7. ESTRATEGIA DE PRECIOS Y MÁRGENES (NUEVO)
El sistema separa el Catálogo de la Fijación de Precios:
- El precio en el catálogo es solo referencial/inicial.
- El análisis real de **Costo vs. Precio de Venta vs. Utilidad** se evaluará en un módulo dedicado de "Tarifarios" o en el momento de la recepción, permitiendo respuestas dinámicas a las alzas de los laboratorios.

## 8. SEGURIDAD (RLS)
- Políticas activas por `company_id`. Ninguna empresa puede ver o modificar datos de otra, incluso mediante inyección de scripts. El RLS aplica la regla `FOR ALL` garantizando aislamiento absoluto.