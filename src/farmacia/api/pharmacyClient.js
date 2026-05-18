import { supabase } from '../../api/supabaseClient';
import { normalizeDocumentSearchTerm } from '../utils/documents/documentSearch';

// Helper para apuntar siempre al esquema 'pharmacy'
export const getPharmacySchema = () => supabase.schema('pharmacy');

export const logAuditEvent = async (eventType, description, metadata = {}) => {
  try {
    const cleanMetadata = Object.fromEntries(
      Object.entries(metadata || {}).filter(([, value]) => value !== undefined)
    );

    const { data, error } = await getPharmacySchema().rpc('log_audit_event', {
      p_event_type: eventType,
      p_description: description,
      p_metadata: cleanMetadata,
    });

    if (error) {
      console.warn('Auditoria no registrada:', eventType, error.message || error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.warn('Auditoria no registrada:', eventType, error.message || error);
    return { data: null, error };
  }
};

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

export const fetchAuditLogs = async (filters = {}) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id"), count: 0 };

  const limit = Number(filters.limit || 50);
  const page = Math.max(1, Number(filters.page || 1));
  const offset = (page - 1) * limit;
  const startDate = filters.startDate || filters.dateFrom;
  const endDate = filters.endDate || filters.dateTo;
  const eventType = (filters.eventType || '').trim();
  const userId = (filters.userId || '').trim();

  const startAt = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null;
  const endAt = endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : null;

  const { data, error } = await getPharmacySchema().rpc('fetch_audit_logs', {
    p_start_at: startAt,
    p_end_at: endAt,
    p_event_type: eventType || null,
    p_user_id: userId || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error || !data) {
    return { data: [], error, count: 0 };
  }

  // Fetch operators to resolve user names from POS operators
  const operatorIds = [...new Set(data.map(log => log.metadata?.operator_id).filter(Boolean))];
  let operatorsById = {};
  
  if (operatorIds.length > 0) {
    const { data: operators } = await getPharmacySchema()
      .from('pos_operators')
      .select('id, full_name')
      .in('id', operatorIds);
    if (operators) {
      operatorsById = Object.fromEntries(operators.map(op => [op.id, op.full_name]));
    }
  }

  const enrichedData = data.map(log => {
    let resolvedName = 'Usuario no identificado';
    if (log.metadata?.operator_id && operatorsById[log.metadata.operator_id]) {
      resolvedName = operatorsById[log.metadata.operator_id];
    }
    return {
      ...log,
      user_name: resolvedName,
    };
  });

  return {
    data: enrichedData,
    error: null,
    count: data?.[0]?.total_count ? Number(data[0].total_count) : 0,
  };
};

export const fetchAuditLogDetail = async (auditLogId) => {
  if (!auditLogId) return { data: null, error: new Error('No audit log id') };

  const { data, error } = await getPharmacySchema().rpc('fetch_audit_log_detail', {
    p_audit_log_id: auditLogId,
  });

  if (error) return { data: null, error };
  return { data, error: null };
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

export const importProductsBulk = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No hay filas para importar');
  }

  const { data, error } = await getPharmacySchema().rpc('import_products_bulk', {
    p_items: items,
  });

  if (error) {
    throw new Error(error.message || 'Error al importar productos');
  }

  return data;
};

// --- GESTIÓN DE PRECIOS POR SUCURSAL ---

export const fetchPricesByWarehouse = async (warehouseId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };
  
  return await getPharmacySchema()
    .from('product_prices')
    .select('*, product:product_id(id, name, price_sale, unit_price, barcode, dci, family, laboratory_name)')
    .eq('warehouse_id', warehouseId)
    .eq('company_id', companyId);
};

export const fetchPricingMatrix = async (search = '', limit = 250) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error('No company id') };

  const rpcPayload = {
    p_search: search || null,
    p_limit: limit,
  };

  const { data, error } = await getPharmacySchema().rpc('get_pricing_matrix', rpcPayload);

  if (error) return { data: [], error };

  return { data: data || [], error: null };
};

export const updateCorporatePrice = async (productId, corporatePrice) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error('No company id') };

  const rpcPayload = {
    p_company_id: companyId,
    p_product_id: productId,
    p_corporate_price: Number(corporatePrice),
    p_active: true,
  };

  const { data, error } = await getPharmacySchema().rpc('upsert_corporate_price', rpcPayload);

  if (error) return { data: null, error };

  return { data, error: null };
};

export const saveBranchPriceConfig = async ({
  productId,
  warehouseId,
  useLocalPrice = true,
  overrideSalePrice = null,
  overrideMarginPercent = null,
  active = true,
}) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { error: new Error("No company id") };

  const rpcPayload = {
    p_company_id: companyId,
    p_product_id: productId,
    p_warehouse_id: warehouseId,
    p_use_local_price: Boolean(useLocalPrice),
    p_override_sale_price: overrideSalePrice === null || overrideSalePrice === undefined || overrideSalePrice === ''
      ? null
      : Number(overrideSalePrice),
    p_override_margin_percent: overrideMarginPercent === null || overrideMarginPercent === undefined || overrideMarginPercent === ''
      ? null
      : Number(overrideMarginPercent),
    p_active: Boolean(active),
  };

  const { data, error } = await getPharmacySchema().rpc('upsert_branch_price_config', rpcPayload);
  if (error) {
    console.error("[product_prices] Error BD Detalle:", error?.message, error?.details, error?.hint);
    return { data: null, error };
  }

  return { data, error: null };
};

export const bulkUpsertBranchPrices = async (items) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error('No company id') };

  if (!Array.isArray(items) || items.length === 0) {
    return { data: null, error: new Error('No hay precios para aplicar') };
  }

  const rpcPayload = {
    p_items: items.map((item) => ({
      product_id: item.productId,
      warehouse_id: item.warehouseId,
      use_local_price: item.useLocalPrice ?? true,
      override_sale_price: item.overrideSalePrice ?? null,
      override_margin_percent: item.overrideMarginPercent ?? null,
      active: item.active ?? true,
    })),
  };

  const { data, error } = await getPharmacySchema().rpc('bulk_upsert_branch_prices', rpcPayload);
  if (error) {
    console.error('[product_prices] Error bulk BD:', error?.message, error?.details, error?.hint);
    return { data: null, error };
  }

  return { data, error: null };
};

export const updateProductPrice = async (productId, warehouseId, newPrice) => {
  return await saveBranchPriceConfig({
    productId,
    warehouseId,
    useLocalPrice: true,
    overrideSalePrice: Number(newPrice),
    active: true,
  });
};

