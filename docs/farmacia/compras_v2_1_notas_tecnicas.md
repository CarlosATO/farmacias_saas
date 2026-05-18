# Compras v2.1 - Notas Técnicas

## Estado
- Implementado.
- `npm run build` OK.
- Validación remota pendiente por indisponibilidad del pooler/CLI de Supabase.

## Migración
- `supabase/migrations/20260513220000_cancel_purchase_order_v1.sql`
- Agrega trazabilidad de anulación en `pharmacy.purchase_orders`.

## RPC
- `pharmacy.cancel_purchase_order(uuid, text)`
- Permite anular solo órdenes en `DRAFT` o `PENDING`.
- Bloquea `RECEIVED` y estados de recepción parcial.

## Validación pendiente
- No se pudo validar en remoto por errores de conexión Supabase CLI.
- Errores observados:
  - `ECIRCUITBREAKER`
  - `password authentication failed for user "cli_login_postgres"`

## Casos de prueba pendientes
- `OC-00004`: pendiente de anulación controlada.
- `OC-00003`: pendiente de bloqueo por estado `RECEIVED`.

## Nota operativa
- Continuar desarrollo sin depender de la conexión remota actual.
