# Protocolo de Traspasos e Inter-Sucursal (Putaway)

## 1. Tipos de Movimiento
* **Reabastecimiento Interno:** Origen y Destino pertenecen al mismo `warehouse_id`.
* **Traspaso Inter-Sucursal:** Origen y Destino pertenecen a distintos `warehouse_id`.

## 2. Reglas de Validación de Destino (Routing)
* **Regla de Oro (Inter-Sucursal):** Si `Local Origen != Local Destino`, el sistema BLOQUEA cualquier selección de bodega y fuerza el destino a la zona de tipo `QUARANTINE` del Local Destino.
* **Regla de Oro (Local):** Si `Local Origen == Local Destino`, el usuario puede elegir entre `STORAGE` o `SALES`, y sus respectivos estantes (Nivel 3). La zona `QUARANTINE` nunca puede ser destino en este caso.

## 3. Estado del Carrito (Picking List)
* El sistema debe permitir múltiples productos en un solo traspaso.
* Cada línea de traspaso debe registrar: `product_id`, `batch_id`, `source_location_id`, `destination_location_id` y `quantity`.