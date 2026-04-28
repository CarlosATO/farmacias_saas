Manual Técnico y Funcional: Módulo de
farmacias
Este documento establece los pilares fundamentales, reglas de negocio y lecciones aprendidas
durante la construcción del sistema de trazabilidad (Kardex) para el ecosistema Datix. Su
propósito es servir de guía definitiva para cualquier desarrollador o agente de IA que intervenga
el código del sistema de gestión de inventarios farmacéuticos.
1. Concepto Fundamental
En el ecosistema Datix, el Kardex no es un simple listado de stock. Es la bitácora cronológica e
inmutable de cada movimiento físico de un producto dentro de una sucursal. Mientras que el
Inventario es una "foto" del presente, el Kardex es la "película" completa.
2. Reglas de la Base de Datos (Source of Truth)
El sistema se apoya en la tabla `pharmacy.inventory_movements` y la vista
`pharmacy.v_kardex_professional`. Para que el sistema funcione, se deben respetar las
siguientes restricciones técnicas:

- **Sin Restricción de Signo:** Se eliminó el constraint `inventory_movements_quantity_check`.
  - Permite el registro de cantidades negativas para salidas, facilitando la contabilidad de doble entrada.
- **Diccionario Oficial (`movement_type`):** Los tipos de movimiento válidos son exactamente:
  - `SALE`
  - `RECEIPT`
  - `TRANSFER`
  - `ADJUSTMENT`
  - Cualquier otro valor será rechazado por el `movement_type_check` de la base de datos.
- **Ubicaciones Oficiales:** Para origen y destino en `inventory_movements` se usan exclusivamente `from_location_id` y `to_location_id`.
  - `source_location_id` y `destination_location_id` son campos obsoletos y no deben usarse en lógica nueva.
- **Aislamiento por Sucursal:** Toda consulta debe filtrar por `warehouse_id`.
  - Garantiza que el farmacéutico solo vea los movimientos de su local activo.

3. Lógica Transaccional y Simetría
Para mantener la trazabilidad, los movimientos se clasifican en cuatro tipos funcionales:

- **SALE:** Venta a pacientes/público. Disminuye el stock del local.
- **RECEIPT:** Ingreso de productos desde proveedores. Aumenta el stock del local.
- **TRANSFER:** Movimiento de stock, tanto interno (mismo local) como externo (entre locales).
  - Debe registrarse con `from_location_id` y `to_location_id`.
  - En transferencias internas, la salida y la entrada pertenecen al mismo local.
  - En transferencias externas, la salida y la entrada reflejan el cambio entre locales distintos.
- **ADJUSTMENT:** Ajustes manuales por mermas, vencimientos o auditorías.
4. Algoritmo del Saldo Acumulado (Frontend)
El cálculo del saldo acumulado en la interfaz de usuario sigue reglas específicas para no
engañar al farmacéutico:
1. Contexto Local: El saldo representa el total del producto en el local, no en el lote.
2. Tratamiento de Transferencias: Los movimientos de tipo `TRANSFER` se muestran en la tabla para trazabilidad y deben afectar el saldo según su dirección de origen/destino.
3. Orden Cronológico: El saldo se calcula de forma acumulativa desde el movimiento más
antiguo al más nuevo, independientemente del orden de visualización en la tabla.
5. Lecciones Aprendidas (Troubleshooting)
Durante el desarrollo se superaron los siguientes errores críticos que no deben repetirse:
● Fallo de Nulidad (Null Pointer): El componente debe usar "Early Returns" y Optional
Chaining (activeWarehouse?.id) para evitar crasheos mientras el contexto de la sucursal
se carga desde el almacenamiento local.
● Alucinación de Columnas: No intentar enviar columnas inexistentes como user_id o
source_location_id a la tabla de movimientos. La lógica nueva debe usar `from_location_id` y `to_location_id`.
● Cálculo de Saldo Post-Insert: No confiar en cálculos posteriores al insert. El
balance_after debe calcularse en el momento de la transacción y enviarse en el mismo
payload de inserción para evitar desfaces.
6. Interfaz de Usuario (UX/UI)
El diseño debe ser auto-explicativo para el personal de salud:
● Colores: Entradas en verde con prefijo (+), Salidas en rojo con prefijo (-).
● Lenguaje Humano: Traducir códigos técnicos (`TRANSFER`) a términos
operativos (Transferencia Interna) mediante la vista SQL.
