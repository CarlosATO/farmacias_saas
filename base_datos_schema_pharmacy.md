## Table `audit_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `user_id` | `uuid` |  |
| `event_type` | `text` |  |
| `description` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `ip_address` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `inventory_batches`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `product_id` | `uuid` |  |
| `po_id` | `uuid` |  Nullable |
| `location_id` | `uuid` |  Nullable |
| `batch_number` | `text` |  |
| `expiry_date` | `date` |  |
| `initial_quantity` | `numeric` |  |
| `current_quantity` | `numeric` |  |
| `created_at` | `timestamptz` |  Nullable |

## Table `inventory_movements`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `product_id` | `uuid` |  |
| `batch_id` | `uuid` |  Nullable |
| `batch_number` | `text` |  Nullable |
| `from_location_id` | `uuid` |  Nullable |
| `to_location_id` | `uuid` |  Nullable |
| `movement_type` | `text` |  |
| `quantity` | `numeric` |  |
| `unit_cost` | `numeric` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `locations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `warehouse_id` | `uuid` |  |
| `name` | `text` |  |
| `location_type` | `text` |  |
| `is_active` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `patients`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `rut` | `text` |  |
| `full_name` | `text` |  |
| `email` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `birth_date` | `date` |  Nullable |
| `gender` | `text` |  Nullable |
| `allergies` | `_text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `prescription_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `prescription_id` | `uuid` |  |
| `product_id` | `uuid` |  |
| `quantity_prescribed` | `numeric` |  |
| `dosage_instructions` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `prescriptions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `patient_id` | `uuid` |  |
| `folio_electronico` | `text` |  Nullable |
| `prescriber_rut` | `text` |  |
| `prescriber_name` | `text` |  |
| `institution_name` | `text` |  Nullable |
| `status` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `created_by` | `uuid` |  Nullable |

## Table `products`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `name` | `text` |  |
| `brand` | `text` |  Nullable |
| `dci` | `text` |  |
| `registro_sanitario` | `text` |  |
| `barcode` | `text` |  Nullable |
| `active_principle` | `text` |  Nullable |
| `concentration` | `text` |  Nullable |
| `presentation` | `text` |  Nullable |
| `is_bioequivalent` | `bool` |  Nullable |
| `is_controlled` | `bool` |  Nullable |
| `sale_condition` | `text` |  |
| `stock_quantity` | `numeric` |  Nullable |
| `min_stock` | `numeric` |  Nullable |
| `price_sale` | `numeric` |  |
| `cost_unit` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `updated_by` | `uuid` |  Nullable |
| `active_ingredient` | `text` |  Nullable |
| `laboratory_name` | `text` |  Nullable |
| `isp_registry_number` | `text` |  Nullable |
| `unit_price` | `numeric` |  Nullable |
| `purchase_uom` | `text` |  Nullable |
| `sale_uom` | `text` |  Nullable |
| `conversion_factor` | `numeric` |  Nullable |
| `barcode_purchase` | `text` |  Nullable |

## Table `purchase_order_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `po_id` | `uuid` |  |
| `product_id` | `uuid` |  |
| `quantity` | `numeric` |  |
| `unit_cost` | `numeric` |  |
| `total_cost` | `numeric` |  |
| `created_at` | `timestamptz` |  Nullable |
| `quantity_received` | `numeric` |  Nullable |
| `updated_by` | `uuid` |  Nullable |

## Table `purchase_orders`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `supplier_id` | `uuid` |  |
| `status` | `text` |  Nullable |
| `total_neto` | `numeric` |  Nullable |
| `tax_amount` | `numeric` |  Nullable |
| `total_amount` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `po_number` | `int4` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `expected_delivery_date` | `date` |  Nullable |
| `issue_date` | `timestamptz` |  Nullable |
| `total_net` | `numeric` |  Nullable |
| `observation_notes` | `text` |  Nullable |
| `payment_terms_days` | `int4` |  Nullable |
| `updated_by` | `uuid` |  Nullable |

## Table `sale_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `sale_id` | `uuid` |  Nullable |
| `product_id` | `uuid` |  Nullable |
| `batch_id` | `uuid` |  Nullable |
| `quantity` | `numeric` |  |
| `unit_price` | `numeric` |  |
| `subtotal` | `numeric` |  |

## Table `sales`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `user_id` | `uuid` |  |
| `patient_id` | `uuid` |  Nullable |
| `total_amount` | `numeric` |  |
| `payment_method` | `text` |  Nullable |
| `document_number` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `suppliers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `rut` | `text` |  |
| `legal_name` | `text` |  |
| `commercial_name` | `text` |  Nullable |
| `business_line` | `text` |  Nullable |
| `contact_email` | `text` |  Nullable |
| `contact_phone` | `text` |  Nullable |
| `address` | `text` |  Nullable |
| `isp_resolution_number` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `created_by` | `uuid` |  Nullable |
| `updated_by` | `uuid` |  Nullable |
| `legal_representative` | `text` |  Nullable |
| `contact_person_name` | `text` |  Nullable |
| `contact_person_role` | `text` |  Nullable |
| `address_city` | `text` |  Nullable |
| `address_commune` | `text` |  Nullable |
| `website_url` | `text` |  Nullable |
| `social_media_links` | `jsonb` |  Nullable |
| `payment_terms_days` | `int4` |  Nullable |
| `bank_details` | `jsonb` |  Nullable |
| `observation_notes` | `text` |  Nullable |
| `compliance_rate` | `numeric` |  Nullable |
| `average_delivery_days` | `int4` |  Nullable |

## Table `warehouses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `company_id` | `uuid` |  |
| `name` | `text` |  |
| `is_active` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `created_by` | `uuid` |  Nullable |