// ── Kardex: calcula el saldo actual tras un movimiento y lo guarda ────────────
export const calculateBalanceAfter = async (schema, productId, locationId, movementId) => {
  try {
    // Sumar todas las cantidades del producto en esa ubicación
    const { data: batches } = await schema
      .from('inventory_batches')
      .select('current_quantity')
      .eq('product_id', productId)
      .eq('location_id', locationId);

    const balance = (batches || []).reduce((sum, b) => sum + (b.current_quantity || 0), 0);

    await schema
      .from('inventory_movements')
      .update({ balance_after: balance })
      .eq('id', movementId);

    return balance;
  } catch (err) {
    // No lanzar error: el movimiento ya fue registrado, solo falla el saldo
    console.warn('calculateBalanceAfter failed silently:', err.message);
    return null;
  }
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

export const fetchInventoryAlerts = async (warehouseId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  let query = getPharmacySchema()
    .from('view_inventory_alerts')
    .select('*')
    .eq('company_id', companyId);

  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId);
  }

  return await query.order('severity', { ascending: true }).order('expiry_date', { ascending: true, nullsFirst: false });
};

export const fetchPurchaseRecommendations = async (warehouseId) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !warehouseId) return { data: [], error: new Error('No company id o warehouse id') };

  const { data, error } = await getPharmacySchema().rpc('get_purchase_recommendations', {
    p_warehouse_id: warehouseId,
  });

  if (error) return { data: [], error };
  return { data: data || [], error: null };
};

export const createRepositionPurchaseDraft = async (warehouseId, items) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !warehouseId) return { data: null, error: new Error('No company id o warehouse id') };

  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: item.product_id,
      quantity: Number(item.quantity || 0),
    }))
    .filter((item) => item.product_id && item.quantity > 0);

  const { data, error } = await getPharmacySchema().rpc('create_reposition_purchase_draft', {
    p_warehouse_id: warehouseId,
    p_items: normalizedItems,
  });

  if (error) return { data: null, error };
  return { data, error: null };
};

export const fetchLastPurchaseUnitCost = async (warehouseId, productId) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !warehouseId || !productId) return { data: 0, error: new Error('No company id, warehouse id o product id') };

  const { data, error } = await getPharmacySchema().rpc('get_last_purchase_unit_cost', {
    p_company_id: companyId,
    p_warehouse_id: warehouseId,
    p_product_id: productId,
  });

  if (error) return { data: 0, error };
  return { data: Number(data || 0), error: null };
};

// Obtener catálogo de pacientes
export const normalizeRut = (rut) => rut?.replace(/\./g, '').toLowerCase().trim() || '';

export const fetchPharmacyPatients = async (query = '', limit = 10) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  const normalizedQ = normalizeRut(query);
  let baseQuery = getPharmacySchema().from('patients').select('*').eq('company_id', companyId);
  
  if (normalizedQ) {
    baseQuery = baseQuery.or(`full_name.ilike.%${query}%,rut.ilike.%${normalizedQ}%`);
  }

  return await baseQuery.order('full_name', { ascending: true }).limit(limit);
};

export const createPharmacyPatient = async (patientData) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  const result = await getPharmacySchema()
    .from('patients')
    .insert([{ ...patientData, company_id: companyId }])
    .select()
    .single();

  return result;
};

export const updatePharmacyPatient = async (id, patientData) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  const result = await getPharmacySchema()
    .from('patients')
    .update({ ...patientData })
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  return result;
};

// --- DOCTORES ---
export const fetchDoctors = async (query = '', limit = 10) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  const normalizedQ = normalizeRut(query);
  let baseQuery = getPharmacySchema().from('doctors').select('*').eq('company_id', companyId);
  
  if (normalizedQ) {
    baseQuery = baseQuery.or(`full_name.ilike.%${query}%,rut.ilike.%${normalizedQ}%`);
  }

  return await baseQuery.order('full_name', { ascending: true }).limit(limit);
};

export const createDoctor = async (doctorData) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  return await getPharmacySchema()
    .from('doctors')
    .insert([{ ...doctorData, company_id: companyId }])
    .select()
    .single();
};

export const updateDoctor = async (id, doctorData) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  return await getPharmacySchema()
    .from('doctors')
    .update({ ...doctorData })
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();
};

// Obtener recetas pendientes por paciente (puente POS)
export const fetchPendingPrescriptionsByPatient = async (patientId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  return await getPharmacySchema()
    .from('prescriptions')
    .select('*, patient:patient_id(*)')
    .eq('company_id', companyId)
    .eq('patient_id', patientId)
    .in('status', ['PENDING', 'PARTIAL'])
    .order('created_at', { ascending: false });
};

// Obtener todas las recetas médicas
export const fetchPrescriptions = async () => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  return await getPharmacySchema().from('prescriptions').select('*, patient:patient_id(*)').eq('company_id', companyId).order('created_at', { ascending: false });
};

// Obtener una receta específica por su folio
export const fetchPrescriptionByFolio = async (folio) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  return await getPharmacySchema()
    .from('prescriptions')
    .select('*, patient:patient_id(*)')
    .eq('company_id', companyId)
    .eq('folio_electronico', folio)
    .single();
};

// Crear una nueva receta médica con items (Transaccional con Inyección de Company ID)
export const fetchWarehouses = async () => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };
  return await getPharmacySchema().from('warehouses').select('*').eq('company_id', companyId).order('name');
};

export const fetchLocations = async (warehouseId = null) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  let query = getPharmacySchema().from('locations').select('*, warehouse:warehouse_id(*)').eq('company_id', companyId);
  if (warehouseId) query = query.eq('warehouse_id', warehouseId);
  return await query.order('name');
};



export const createPrescriptionWithItems = async (prescriptionData, items) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) return { error: { message: "No company id" } };

  // Prepare items for the RPC: requires an array of JSON objects with specific keys
  const p_items = items.map(item => ({
    product_id: item.product_id,
    quantity_prescribed: Number(item.quantity_prescribed || 0),
    dosage_instructions: item.dosage_instructions || item.instructions || ''
  }));

  const { data, error } = await schema.rpc('create_prescription_with_items', {
    p_company_id: companyId,
    p_patient_id: prescriptionData.patient_id || null,
    p_doctor_id: prescriptionData.doctor_id || null,
    p_prescriber_rut: prescriptionData.prescriber_rut || null,
    p_prescriber_name: prescriptionData.prescriber_name || null,
    p_folio_electronico: prescriptionData.folio_electronico || null,
    p_issue_date: prescriptionData.issue_date || null,
    p_valid_until: prescriptionData.valid_until || null,
    p_diagnosis: prescriptionData.diagnosis || null,
    p_notes: prescriptionData.notes || null,
    p_items: p_items
  });

  if (error) {
    return { error };
  }

  const header = Array.isArray(data) ? data[0] : data;
  const prescriptionId = header?.id || header?.prescription_id || data?.id || data?.prescription_id || null;
  const folioElectronico = header?.folio_electronico || prescriptionData.folio_electronico || null;
  const normalizedItems = items.map((item, idx) => ({
    id: item.id || item.prescription_item_id || null,
    prescription_item_id: item.prescription_item_id || item.id || null,
    product_id: item.product_id,
    quantity: Number(item.quantity_prescribed || item.quantity || 0),
    quantity_prescribed: Number(item.quantity_prescribed || item.quantity || 0),
    dosage_instructions: item.dosage_instructions || item.instructions || '',
    prescription_id: prescriptionId,
    prescription_folio: folioElectronico,
    order: idx + 1,
  }));

  return {
    data: {
      id: prescriptionId,
      prescription_id: prescriptionId,
      folio_electronico: folioElectronico,
      prescription_type: header?.prescription_type || null,
      status: header?.status || 'PENDING',
      header: {
        ...header,
        id: prescriptionId,
        prescription_id: prescriptionId,
        folio_electronico: folioElectronico,
      },
      items: normalizedItems,
    },
    error: null,
  };
};

