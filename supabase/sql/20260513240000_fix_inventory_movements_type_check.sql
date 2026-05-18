-- Alinea el CHECK de inventory_movements con los tipos reales usados por el sistema.

ALTER TABLE pharmacy.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE pharmacy.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (
    movement_type = ANY (
      ARRAY[
        'IN'::text,
        'OUT'::text,
        'ADJUSTMENT'::text,
        'INITIAL_LOAD'::text,
        'IN_PURCHASE'::text,
        'PURCHASE_RECEIPT'::text,
        'INBOUND_TRANSFER'::text,
        'OUTBOUND_TRANSFER'::text,
        'INTERNAL_TRANSFER'::text,
        'SALE'::text,
        'RETURN'::text,
        'ADJUSTMENT_IN'::text,
        'ADJUSTMENT_OUT'::text
      ]
    )
  );
