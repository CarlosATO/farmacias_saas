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

// --- GESTIÓN DE PRECIOS POR SUCURSAL ---

export const fetchPricesByWarehouse = async (warehouseId) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };
  
  return await getPharmacySchema()
    .from('product_prices')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .eq('company_id', companyId);
};

export const updateProductPrice = async (productId, warehouseId, newPrice) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { error: new Error("No company id") };

  const { error } = await getPharmacySchema()
    .from('product_prices')
    .upsert({
      company_id: companyId,
      product_id: productId,
      warehouse_id: warehouseId,
      price_sale: Number(newPrice)
    }, {
      onConflict: 'product_id,warehouse_id'
    });

  if (error) {
    console.error("[product_prices] Error BD Detalle:", error?.message, error?.details, error?.hint);
    return { error };
  }
  return { error: null };
};

// ── Kardex: calcula el saldo actual tras un movimiento y lo guarda ────────────
// Llama a esta función DESPUÉS de actualizar inventory_batches en cada movimiento.
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

// Obtener catálogo de pacientes
export const fetchPharmacyPatients = async (query = '') => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  let baseQuery = getPharmacySchema().from('patients').select('*').eq('company_id', companyId);
  
  if (query) {
    baseQuery = baseQuery.or(`full_name.ilike.%${query}%,rut.ilike.%${query}%`);
  }

  return await baseQuery.order('full_name', { ascending: true }).limit(50);
};

export const createPharmacyPatient = async (patientData) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  return await getPharmacySchema()
    .from('patients')
    .insert([{ ...patientData, company_id: companyId }])
    .select()
    .single();
};

export const updatePharmacyPatient = async (id, patientData) => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };

  return await getPharmacySchema()
    .from('patients')
    .update({ ...patientData })
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();
};

// --- DOCTORES ---
export const fetchDoctors = async (query = '') => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: [], error: new Error("No company id") };

  let baseQuery = getPharmacySchema().from('doctors').select('*').eq('company_id', companyId);
  
  if (query) {
    baseQuery = baseQuery.or(`full_name.ilike.%${query}%,rut.ilike.%${query}%`);
  }

  return await baseQuery.order('full_name', { ascending: true }).limit(50);
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
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
};

// Obtener todas las recetas médicas
export const fetchPrescriptions = async () => {
  return await getPharmacySchema().from('prescriptions').select('*, patient:patient_id(*)').order('created_at', { ascending: false });
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

export const fetchLocations = async () => {
  const companyId = await getMyCompanyId();
  if (!companyId) return { data: null, error: new Error("No company id") };
  return await getPharmacySchema().from('locations').select('*, warehouse:warehouse_id(*)').eq('company_id', companyId).order('name');
};

export const createQuickPrescription = async (prescriptionData) => {
  const companyId = await getMyCompanyId();
  const userId = await getCurrentUserId();
  if (!companyId) return { error: { message: "No company id" } };

  return await getPharmacySchema()
    .from('prescriptions')
    .insert([{ 
      ...prescriptionData, 
      company_id: companyId, 
      created_by: userId,
      status: 'DISPENSED'
    }])
    .select()
    .single();
};

export const createPrescriptionWithItems = async (prescriptionData, items) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) return { error: { message: "No company id" } };

  const { data: header, error: headerError } = await schema
    .from('prescriptions')
    .insert([{ ...prescriptionData, company_id: companyId }])
    .select()
    .single();

  if (headerError) return { error: headerError };

  const itemsWithHeaderId = items.map(item => ({
    ...item,
    prescription_id: header.id
  }));

  const { data: itemsData, error: itemsError } = await schema
    .from('prescription_items')
    .insert(itemsWithHeaderId);

  return { data: { header, items: itemsData }, error: itemsError };
};

export const fetchPrescriptionItems = async (prescriptionId) => {
  return await getPharmacySchema()
    .from('prescription_items')
    .select('*, product:product_id(*)')
    .eq('prescription_id', prescriptionId);
};