export const derivePrescriptionTypeFromItems = async (items) => {
  const schema = getPharmacySchema();
  // The RPC expects p_items as jsonb
  const p_items = items.map(item => ({ product_id: item.product_id }));

  const { data, error } = await schema.rpc('derive_prescription_type_from_items', {
    p_items: p_items
  });
  
  if (!error && data) {
    return data;
  }
  
  // Fallback local en caso de error en la RPC
  console.warn("Fallback de cálculo de tipo de receta local", error);
  let highestType = 'RECETA_SIMPLE';
  for (const item of items) {
    const condition = (item.sale_condition || item.prescription_type || '').toUpperCase();
    if (condition === 'RCH' || condition === 'RECETA_CHEQUE') {
      return 'RECETA_CHEQUE'; // Máxima prioridad
    }
    if (condition === 'RR' || condition === 'RECETA_RETENIDA' || item.is_controlled) {
      highestType = 'RECETA_RETENIDA';
    }
  }
  
  return highestType;
};


export const fetchPrescriptionItems = async (prescriptionId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  // Validar que la receta pertenezca a la empresa antes de traer sus items
  const { data: valid } = await getPharmacySchema()
    .from('prescriptions')
    .select('id')
    .eq('id', prescriptionId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!valid) return { data: [], error: null };

  return await getPharmacySchema()
    .from('prescription_items')
    .select('*, product:product_id(*)')
    .eq('prescription_id', prescriptionId);
};

// --- POS: PRODUCTOS CON STOCK Y PRECIO (RPC OPTIMIZADA) ---
export const fetchPosProducts = async (warehouseId, search = '', limit = 100) => {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Acceso denegado: No se encontró vinculación con una empresa.");

  const { data, error } = await getPharmacySchema()
    .rpc('get_pos_products', {
      p_warehouse_id: warehouseId,
      p_search: search || null,
      p_limit: limit
    });

  if (error) throw error;

  // Mapear campos de la RPC al formato esperado por el frontend
  return (data || []).map(p => ({
    id: p.product_id,
    ...p,
    effective_price_sale: Number(p.price_sale || 0),
    stock_disponible: Number(p.stock_available || 0),
    stock_cuarentena: Number(p.stock_quarantine || 0)
  }));
};

export const fetchBioequivalentSuggestions = async (productId, warehouseId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return [];

  const { data, error } = await getPharmacySchema()
    .rpc('get_bioequivalent_suggestions', {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
    });

  if (error) {
    console.error('Error en fetchBioequivalentSuggestions:', error);
    return [];
  }

  return data || [];
};

// --- OPERACIONES DE VENTA (POS) — RPC TRANSACCIONAL ---
export const createSaleWithItems = async (saleHeader, cartItems, warehouseId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Acceso denegado: No se encontró vinculación con una empresa.");

  if (!cartItems || cartItems.length === 0) {
    throw new Error("La venta no contiene productos.");
  }

  // Normalizar items al formato esperado por la RPC
  const p_items = cartItems.map(item => ({
    product_id: item.id || item.product_id,
    quantity: Number(item.quantity || 1),
    unit_price: Number(item.price_sale || item.unit_price || 0),
    prescription_id: item.prescription_id || null,
    prescription_item_id: item.prescription_item_id || null,
    prescription_folio: item.prescription_folio || item.correlativo_asociado || null,
    prescription_status: item.prescription_status || null,
    prescription_patient_id: item.prescription_patient_id || null
  }));

  const headerPrescriptionId = saleHeader.prescription_id || p_items.find(i => i.prescription_id)?.prescription_id || null;

  // Validar que todas las recetas asociadas estén pendientes
  const prescriptionIds = new Set([
    ...(headerPrescriptionId ? [headerPrescriptionId] : []),
    ...p_items.map(i => i.prescription_id).filter(Boolean)
  ]);
  if (prescriptionIds.size > 0) {
    for (const pid of prescriptionIds) {
      const { error: valErr } = await getPharmacySchema()
        .rpc('validate_prescription_pending', { p_prescription_id: pid });
      if (valErr) {
        const msg = valErr.message || '';
        if (msg.includes('despachada') || msg.includes('disponible')) {
          throw new Error('Esta receta ya fue despachada o no está disponible.');
        }
        throw new Error(msg);
      }
    }
  }

  const { data, error } = await getPharmacySchema()
    .rpc('process_pharmacy_sale', {
      p_warehouse_id: warehouseId,
      p_total_amount: Number(saleHeader.total_amount || 0),
      p_payment_method: saleHeader.payment_method || 'CASH',
      p_document_number: saleHeader.document_number || `TICKET-${Date.now()}`,
      p_patient_id: saleHeader.patient_id || null,
      p_prescription_id: headerPrescriptionId,
      p_items
    });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('stock') || msg.includes('Stock')) {
      throw new Error(`Stock insuficiente: ${msg}`);
    }
    if (msg.includes('caja') || msg.includes('session') || msg.includes('OPEN')) {
      throw new Error('Debes abrir tu caja en el módulo de Control de Caja antes de poder vender.');
    }
    if (msg.includes('company') || msg.includes('empresa')) {
      throw new Error('Acceso denegado: No se encontró vinculación con una empresa.');
    }
    throw new Error(msg);
  }

  // process_pharmacy_sale returns: { sale_id, session_id, company_id, dte_id, success }
  // Read all fields directly — do NOT destructure through a nested .sale property.
  const saleResult = Array.isArray(data) ? data[0] : data;
  const saleId = saleResult?.sale_id || null;
  let sessionId = saleResult?.session_id || saleHeader.session_id || null;
  let operatorId = saleHeader.operator_id || null;

  if ((!sessionId || !operatorId) && warehouseId) {
    try {
      const { data: currentSession } = await fetchOpenPosSession(warehouseId);
      sessionId = sessionId || currentSession?.id || null;
      operatorId = operatorId || currentSession?.operator_id || currentSession?.operator?.id || null;
    } catch (sessionErr) {
      console.warn('No se pudo resolver sesion POS para auditoria:', sessionErr.message || sessionErr);
    }
  }

  // DTE is generated inside process_pharmacy_sale (backend authority).
  // If the RPC returns only sale_id, resolve the internal receipt once by sale_id.
  let dteDoc = null;
  let dteId = saleResult?.dte_id || null;
  let dteWarning = null;

  if (!dteId && saleId) {
    try {
      const { data: dteBySale, error: dteBySaleError } = await fetchDteBySaleId(saleId);
      if (!dteBySaleError && dteBySale) {
        dteDoc = dteBySale;
        dteId = dteBySale.id || null;
      }
    } catch (dteLookupErr) {
      console.warn('No se pudo resolver boleta interna por sale_id:', dteLookupErr.message || dteLookupErr);
    }
  }

  if (!dteId) {
    dteWarning = 'Venta registrada, pero boleta interna pendiente de generación.';
  }

  // Return structured result for the POS to consume
  return {
    sale_id: saleId,
    dte_id: dteId,
    dte_doc: dteDoc,
    dte_warning: dteWarning,
    session_id: sessionId,
    total_amount: Number(saleHeader.total_amount || 0),
    payment_method: saleHeader.payment_method || 'CASH',
    document_number: saleHeader.document_number || null,
    raw: data,
  };
};

