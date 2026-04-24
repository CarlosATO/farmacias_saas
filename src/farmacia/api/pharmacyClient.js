import { supabase } from '../../api/supabaseClient';

// Helper para apuntar siempre al esquema 'pharmacy'
export const getPharmacySchema = () => supabase.schema('pharmacy');

/**
 * Obtiene el ID de la compañía vinculada al usuario autenticado.
 * Busca en la tabla public.company_users.
 */
export const getMyCompanyId = async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Usuario no autenticado");

  const { data, error } = await supabase
    .from('company_users')
    .select('company_id')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    console.error("Error obteniendo company_id:", error);
    return null;
  }
  return data.company_id;
};

// Función base para obtener productos del inventario médico (Catálogo Maestro)
export const fetchPharmacyProducts = async () => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  return await getPharmacySchema()
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
};

// Obtener stock consolidado por producto y bodega
export const fetchInventoryStock = async (warehouseId = null) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  if (warehouseId) {
    // Si filtramos por bodega, usamos !inner para que el filtro de la tabla relacionada sea efectivo
    return await getPharmacySchema()
      .from('inventory_batches')
      .select('*, product:product_id(*), location:location_id!inner(*)')
      .eq('company_id', companyId)
      .eq('location.warehouse_id', warehouseId);
  }

  // Si no hay bodega, traemos todo el stock de la empresa (útil para "Otros Locales")
  return await getPharmacySchema()
    .from('inventory_batches')
    .select('*, product:product_id(*), location:location_id(*)')
    .eq('company_id', companyId);
};

// Obtener catálogo de pacientes
export const fetchPharmacyPatients = async () => {
  return await getPharmacySchema().from('patients').select('*').order('created_at', { ascending: false });
};

// Obtener todas las recetas médicas
export const fetchPrescriptions = async () => {
  return await getPharmacySchema().from('prescriptions').select('*, patient:patient_id(*)').order('created_at', { ascending: false });
};

// Crear una nueva receta médica con items (Transaccional con Inyección de Company ID)
export const fetchWarehouses = async () => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };
  return await getPharmacySchema().from('warehouses').select('*').eq('company_id', companyId).order('name');
};

export const fetchLocations = async () => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };
  return await getPharmacySchema().from('locations').select('*, warehouse:warehouse_id(*)').eq('company_id', companyId).order('name');
};

export const createPrescriptionWithItems = async (prescriptionData, items) => {
  const schema = getPharmacySchema();
  
  // 1. Obtener Company ID para cumplir con RLS
  const companyId = await getMyCompanyId();
  if (!companyId) {
    return { error: { message: "No se pudo determinar el Company ID del colaborador activo." } };
  }

  // 2. Inyectar Company ID en la cabecera
  const finalHeaderData = {
    ...prescriptionData,
    company_id: companyId
  };

  // 3. Insertar Cabecera
  const { data: headerData, error: headerError } = await schema
    .from('prescriptions')
    .insert([finalHeaderData])
    .select()
    .single();

  if (headerError) return { error: headerError };

  // 4. Preparar Items
  const itemsWithHeaderId = items.map(item => ({
    ...item,
    prescription_id: headerData.id
  }));

  // 5. Insertar Items
  const { data: itemsData, error: itemsError } = await schema
    .from('prescription_items')
    .insert(itemsWithHeaderId);

  if (itemsError) return { error: itemsError, headerId: headerData.id };

  return { data: { header: headerData, items: itemsData }, error: null };
};

export const fetchPrescriptionItems = async (prescriptionId) => {
  return await getPharmacySchema()
    .from('prescription_items')
    .select('*, product:product_id(*)')
    .eq('prescription_id', prescriptionId);
};

// --- OPERACIONES DE VENTA (POS) ---
export const createSaleWithItems = async (saleHeader, items) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Acceso denegado: No se encontró vinculación con una empresa.");

  const finalHeader = {
    ...saleHeader,
    company_id: companyId,
    sale_date: new Date().toISOString()
  };

  const { data: header, error: headerError } = await schema
    .from('sales')
    .insert([finalHeader])
    .select()
    .single();

  if (headerError) throw headerError;

  const itemsWithSale = items.map(item => ({
    ...item,
    sale_id: header.id,
    company_id: companyId
  }));

  const { error: itemsError } = await schema
    .from('sale_items')
    .insert(itemsWithSale);

  if (itemsError) throw itemsError;

  if (saleHeader.prescription_id) {
    await schema
      .from('prescriptions')
      .update({ status: 'DISPENSED' })
      .eq('id', saleHeader.prescription_id);
  }

  return header;
};

