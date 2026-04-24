# Arquitectura Logística y WMS (SaaS Farmacéutico)

## 1. Topología Físico-Lógica (3 Niveles)
El sistema utiliza un modelo jerárquico anidado para representar el mundo real, mapeando términos técnicos WMS al vocabulario de retail farmacéutico.

* **Nivel 1: EL LOCAL / SUCURSAL (Edificio Físico)**
  * **Base de datos:** Tabla `warehouses`.
  * **Definición:** El contenedor principal. Representa una dirección física (Ej: "Local San Javier").
  * **Regla SaaS:** Por defecto, se crea 1 Local al registrar un tenant. La creación de múltiples locales es una característica premium.

* **Nivel 2: LAS BODEGAS / ZONAS LÓGICAS**
  * **Base de datos:** Tabla `locations` (donde `parent_location_id` IS NULL).
  * **Definición:** Las habitaciones o divisiones conceptuales dentro del Local.
  * **Regla de Creación:** Todo Local nace automáticamente con 3 Zonas inmutables:
    1. `QUARANTINE` (Zona de Cuarentena / Recepción)
    2. `STORAGE` (Bodega Trastienda)
    3. `SALES` (Sala de Ventas)

* **Nivel 3: LAS UBICACIONES FÍSICAS (Estantes/Vitrinas)**
  * **Base de datos:** Tabla `locations` (donde `parent_location_id` NO ES NULL).
  * **Definición:** El punto exacto de almacenaje (Ej: "Estante A, Nivel 2", "Vitrina Analgésicos").
  * **Regla de Anidación:** Viven *dentro* de una Bodega del Nivel 2.

## 2. Reglas de Negocio Estrictas (Inbound & Putaway)

1. **Bloqueo de Cuarentena (Inbound):** * La zona `QUARANTINE` es estrictamente un área de tránsito (Staging). 
   * **Prohibición de Nivel 3:** NO se pueden crear sub-ubicaciones (Estantes) dentro de Cuarentena.
   * **Prohibición de Destino:** En traspasos internos, `QUARANTINE` NUNCA puede ser destino, solo origen.
2. **Flujo de Recepción Ciego:**
   * Al recibir una Orden de Compra, el usuario solo selecciona el Nivel 1 (Local). El sistema inyecta el inventario automáticamente en el Nivel 2 (`QUARANTINE` de ese Local).
3. **Integridad Referencial (Protección de Borrado):**
   * Un Local o Bodega NO puede ser eliminado si existe algún registro asociado en `inventory_batches` (stock) o `inventory_movements` (Kardex histórico).