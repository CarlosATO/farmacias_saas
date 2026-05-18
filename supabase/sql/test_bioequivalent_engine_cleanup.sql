-- Cleanup de los datos de prueba del motor de bioequivalentes.
-- Elimina solo registros TEST creados por `test_bioequivalent_engine_seed.sql`.

DO $$
DECLARE
  v_company_id uuid := '8287fedb-3faf-47df-9849-bf0d8cad81f1';
BEGIN
  DELETE FROM pharmacy.inventory_batches
  WHERE product_id IN (
    SELECT id
    FROM pharmacy.products
    WHERE company_id = v_company_id
      AND (
        name LIKE 'TEST BIOEQ %'
        OR name LIKE 'TEST ALT %'
        OR name LIKE 'TEST SIN ALT %'
      )
  );

  DELETE FROM pharmacy.product_prices
  WHERE product_id IN (
    SELECT id
    FROM pharmacy.products
    WHERE company_id = v_company_id
      AND (
        name LIKE 'TEST BIOEQ %'
        OR name LIKE 'TEST ALT %'
        OR name LIKE 'TEST SIN ALT %'
      )
  );

  DELETE FROM pharmacy.products
  WHERE company_id = v_company_id
    AND (
      name LIKE 'TEST BIOEQ %'
      OR name LIKE 'TEST ALT %'
      OR name LIKE 'TEST SIN ALT %'
    );
END $$;