export const findPendingPrescription = async (folio) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return null;

  const { data, error } = await getPharmacySchema()
    .from('prescriptions')
    .select('*, patient:patient_id(*)')
    .eq('company_id', companyId)
    .eq('folio', folio)
    .in('status', ['PENDING', 'PARTIAL'])
    .single();

  if (error) return null;
  return data;
};

// --- CONTROL DE CAJA / POS SESSIONS ---

export const fetchOpenPosSession = async (warehouseId) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  const userId = await getCurrentUserId();

  if (!companyId || !userId || !warehouseId) {
    return { data: null, error: new Error('No se pudo resolver compania, usuario o sucursal.') };
  }

  return await schema
    .from('pos_sessions')
    .select('*, operator:operator_id(id, full_name, is_active)')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('warehouse_id', warehouseId)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
};

/**
 * Obtiene la sesión activa o pendiente para un terminal específico.
 * Utilizado por el equipo físico (POS) para identificarse.
 */
export const fetchSessionByTerminal = async (terminalId) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !terminalId) return { data: null, error: new Error('Falta terminalId o companyId') };

  return await schema
    .from('pos_sessions')
    .select('*, operator:operator_id(id, full_name, is_active), terminal:terminal_id(id, name)')
    .eq('company_id', companyId)
    .eq('terminal_id', terminalId)
    .in('status', ['PENDING', 'OPEN'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
};

/**
 * Obtiene todas las sesiones (abiertas, cerradas, pendientes) de una sucursal.
 * Utilizado por el monitor de cajas (ControlCaja).
 */
export const fetchSessionsByWarehouse = async (warehouseId) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !warehouseId) return { data: [], error: new Error('Falta warehouseId') };

  return await schema
    .from('pos_sessions')
    .select('*, operator:operator_id(id, full_name), terminal:terminal_id(id, name)')
    .eq('company_id', companyId)
    .eq('warehouse_id', warehouseId)
    .order('created_at', { ascending: false });
};

export const preOpenSession = async ({ terminalId, warehouseId, operatorId, openingBalance }) => {
  const { data, error } = await getPharmacySchema().rpc('pre_open_pos_session', {
    p_payload: {
      warehouse_id: warehouseId,
      terminal_id: terminalId,
      operator_id: operatorId,
      initial_cash: Number(openingBalance || 0),
    },
  });

  if (error) return { data: null, error };
  return { data: data?.session || data || null, error: null };
};

export const activateSession = async ({ sessionId, operatorId, pinCode }) => {
  const { data, error } = await getPharmacySchema().rpc('activate_pos_session', {
    p_session_id: sessionId,
    p_operator_id: operatorId,
    p_pin_code: pinCode,
  });

  if (error) return { data: null, error };
  return { data: data?.session || data || null, error: null };
};

export const openPosSession = async ({ warehouseId, openingBalance, operatorId }) => {
  const { data, error } = await getPharmacySchema().rpc('open_pos_session', {
    p_payload: {
      warehouse_id: warehouseId,
      operator_id: operatorId,
      initial_cash: Number(openingBalance || 0),
    },
  });

  if (error) return { data: null, error };
  return { data: data?.session || data || null, error: null };
};

export const fetchPosSessionSummary = async (session) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !session?.id) {
    return { data: null, error: new Error('No se pudo resolver compania o sesion.') };
  }

  const allSalesResult = await schema
    .from('sales')
    .select('id, total_amount, payment_method, created_at, document_number, patient_id, sale_items(*, product:product_id(name))')
    .eq('company_id', companyId)
    .eq('session_id', session.id)
    .order('created_at', { ascending: false });

  if (allSalesResult.error) return { data: null, error: allSalesResult.error };

  const movementsResult = await schema
    .from('cash_movements')
    .select('*')
    .eq('company_id', companyId)
    .eq('session_id', session.id)
    .order('created_at', { ascending: false });

  if (movementsResult.error) return { data: null, error: movementsResult.error };

  const sales = allSalesResult.data || [];
  const movements = movementsResult.data || [];

  const totalsByMethod = sales.reduce((acc, sale) => {
    const method = sale.payment_method || 'CASH';
    acc[method] = (acc[method] || 0) + Number(sale.total_amount || 0);
    return acc;
  }, {});

  const cashSales = totalsByMethod['CASH'] || 0;
  const cardSales = totalsByMethod['CARD'] || 0;
  const transferSales = totalsByMethod['TRANSFER'] || 0;

  const cashEntries = movements
    .filter((movement) => movement.movement_type === 'IN')
    .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const cashOutflows = movements
    .filter((movement) => movement.movement_type === 'OUT')
    .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);

  return {
    data: {
      cashSales,
      cardSales,
      transferSales,
      cashEntries,
      cashOutflows,
      expectedCash: Number(session.opening_balance || 0) + cashSales + cashEntries - cashOutflows,
      sales,
      movements,
      totalsByMethod
    },
    error: null,
  };
};

export const fetchPosSessionHistory = async (warehouseId = null, limit = 50, offset = 0) => {
  const { data, error } = await getPharmacySchema().rpc('fetch_pos_session_history', {
    p_warehouse_id: warehouseId || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) return { data: [], error };
  return { data: data || [], error: null };
};

export const fetchManagementDashboardKpis = async (warehouseId) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !warehouseId) return { data: null, error: new Error('No company id o warehouse id') };

  const { data, error } = await getPharmacySchema()
    .rpc('get_dashboard_kpis', { p_warehouse_id: warehouseId });

  if (error) return { data: null, error };

  const row = Array.isArray(data) ? data[0] : data;
  return { data: row || null, error: null };
};

const fetchManagementDashboardList = async (viewName, warehouseId, limit = 10, order = []) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !warehouseId) return { data: [], error: new Error('No company id o warehouse id') };

  let query = getPharmacySchema()
    .from(viewName)
    .select('*')
    .eq('company_id', companyId)
    .eq('warehouse_id', warehouseId);

  order.forEach(({ column, ascending = true, nullsFirst }) => {
    query = query.order(column, { ascending, nullsFirst });
  });

  const { data, error } = await query.limit(limit);
  if (error) return { data: [], error };
  return { data: data || [], error: null };
};

export const fetchManagementDashboardOperationalAlerts = async (warehouseId, limit = 8) => {
  return fetchManagementDashboardList('view_dashboard_operational_alerts', warehouseId, limit, [
    { column: 'severity_rank', ascending: true },
    { column: 'alert_type', ascending: true },
    { column: 'days_to_expire', ascending: true, nullsFirst: false },
  ]);
};