// --- OPERACIONES DE VENTA (POS) CON LÓGICA FEFO ---
export const createSaleWithItems = async (saleHeader, cartItems, warehouseId) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Acceso denegado: No se encontró vinculación con una empresa.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Sesión expirada o usuario no autenticado.");

  const { data: openSession, error: openSessionError } = await schema
    .from('pos_sessions')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('warehouse_id', warehouseId)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openSessionError) {
    throw openSessionError;
  }

  if (!openSession?.id) {
    throw new Error('Debes abrir tu caja en el módulo de Control de Caja antes de poder vender');
  }

  // 1. Creación de la Cabecera (Payload Estricto de 6 propiedades)
  const salePayload = {
    company_id: companyId,
    user_id: userId,
    session_id: openSession.id,
    total_amount: Number(saleHeader.total_amount),
    payment_method: saleHeader.payment_method || 'CASH',
    document_number: saleHeader.document_number || `TICKET-${Date.now()}`,
    patient_id: saleHeader.patient_id || null
  };

  const { data: header, error: headerError } = await schema
    .from('sales')
    .insert([salePayload])
    .select()
    .single();

  if (headerError) {
    console.error("ERROR CABECERA VENTA:", headerError);
    throw headerError;
  }
  const saleHeaderId = header.id;

  // 2. Bucle Principal (Por cada producto en cartItems)
  for (const item of cartItems) {
    const productId = item.id || item.product_id;
    const priceSale = item.price_sale || item.unit_price || 0;

    // Búsqueda FEFO: solo stock vendible del local, bloqueando Cuarentena desde POS.
    let { data: batches, error: batchesErr } = await schema
      .from('inventory_batches')
      .select('*, location:location_id!inner(id, name, location_type, warehouse_id)')
      .eq('product_id', productId)
      .eq('location.warehouse_id', warehouseId)
      .neq('location.location_type', 'QUARANTINE')
      .gt('current_quantity', 0)
      .order('expiry_date', { ascending: true });

    if (batchesErr) {
      console.warn('[POS] Filtro por location_type en join falló; aplicando exclusión de cuarentena en memoria.', batchesErr);
      const fallback = await schema
        .from('inventory_batches')
        .select('*, location:location_id!inner(id, name, location_type, warehouse_id)')
        .eq('product_id', productId)
        .eq('location.warehouse_id', warehouseId)
        .gt('current_quantity', 0)
        .order('expiry_date', { ascending: true });

      batches = fallback.data;
      batchesErr = fallback.error;
    }

    if (batchesErr) throw batchesErr;

    const validBatches = (batches || [])
      .filter(batch => {
        const locationType = batch.location?.location_type?.toUpperCase();
        const locationName = batch.location?.name?.toLowerCase() || '';
        return locationType !== 'QUARANTINE' && !locationName.includes('cuarentena');
      })
      .sort((a, b) => {
        const isASales = a.location?.location_type?.toUpperCase() === 'SALES' || a.location?.name?.toLowerCase().includes('venta');
        const isBSales = b.location?.location_type?.toUpperCase() === 'SALES' || b.location?.name?.toLowerCase().includes('venta');

        if (isASales && !isBSales) return -1;
        if (!isASales && isBSales) return 1;

        return new Date(a.expiry_date) - new Date(b.expiry_date);
      });

    // 3. Bucle Destripador de Lotes
    let remainingToFulfill = item.quantity;

    for (const batch of validBatches) {
      if (remainingToFulfill <= 0) break;

      const qtyToDeduct = Math.min(remainingToFulfill, batch.current_quantity);
      const newBatchQty = batch.current_quantity - qtyToDeduct;
      
      // A. Actualizar Lote
      const { error: updErr } = await schema
        .from('inventory_batches')
        .update({ current_quantity: newBatchQty })
        .eq('id', batch.id);
      
      if (updErr) throw updErr;
      
      // B. Insertar item de venta asociado a este lote
      const { error: itemErr } = await schema
        .from('sale_items')
        .insert({
           company_id: companyId,
           sale_id: saleHeaderId,
           product_id: productId,
           batch_id: batch.id,
           quantity: qtyToDeduct,
           unit_price: priceSale,
           subtotal: qtyToDeduct * priceSale,
           prescription_id: item.prescription_id || null
        });
      
      if (itemErr) throw itemErr;

      // C. Insertar movimiento en Kardex
      const { error: movErr } = await schema
        .from('inventory_movements')
        .insert({
           company_id: companyId,
           product_id: productId,
           batch_id: batch.id,
           batch_number: batch.batch_number,
           from_location_id: batch.location_id,
           movement_type: 'SALE',
           quantity: -Math.abs(qtyToDeduct),
           balance_after: newBatchQty,
           reference_folio: saleHeader.document_number || 'VENTA_POS'
        });
      
      if (movErr) throw movErr;

      remainingToFulfill -= qtyToDeduct;
    }

    if (remainingToFulfill > 0) {
      throw new Error(`Stock físico insuficiente para ${item.name || 'producto'}. Faltan ${remainingToFulfill} unidades.`);
    }
  }

  // Si la venta está vinculada a una receta, marcarla como dispensada
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
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  const userId = await getCurrentUserId();

  if (!companyId || !userId) return { error: new Error('Usuario no identificado') };

  return await schema
    .from('pos_sessions')
    .insert({
      company_id: companyId,
      user_id: userId,
      warehouse_id: warehouseId,
      terminal_id: terminalId,
      operator_id: operatorId,
      opening_balance: Number(openingBalance || 0),
      status: 'PENDING',
      start_time: new Date().toISOString()
    })
    .select()
    .single();
};