export const findPendingPrescription = async (folio) => {
  const { data, error } = await getPharmacySchema()
    .from('prescriptions')
    .select('*, patient:patient_id(*)')
    .eq('folio', folio)
    .eq('status', 'PENDING')
    .single();

  if (error) return null;
  return data;
};

// --- ÓRDENES DE COMPRA (LOGÍSTICA) ---
export const fetchSuppliers = async () => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };
  
  return await getPharmacySchema()
    .from('suppliers')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
};

export const getCurrentUserId = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
};

export const fetchPurchaseOrders = async (warehouseId = null) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  let query = getPharmacySchema()
    .from('purchase_orders')
    .select('*, supplier:supplier_id(*)')
    .eq('company_id', companyId);
  
  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId);
  }

  return await query.order('created_at', { ascending: false });
};

export const fetchPurchaseOrderItems = async (purchaseOrderId) => {
  return await getPharmacySchema()
    .from('purchase_order_items')
    .select('*, product:product_id(*)')
    .eq('po_id', purchaseOrderId);
};

export const fetchOrderReceipts = async (poId) => {
  return await getPharmacySchema()
    .from('inventory_receipts')
    .select('id, document_type, document_number, received_date, notes, created_at')
    .eq('po_id', poId)
    .order('created_at', { ascending: false });
};

export const receivePurchaseOrder = async (poId, batchesData, receiptData) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("No se pudo obtener el ID de la compañía.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No se pudo obtener el usuario actual.");

  if (!receiptData.warehouse_id) throw new Error("Debe seleccionar una bodega para la recepción.");

  // 1. Get QUARANTINE location for the selected warehouse
  const { data: locData, error: locError } = await schema
    .from('locations')
    .select('id')
    .eq('company_id', companyId)
    .eq('warehouse_id', receiptData.warehouse_id)
    .eq('location_type', 'QUARANTINE')
    .limit(1)
    .maybeSingle();

  if (locError) throw new Error("Error obteniendo ubicación QUARANTINE: " + locError.message);
  if (!locData) throw new Error("No se encontró la ubicación de Cuarentena (QUARANTINE) para la bodega seleccionada. Cree una antes de recepcionar.");
  const locationId = locData.id;

  const itemUpdates = {};
  const batchesToInsert = [];

  // 2. Iterate batchesData to prepare inserts and group updates
  for (const batch of batchesData) {
    const factor = Number(batch.conversion_factor) || 1;
    const fractionatedQty = Number(batch.entered_quantity) * factor;

    batchesToInsert.push({
      company_id: companyId,
      product_id: batch.product_id,
      location_id: locationId,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      initial_quantity: fractionatedQty,
      current_quantity: fractionatedQty,
      po_id: poId
    });

    if (!itemUpdates[batch.po_item_id]) {
      itemUpdates[batch.po_item_id] = { entered_total: 0, product_id: batch.product_id, fractionated_total: 0 };
    }
    itemUpdates[batch.po_item_id].entered_total += Number(batch.entered_quantity);
    itemUpdates[batch.po_item_id].fractionated_total += fractionatedQty;
  }

  // Perform Inserts
  if (batchesToInsert.length > 0) {
    // 0. Insert Receipt (Header)
    const { data: receipt, error: receiptErr } = await schema
      .from('inventory_receipts')
      .insert([{
        company_id: companyId,
        po_id: poId,
        supplier_id: receiptData.supplier_id,
        document_type: receiptData.document_type,
        document_number: receiptData.document_number,
        notes: receiptData.notes,
        created_by: userId
      }])
      .select()
      .single();

    if (receiptErr) throw receiptErr;

    // 1. Insert Batches and get the generated IDs
    const { data: insertedBatches, error: batchErr } = await schema
      .from('inventory_batches')
      .insert(batchesToInsert)
      .select();

    if (batchErr) throw batchErr;

    // 2. Prepare Movements using the inserted batch IDs
    const movementsToInsert = insertedBatches.map((insertedBatch, index) => {
      // Correlate with original data for unit_cost and conversion_factor
      const originalBatch = batchesData[index];
      const factor = Number(originalBatch.conversion_factor) || 1;
      const realUnitCost = (originalBatch?.unit_cost || 0) / factor;

      return {
        company_id: companyId,
        product_id: insertedBatch.product_id,
        batch_id: insertedBatch.id,
        batch_number: insertedBatch.batch_number,
        from_location_id: null,
        to_location_id: locationId,
        movement_type: 'IN_PURCHASE',
        quantity: insertedBatch.initial_quantity,
        unit_cost: realUnitCost,
        receipt_id: receipt.id,
        notes: `Lote ${insertedBatch.batch_number} - OC ${poId}`
      };
    });

    const { error: movErr } = await schema
      .from('inventory_movements')
      .insert(movementsToInsert);

    if (movErr) throw movErr;
  }

  // 3. Update purchase_order_items & products
  for (const poItemId of Object.keys(itemUpdates)) {
    const updateData = itemUpdates[poItemId];

    const { data: poItem, error: poItemErr } = await schema
      .from('purchase_order_items')
      .select('quantity_received, unit_cost, conversion_factor')
      .eq('id', poItemId)
      .single();
    if (poItemErr) throw poItemErr;

    const newQtyReceived = Number(poItem.quantity_received || 0) + updateData.entered_total;

    const { error: updPoItemErr } = await schema
      .from('purchase_order_items')
      .update({ quantity_received: newQtyReceived, updated_by: userId })
      .eq('id', poItemId);
    if (updPoItemErr) throw updPoItemErr;

    const { data: product, error: prodErr } = await schema
      .from('products')
      .select('stock_quantity, last_cost, average_cost')
      .eq('id', updateData.product_id)
      .single();
    if (prodErr) throw prodErr;

    const oldStock = Number(product.stock_quantity || 0);
    const newStockAdded = updateData.fractionated_total;
    const totalStock = oldStock + newStockAdded;
    const oldAvgCost = Number(product.average_cost || 0);

    const productUpdates = { 
      stock_quantity: totalStock, 
      updated_by: userId 
    };

    const realUnitCost = Number(poItem.unit_cost || 0) / (Number(poItem.conversion_factor) || 1);

    if (realUnitCost > 0) {
      productUpdates.last_cost = realUnitCost;
      
      // Cálculo de Precio Promedio Ponderado (PPP)
      if (oldStock <= 0) {
        // Si no hay stock previo, el promedio es el costo actual
        productUpdates.average_cost = realUnitCost;
      } else {
        // Fórmula: ((Stock Antiguo * Costo Prom Antiguo) + (Stock Nuevo * Costo Nuevo)) / Stock Total
        const weightedAvg = ((oldStock * oldAvgCost) + (newStockAdded * realUnitCost)) / totalStock;
        productUpdates.average_cost = weightedAvg;
      }
    }

    const { error: updProdErr } = await schema
      .from('products')
      .update(productUpdates)
      .eq('id', updateData.product_id);
    if (updProdErr) throw updProdErr;
  }

  // 4. Evaluate PO status
  const { data: allItems, error: allItemsErr } = await schema
    .from('purchase_order_items')
    .select('quantity, quantity_received')
    .eq('po_id', poId);

  if (allItemsErr) throw allItemsErr;

  let allReceived = true;
  for (const it of allItems) {
    if (Number(it.quantity_received || 0) < Number(it.quantity)) {
      allReceived = false;
      break;
    }
  }

  const newStatus = allReceived ? 'RECEIVED' : 'PARTIAL';
  const { data: header, error: headerError } = await schema
    .from('purchase_orders')
    .update({ status: newStatus, updated_by: userId })
    .eq('id', poId)
    .select()
    .single();

  if (headerError) throw headerError;

  return { data: header, error: null };
};

