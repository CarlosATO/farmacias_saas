ALTER TABLE pharmacy.sale_items 
ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES pharmacy.prescriptions(id);

CREATE INDEX IF NOT EXISTS idx_sale_items_prescription_id 
ON pharmacy.sale_items(prescription_id);