export const fetchManagementDashboardExpirations = async (warehouseId, limit = 10) => {
  return fetchManagementDashboardList('view_dashboard_expirations', warehouseId, limit, [
    { column: 'days_to_expire', ascending: true, nullsFirst: false },
    { column: 'product_name', ascending: true },
  ]);
};

export const fetchManagementDashboardStockCritical = async (warehouseId, limit = 10) => {
  return fetchManagementDashboardList('view_dashboard_stock_critical', warehouseId, limit, [
    { column: 'severity_rank', ascending: true },
    { column: 'current_quantity', ascending: true, nullsFirst: false },
    { column: 'product_name', ascending: true },
  ]);
};

export const fetchManagementDashboardQuarantine = async (warehouseId, limit = 5) => {
  return fetchManagementDashboardList('view_dashboard_quarantine', warehouseId, limit, [
    { column: 'product_name', ascending: true },
  ]);
};

export const fetchManagementDashboard = async (warehouseId) => {
  const [kpisResult, alertsResult, expirationsResult, criticalResult, quarantineResult] = await Promise.all([
    fetchManagementDashboardKpis(warehouseId),
    fetchManagementDashboardOperationalAlerts(warehouseId),
    fetchManagementDashboardExpirations(warehouseId),
    fetchManagementDashboardStockCritical(warehouseId),
    fetchManagementDashboardQuarantine(warehouseId),
  ]);

  const error = kpisResult.error || alertsResult.error || expirationsResult.error || criticalResult.error || quarantineResult.error || null;
  if (error) return { data: null, error };

  const kpis = kpisResult.data || {};
  return {
    data: {
      ...kpis,
      operational_alerts: alertsResult.data || [],
      expiration_alerts: expirationsResult.data || [],
      stock_critical_alerts: criticalResult.data || [],
      quarantine_alerts: quarantineResult.data || [],
    },
    error: null,
  };
};

export const fetchSessionSalesSummary = async (sessionId) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !sessionId) return { data: [], error: new Error('Falta companyId o sessionId') };

  return await schema
    .from('sales')
    .select('*, sale_items(*, product:product_id(name))')
    .eq('company_id', companyId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });
};

export const fetchClosedPosSessions = async (warehouseId, limit = 10) => {
  const { data, error } = await fetchPosSessionHistory(warehouseId, Math.max(Number(limit || 10), 1), 0);

  if (error) return { data: [], error };

  const closedSessions = (data || [])
    .filter((session) => session.status === 'CLOSED')
    .map((session) => ({
      ...session,
      id: session.session_id,
      warehouse: session.warehouse,
      terminal: session.terminal,
      operator: session.operator,
      start_time: session.opened_at,
      end_time: session.closed_at,
      opening_balance: session.initial_cash,
      closing_balance: session.counted_cash,
      difference: session.difference,
      summary: {
        cashSales: session.total_sales || 0,
        cardSales: 0,
        transferSales: 0,
        cashEntries: 0,
        cashOutflows: 0,
        expectedCash: session.expected_cash || 0,
        total_cash_movements: session.total_cash_movements || 0,
      },
    }));

  return { data: closedSessions, error: null };
};

export const fetchClosedSessions = async (warehouseId, startDate, endDate) => {
  const { data, error } = await fetchPosSessionHistory(warehouseId, 200, 0);

  if (error) {
    console.error('Error en fetchClosedSessions:', error);
    return { data: [], error };
  }

  const startAt = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
  const endAt = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;

  const summarized = (data || [])
    .filter((session) => session.status === 'CLOSED')
    .filter((session) => {
      const closedAt = session.closed_at ? new Date(session.closed_at) : null;
      if (!closedAt) return false;
      if (startAt && closedAt < startAt) return false;
      if (endAt && closedAt > endAt) return false;
      return true;
    })
    .map((session) => ({
      ...session,
      id: session.session_id,
      operator: session.operator,
      terminal: session.terminal,
      start_time: session.opened_at,
      end_time: session.closed_at,
      opening_balance: session.initial_cash,
      closing_balance: session.counted_cash,
      summary: {
        cashSales: session.total_sales || 0,
        cardSales: 0,
        transferSales: 0,
        cashEntries: 0,
        cashOutflows: 0,
        expectedCash: session.expected_cash || 0,
        sales: [],
        movements: [],
      },
    }));

  return { data: summarized, error: null };
};

export const createCashMovement = async ({ sessionId, movementType, amount, reason }) => {
  const { data, error } = await getPharmacySchema().rpc('create_cash_movement', {
    p_payload: {
      session_id: sessionId,
      movement_type: movementType,
      amount: Number(amount || 0),
      reason,
    },
  });

  if (error) return { data: null, error };
  return { data: data?.movement || data || null, error: null };
};

export const closePosSession = async ({ sessionId, operatorId, pinCode, countedCash }) => {
  const { data, error } = await getPharmacySchema().rpc('close_pos_session', {
    p_payload: {
      session_id: sessionId,
      operator_id: operatorId,
      pin_code: pinCode,
      counted_cash: Number(countedCash || 0),
    },
  });

  if (error) return { data: null, error };
  return { data: data || null, error: null };
};

export const fetchPosOperators = async (warehouseId) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !warehouseId) {
    return { data: [], error: new Error('No se pudo resolver compania o sucursal.') };
  }

  return await schema
    .from('pos_operators')
    .select('*')
    .eq('company_id', companyId)
    .eq('warehouse_id', warehouseId)
    .order('full_name');
};

export const createPosOperator = async ({ warehouseId, fullName, pinCode }) => {
  if (!warehouseId) {
    return { data: null, error: new Error('No se pudo resolver la sucursal.') };
  }

  const result = await getPharmacySchema().rpc('create_pos_operator', {
    p_warehouse_id: warehouseId,
    p_full_name: fullName,
    p_pin_code: pinCode,
  });

  if (result.error) return result;

  return { data: result.data?.operator || result.data || null, error: null };
};

export const updatePosOperator = async ({ operatorId, fullName, warehouseId = null, isActive = undefined }) => {
  if (!operatorId) {
    return { data: null, error: new Error('No se pudo resolver el operador.') };
  }

  const rpcPayload = {
    p_payload: {
      operator_id: operatorId,
      full_name: fullName,
      ...(warehouseId ? { warehouse_id: warehouseId } : {}),
      ...(isActive === undefined ? {} : { is_active: Boolean(isActive) }),
    },
  };

  return await getPharmacySchema().rpc('update_pos_operator', rpcPayload);
};

export const deactivatePosOperator = async ({ operatorId }) => {
  if (!operatorId) {
    return { data: null, error: new Error('No se pudo resolver el operador.') };
  }

  return await getPharmacySchema().rpc('deactivate_pos_operator', {
    p_operator_id: operatorId,
  });
};