export const createPurchaseOrderWithItems = async (headerData, items) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("No se pudo obtener el ID de la compañía.");

  // Omitimos enviar `po_number` porque la BD lo generará con su Trigger.
  // Pero sí incluimos los notes del frontend, y las llaves the RLS.
  const { data: header, error: headerError } = await schema
    .from('purchase_orders')
    .insert([{
      ...headerData, // notes, created_by, total_amount, etc...
      company_id: companyId,
      status: 'PENDING',
      issue_date: new Date().toISOString()
    }])
    .select()
    .single();

  if (headerError) throw headerError;

  const detailItems = items.map(item => ({
    po_id: header.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    total_cost: item.quantity * item.unit_cost,
    conversion_factor: item.conversion_factor || 1
  }));

  const { error: itemsError } = await schema
    .from('purchase_order_items')
    .insert(detailItems);

  if (itemsError) throw itemsError;

  return header;
};

// --- MÓDULO LOGÍSTICO (WMS) ---
/**
 * Procesa una operación de traspaso o reserva según el destino.
 * Caso A: Mismo Local -> Acomodo Inmediato (Update stock direct)
 * Caso B: Distinto Local -> Reserva Inter-Sucursal (Transfer Order)
 */
export const createTransferRequest = async (transferData, cartItems) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Company ID no encontrado.");

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("Usuario no autenticado.");

  const isInternal = transferData.source_warehouse_id === transferData.dest_warehouse_id;

  if (isInternal) {
    // CASO A: Acomodo Inmediato (Putaway Directo)
    for (const item of cartItems) {
      const { batch, transferQuantity, dest_location_id } = item;
      const finalDest = dest_location_id || transferData.dest_location_id;

      // 1. Restar del origen
      const { error: subErr } = await schema
        .from('inventory_batches')
        .update({ current_quantity: batch.current_quantity - transferQuantity })
        .eq('id', batch.id);
      if (subErr) throw new Error(`Error restando stock origen (${batch.batch_number}): ${subErr.message}`);

      // 2. Sumar al destino (Upsert basado en lote/producto/ubicacion)
      // Buscamos si ya existe el lote en la ubicación destino
      const { data: existingBatch, error: findErr } = await schema
        .from('inventory_batches')
        .select('*')
        .eq('company_id', companyId)
        .eq('product_id', batch.product_id)
        .eq('location_id', finalDest)
        .eq('batch_number', batch.batch_number)
        .maybeSingle();

      if (findErr) throw findErr;

      if (existingBatch) {
        const { error: addErr } = await schema
          .from('inventory_batches')
          .update({ current_quantity: Number(existingBatch.current_quantity) + transferQuantity })
          .eq('id', existingBatch.id);
        if (addErr) throw addErr;
      } else {
        const { error: insErr } = await schema
          .from('inventory_batches')
          .insert([{
            company_id: companyId,
            product_id: batch.product_id,
            location_id: finalDest,
            batch_number: batch.batch_number,
            expiry_date: batch.expiry_date,
            initial_quantity: transferQuantity,
            current_quantity: transferQuantity,
            po_id: batch.po_id
          }]);
        if (insErr) throw insErr;
      }

      // 3. Registrar Movimiento
      await schema
        .from('inventory_movements')
        .insert([{
          company_id: companyId,
          product_id: batch.product_id,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          from_location_id: transferData.source_location_id,
          to_location_id: finalDest,
          movement_type: 'INTERNAL_TRANSFER',
          quantity: transferQuantity,
          created_by: user.id,
          notes: `Acomodo interno: ${transferData.notes || ''}`
          // El reference_folio se genera por trigger o se omite en acomodos simples si no hay secuencia expuesta
        }]);
    }
    return { type: 'ACOMODO', message: 'Acomodo interno finalizado correctamente.' };
  } else {
    // CASO B: Reserva Inter-Sucursal
    // 1. Crear cabecera (transfer_requests) - Solicitamos el folio generado
    const { data: header, error: headerErr } = await schema
      .from('transfer_requests')
      .insert([{
        company_id: companyId,
        source_warehouse_id: transferData.source_warehouse_id,
        destination_warehouse_id: transferData.dest_warehouse_id,
        notes: transferData.notes || 'Reserva de traspaso generada desde consola',
        status: 'PENDING',
        requested_by: user.id
      }])
      .select('id, folio')
      .single();

    if (headerErr) throw new Error("Error creando reserva: " + headerErr.message);

    // 2. Insertar items (transfer_request_items)
    const itemsToInsert = cartItems.map(item => ({
      company_id: companyId,
      transfer_request_id: header.id,
      product_id: item.batch.product_id,
      batch_id: item.batch.id,
      source_location_id: transferData.source_location_id,
      destination_location_id: item.dest_location_id || transferData.dest_location_id,
      quantity: item.transferQuantity,
      status: 'PENDING'
    }));

    const { error: itemsErr } = await schema
      .from('transfer_request_items')
      .insert(itemsToInsert);

    if (itemsErr) throw new Error("Error creando detalle de reserva: " + itemsErr.message);

    return { type: 'RESERVA', folio: header.folio, message: `Reserva ${header.folio} generada. Pendiente de recepción en destino.` };
  }
};
export const createWarehouse = async (warehouseData) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  const userId = await getCurrentUserId();
  if (!companyId) throw new Error("No company id");

  // 1. Create warehouse
  const { data: warehouse, error } = await schema
    .from('warehouses')
    .insert([{
      ...warehouseData,
      company_id: companyId,
      created_by: userId
    }])
    .select()
    .single();

  if (error) throw error;

  // 2. Create default locations (Bodegas base)
  const defaultLocations = [
    { name: 'CUARENTENA (INBOUND)', location_type: 'QUARANTINE', warehouse_id: warehouse.id, company_id: companyId },
    { name: 'STORAGE (ALMACENAMIENTO)', location_type: 'STORAGE', warehouse_id: warehouse.id, company_id: companyId },
    { name: 'SALA DE VENTAS', location_type: 'SALES', warehouse_id: warehouse.id, company_id: companyId }
  ];

  const { error: locError } = await schema
    .from('locations')
    .insert(defaultLocations);

  if (locError) throw locError;

  return warehouse;
};

export const updateWarehouse = async (id, warehouseData) => {
  const { data, error } = await getPharmacySchema()
    .from('warehouses')
    .update(warehouseData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteWarehouse = async (id) => {
  const { error } = await getPharmacySchema()
    .from('warehouses')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
};
