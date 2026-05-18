# POS Inteligente Bioequivalente v2

## Objetivo
Separar bioequivalencia oficial ISP de alternativas farmacéuticas, manteniendo compatibilidad con el POS.

## Clasificación
- `BIOEQUIVALENTE_OFICIAL`: producto con `is_bioequivalent = true`.
- `ALTERNATIVA_FARMACEUTICA`: producto que coincide en DCI, concentración y forma farmacéutica, pero no tiene bioequivalencia oficial.

## Fuente de datos
- `pharmacy.products`
- `pharmacy.inventory_batches`
- `pharmacy.locations`
- `pharmacy.product_prices`

## Vista
- `pharmacy.view_bioequivalent_products`

## RPC
- `pharmacy.get_bioequivalent_suggestions(p_product_id, p_warehouse_id)`

## Reglas de comparación
- misma DCI
- misma concentración
- misma forma farmacéutica
- stock en ubicación `SALES`
- no mezcla entre compañías

## Ordenamiento
1. Bioequivalentes oficiales primero.
2. Mayor stock disponible.
3. Vencimiento más cercano.
4. Menor precio.

## Limitaciones actuales
- No integra ISP externo.
- No usa API pagada.
- La clasificación depende del campo `is_bioequivalent` del catálogo.

## Prueba nuevamente
1. Correr seed: `supabase db query --db-url "<DB_URL>" -f supabase/sql/test_bioequivalent_engine_seed.sql`
2. Validar en POS con:
   - `TEST BIOEQ ...`
   - `TEST ALT ...`
   - `TEST SIN ALT ...`
3. Limpiar al final: `supabase db query --db-url "<DB_URL>" -f supabase/sql/test_bioequivalent_engine_cleanup.sql`