export const resetPosOperatorPin = async ({ operatorId, warehouseId, pinCode }) => {
  if (!warehouseId || !operatorId) {
    return { data: null, error: new Error('No se pudo resolver la sucursal u operador.') };
  }

  return await getPharmacySchema().rpc('reset_pos_operator_pin', {
    p_operator_id: operatorId,
    p_warehouse_id: warehouseId,
    p_pin_code: pinCode,
  });
};

// --- TERMINALES POS ---

export const fetchPosTerminals = async (warehouseId) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !warehouseId) return { data: [], error: new Error('Falta companyId o warehouseId') };

  return await schema
    .from('pos_terminals')
    .select('*')
    .eq('company_id', companyId)
    .eq('warehouse_id', warehouseId)
    .eq('is_active', true)
    .order('name');
};

export const createPosTerminal = async ({ warehouseId, name }) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !warehouseId) return { error: new Error('Falta companyId o warehouseId') };

  return await schema
    .from('pos_terminals')
    .insert({
      company_id: companyId,
      warehouse_id: warehouseId,
      name
    })
    .select()
    .single();
};

export const updatePosTerminal = async (terminalId, updates) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !terminalId) return { error: new Error('Falta companyId o terminalId') };

  return await schema
    .from('pos_terminals')
    .update(updates)
    .eq('company_id', companyId)
    .eq('id', terminalId)
    .select()
    .single();
};

export const togglePosTerminalStatus = async (terminalId, isActive) => {
  return await updatePosTerminal(terminalId, { is_active: isActive });
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
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  // Validar que la OC pertenezca a la empresa
  const { data: valid } = await getPharmacySchema()
    .from('purchase_orders')
    .select('id')
    .eq('id', purchaseOrderId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!valid) return { data: [], error: null };

  return await getPharmacySchema()
    .from('purchase_order_items')
    .select('*, product:product_id(*)')
    .eq('po_id', purchaseOrderId);
};

export const fetchOrderReceipts = async (poId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  return await getPharmacySchema()
    .from('inventory_receipts')
    .select('id, document_type, document_number, received_date, notes, created_at')
    .eq('company_id', companyId)
    .eq('po_id', poId)
    .order('created_at', { ascending: false });
};

export const receivePurchaseOrder = async (poId, batchesData, receiptData) => {
  const { data, error } = await getPharmacySchema().rpc('receive_purchase_order_transactional', {
    p_purchase_order_id: poId,
    p_warehouse_id: receiptData?.warehouse_id || null,
    p_receipt_data: {
      supplier_id: receiptData?.supplier_id || null,
      document_type: receiptData?.document_type || null,
      document_number: receiptData?.document_number || null,
      notes: receiptData?.notes || null,
    },
    p_batches: batchesData || [],
  });

  if (error) return { data: null, error };
  return { data, error: null };
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
      status: 'WAITING_APPROVAL',
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

  await logAuditEvent('PURCHASE_ORDER_CREATED', 'Orden de compra creada', {
    purchase_order_id: header.id,
    warehouse_id: header.warehouse_id || headerData.warehouse_id || null,
    amount: Number(header.total_amount || headerData.total_amount || 0),
    items: detailItems.map(item => ({
      product_id: item.product_id,
      cantidad: Number(item.quantity || 0),
      amount: Number(item.total_cost || 0),
    })),
  });

  return header;
};

export const updatePurchaseOrderDraft = async (purchaseOrderId, payload = {}) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !purchaseOrderId) return { data: null, error: new Error('No company id o purchase order id') };

  const { data, error } = await getPharmacySchema().rpc('update_purchase_order_draft', {
    p_purchase_order_id: purchaseOrderId,
    p_supplier_id: payload.supplier_id || null,
    p_expected_delivery_date: payload.expected_delivery_date || null,
    p_observation_notes: payload.observation_notes || null,
    p_payment_terms_days: payload.payment_terms_days ?? null,
    p_items: payload.items || [],
    p_emit: Boolean(payload.emit),
  });

  if (error) return { data: null, error };
  return { data, error: null };
};

export const cancelPurchaseOrder = async (purchaseOrderId, reason) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !purchaseOrderId) return { data: null, error: new Error('No company id o purchase order id') };

  const { data, error } = await getPharmacySchema().rpc('cancel_purchase_order', {
    p_purchase_order_id: purchaseOrderId,
    p_reason: reason,
  });

  if (error) return { data: null, error };
  return { data, error: null };
};

export const approvePurchaseOrder = async (purchaseOrderId) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !purchaseOrderId) return { data: null, error: new Error('No company id o purchase order id') };

  const { data, error } = await getPharmacySchema().rpc('approve_purchase_order', {
    p_purchase_order_id: purchaseOrderId,
  });

  if (error) return { data: null, error };
  return { data, error: null };
};

export const emitPurchaseOrder = async (purchaseOrderId) => {
  const companyId = await getMyCompanyId();
  if (!companyId || !purchaseOrderId) return { data: null, error: new Error('No company id o purchase order id') };

  const { data, error } = await getPharmacySchema().rpc('emit_purchase_order', {
    p_purchase_order_id: purchaseOrderId,
  });

  if (error) return { data: null, error };
  return { data, error: null };
};

// --- MÓDULO LOGÍSTICO (WMS) ---
/**
 * Procesa una operación de traspaso o reserva según el destino.
 * Caso A: Mismo Local -> Acomodo Inmediato (Update stock direct)
 * Caso B: Distinto Local -> Reserva Inter-Sucursal (Transfer Order)
 */
export const createTransferRequest = async (transferData, cartItems) => {
  const { data, error } = await getPharmacySchema().rpc('process_internal_transfer', {
    p_transfer_data: {
      source_warehouse_id: transferData?.source_warehouse_id || null,
      dest_warehouse_id: transferData?.dest_warehouse_id || null,
      source_location_id: transferData?.source_location_id || null,
      dest_location_id: transferData?.dest_location_id || null,
      notes: transferData?.notes || null,
    },
    p_items: (cartItems || []).map(item => ({
      batch_id: item.batch?.id || null,
      product_id: item.batch?.product_id || null,
      transfer_quantity: Number(item.transferQuantity || 0),
      source_location_id: item.batch?.location_id || transferData?.source_location_id || null,
      dest_location_id: item.dest_location_id || transferData?.dest_location_id || null,
      batch_number: item.batch?.batch_number || null,
      expiry_date: item.batch?.expiry_date || null,
    })),
  });

  if (error) return { data: null, error };
  return { data, error: null };
};

// --- RECEPCIÓN DE TRASPASOS (LOGÍSTICA) ---