export const activateSession = async ({ sessionId, operatorId, warehouseId, pinCode }) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId) return { error: new Error('Falta companyId') };

  // 1. Verificar PIN
  const { data: pinValid, error: pinError } = await verifyPosOperatorPin({
    operatorId,
    warehouseId,
    pinCode
  });

  if (pinError) return { error: pinError };
  if (!pinValid) return { error: new Error('PIN inválido') };

  // 2. Activar sesión
  return await schema
    .from('pos_sessions')
    .update({ status: 'OPEN' })
    .eq('id', sessionId)
    .select()
    .single();
};

export const openPosSession = async ({ warehouseId, openingBalance, operatorId }) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  const userId = await getCurrentUserId();

  if (!companyId || !userId || !warehouseId) {
    return { data: null, error: new Error('No se pudo resolver compania, usuario o sucursal.') };
  }

  return await schema
    .from('pos_sessions')
    .insert({
      company_id: companyId,
      user_id: userId,
      warehouse_id: warehouseId,
      operator_id: operatorId,
      start_time: new Date().toISOString(),
      opening_balance: Number(openingBalance || 0),
      status: 'OPEN',
    })
    .select()
    .single();
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
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  const userId = await getCurrentUserId();

  if (!companyId || !userId || !warehouseId) {
    return { data: [], error: new Error('No se pudo resolver compania, usuario o sucursal.') };
  }

  const { data: sessions, error: sessionsError } = await schema
    .from('pos_sessions')
    .select('*, operator:operator_id(id, full_name, is_active)')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('warehouse_id', warehouseId)
    .eq('status', 'CLOSED')
    .order('end_time', { ascending: false })
    .limit(limit);

  if (sessionsError) return { data: [], error: sessionsError };

  const summarizedSessions = await Promise.all((sessions || []).map(async (session) => {
    const { data: sessionSummary, error: summaryError } = await fetchPosSessionSummary(session);
    if (summaryError) {
      return {
        ...session,
        summaryError: summaryError.message || 'No se pudo calcular resumen del turno',
      };
    }

    return {
      ...session,
      summary: sessionSummary,
    };
  }));

  return { data: summarizedSessions, error: null };
};

export const fetchClosedSessions = async (warehouseId, startDate, endDate) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !warehouseId) return { data: [], error: new Error('Falta companyId o warehouseId') };

  let query = schema
    .from('pos_sessions')
    .select('*, operator:pos_operators!operator_id(full_name), terminal:pos_terminals!terminal_id(name)')
    .eq('company_id', companyId)
    .eq('warehouse_id', warehouseId)
    .eq('status', 'CLOSED');

  if (startDate) query = query.gte('end_time', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.lte('end_time', `${endDate}T23:59:59.999Z`);

  const { data: sessions, error } = await query.order('end_time', { ascending: false });

  if (error) {
    console.error("Error en fetchClosedSessions:", error);
    return { data: [], error };
  }

  // Enriquecer con resumen para auditoría
  const summarized = await Promise.all(sessions.map(async (session) => {
    const { data: summary } = await fetchPosSessionSummary(session);
    return { ...session, summary };
  }));

  return { data: summarized, error: null };
};

