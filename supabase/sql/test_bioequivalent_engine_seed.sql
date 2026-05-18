-- Seed de prueba para validar el motor de bioequivalentes del POS.
-- Uso: ejecutar una sola vez contra el remoto con `supabase db query --db-url ... -f`.
-- Scope: solo inserta productos de prueba con prefijo TEST en la empresa/sucursal indicada.

DO $$
DECLARE
  v_company_id uuid := '8287fedb-3faf-47df-9849-bf0d8cad81f1';
  v_warehouse_id uuid := '1c00f5f8-287f-4c36-be5f-21ebec79d099';
  v_sales_location_id uuid := 'c35efb5c-a09a-41d0-8a1d-037e7b258aa6';
  v_bioeq_ref uuid;
  v_bioeq_official uuid;
  v_alt_ref uuid;
  v_alt_pure uuid;
  v_no_alt uuid;
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

  INSERT INTO pharmacy.products (
    company_id, name, brand, dci, registro_sanitario, barcode,
    active_principle, concentration, presentation, is_bioequivalent,
    is_controlled, sale_condition, stock_quantity, min_stock,
    price_sale, unit_price, active_ingredient, laboratory_name,
    isp_registry_number, prescription_type
  ) VALUES (
    v_company_id, 'TEST BIOEQ REF PARACETAMOL', 'TEST BIOEQ', 'TESTBIOEQ', 'TEST-RS-BIOEQ-REF', 'TESTBIOEQREF001',
    'TESTBIOEQ', '10 MG', 'COMPRIMIDO', false,
    false, 'VD', 0, 0,
    1000, 1000, 'TESTBIOEQ', 'LAB TEST BIOEQ',
    'TEST-ISP-BIOEQ-REF', 'VENTA_LIBRE'
  ) RETURNING id INTO v_bioeq_ref;

  INSERT INTO pharmacy.products (
    company_id, name, brand, dci, registro_sanitario, barcode,
    active_principle, concentration, presentation, is_bioequivalent,
    is_controlled, sale_condition, stock_quantity, min_stock,
    price_sale, unit_price, active_ingredient, laboratory_name,
    isp_registry_number, prescription_type
  ) VALUES (
    v_company_id, 'TEST BIOEQ OFICIAL PARACETAMOL', 'TEST BIOEQ', 'TESTBIOEQ', 'TEST-RS-BIOEQ-OFC', 'TESTBIOEQOFC001',
    'TESTBIOEQ', '10 MG', 'COMPRIMIDO', true,
    false, 'VD', 0, 0,
    950, 950, 'TESTBIOEQ', 'LAB TEST BIOEQ',
    'TEST-ISP-BIOEQ-OFC', 'VENTA_LIBRE'
  ) RETURNING id INTO v_bioeq_official;

  INSERT INTO pharmacy.products (
    company_id, name, brand, dci, registro_sanitario, barcode,
    active_principle, concentration, presentation, is_bioequivalent,
    is_controlled, sale_condition, stock_quantity, min_stock,
    price_sale, unit_price, active_ingredient, laboratory_name,
    isp_registry_number, prescription_type
  ) VALUES (
    v_company_id, 'TEST ALT REF IBUPROFENO', 'TEST ALT', 'TESTALT', 'TEST-RS-ALT-REF', 'TESTALTREF001',
    'TESTALT', '20 MG', 'COMPRIMIDO', false,
    false, 'VD', 0, 0,
    1200, 1200, 'TESTALT', 'LAB TEST ALT',
    'TEST-ISP-ALT-REF', 'VENTA_LIBRE'
  ) RETURNING id INTO v_alt_ref;

  INSERT INTO pharmacy.products (
    company_id, name, brand, dci, registro_sanitario, barcode,
    active_principle, concentration, presentation, is_bioequivalent,
    is_controlled, sale_condition, stock_quantity, min_stock,
    price_sale, unit_price, active_ingredient, laboratory_name,
    isp_registry_number, prescription_type
  ) VALUES (
    v_company_id, 'TEST ALT PURA IBUPROFENO', 'TEST ALT', 'TESTALT', 'TEST-RS-ALT-PUR', 'TESTALTPUR001',
    'TESTALT', '20 MG', 'COMPRIMIDO', false,
    false, 'VD', 0, 0,
    1150, 1150, 'TESTALT', 'LAB TEST ALT',
    'TEST-ISP-ALT-PUR', 'VENTA_LIBRE'
  ) RETURNING id INTO v_alt_pure;

  INSERT INTO pharmacy.products (
    company_id, name, brand, dci, registro_sanitario, barcode,
    active_principle, concentration, presentation, is_bioequivalent,
    is_controlled, sale_condition, stock_quantity, min_stock,
    price_sale, unit_price, active_ingredient, laboratory_name,
    isp_registry_number, prescription_type
  ) VALUES (
    v_company_id, 'TEST SIN ALT UNICO NAPROXENO', 'TEST SIN ALT', 'TESTSINALT', 'TEST-RS-SIN-ALT', 'TESTSINALT001',
    'TESTSINALT', '5 MG', 'CAPSULA', false,
    false, 'VD', 0, 0,
    1300, 1300, 'TESTSINALT', 'LAB TEST SIN ALT',
    'TEST-ISP-SIN-ALT', 'VENTA_LIBRE'
  ) RETURNING id INTO v_no_alt;

  INSERT INTO pharmacy.inventory_batches (
    company_id, product_id, po_id, location_id, batch_number, expiry_date,
    initial_quantity, current_quantity
  ) VALUES
    (v_company_id, v_bioeq_ref, null, v_sales_location_id, 'TEST-BIOEQ-REF-001', DATE '2026-12-31', 25, 25),
    (v_company_id, v_bioeq_official, null, v_sales_location_id, 'TEST-BIOEQ-OFC-001', DATE '2027-01-31', 18, 18),
    (v_company_id, v_alt_ref, null, v_sales_location_id, 'TEST-ALT-REF-001', DATE '2026-11-30', 22, 22),
    (v_company_id, v_alt_pure, null, v_sales_location_id, 'TEST-ALT-PUR-001', DATE '2026-10-31', 16, 16),
    (v_company_id, v_no_alt, null, v_sales_location_id, 'TEST-SIN-ALT-001', DATE '2027-02-28', 11, 11);

  RAISE NOTICE 'Seed creado: %, %, %, %, %', v_bioeq_ref, v_bioeq_official, v_alt_ref, v_alt_pure, v_no_alt;
END $$;
