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
El sistema se apoya en la tabla pharmacy.inventory_movements y la vista
pharmacy.v_kardex_professional. Para que el sistema funcione, se deben respetar las
siguientes restricciones técnicas:
Regla Descripción Importancia
Sin Restricción de Signo Se eliminó el constraint
inventory_movements_quantity
_check.

Permite el registro de
cantidades negativas para
salidas, facilitando la
contabilidad de doble entrada.

Diccionario VIP (Enum) Los tipos de movimiento deben

ser exactos:
INTERNAL_TRANSFER,
IN_PURCHASE,
OUTBOUND_TRANSFER,
INBOUND_TRANSFER.

Cualquier otra palabra será
rechazada por el
movement_type_check de la
base de datos.

Aislamiento por Sucursal Toda consulta debe filtrar por

warehouse_id.

Garantiza que el farmacéutico
solo vea los movimientos de su
local activo.

3. Lógica Transaccional y Simetría
Para mantener la trazabilidad, los movimientos se clasifican en dos categorías lógicas:
A. Movimientos de Patrimonio (Entradas/Salidas Externas)
● Ingreso por Compra (IN_PURCHASE): Suma al stock del local.
● Envío a Sucursal (OUTBOUND_TRANSFER): Resta al stock del local de origen (valor
negativo).

● Recepción de Traspaso (INBOUND_TRANSFER): Suma al stock del local de destino.
B. Movimientos de Acomodo (Suma Cero)
● Acomodo Interno (INTERNAL_TRANSFER): Ocurre cuando se mueve mercadería
entre bodegas del mismo local (ej. de Cuarentena a Trastienda).
● Regla de Simetría: Un acomodo interno DEBE generar dos registros simultáneos: una
salida negativa de la ubicación origen y una entrada positiva a la ubicación destino.
4. Algoritmo del Saldo Acumulado (Frontend)
El cálculo del saldo acumulado en la interfaz de usuario sigue reglas específicas para no
engañar al farmacéutico:
1. Contexto Local: El saldo representa el total del producto en el local, no en el lote.
2. Tratamiento de Acomodos: Los movimientos de tipo INTERNAL_TRANSFER se
muestran en la tabla para trazabilidad, pero no afectan el saldo acumulado ni se suman
en los totales de "Entradas" o "Salidas" de las tarjetas de resumen.
3. Orden Cronológico: El saldo se calcula de forma acumulativa desde el movimiento más
antiguo al más nuevo, independientemente del orden de visualización en la tabla.
5. Lecciones Aprendidas (Troubleshooting)
Durante el desarrollo se superaron los siguientes errores críticos que no deben repetirse:
● Fallo de Nulidad (Null Pointer): El componente debe usar "Early Returns" y Optional
Chaining (activeWarehouse?.id) para evitar crasheos mientras el contexto de la sucursal
se carga desde el almacenamiento local.
● Alucinación de Columnas: No intentar enviar columnas inexistentes como user_id o
source_location_id a la tabla de movimientos. La ubicación se infiere por el batch_id.
● Cálculo de Saldo Post-Insert: No confiar en cálculos posteriores al insert. El
balance_after debe calcularse en el momento de la transacción y enviarse en el mismo
payload de inserción para evitar desfaces.
6. Interfaz de Usuario (UX/UI)
El diseño debe ser auto-explicativo para el personal de salud:
● Colores: Entradas en verde con prefijo (+), Salidas en rojo con prefijo (-).
● Lenguaje Humano: Traducir códigos técnicos (INTERNAL_TRANSFER) a términos
operativos (Acomodo Interno) mediante la vista SQL.