export const createCashMovement = async ({ sessionId, movementType, amount, reason }) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  const userId = await getCurrentUserId();

  if (!companyId || !userId || !sessionId) {
    return { data: null, error: new Error('No se pudo resolver compania, usuario o sesion.') };
  }

  return await schema
    .from('cash_movements')
    .insert({
      company_id: companyId,
      session_id: sessionId,
      user_id: userId,
      movement_type: movementType,
      amount: Number(amount || 0),
      reason,
    })
    .select()
    .single();
};

export const closePosSession = async ({ sessionId, closingBalance, difference }) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !sessionId) {
    return { data: null, error: new Error('No se pudo resolver compania o sesion.') };
  }

  return await schema
    .from('pos_sessions')
    .update({
      status: 'CLOSED',
      closing_balance: Number(closingBalance || 0),
      difference: Number(difference || 0),
      end_time: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', sessionId)
    .select()
    .single();
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
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !warehouseId) {
    return { data: null, error: new Error('No se pudo resolver compania o sucursal.') };
  }

  const result = await schema.rpc('create_pos_operator', {
    p_company_id: companyId,
    p_warehouse_id: warehouseId,
    p_full_name: fullName,
    p_pin_code: pinCode,
  });

  if (result.error) return result;

  const normalizedData = Array.isArray(result.data) ? result.data[0] : result.data;
  return { data: normalizedData || null, error: null };
};

export const updatePosOperator = async ({ operatorId, fullName, isActive }) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !operatorId) {
    return { data: null, error: new Error('No se pudo resolver compania u operador.') };
  }

  return await schema
    .from('pos_operators')
    .update({
      full_name: fullName,
      is_active: isActive,
    })
    .eq('company_id', companyId)
    .eq('id', operatorId)
    .select()
    .single();
};

export const resetPosOperatorPin = async ({ operatorId, warehouseId, pinCode }) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !warehouseId || !operatorId) {
    return { data: false, error: new Error('No se pudo resolver compania, sucursal u operador.') };
  }

  return await schema.rpc('reset_pos_operator_pin', {
    p_operator_id: operatorId,
    p_company_id: companyId,
    p_warehouse_id: warehouseId,
    p_pin_code: pinCode,
  });
};