export const fetchPendingTransfers = async (warehouseId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  return await getPharmacySchema()
    .from('transfer_requests')
    .select('*, source_warehouse:warehouses!source_warehouse_id(name)')
    .eq('company_id', companyId)
    .eq('destination_warehouse_id', warehouseId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
};

export const fetchTransferItems = async (transferId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  // Validar que la solicitud pertenezca a la empresa
  const { data: valid } = await getPharmacySchema()
    .from('transfer_requests')
    .select('id')
    .eq('id', transferId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!valid) return { data: [], error: null };

  return await getPharmacySchema()
    .from('transfer_request_items')
    .select('*, product:products!product_id(name, dci), batch:inventory_batches!batch_id(batch_number, expiry_date)')
    .eq('transfer_request_id', transferId);
};

export const receiveTransfer = async (transferId, warehouseId, receptionMeta = {}, receivedQuantities = {}) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  const { dispatchGuide = null, receptionNotes = null } = receptionMeta;

  // 1. Obtener ubicación de CUARENTENA del local destino
  const { data: quarantineLoc, error: qError } = await schema
    .from('locations')
    .select('id')
    .eq('company_id', companyId)
    .eq('warehouse_id', warehouseId)
    .eq('location_type', 'QUARANTINE')
    .limit(1)
    .single();

  if (qError || !quarantineLoc) throw new Error("No se encontró ubicación de CUARENTENA en la sucursal de destino.");

  // 2. Obtener cabecera (folio) + items del traspaso
  const { data: header, error: headerErr } = await schema
    .from('transfer_requests')
    .select('folio, source_warehouse_id, destination_warehouse_id')
    .eq('company_id', companyId)
    .eq('id', transferId)
    .single();

  if (headerErr) throw headerErr;
  const transferFolio = header?.folio || null;

  const { data: items, error: iError } = await schema
    .from('transfer_request_items')
    .select('*')
    .eq('transfer_request_id', transferId);

  if (iError || !items.length) throw new Error("No se encontraron items para recibir.");

  // 3. Procesar cada item usando la cantidad RECIBIDA (no la enviada)
  for (const item of items) {
    const receivedQty = Number(receivedQuantities[item.id] ?? item.quantity);

    // 3a. Obtener datos del lote original para mantener consistencia
    const { data: originalBatch } = await schema
      .from('inventory_batches')
      .select('*')
      .eq('id', item.batch_id)
      .single();

    if (!originalBatch) continue; // Lote de origen no encontrado, saltar

    // Solo actualizar stock si la cantidad recibida es mayor a 0
    if (receivedQty > 0) {
      // 3b. Insertar/Actualizar stock en destino (Cuarentena) con cantidad RECIBIDA
      const { data: existingBatch } = await schema
        .from('inventory_batches')
        .select('id, current_quantity')
        .eq('product_id', item.product_id)
        .eq('batch_number', originalBatch.batch_number)
        .eq('location_id', quarantineLoc.id)
        .maybeSingle();

      let destBatchId;
      if (existingBatch) {
        const newQtyDest = existingBatch.current_quantity + receivedQty;
        await schema
          .from('inventory_batches')
          .update({ current_quantity: newQtyDest })
          .eq('id', existingBatch.id);
        destBatchId = existingBatch.id;
      } else {
        const { data: newBatch } = await schema
          .from('inventory_batches')
          .insert([{
            company_id: companyId,
            product_id: item.product_id,
            location_id: quarantineLoc.id,
            batch_number: originalBatch.batch_number,
            expiry_date: originalBatch.expiry_date,
            initial_quantity: receivedQty,
            current_quantity: receivedQty
          }])
          .select('id')
          .single();
        destBatchId = newBatch?.id;
      }

      // 3c. Registrar INBOUND_TRANSFER — quantity POSITIVO (es una entrada en el destino)
      //     Usamos el batch del destino y calculamos balance_after inline
      const destQtyAfter = existingBatch
        ? (existingBatch.current_quantity + receivedQty)
        : receivedQty;

      const { error: movErr } = await schema
        .from('inventory_movements')
        .insert([{
          company_id: companyId,
          product_id: item.product_id,
          batch_id: destBatchId || item.batch_id,
          batch_number: originalBatch.batch_number,
          from_location_id: null,
          to_location_id: quarantineLoc.id,
          movement_type: 'INBOUND_TRANSFER',
          quantity: Math.abs(receivedQty),
          reference_folio: transferFolio || null,
          balance_after: destQtyAfter,
          notes: `Recepción de traspaso inter-sucursal${dispatchGuide ? ` | Guía: ${dispatchGuide}` : ''}`
        }]);

      if (movErr) {
        throw new Error(`[Kardex] FALLO INBOUND_TRANSFER: ${movErr.message}`);
      }
    }

    // 3d. Actualizar estado del item con la cantidad realmente recibida
    const itemUpdate = { status: 'COMPLETED', received_quantity: receivedQty };
    await schema
      .from('transfer_request_items')
      .update(itemUpdate)
      .eq('id', item.id);
  }

  // 4. Finalizar cabecera con datos del documento
  const headerUpdate = {
    status: 'COMPLETED',
    ...(dispatchGuide && { dispatch_guide: dispatchGuide }),
    ...(receptionNotes && { notes: receptionNotes })
  };

  const { error: finalError } = await schema
    .from('transfer_requests')
    .update(headerUpdate)
    .eq('company_id', companyId)
    .eq('id', transferId);

  if (finalError) throw finalError;

  const receivedItems = items.map(item => ({
    product_id: item.product_id,
    cantidad: Number(receivedQuantities[item.id] ?? item.quantity),
    batch_id: item.batch_id,
  }));

  await logAuditEvent('TRANSFER_RECEIVED', 'Traspaso entre sucursales recibido', {
    transfer_id: transferId,
    folio: transferFolio,
    warehouse_id: warehouseId,
    source_warehouse_id: header?.source_warehouse_id || null,
    destination_warehouse_id: header?.destination_warehouse_id || warehouseId,
    operator_id: null,
    cantidad: receivedItems.reduce((sum, item) => sum + Number(item.cantidad || 0), 0),
    items: receivedItems,
  });

  return { success: true };
};
export const createWarehouse = async (warehouseData) => {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("No company id");

  const { data, error } = await getPharmacySchema().rpc('create_warehouse_with_default_locations', {
    p_payload: {
      ...warehouseData,
      name: warehouseData?.name,
    },
  });

  if (error) throw error;

  return data;
};

export const updateWarehouse = async (id, warehouseData) => {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("No company id");

  const { data, error } = await getPharmacySchema().rpc('update_warehouse', {
    p_payload: {
      id,
      ...warehouseData,
      name: warehouseData?.name,
    },
  });

  if (error) throw error;

  return data;
};

export const deleteWarehouse = async (id) => {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("No company id");

  const { data, error } = await getPharmacySchema().rpc('deactivate_warehouse', {
    p_warehouse_id: id,
  });
  if (error) throw error;

  return data;
};

// --- DTE INTERNO ---
export const fetchDteDocuments = async (filters = {}) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  let query = getPharmacySchema()
    .from('dte_documents')
    .select(`*, sale:sale_id(document_number), patient:customer_id(full_name, rut)`)
    .eq('company_id', companyId);

  if (filters.dte_type) query = query.eq('dte_type', filters.dte_type);
  if (filters.folio && /^\d+$/.test(String(filters.folio).trim())) query = query.eq('folio', Number(filters.folio));
  if (filters.status) query = query.eq('status', filters.status);

  return await query.order('created_at', { ascending: false });
};

