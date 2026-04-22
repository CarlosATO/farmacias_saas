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

// Función base para obtener productos del inventario médico
export const fetchPharmacyProducts = async () => {
  return await getPharmacySchema().from('products').select('*');
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
  // Ahora los proveedores pertenecen al esquema 'pharmacy' (aislamiento del módulo)
  return await getPharmacySchema().from('suppliers').select('*').order('created_at', { ascending: false });
};

export const getCurrentUserId = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
};

export const fetchPurchaseOrders = async () => {
  return await getPharmacySchema()
    .from('purchase_orders')
    .select('*, supplier:supplier_id(*)')
    .order('created_at', { ascending: false });
};

export const fetchPurchaseOrderItems = async (purchaseOrderId) => {
  return await getPharmacySchema()
    .from('purchase_order_items')
    .select('*, product:product_id(*)')
    .eq('po_id', purchaseOrderId);
};

export const receivePurchaseOrder = async (poId, items) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("No se pudo obtener el ID de la compañía.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No se pudo obtener el usuario actual.");

  const { data: header, error: headerError } = await schema
    .from('purchase_orders')
    .update({ status: 'RECEIVED' })
    .eq('id', poId)
    .select()
    .single();

  if (headerError) throw headerError;

  const batchPayload = items.map(item => ({
    product_id: item.product_id,
    po_id: poId,
    batch_number: item.batch_number,
    expiry_date: item.expiry_date,
    quantity_received: item.received_quantity,
    unit_cost: item.unit_cost,
    company_id: companyId
  }));

  const { error: batchError } = await schema
    .from('inventory_batches')
    .insert(batchPayload);

  if (batchError) throw batchError;

  const movementPayload = items.map(item => ({
    company_id: companyId,
    product_id: item.product_id,
    user_id: userId,
    movement_type: 'IN_PURCHASE',
    quantity: item.received_quantity,
    reason: `Recepción OC ${poId}`,
    batch_number: item.batch_number,
    expiry_date: item.expiry_date
  }));

  const { error: movementError } = await schema
    .from('inventory_movements')
    .insert(movementPayload);

  if (movementError) throw movementError;

  for (const item of items) {
    const { data: product, error: productErr } = await schema
      .from('products')
      .select('stock_quantity')
      .eq('id', item.product_id)
      .single();

    if (productErr) throw productErr;

    const newStock = Number(product.stock_quantity || 0) + Number(item.received_quantity);
    const { error: updateError } = await schema
      .from('products')
      .update({ stock_quantity: newStock })
      .eq('id', item.product_id);

    if (updateError) throw updateError;
  }

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
    total_cost: item.quantity * item.unit_cost
  }));

  const { error: itemsError } = await schema
    .from('purchase_order_items')
    .insert(detailItems);

  if (itemsError) throw itemsError;

  return header;
};