export const verifyPosOperatorPin = async ({ operatorId, warehouseId, pinCode }) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();

  if (!companyId || !warehouseId || !operatorId) {
    return { data: false, error: new Error('No se pudo resolver compania, sucursal u operador.') };
  }

  return await schema.rpc('verify_pos_operator_pin', {
    p_operator_id: operatorId,
    p_company_id: companyId,
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
        balance_after: insertedBatch.current_quantity,   // ← saldo real post-ingreso
        unit_cost: realUnitCost,
        receipt_id: receipt.id,
        notes: `Lote ${insertedBatch.batch_number} - OC ${poId}`
      };
    });

    const { error: movErr } = await schema
      .from('inventory_movements')
      .insert(movementsToInsert);

    if (movErr) throw new Error(`Error registrando movimientos de compra: ${movErr.message}`);
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
      const srcLocationId = transferData.source_location_id || batch.location_id;

      // 1. Restar del origen
      const newSrcQty = Math.max(0, (batch.current_quantity || 0) - transferQuantity);
      const { error: subErr } = await schema
        .from('inventory_batches')
        .update({ current_quantity: newSrcQty })
        .eq('id', batch.id);
      if (subErr) throw new Error(`Error restando stock origen (${batch.batch_number}): ${subErr.message}`);

      // 2. Sumar al destino — upsert por lote/producto/ubicación
      const { data: existingBatch, error: findErr } = await schema
        .from('inventory_batches')
        .select('id, current_quantity')
        .eq('company_id', companyId)
        .eq('product_id', batch.product_id)
        .eq('location_id', finalDest)
        .eq('batch_number', batch.batch_number)
        .maybeSingle();

      if (findErr) throw findErr;

      let destBatchId;
      let newDestQty;
      if (existingBatch) {
        newDestQty = Number(existingBatch.current_quantity) + transferQuantity;
        const { error: addErr } = await schema
          .from('inventory_batches')
          .update({ current_quantity: newDestQty })
          .eq('id', existingBatch.id);
        if (addErr) throw new Error(`Error sumando stock destino: ${addErr.message}`);
        destBatchId = existingBatch.id;
      } else {
        newDestQty = transferQuantity;
        const { data: newBatch, error: insErr } = await schema
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
          }])
          .select('id')
          .single();
        if (insErr) throw new Error(`Error creando lote destino: ${insErr.message}`);
        destBatchId = newBatch?.id;
      }

      // 3a. SALIDA: movimiento negativo desde el lote de ORIGEN
      //     Usa exactamente las mismas columnas que IN_PURCHASE (que SÍ funciona)
      const { error: movOutErr } = await schema
        .from('inventory_movements')
        .insert([{
          company_id: companyId,
          product_id: batch.product_id,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          from_location_id: srcLocationId,
          to_location_id: null,
          movement_type: 'INTERNAL_TRANSFER',
          quantity: -Math.abs(transferQuantity),
          balance_after: newSrcQty,
          notes: `Acomodo interno (salida): ${transferData.notes || ''}`
        }]);

      if (movOutErr) {
        throw new Error(`[Kardex] FALLO al registrar INTERNAL_TRANSFER salida: ${movOutErr.message}`);
      }

      // 3b. ENTRADA: movimiento positivo al lote de DESTINO
      const { error: movInErr } = await schema
        .from('inventory_movements')
        .insert([{
          company_id: companyId,
          product_id: batch.product_id,
          batch_id: destBatchId,
          batch_number: batch.batch_number,
          from_location_id: null,
          to_location_id: finalDest,
          movement_type: 'INTERNAL_TRANSFER',
          quantity: Math.abs(transferQuantity),
          balance_after: newDestQty,
          notes: `Acomodo interno (entrada): ${transferData.notes || ''}`
        }]);

      if (movInErr) {
        throw new Error(`[Kardex] FALLO al registrar INTERNAL_TRANSFER entrada: ${movInErr.message}`);
      }
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

    // 3. Descontar stock origen y registrar salida en Kardex
    for (const item of cartItems) {
      const { batch, transferQuantity } = item;

      // 3a. Restar del lote de origen
      const newQty = (batch.current_quantity || 0) - transferQuantity;
      const { error: subErr } = await schema
        .from('inventory_batches')
        .update({ current_quantity: newQty })
        .eq('id', batch.id);

      if (subErr) throw new Error(`Error descontando stock origen (${batch.batch_number}): ${subErr.message}`);

      // 3b. Calcular saldo restante ANTES de insertar para incluirlo en el payload
      const balanceAfter = Math.max(0, newQty);

      // 3c. Registrar OUTBOUND_TRANSFER — quantity NEGATIVO (requerido por v_kardex_professional)
      const { error: movErr } = await schema
        .from('inventory_movements')
        .insert([{
          company_id: companyId,
          product_id: batch.product_id,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          from_location_id: transferData.source_location_id || batch.location_id,
          to_location_id: null,
          movement_type: 'OUTBOUND_TRANSFER',
          quantity: -Math.abs(transferQuantity),
          reference_folio: header.folio,
          balance_after: balanceAfter,
          notes: `Reserva inter-sucursal ${header.folio} → Sucursal destino`
        }]);

      if (movErr) {
        throw new Error(`[Kardex] FALLO OUTBOUND_TRANSFER: ${movErr.message}`);
      }
    }

    return { type: 'RESERVA', folio: header.folio, message: `Reserva ${header.folio} generada. Pendiente de recepción en destino.` };
  }
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
  return await getPharmacySchema()
    .from('transfer_request_items')
    .select('*, product:products!product_id(name, dci), batch:inventory_batches!batch_id(batch_number, expiry_date)')
    .eq('transfer_request_id', transferId);
};

export const receiveTransfer = async (transferId, warehouseId, receptionMeta = {}, receivedQuantities = {}) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  const userId = await getCurrentUserId();

  const { dispatchGuide = null, receptionNotes = null } = receptionMeta;

  // 1. Obtener ubicación de CUARENTENA del local destino
  const { data: quarantineLoc, error: qError } = await schema
    .from('locations')
    .select('id')
    .eq('warehouse_id', warehouseId)
    .eq('location_type', 'QUARANTINE')
    .limit(1)
    .single();

  if (qError || !quarantineLoc) throw new Error("No se encontró ubicación de CUARENTENA en la sucursal de destino.");

  // 2. Obtener cabecera (folio) + items del traspaso
  const { data: header } = await schema
    .from('transfer_requests')
    .select('folio')
    .eq('id', transferId)
    .single();
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
    .eq('id', transferId);

  if (finalError) throw finalError;

  return { success: true };
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
