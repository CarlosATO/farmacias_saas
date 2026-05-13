-- Keep sale returns attached to the original sold batch.
-- Returned units are tracked as quarantine stock on the same inventory_batch_id
-- instead of creating another logical batch with the same batch_number.

ALTER TABLE pharmacy.inventory_batches
ADD COLUMN IF NOT EXISTS quarantine_quantity numeric NOT NULL DEFAULT 0;

ALTER TABLE pharmacy.inventory_batches
DROP CONSTRAINT IF EXISTS inventory_batches_non_negative_quantities;

ALTER TABLE pharmacy.inventory_batches
ADD CONSTRAINT inventory_batches_non_negative_quantities
CHECK (
  current_quantity >= 0
  AND quarantine_quantity >= 0
  AND quarantine_quantity <= current_quantity
);

CREATE OR REPLACE FUNCTION "pharmacy"."get_pos_products"(
  "p_warehouse_id" uuid,
  "p_search" text DEFAULT NULL::text,
  "p_limit" integer DEFAULT 100
) RETURNS TABLE(
  "product_id" uuid,
  "barcode" text,
  "name" text,
  "brand" text,
  "dci" text,
  "laboratory_name" text,
  "sale_condition" text,
  "prescription_type" text,
  "requires_prescription" boolean,
  "is_controlled" boolean,
  "price_sale" numeric,
  "stock_available" numeric,
  "stock_quarantine" numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pharmacy', 'public'
AS $$
  with my_company as (
    select company_id
    from public.company_users
    where user_id = auth.uid()
    limit 1
  ),
  stock as (
    select
      b.product_id,
      sum(
        case
          when upper(l.location_type) = 'QUARANTINE' then 0
          else greatest(b.current_quantity - coalesce(b.quarantine_quantity, 0), 0)
        end
      ) as stock_available,
      sum(
        case
          when upper(l.location_type) = 'QUARANTINE' then b.current_quantity
          else coalesce(b.quarantine_quantity, 0)
        end
      ) as stock_quarantine
    from pharmacy.inventory_batches b
    join pharmacy.locations l on l.id = b.location_id
    join my_company mc on mc.company_id = b.company_id
    where l.warehouse_id = p_warehouse_id
      and l.company_id = mc.company_id
      and b.current_quantity > 0
    group by b.product_id
  )
  select
    p.id as product_id,
    p.barcode,
    p.name,
    p.brand,
    p.dci,
    p.laboratory_name,
    p.sale_condition,
    p.prescription_type,
    case
      when p.prescription_type in ('RECETA_SIMPLE', 'RECETA_RETENIDA', 'RECETA_CHEQUE')
        or p.sale_condition in ('R', 'RR', 'RCH')
      then true
      else false
    end as requires_prescription,
    coalesce(p.is_controlled, false) as is_controlled,
    coalesce(pp.price_sale, p.price_sale, p.unit_price, 0) as price_sale,
    coalesce(s.stock_available, 0) as stock_available,
    coalesce(s.stock_quarantine, 0) as stock_quarantine
  from pharmacy.products p
  join my_company mc on mc.company_id = p.company_id
  left join stock s on s.product_id = p.id
  left join pharmacy.product_prices pp
    on pp.product_id = p.id
   and pp.company_id = p.company_id
   and pp.warehouse_id = p_warehouse_id
  where p.company_id = mc.company_id
    and p.is_active = true
    and (
      p_search is null
      or p.name ilike '%' || p_search || '%'
      or p.barcode ilike '%' || p_search || '%'
      or p.dci ilike '%' || p_search || '%'
    )
  order by p.name
  limit p_limit;
$$;

GRANT EXECUTE ON FUNCTION pharmacy.get_pos_products(uuid, text, integer) TO authenticated;

DROP FUNCTION IF EXISTS pharmacy.process_pharmacy_sale(uuid, numeric, text, text, uuid, uuid, jsonb) CASCADE;

CREATE FUNCTION pharmacy.process_pharmacy_sale(
    p_warehouse_id    uuid,
    p_total_amount    numeric,
    p_payment_method  text,
    p_document_number text,
    p_patient_id      uuid    DEFAULT NULL,
    p_prescription_id uuid    DEFAULT NULL,
    p_items           jsonb   DEFAULT '[]'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pharmacy', 'public'
AS $$
declare
  v_user_id    uuid;
  v_company_id uuid;
  v_session_id uuid;
  v_sale_id    uuid;
  v_dte_id     uuid;
  v_dte_error  text;

  v_item                      jsonb;
  v_product_id                uuid;
  v_quantity                  numeric;
  v_unit_price                numeric;
  v_item_prescription_id      uuid;

  v_remaining      numeric;
  v_qty_to_deduct  numeric;
  v_batch          record;
  v_balance_after  numeric;

  v_sale_condition            text;
  v_product_prescription_type text;
  v_is_controlled             boolean;

  v_prescription_status       text;
  v_prescription_type         text;
  v_prescription_patient_id   uuid;
  v_prescription_valid_until  timestamptz;
  v_qty_prescribed            numeric;
  v_qty_dispensed             numeric;
  v_qty_pending               numeric;
begin
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;

  SELECT company_id INTO v_company_id FROM public.company_users WHERE user_id = v_user_id LIMIT 1;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Usuario sin empresa asociada'; END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'La venta no contiene productos'; END IF;

  BEGIN
    SELECT id INTO v_session_id
    FROM pharmacy.pos_sessions
    WHERE company_id = v_company_id AND user_id = v_user_id AND warehouse_id = p_warehouse_id AND status = 'OPEN'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'Su sesión de caja está siendo procesada en otra transacción.';
  END;

  IF v_session_id IS NULL THEN RAISE EXCEPTION 'Debes abrir caja antes de vender'; END IF;

  INSERT INTO pharmacy.sales (company_id, user_id, session_id, patient_id, total_amount, payment_method, document_number)
  VALUES (
    v_company_id, v_user_id, v_session_id, p_patient_id, p_total_amount,
    COALESCE(p_payment_method, 'CASH'),
    COALESCE(p_document_number, 'TICKET-' || EXTRACT(epoch FROM now())::bigint)
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := COALESCE(NULLIF(v_item->>'product_id','')::uuid, NULLIF(v_item->>'id','')::uuid);
    v_item_prescription_id := COALESCE(NULLIF(v_item->>'prescription_id','')::uuid, p_prescription_id);
    v_quantity   := COALESCE((v_item->>'quantity')::numeric, 0);
    v_unit_price := COALESCE(NULLIF(v_item->>'unit_price','')::numeric, NULLIF(v_item->>'price_sale','')::numeric, 0);

    IF v_product_id IS NULL THEN RAISE EXCEPTION 'Producto inválido en carrito'; END IF;
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'Cantidad inválida para producto %', v_product_id; END IF;

    SELECT UPPER(COALESCE(sale_condition,'VD')), UPPER(COALESCE(prescription_type,'VENTA_LIBRE')), COALESCE(is_controlled,false)
    INTO v_sale_condition, v_product_prescription_type, v_is_controlled
    FROM pharmacy.products WHERE id = v_product_id AND company_id = v_company_id;

    IF v_sale_condition IS NULL THEN RAISE EXCEPTION 'Producto no encontrado o no pertenece a la empresa'; END IF;

    IF v_is_controlled OR v_sale_condition IN ('R','RR','RCH') OR v_product_prescription_type IN ('RECETA_SIMPLE','RECETA_RETENIDA','RECETA_CHEQUE') THEN
      IF v_item_prescription_id IS NULL THEN RAISE EXCEPTION 'El producto requiere receta médica válida'; END IF;

      BEGIN
        SELECT status, UPPER(COALESCE(prescription_type,'RECETA_SIMPLE')), patient_id, valid_until
        INTO v_prescription_status, v_prescription_type, v_prescription_patient_id, v_prescription_valid_until
        FROM pharmacy.prescriptions WHERE id = v_item_prescription_id AND company_id = v_company_id FOR UPDATE NOWAIT;
      EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'La receta está siendo procesada en otra caja.';
      END;

      IF v_prescription_status IS NULL THEN RAISE EXCEPTION 'Receta no encontrada'; END IF;

      IF v_prescription_valid_until IS NOT NULL AND now() > (v_prescription_valid_until + INTERVAL '1 day') THEN
        UPDATE pharmacy.prescriptions SET status='EXPIRED', expired_at=now() WHERE id=v_item_prescription_id;
        RAISE EXCEPTION 'La receta se encuentra vencida';
      END IF;

      IF v_prescription_status NOT IN ('PENDING','PARTIAL') THEN
        RAISE EXCEPTION 'La receta ya no está disponible para despacho (Estado: %)', v_prescription_status;
      END IF;

      IF p_patient_id IS NOT NULL AND v_prescription_patient_id <> p_patient_id THEN
        RAISE EXCEPTION 'La receta no pertenece al paciente seleccionado';
      END IF;

      IF (v_sale_condition='RR' OR v_product_prescription_type='RECETA_RETENIDA') AND v_prescription_type<>'RECETA_RETENIDA' THEN
        RAISE EXCEPTION 'Este producto requiere receta retenida';
      END IF;

      IF (v_sale_condition='RCH' OR v_product_prescription_type='RECETA_CHEQUE') AND v_prescription_type<>'RECETA_CHEQUE' THEN
        RAISE EXCEPTION 'Este producto requiere receta cheque';
      END IF;

      BEGIN
        SELECT quantity_prescribed, COALESCE(quantity_dispensed,0)
        INTO v_qty_prescribed, v_qty_dispensed
        FROM pharmacy.prescription_items WHERE prescription_id=v_item_prescription_id AND product_id=v_product_id FOR UPDATE NOWAIT;
      EXCEPTION WHEN lock_not_available THEN
        RAISE EXCEPTION 'Los items de esta receta están bloqueados por otra operación.';
      END;

      IF v_qty_prescribed IS NULL THEN RAISE EXCEPTION 'El producto no está incluido en la receta'; END IF;
      v_qty_pending := v_qty_prescribed - v_qty_dispensed;
      IF v_qty_pending <= 0 THEN RAISE EXCEPTION 'El producto ya fue completamente despachado en esta receta.'; END IF;
      IF v_quantity > v_qty_pending THEN
        RAISE EXCEPTION 'La cantidad vendida (%) supera la cantidad pendiente de la receta (%)', v_quantity, v_qty_pending;
      END IF;
    END IF;

    v_remaining := v_quantity;
    FOR v_batch IN
      SELECT
        b.id,
        b.product_id,
        b.batch_number,
        b.current_quantity,
        coalesce(b.quarantine_quantity, 0) as quarantine_quantity,
        greatest(b.current_quantity - coalesce(b.quarantine_quantity, 0), 0) as available_quantity,
        b.location_id,
        b.expiry_date
      FROM pharmacy.inventory_batches b
      JOIN pharmacy.locations l ON l.id = b.location_id
      WHERE b.company_id=v_company_id
        AND b.product_id=v_product_id
        AND greatest(b.current_quantity - coalesce(b.quarantine_quantity, 0), 0) > 0
        AND l.company_id=v_company_id
        AND l.warehouse_id=p_warehouse_id
        AND UPPER(l.location_type)<>'QUARANTINE'
      ORDER BY CASE WHEN UPPER(l.location_type)='SALES' THEN 0 ELSE 1 END, b.expiry_date ASC
      FOR UPDATE OF b NOWAIT
    LOOP
      EXIT WHEN v_remaining <= 0;
      IF v_batch.available_quantity <= 0 THEN CONTINUE; END IF;

      v_qty_to_deduct := LEAST(v_remaining, v_batch.available_quantity);

      UPDATE pharmacy.inventory_batches
      SET current_quantity = current_quantity - v_qty_to_deduct
      WHERE id=v_batch.id
        AND company_id=v_company_id
        AND greatest(current_quantity - coalesce(quarantine_quantity, 0), 0) >= v_qty_to_deduct;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Error de concurrencia: El stock del lote % cambió durante la transacción.', v_batch.batch_number;
      END IF;

      INSERT INTO pharmacy.sale_items (company_id, sale_id, product_id, batch_id, quantity, unit_price, subtotal, prescription_id)
      VALUES (v_company_id, v_sale_id, v_product_id, v_batch.id, v_qty_to_deduct, v_unit_price, v_qty_to_deduct*v_unit_price, v_item_prescription_id);

      SELECT COALESCE(SUM(greatest(b.current_quantity - coalesce(b.quarantine_quantity, 0), 0)),0)
      INTO v_balance_after
      FROM pharmacy.inventory_batches b
      WHERE b.company_id=v_company_id
        AND b.product_id=v_product_id
        AND b.location_id=v_batch.location_id;

      INSERT INTO pharmacy.inventory_movements (company_id, product_id, batch_id, batch_number, from_location_id, movement_type, quantity, balance_after, reference_folio, created_by)
      VALUES (v_company_id, v_product_id, v_batch.id, v_batch.batch_number, v_batch.location_id, 'SALE', -ABS(v_qty_to_deduct), v_balance_after, COALESCE(p_document_number,'VENTA_POS'), v_user_id);

      v_remaining := v_remaining - v_qty_to_deduct;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto %. Faltan % unidades (posible venta simultánea).', v_product_id, v_remaining;
    END IF;

    IF v_item_prescription_id IS NOT NULL THEN
      UPDATE pharmacy.prescription_items
      SET quantity_dispensed = COALESCE(quantity_dispensed,0) + v_quantity
      WHERE prescription_id=v_item_prescription_id AND product_id=v_product_id;
    END IF;
  END LOOP;

  UPDATE pharmacy.prescriptions p
  SET status = CASE
    WHEN totals.total_dispensed <= 0 THEN 'PENDING'
    WHEN totals.total_dispensed < totals.total_prescribed THEN 'PARTIAL'
    ELSE 'DISPENSED'
  END
  FROM (
    SELECT pi.prescription_id,
      SUM(pi.quantity_prescribed) AS total_prescribed,
      SUM(COALESCE(pi.quantity_dispensed,0)) AS total_dispensed
    FROM pharmacy.prescription_items pi
    WHERE pi.prescription_id IN (
      SELECT DISTINCT COALESCE(NULLIF(item->>'prescription_id','')::uuid, p_prescription_id)
      FROM jsonb_array_elements(p_items) item
      WHERE COALESCE(NULLIF(item->>'prescription_id',''), p_prescription_id::text) IS NOT NULL
    )
    GROUP BY pi.prescription_id
  ) totals
  WHERE p.id = totals.prescription_id AND p.company_id = v_company_id;

  BEGIN
    v_dte_id := pharmacy.generate_internal_dte(v_sale_id);
  EXCEPTION WHEN OTHERS THEN
    v_dte_id    := NULL;
    v_dte_error := SQLERRM;
    RAISE WARNING 'process_pharmacy_sale: DTE generation failed for sale_id=%: %', v_sale_id, v_dte_error;
  END;

  RETURN jsonb_build_object(
    'sale_id',    v_sale_id,
    'session_id', v_session_id,
    'company_id', v_company_id,
    'dte_id',     v_dte_id,
    'dte_error',  v_dte_error,
    'success',    true
  );

EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'Conflicto de concurrencia: Los recursos (stock o receta) están siendo usados por otra caja. Intente nuevamente.';
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy.process_pharmacy_sale(uuid, numeric, text, text, uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION "pharmacy"."process_sale_return"(
    "p_sale_id" uuid,
    "p_reason" text,
    "p_items" jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pharmacy', 'public'
AS $$
declare
    v_user_id uuid;
    v_company_id uuid;
    v_sale record;
    v_return_id uuid;
    v_item jsonb;
    v_sale_item record;
    v_quarantine_location_id uuid;
    v_total_return_amount numeric := 0;
    v_folio bigint;
    v_cn_id uuid;
    v_warehouse_id uuid;
    v_already_returned numeric;
    v_requested_qty numeric;
    v_balance_after numeric;
begin
    v_user_id := auth.uid();
    if v_user_id is null then raise exception 'No autenticado'; end if;

    v_company_id := pharmacy.get_my_company_id();
    if v_company_id is null then raise exception 'Empresa no encontrada'; end if;

    if p_items is null or jsonb_array_length(p_items) = 0 then
        raise exception 'La devolución no contiene productos';
    end if;

    select * into v_sale from pharmacy.sales where id = p_sale_id and company_id = v_company_id for update;
    if not found then raise exception 'Venta no encontrada'; end if;

    select warehouse_id into v_warehouse_id from pharmacy.pos_sessions where id = v_sale.session_id;

    select id into v_quarantine_location_id
    from pharmacy.locations
    where warehouse_id = v_warehouse_id
      and company_id = v_company_id
      and location_type = 'QUARANTINE'
      and is_active = true
    limit 1;

    if v_quarantine_location_id is null then
        raise exception 'No se encontró una ubicación de tipo CUARENTENA en el almacén de la venta.';
    end if;

    insert into pharmacy.sales_returns (company_id, sale_id, reason, created_by, total_amount)
    values (v_company_id, p_sale_id, p_reason, v_user_id, 0)
    returning id into v_return_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
        v_requested_qty := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
        if v_requested_qty <= 0 then
            raise exception 'Cantidad inválida para devolución: %', v_requested_qty;
        end if;

        select
            si.*,
            p.is_controlled,
            b.batch_number,
            b.expiry_date,
            b.location_id as original_location_id
        into v_sale_item
        from pharmacy.sale_items si
        join pharmacy.products p on p.id = si.product_id
        join pharmacy.inventory_batches b on b.id = si.batch_id
        where si.id = (v_item->>'sale_item_id')::uuid
          and si.sale_id = p_sale_id
          and si.company_id = v_company_id
        for update of si, b;

        if not found then raise exception 'Item de venta % no encontrado', (v_item->>'sale_item_id'); end if;

        select coalesce(sum(quantity), 0) into v_already_returned
        from pharmacy.sales_return_items
        where sale_item_id = v_sale_item.id
          and company_id = v_company_id;

        if (v_requested_qty + v_already_returned) > v_sale_item.quantity then
            raise exception 'La devolución excede el saldo disponible. Vendido: %, Ya devuelto: %, Solicitado: %',
                v_sale_item.quantity, v_already_returned, v_requested_qty;
        end if;

        insert into pharmacy.sales_return_items (
            company_id, return_id, sale_item_id, product_id, batch_id, quantity, unit_price, subtotal
        ) values (
            v_company_id, v_return_id, v_sale_item.id, v_sale_item.product_id, v_sale_item.batch_id,
            v_requested_qty, v_sale_item.unit_price, v_requested_qty * v_sale_item.unit_price
        );

        v_total_return_amount := v_total_return_amount + (v_requested_qty * v_sale_item.unit_price);

        update pharmacy.inventory_batches
        set current_quantity = current_quantity + v_requested_qty,
            quarantine_quantity = coalesce(quarantine_quantity, 0) + v_requested_qty
        where id = v_sale_item.batch_id
          and company_id = v_company_id;

        if not found then
            raise exception 'No se encontró el lote original vendido para la devolución';
        end if;

        select coalesce(sum(
            case
              when upper(l.location_type) = 'QUARANTINE' then b.current_quantity
              else coalesce(b.quarantine_quantity, 0)
            end
        ), 0)
        into v_balance_after
        from pharmacy.inventory_batches b
        join pharmacy.locations l on l.id = b.location_id
        where b.company_id = v_company_id
          and b.product_id = v_sale_item.product_id
          and l.warehouse_id = v_warehouse_id;

        insert into pharmacy.inventory_movements (
            company_id, product_id, batch_id, batch_number, to_location_id,
            movement_type, quantity, reference_folio, created_by, balance_after
        ) values (
            v_company_id, v_sale_item.product_id, v_sale_item.batch_id, v_sale_item.batch_number, v_quarantine_location_id,
            'RETURN', v_requested_qty, 'RET-' || v_return_id::text, v_user_id, v_balance_after
        );

    end loop;

    update pharmacy.sales_returns set total_amount = v_total_return_amount where id = v_return_id;

    insert into pharmacy.dte_folios (company_id, dte_type, current_folio)
    values (v_company_id, 'NOTA_CREDITO', 1)
    on conflict (company_id, dte_type)
    do update set current_folio = dte_folios.current_folio + 1
    returning current_folio into v_folio;

    insert into pharmacy.internal_credit_notes (
        company_id, return_id, sale_id, folio, total_amount, status
    ) values (
        v_company_id, v_return_id, p_sale_id, v_folio, v_total_return_amount, 'GENERATED'
    ) returning id into v_cn_id;

    insert into pharmacy.audit_logs (
        company_id, user_id, event_type, table_name, record_id, old_data, new_data
    ) values (
        v_company_id, v_user_id, 'SALE_RETURN', 'sales_returns', v_return_id,
        null, jsonb_build_object('return_id', v_return_id, 'total_amount', v_total_return_amount, 'folio', v_folio)
    );

    return jsonb_build_object(
        'success', true,
        'return_id', v_return_id,
        'folio_nc', v_folio,
        'total_amount', v_total_return_amount
    );

exception when others then
    raise exception 'Error en proceso de devolución: %', sqlerrm;
end;
$$;

GRANT EXECUTE ON FUNCTION pharmacy.process_sale_return(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE VIEW "pharmacy"."view_batch_registry" AS
SELECT
    b.id,
    b.company_id,
    b.product_id,
    p.name as product_name,
    p.dci as product_dci,
    b.batch_number,
    b.expiry_date,
    b.current_quantity,
    coalesce(b.quarantine_quantity, 0) as quarantine_quantity,
    case
      when upper(l.location_type) = 'QUARANTINE' then 0
      else greatest(b.current_quantity - coalesce(b.quarantine_quantity, 0), 0)
    end as active_quantity,
    case
      when upper(l.location_type) = 'QUARANTINE' then b.current_quantity
      else coalesce(b.quarantine_quantity, 0)
    end as quarantine_stock,
    b.created_at,
    b.po_id,
    l.id as location_id,
    l.name as location_name,
    l.location_type,
    w.id as warehouse_id,
    w.name as warehouse_name,
    po.po_number,
    po.issue_date as purchase_order_date,
    s.id as supplier_id,
    coalesce(s.commercial_name, s.legal_name) as supplier_name,
    origin.receipt_id,
    origin.document_type as receipt_document_type,
    origin.document_number as receipt_document_number,
    origin.received_date,
    origin.origin_movement_type,
    case
      when po.id is not null or origin.receipt_id is not null or origin.origin_movement_type in ('IN_PURCHASE', 'INBOUND_TRANSFER') then 'RECEPCION_REAL'
      when exists (
        select 1
        from pharmacy.inventory_movements ret
        where ret.batch_id = b.id
          and ret.movement_type = 'RETURN'
      ) then 'DEVOLUCION_LEGADO'
      else 'SIN_ORIGEN'
    end as source_type,
    case
      when upper(l.location_type) = 'QUARANTINE' or coalesce(b.quarantine_quantity, 0) > 0 then 'CUARENTENA'
      else 'ACTIVO'
    end as warehouse_state
FROM pharmacy.inventory_batches b
JOIN pharmacy.products p on p.id = b.product_id
LEFT JOIN pharmacy.locations l on l.id = b.location_id
LEFT JOIN pharmacy.warehouses w on w.id = l.warehouse_id
LEFT JOIN pharmacy.purchase_orders po on po.id = b.po_id
LEFT JOIN LATERAL (
    select
      r.id as receipt_id,
      r.document_type,
      r.document_number,
      r.received_date,
      im_in.movement_type as origin_movement_type,
      r.supplier_id
    from pharmacy.inventory_movements im_in
    left join pharmacy.inventory_receipts r on r.id = im_in.receipt_id
    where im_in.batch_id = b.id
      and im_in.movement_type in ('IN_PURCHASE', 'INBOUND_TRANSFER')
    order by im_in.created_at asc
    limit 1
) origin on true
LEFT JOIN pharmacy.suppliers s on s.id = coalesce(origin.supplier_id, po.supplier_id);

CREATE OR REPLACE VIEW "pharmacy"."view_batch_audit" AS
SELECT
    im.id,
    im.created_at,
    p.name as product_name,
    p.dci as product_dci,
    im.batch_number,
    im.movement_type,
    im.quantity,
    im.balance_after,
    im.reference_folio,
    cu.full_name as operator_name,
    move_l.name as location_name,
    move_w.name as warehouse_name,
    im.company_id,
    im.product_id,
    im.batch_id,
    move_l.location_type as location_type,
    b.expiry_date,
    b.current_quantity,
    coalesce(b.quarantine_quantity, 0) as quarantine_quantity,
    case
      when upper(coalesce(batch_l.location_type, '')) = 'QUARANTINE' then 0
      else greatest(coalesce(b.current_quantity, 0) - coalesce(b.quarantine_quantity, 0), 0)
    end as active_quantity,
    case
      when upper(coalesce(batch_l.location_type, '')) = 'QUARANTINE' then coalesce(b.current_quantity, 0)
      else coalesce(b.quarantine_quantity, 0)
    end as quarantine_stock,
    case
      when im.movement_type = 'RETURN' or upper(coalesce(move_l.location_type, batch_l.location_type, '')) = 'QUARANTINE' then 'CUARENTENA'
      else 'ACTIVO'
    end as warehouse_state,
    po.id as purchase_order_id,
    po.po_number,
    po.issue_date as purchase_order_date,
    coalesce(s.commercial_name, s.legal_name) as supplier_name,
    origin.receipt_id,
    origin.document_type as receipt_document_type,
    origin.document_number as receipt_document_number,
    origin.received_date,
    case
      when po.id is not null or origin.receipt_id is not null or origin.origin_movement_type in ('IN_PURCHASE', 'INBOUND_TRANSFER') then 'RECEPCION_REAL'
      when im.movement_type = 'RETURN' then 'DEVOLUCION'
      else 'SIN_ORIGEN'
    end as source_type
FROM pharmacy.inventory_movements im
JOIN pharmacy.products p ON p.id = im.product_id
LEFT JOIN pharmacy.inventory_batches b ON b.id = im.batch_id
LEFT JOIN pharmacy.locations batch_l ON batch_l.id = b.location_id
LEFT JOIN pharmacy.locations move_l ON move_l.id = COALESCE(im.to_location_id, im.destination_location_id, im.from_location_id, im.source_location_id, b.location_id)
LEFT JOIN pharmacy.warehouses move_w ON move_w.id = move_l.warehouse_id
LEFT JOIN pharmacy.purchase_orders po ON po.id = b.po_id
LEFT JOIN LATERAL (
    select
      r.id as receipt_id,
      r.document_type,
      r.document_number,
      r.received_date,
      im_in.movement_type as origin_movement_type,
      r.supplier_id
    from pharmacy.inventory_movements im_in
    left join pharmacy.inventory_receipts r on r.id = im_in.receipt_id
    where im_in.batch_id = im.batch_id
      and im_in.movement_type in ('IN_PURCHASE', 'INBOUND_TRANSFER')
    order by im_in.created_at asc
    limit 1
) origin on true
LEFT JOIN pharmacy.suppliers s ON s.id = COALESCE(origin.supplier_id, po.supplier_id)
LEFT JOIN public.company_users cu ON cu.user_id = im.created_by AND cu.company_id = im.company_id;

GRANT SELECT ON "pharmacy"."view_batch_registry" TO authenticated;
GRANT SELECT ON "pharmacy"."view_batch_audit" TO authenticated;