export const fetchDteById = async (dteId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  return await getPharmacySchema()
    .from('dte_documents')
    .select(`*, sale:sale_id(document_number), patient:customer_id(full_name, rut)`)
    .eq('company_id', companyId)
    .eq('id', dteId)
    .maybeSingle();
};

export const fetchDteBySaleId = async (saleId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  const result = await getPharmacySchema()
    .from('dte_documents')
    .select(`*, sale:sale_id(document_number), patient:customer_id(full_name, rut)`)
    .eq('company_id', companyId)
    .eq('sale_id', saleId)
    .maybeSingle();

  return result;
};

export const fetchSaleItems = async (saleId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  return await getPharmacySchema()
    .from('sale_items')
    .select('*, product:product_id(name, dci, barcode)')
    .eq('company_id', companyId)
    .eq('sale_id', saleId);
};

// --- ISP AUDIT VIEWS ---
export const fetchBatchAudit = async (filters = {}) => {
  const params = typeof filters === 'string' ? { batch_number: filters } : filters;

  return await getPharmacySchema().rpc('fetch_batch_audit', {
    p_batch_id: params.batch_id || null,
    p_batch_number: params.batch_number || null,
    p_from: params.from || null,
    p_to: params.to || null,
    p_product_id: params.product_id || null,
    p_limit: params.limit || 500,
    p_offset: params.offset || 0,
  });
};

export const fetchBatchRegistry = async (batchNumber, options = {}) => {
  const params = typeof batchNumber === 'object'
    ? batchNumber
    : { batch_number: batchNumber, ...options };

  return await getPharmacySchema().rpc('fetch_batch_registry', {
    p_batch_number: params.batch_number || null,
    p_limit: params.limit || 200,
    p_offset: params.offset || 0,
  });
};

/**
 * Obtiene la lista de lotes únicos (por producto/lote) que coinciden con un número de lote
 */
export const fetchUniqueLotsByNumber = async (batchNumber) => {
  const { data, error } = await fetchBatchRegistry(batchNumber);
  if (error) return { data: [], error };

  return {
    data: (data || []).map(lot => ({
      ...lot,
      product: { name: lot.product_name, dci: lot.product_dci },
      location: {
        name: lot.location_name,
        location_type: lot.location_type,
        warehouse: { name: lot.warehouse_name }
      },
      po: lot.po_id ? {
        id: lot.po_id,
        po_number: lot.po_number,
        issue_date: lot.purchase_order_date,
        supplier: { name: lot.supplier_name }
      } : null,
      receipt: lot.receipt_id ? {
        id: lot.receipt_id,
        document_type: lot.receipt_document_type,
        document_number: lot.receipt_document_number,
        received_date: lot.received_date
      } : null
    })),
    error: null
  };
};


export const fetchPrescriptionAudit = async (filters = {}) => {
  return await getPharmacySchema().rpc('fetch_prescription_audit', {
    p_patient_rut: filters.patient_rut || null,
    p_folio_electronico: filters.folio_electronico || filters.folio || null,
    p_from: filters.from || filters.startDate || null,
    p_to: filters.to || filters.endDate || null,
    p_limit: filters.limit || 200,
    p_offset: filters.offset || 0,
  });
};

export const fetchControlledAudit = async (filters = {}) => {
  return await getPharmacySchema().rpc('fetch_controlled_audit', {
    p_patient_rut: filters.patient_rut || null,
    p_product_id: filters.product_id || null,
    p_from: filters.from || filters.startDate || null,
    p_to: filters.to || filters.endDate || null,
    p_limit: filters.limit || 200,
    p_offset: filters.offset || 0,
  });
};

/**
 * Procesa una devolución de venta (arquitectura interna)
 * @param {string} saleId - ID de la venta original
 * @param {string} reason - Motivo de la devolución
 * @param {Array} items - Lista de items [{sale_item_id, quantity}]
 */
export const processSaleReturn = async (saleId, reason, items) => {
  if (!saleId || !items || items.length === 0) {
    throw new Error('Datos de devolución incompletos');
  }

  const { data, error } = await getPharmacySchema().rpc('process_sale_return', {
    p_sale_id: saleId,
    p_reason: reason,
    p_items: items
  });

  if (error) {
    console.error('Error en processSaleReturn:', error);
    throw new Error(error.message || 'Error al procesar la devolución');
  }

  return data;
};

/**
 * Busca ventas con filtros
 * @param {Object} filters { document_number, patient_rut, patient_name }
 */
export const fetchSales = async (filters = {}) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  let query = getPharmacySchema()
    .from('sales')
    .select(`*, patient:patient_id(full_name, rut)`)
    .eq('company_id', companyId);

  if (filters.document_number) query = query.ilike('document_number', `%${filters.document_number}%`);
  if (filters.patient_rut) query = query.ilike('patient(rut)', `%${filters.patient_rut}%`);
  
  return await query.order('created_at', { ascending: false }).limit(50);
};

/**
 * Obtiene una venta específica por su número de documento o ID
 */
export const fetchSaleByNumber = async (docNumberOrId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  const search = normalizeDocumentSearchTerm(docNumberOrId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.raw);

  let query = getPharmacySchema()
    .from('sales')
    .select(`*, patient:patient_id(full_name, rut)`)
    .eq('company_id', companyId);

  if (isUuid) {
    query = query.eq('id', search.raw);
    return await query.maybeSingle();
  }

  const searchTerms = [search.raw, search.compact, search.digits].filter(Boolean);

  if (searchTerms.length > 0) {
    const { data: salesData, error: salesError } = await query
      .or(searchTerms.map((term) => `document_number.ilike.%${term}%`).join(','))
      .order('created_at', { ascending: false })
      .limit(5);

    if (salesError) return { data: null, error: salesError };
    if (salesData?.length > 0) return { data: salesData[0], error: null };
  }

  if (search.digits) {
    const { data: dteData, error: dteError } = await getPharmacySchema()
      .from('dte_documents')
      .select(`folio, sale:sale_id(*, patient:patient_id(full_name, rut))`)
      .eq('company_id', companyId)
      .eq('folio', Number(search.digits))
      .maybeSingle();

    if (dteError) return { data: null, error: dteError };
    if (dteData?.sale) {
      return {
        data: {
          ...dteData.sale,
          internal_document_number: dteData.folio,
          pos_reference: dteData.sale.document_number,
        },
        error: null,
      };
    }
  }

  return { data: null, error: null };
};

/**
 * Obtiene el historial de devoluciones de una venta
 */
export const fetchReturnHistoryForSale = async (saleId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  // 1. Obtener los IDs de las devoluciones asociadas a la venta
  const { data: returns, error: retErr } = await getPharmacySchema()
    .from('sales_returns')
    .select('id')
    .eq('sale_id', saleId)
    .eq('company_id', companyId);

  if (retErr) throw retErr;
  if (!returns || returns.length === 0) return { data: [] };

  const returnIds = returns.map(r => r.id);

  // 2. Obtener los items devueltos en esas devoluciones
  return await getPharmacySchema()
    .from('sales_return_items')
    .select('sale_item_id, quantity')
    .in('return_id', returnIds)
    .eq('company_id', companyId);
};
