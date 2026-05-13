ALTER TABLE pharmacy.prescription_items ADD COLUMN quantity_dispensed numeric DEFAULT 0;

ALTER TABLE pharmacy.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_status_check;
ALTER TABLE pharmacy.prescriptions ADD CONSTRAINT prescriptions_status_check CHECK (status = ANY (ARRAY['PENDING'::text, 'PARTIAL'::text, 'DISPENSED'::text, 'EXPIRED'::text, 'CANCELLED'::text]));

CREATE OR REPLACE FUNCTION pharmacy.update_prescription_status(p_prescription_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_prescribed numeric;
  v_total_dispensed numeric;
BEGIN
  SELECT COALESCE(SUM(quantity_prescribed), 0), COALESCE(SUM(quantity_dispensed), 0)
  INTO v_total_prescribed, v_total_dispensed
  FROM pharmacy.prescription_items
  WHERE prescription_id = p_prescription_id;

  IF v_total_dispensed >= v_total_prescribed THEN
    UPDATE pharmacy.prescriptions SET status = 'DISPENSED' WHERE id = p_prescription_id;
  ELSIF v_total_dispensed > 0 THEN
    UPDATE pharmacy.prescriptions SET status = 'PARTIAL' WHERE id = p_prescription_id;
  ELSE
    UPDATE pharmacy.prescriptions SET status = 'PENDING' WHERE id = p_prescription_id;
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION pharmacy.increment_dispensed_quantity(p_prescription_id uuid, p_product_id uuid, p_quantity numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE pharmacy.prescription_items
  SET quantity_dispensed = COALESCE(quantity_dispensed, 0) + p_quantity
  WHERE prescription_id = p_prescription_id AND product_id = p_product_id;
END;
$$;
