import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, ChevronRight, MapPin, Search,
  Loader2, Calendar, Pill
} from 'lucide-react';
import { getPharmacySchema, getMyCompanyId } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';
import { summarizeKardexRows } from '../utils/kardex/summarizeKardexRows';

// Componente Switch para el toggle
const Switch = ({ checked, onChange, id }) => (
  <button
    id={id}
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${
      checked ? 'bg-[#4C3073]' : 'bg-gray-200'
    }`}
  >
    <span
      className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const isInternalMovement = (mov, activeWarehouseId) => {
  if (mov.movement_type === 'SALE') return false;

  const fromWarehouseId = mov.from_loc?.warehouse_id;
  const toWarehouseId = mov.to_loc?.warehouse_id;
  const bothSidesInSameWarehouse = Boolean(fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId);
  const legacyInternalSplitRow = mov.movement_type === 'INTERNAL_TRANSFER'
    && (fromWarehouseId === activeWarehouseId || toWarehouseId === activeWarehouseId);

  return bothSidesInSameWarehouse || legacyInternalSplitRow;
};

// Hook para redimensionamiento de columnas
const useResizableColumns = (initialWidths) => {
  const [columnWidths, setColumnWidths] = useState(initialWidths);
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(null);

  const handleMouseDown = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { index, startX: e.clientX, startWidth: columnWidths[index] };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    setIsResizing(true);
  };

  const handleMouseMove = (e) => {
    if (!resizingRef.current) return;
    const { index, startX, startWidth } = resizingRef.current;
    const newWidth = Math.max(50, startWidth + (e.clientX - startX));
    setColumnWidths(prev => {
      const newWidths = [...prev];
      newWidths[index] = newWidth;
      return newWidths;
    });
  };

  const handleMouseUp = () => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    setIsResizing(false);
  };

  useEffect(() => {
    if (!isResizing) return undefined;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return { columnWidths, handleMouseDown };
};

const LOCATION_TONE_META = {
  quarantine: { label: 'QUARANTINE', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  sales: { label: 'SALES', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  storage: { label: 'STORAGE', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  purchase: { label: 'PURCHASE', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  return: { label: 'RETURN', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  transfer: { label: 'INTERNAL_TRANSFER', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  neutral: { label: 'MOVEMENT', className: 'bg-gray-50 text-gray-600 border-gray-200' },
};

const MOVEMENT_META = {
  SALE: { label: 'Venta', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RECEIPT: { label: 'Recepción', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  TRANSFER: { label: 'Traspaso', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  INTERNAL_TRANSFER: { label: 'Traspaso interno', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  INBOUND_TRANSFER: { label: 'Entrada traspaso', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  OUTBOUND_TRANSFER: { label: 'Salida traspaso', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  RETURN: { label: 'Devolución', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  ADJUSTMENT: { label: 'Ajuste', className: 'bg-gray-100 text-gray-700 border-gray-200' },
};

const getLocationToken = (loc, fallbackLabel = 'N/A') => {
  const rawLabel = loc?.name || fallbackLabel;
  const fullLabel = [loc?.warehouses?.name, loc?.name].filter(Boolean).join(' / ') || fallbackLabel;
  const haystack = `${rawLabel} ${fullLabel}`.toLowerCase();

  if (haystack.includes('cuarentena') || haystack.includes('quarantine')) {
    return { label: 'QUARANTINE', tone: 'quarantine', detail: fullLabel };
  }

  if (haystack.includes('venta') || haystack.includes('mostrador') || haystack.includes('sales')) {
    return { label: 'SALES', tone: 'sales', detail: fullLabel };
  }

  if (haystack.includes('bodega') || haystack.includes('almacen') || haystack.includes('storage')) {
    return { label: 'STORAGE', tone: 'storage', detail: fullLabel };
  }

  return { label: rawLabel.toUpperCase(), tone: 'neutral', detail: fullLabel };
};

const getMovementMeta = (type) => MOVEMENT_META[type] || { label: type || 'Movimiento', className: LOCATION_TONE_META.neutral.className };

const getWarehouseToken = (name, fallback = 'SUCURSAL') => ({
  label: name || fallback,
  tone: 'transfer',
  detail: name || 'No disponible',
});

const formatCLQuantity = (value) => {
  const num = Number(value) || 0;
  const sign = num > 0 ? '+' : '';
  return `${sign}${num}`;
};

const getMovementHeadline = (mov, activeWarehouseName, transferLookupByFolio = {}) => {
  const route = getRoutePresentation(mov, activeWarehouseName, transferLookupByFolio);
  const qty = Number(mov.quantity) || 0;

  if (mov.movement_type === 'SALE') {
    return `VENTA ${formatCLQuantity(qty)}`;
  }

  if (mov.movement_type === 'RETURN') {
    return `DEVOLUCIÓN ${formatCLQuantity(qty)}`;
  }

  if (mov.movement_type === 'IN_PURCHASE' || mov.movement_type === 'PURCHASE_RECEIPT' || mov.movement_type === 'RECEIPT') {
    return `COMPRA ${formatCLQuantity(qty)}`;
  }

  if (mov.movement_type === 'INTERNAL_TRANSFER' || mov.movement_type === 'TRANSFER' || mov.movement_type === 'INBOUND_TRANSFER' || mov.movement_type === 'OUTBOUND_TRANSFER') {
    return `${route.origin.label} → ${route.destination.label}`;
  }

  if (qty !== 0) {
    return `${getMovementMeta(mov.movement_type).label.toUpperCase()} ${formatCLQuantity(qty)}`;
  }

  return route.technicalRoute;
};

const getMovementFields = (mov, activeWarehouseName, productRecord, transferLookupByFolio = {}) => {
  const route = getRoutePresentation(mov, activeWarehouseName, transferLookupByFolio);
  const qty = Number(mov.quantity) || 0;
  const movementType = String(mov.movement_type || '').toUpperCase();
  const actionLabel = qty > 0 ? 'Entrada' : qty < 0 ? 'Salida' : 'Movimiento';
  const currentLocation = mov.to_loc?.name || mov.to_loc?.warehouses?.name || mov.from_loc?.name || mov.from_loc?.warehouses?.name || 'No disponible';

  return [
    { label: 'Tipo de movimiento', value: getMovementMeta(movementType).label },
    { label: 'Fecha / hora', value: mov.created_at ? new Date(mov.created_at).toLocaleString('es-CL') : 'No disponible' },
    { label: 'Producto', value: productRecord?.name || mov.product_name || 'No disponible' },
    { label: 'DCI', value: productRecord?.dci || mov.dci || 'No disponible' },
    { label: 'Lote', value: mov.inventory_batches?.batch_number || 'No disponible' },
    { label: 'Cantidad', value: String(qty || '0') },
    { label: 'Entrada / salida', value: `${actionLabel}: ${formatCLQuantity(qty)}` },
    { label: 'Saldo después', value: mov.calculated_balance ?? 'No disponible' },
    { label: 'Origen', value: route.technicalOrigin || 'No disponible' },
    { label: 'Destino', value: route.technicalDestination || 'No disponible' },
    { label: 'Folio / referencia', value: mov.reference_folio || 'No disponible' },
    { label: 'Notas', value: mov.notes || 'No disponible' },
    { label: 'Usuario', value: mov.created_by || mov.updated_by || 'No disponible' },
    { label: 'Ubicación actual del lote', value: currentLocation },
  ];
};

const getRoutePresentation = (mov, activeWarehouseName, transferLookupByFolio = {}) => {
  const fromWarehouseName = mov.from_loc?.warehouses?.name || activeWarehouseName;
  const toWarehouseName = mov.to_loc?.warehouses?.name || activeWarehouseName;
  const transferMeta = mov.reference_folio ? transferLookupByFolio[mov.reference_folio] : null;
  const sourceWarehouseName = transferMeta?.source_warehouse?.name || fromWarehouseName;
  const destinationWarehouseName = transferMeta?.destination_warehouse?.name || toWarehouseName;

  const technicalOrigin = mov.movement_type === 'RECEIPT'
    ? (mov.inventory_receipts?.suppliers?.legal_name ? `Proveedor: ${mov.inventory_receipts.suppliers.legal_name}` : 'Ingreso externo')
    : formatLocation(mov.from_loc, sourceWarehouseName);
  const technicalDestination = mov.movement_type === 'SALE'
    ? 'Venta a público'
    : formatLocation(mov.to_loc, destinationWarehouseName);

  let origin = getLocationToken(mov.from_loc, fromWarehouseName);
  let destination = getLocationToken(mov.to_loc, toWarehouseName);

  if (mov.movement_type === 'SALE') {
    destination = { label: 'SALES', tone: 'sales', detail: 'Venta a público' };
  }

  if (mov.movement_type === 'RECEIPT') {
    origin = { label: 'PURCHASE', tone: 'purchase', detail: technicalOrigin };
  }

  if (mov.movement_type === 'OUTBOUND_TRANSFER') {
    origin = getLocationToken(mov.from_loc, fromWarehouseName);
    destination = transferMeta?.destination_warehouse?.name
      ? getWarehouseToken(transferMeta.destination_warehouse.name, 'SUCURSAL DESTINO')
      : getWarehouseToken('SUCURSAL DESTINO');
  }

  if (mov.movement_type === 'INBOUND_TRANSFER') {
    origin = transferMeta?.source_warehouse?.name
      ? getWarehouseToken(transferMeta.source_warehouse.name, 'SUCURSAL ORIGEN')
      : getWarehouseToken('SUCURSAL ORIGEN');
    destination = getLocationToken(mov.to_loc, destinationWarehouseName);
  }

  if (mov.movement_type === 'INTERNAL_TRANSFER') {
    origin = getLocationToken(mov.from_loc, fromWarehouseName);
    destination = getLocationToken(mov.to_loc, toWarehouseName);
  }

  const technicalRoute = `${technicalOrigin} → ${technicalDestination}`;

  return { origin, destination, technicalOrigin, technicalDestination, technicalRoute };
};

const TokenBadge = ({ label, tone = 'neutral', title }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${LOCATION_TONE_META[tone]?.className || LOCATION_TONE_META.neutral.className}`}
    title={title || label}
  >
    {label}
  </span>
);

const RouteCompact = ({ route }) => (
  <div className="min-w-0 space-y-2" title={route.technicalRoute}>
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <TokenBadge label={route.origin.label} tone={route.origin.tone} title={route.origin.detail} />
      <span className="text-gray-300 text-[11px] font-black">→</span>
      <TokenBadge label={route.destination.label} tone={route.destination.tone} title={route.destination.detail} />
    </div>
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 shrink-0">Detalle</span>
      <p className="min-w-0 text-[11px] leading-4 text-gray-500 truncate" title={route.technicalRoute}>
        {route.technicalRoute}
      </p>
    </div>
  </div>
);

const MobileKardexCard = ({ mov, activeWarehouseName, fmtDate, getTipoHumano, transferLookupByFolio }) => {
  const route = getRoutePresentation(mov, activeWarehouseName, transferLookupByFolio);
  const qty = Number(mov.quantity) || 0;
  const movementMeta = getMovementMeta(mov.movement_type);
  const isPositive = qty > 0;

  return (
    <details className="group rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <summary className="cursor-pointer list-none px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${movementMeta.className}`}>
                {movementMeta.label}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {fmtDate(mov.created_at)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900 truncate" title={route.technicalRoute}>
                {route.origin.label} <span className="text-gray-300">→</span> {route.destination.label}
              </p>
              <p className="text-[11px] text-gray-500 truncate" title={route.technicalRoute}>
                {route.technicalRoute}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tipo</span>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${getMovementMeta(mov.movement_type).className}`}>
                {getTipoHumano(mov.movement_type, mov.is_internal)}
              </span>
              {mov.inventory_batches?.batch_number && (
                <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-gray-600" title={mov.inventory_batches.batch_number}>
                  Lote {mov.inventory_batches.batch_number}
                </span>
              )}
            </div>
          </div>
          <ChevronDown size={16} className="text-gray-400 transition-transform duration-200 group-open:rotate-180" />
        </div>
      </summary>

      <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50/50 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Entrada</p>
            <p className={`text-sm font-black font-mono ${isPositive ? 'text-green-700' : 'text-gray-300'}`}>{qty > 0 ? `+${qty}` : '—'}</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Salida</p>
            <p className={`text-sm font-black font-mono ${qty < 0 ? 'text-red-700' : 'text-gray-300'}`}>{qty < 0 ? qty : '—'}</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Saldo</p>
            <p className={`text-sm font-black font-mono ${mov.calculated_balance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{mov.calculated_balance}</p>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">Detalle técnico</p>
          <div className="space-y-2 text-[11px] text-gray-600">
            <div className="flex justify-between gap-3"><span className="text-gray-400 font-black uppercase tracking-widest">Folio</span><span className="font-mono font-semibold truncate">{mov.reference_folio || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-gray-400 font-black uppercase tracking-widest">Lote</span><span className="font-mono font-semibold truncate">{mov.inventory_batches?.batch_number || 'S/L'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-gray-400 font-black uppercase tracking-widest">Notas</span><span className="italic text-right truncate">{mov.notes || '—'}</span></div>
          </div>
        </div>
      </div>
    </details>
  );
};

const SummaryCard = ({ tone, label, value, subtitle, details, hint, valueClassName }) => (
  <div className={`rounded-2xl border bg-white p-4 shadow-sm ${tone}`}>
    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>
    <div className="mt-2 flex items-end justify-between gap-3">
      <p className={`text-2xl font-black font-mono leading-none ${valueClassName || 'text-gray-900'}`}>{value}</p>
      {hint && <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{hint}</span>}
    </div>
    <div className="mt-3 space-y-1">
      {subtitle && <p className="text-[11px] font-bold text-gray-700">{subtitle}</p>}
      {details?.map((line) => (
        <p key={line} className="text-[10px] leading-4 text-gray-500 truncate" title={line}>{line}</p>
      ))}
    </div>
  </div>
);

const MovementDetailModal = ({ open, movement, activeWarehouseName, productRecord, onClose, transferLookupByFolio }) => {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !movement) return null;

  const route = getRoutePresentation(movement, activeWarehouseName, transferLookupByFolio);
  const movementMeta = getMovementMeta(movement.movement_type);
  const headline = getMovementHeadline(movement, activeWarehouseName, transferLookupByFolio);
  const fields = getMovementFields(movement, activeWarehouseName, productRecord, transferLookupByFolio);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white shadow-2xl sm:max-w-4xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${movementMeta.className}`}>
                {movementMeta.label}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Detalle del movimiento</span>
            </div>
            <h2 className="mt-2 text-lg sm:text-2xl font-black text-gray-900 tracking-tight">{headline}</h2>
            <p className="mt-1 text-[11px] sm:text-sm text-gray-500 truncate" title={route.technicalRoute}>{route.technicalRoute}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900" aria-label="Cerrar modal">
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <TokenBadge label={route.origin.label} tone={route.origin.tone} title={route.origin.detail} />
                <span className="text-gray-300 text-[11px] font-black">→</span>
                <TokenBadge label={route.destination.label} tone={route.destination.tone} title={route.destination.detail} />
              </div>
              <p className="mt-3 text-sm font-bold text-gray-700">{productRecord?.name || movement.product_name || 'No disponible'}</p>
              <p className="text-[11px] text-gray-500">{productRecord?.dci || movement.dci || 'No disponible'}</p>
            </div>

            {fields.map((field) => (
              <div key={field.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{field.label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-gray-800">{field.value}</p>
              </div>
            ))}
          </div>

          {movement.movement_type === 'INTERNAL_TRANSFER' && (
            <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700">
              Badge operativo: traspaso interno / liberación o reubicación sin cambio de stock total.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function formatLocation(loc, warehouseName) {
  if (!loc) return warehouseName || 'N/A';
  const finalWarehouse = (loc.warehouses && !Array.isArray(loc.warehouses))
    ? loc.warehouses.name
    : warehouseName;
  return `${finalWarehouse} / ${loc.name}`;
}

export default function KardexProducto() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { activeWarehouse } = useSucursal();

  const [product, setProduct] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hideInternals, setHideInternals] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [transferLookupByFolio, setTransferLookupByFolio] = useState({});

  // Anchos iniciales de columnas
  const initialWidths = [132, 154, 280, 124, 92, 92, 100, 204];
  const { columnWidths, handleMouseDown } = useResizableColumns(initialWidths);
  const tableMinWidth = useMemo(() => columnWidths.reduce((total, width) => total + width, 0), [columnWidths]);

  useEffect(() => {
    if (!productId || !activeWarehouse?.id) return;
    let cancelled = false;
    setLoading(true);
    setTransferLookupByFolio({});

    (async () => {
      try {
        const companyId = await getMyCompanyId();
        const schema = getPharmacySchema();

        const { data: prod } = await schema
          .from('products')
          .select('id, name, dci, active_principle')
          .eq('id', productId)
          .single();
        if (!cancelled) setProduct(prod ?? null);

        const { data: locs } = await schema
          .from('locations')
          .select('id')
          .eq('company_id', companyId)
          .eq('warehouse_id', activeWarehouse.id);
        
        const warehouseLocationIds = (locs || []).map(l => l.id);

        if (warehouseLocationIds.length === 0) {
          if (!cancelled) setRows([]);
          if (!cancelled) setTransferLookupByFolio({});
          return;
        }

        let query = schema
          .from('inventory_movements')
          .select(`
            *,
            from_loc:from_location_id ( id, name, warehouse_id, warehouses (id, name) ),
            to_loc:to_location_id ( id, name, warehouse_id, warehouses (id, name) ),
            inventory_batches ( batch_number ),
            inventory_receipts ( suppliers:supplier_id ( legal_name ) )
          `)
          .eq('product_id', productId)
          .eq('company_id', companyId)
          .or(`from_location_id.in.(${warehouseLocationIds.join(',')}),to_location_id.in.(${warehouseLocationIds.join(',')})`)
          .order('created_at', { ascending: true });

        if (dateFrom) query = query.gte('created_at', dateFrom);
        if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

        const { data, error } = await query;
        const transferFolios = [...new Set((data || [])
          .map((mov) => mov.reference_folio)
          .filter((folio) => typeof folio === 'string' && folio.trim())
        )];

        let transferMap = {};

        if (transferFolios.length > 0) {
          const { data: transferRows, error: transferError } = await schema
            .from('transfer_requests')
            .select('folio, source_warehouse:warehouses!source_warehouse_id(name), destination_warehouse:warehouses!destination_warehouse_id(name)')
            .eq('company_id', companyId)
            .in('folio', transferFolios);

          if (!transferError && Array.isArray(transferRows)) {
            transferMap = Object.fromEntries(
              transferRows
                .filter((transfer) => transfer?.folio)
                .map((transfer) => [transfer.folio, transfer])
            );
          }
        }

        if (!cancelled) {
          if (error) {
            console.error('[Kardex] Error:', error);
            setRows([]);
            setTransferLookupByFolio({});
          } else {
            let saldoAcumulado = 0;
            const movementsWithBalance = (data || []).map(mov => {
              const qty = Number(mov.quantity) || 0;
              const isInternal = isInternalMovement(mov, activeWarehouse.id);
              
              // Solo los movimientos que no son internos afectan el saldo
              if (!isInternal) {
                saldoAcumulado += qty;
              }
              
              return { ...mov, calculated_balance: saldoAcumulado, is_internal: isInternal };
            });
            setRows(movementsWithBalance.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
            setTransferLookupByFolio(transferMap);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId, activeWarehouse?.id, dateFrom, dateTo]);

  const processedRows = useMemo(() => {
    let filteredData = [...rows];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredData = filteredData.filter(r => {
        const originDest = getRoutePresentation(r, activeWarehouse.name, transferLookupByFolio);
        return (
          r.movement_type?.toLowerCase().includes(term) ||
          r.inventory_batches?.batch_number?.toLowerCase().includes(term) ||
          r.reference_folio?.toLowerCase().includes(term) ||
          r.notes?.toLowerCase().includes(term) ||
          originDest.technicalRoute.toLowerCase().includes(term) ||
          originDest.origin.detail.toLowerCase().includes(term) ||
          originDest.destination.detail.toLowerCase().includes(term)
        );
      });
    }
    return filteredData;
  }, [rows, searchTerm, activeWarehouse?.name, transferLookupByFolio]);

  const visibleRows = useMemo(() => {
    let filteredData = [...processedRows];

    if (hideInternals) {
      filteredData = filteredData.filter(r => r.movement_type === 'SALE' || !r.is_internal);
    }

    return filteredData;
  }, [processedRows, hideInternals]);

  const summary = useMemo(() => summarizeKardexRows(processedRows), [processedRows]);
  const openMovementDetail = (movement) => setSelectedMovement(movement);
  const closeMovementDetail = () => setSelectedMovement(null);

  const fmtDate = (val) => {
    if (!val) return '—';
    try { return new Date(val).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return String(val); }
  };

  const getTipoHumano = (type, isInternal) => {
    const map = {
      'SALE': 'Venta',
      'RECEIPT': 'Ingreso / Compra',
      'TRANSFER': 'Traspaso',
      'ADJUSTMENT': 'Ajuste',
    };
    return map[type] || (isInternal ? 'Traspaso' : type);
  };

  if (!activeWarehouse || !product) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="text-[#4C3073] animate-spin" size={40} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans text-gray-900">
      
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col gap-5 shrink-0 shadow-sm">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/inventario')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center text-[10px] text-gray-400 uppercase tracking-widest font-black mb-1">
                <span>WMS Logística</span>
                <ChevronRight size={10} className="mx-1" />
                <span className="text-[#4C3073]">Libro Mayor Kardex</span>
              </div>
              <h1 className="text-2xl font-black text-gray-800 tracking-tight uppercase italic">Trazabilidad de Lotes</h1>
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-100 px-4 py-2 rounded-xl flex items-center gap-3">
            <MapPin size={18} className="text-[#4C3073]" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase leading-none">Sucursal Activa</span>
              <span className="text-xs font-black text-[#4C3073] uppercase">{activeWarehouse?.name}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl px-6 py-5 flex items-center gap-8 shadow-xl">
          <div className="p-4 bg-purple-600 rounded-2xl text-white shadow-lg shadow-purple-900/20"><Pill size={26} /></div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Producto / Insumo</p>
              <p className="text-lg font-black text-white uppercase leading-tight">{product.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Principio Activo (DCI)</p>
              <p className="text-sm font-bold text-gray-300 italic">{product.dci || 'No especificado'}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-4 w-full md:w-auto">
            <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2 bg-gray-50 shadow-inner">
              <Calendar size={14} className="text-gray-400" />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-xs font-black text-gray-700 outline-none" />
              <span className="text-gray-300 font-light">→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-xs font-black text-gray-700 outline-none" />
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar por lote, folio, origen o notas..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073] transition-all" />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="hide-internal-switch" className="text-[10px] font-black text-gray-500 uppercase">No mostrar traspasos internos</label>
            <Switch id="hide-internal-switch" checked={hideInternals} onChange={setHideInternals} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <SummaryCard
            tone="border-blue-100"
            label="Saldo actual"
            value={summary.balance}
            subtitle="Stock físico actual"
            hint="Blue"
            valueClassName={summary.balance >= 0 ? 'text-blue-700' : 'text-red-600'}
          />
          <SummaryCard
            tone="border-emerald-100"
            label="Entradas externas"
            value={`+${summary.externalIn.total}`}
            subtitle="Compras, devoluciones, traspasos entrantes y ajustes positivos"
            details={[
              `Compras: +${summary.externalIn.purchases}`,
              `Devoluciones: +${summary.externalIn.returns}`,
              `Traspasos entrantes: +${summary.externalIn.inboundTransfers}`,
              `Ajustes positivos: +${summary.externalIn.positiveAdjustments}`,
              summary.externalIn.uncategorized > 0 ? `Sin clasificar: +${summary.externalIn.uncategorized}` : null,
            ].filter(Boolean)}
            hint="Green"
            valueClassName="text-emerald-700"
          />
          <SummaryCard
            tone="border-red-100"
            label="Salidas externas"
            value={`-${summary.externalOut.total}`}
            subtitle="Ventas, traspasos salientes y ajustes negativos"
            details={[
              `Ventas: -${summary.externalOut.sales}`,
              `Traspasos salientes: -${summary.externalOut.outboundTransfers}`,
              `Ajustes negativos: -${summary.externalOut.negativeAdjustments}`,
              summary.externalOut.uncategorized > 0 ? `Sin clasificar: -${summary.externalOut.uncategorized}` : null,
            ].filter(Boolean)}
            hint="Red"
            valueClassName="text-red-700"
          />
          <SummaryCard
            tone="border-violet-100"
            label="Movimientos internos"
            value={summary.internal.total}
            subtitle="No altera stock total"
            details={[
              `Cuarentena → Ventas: ${summary.internal.quarantineToSales}`,
              `Cuarentena → Bodega: ${summary.internal.quarantineToStorage}`,
              `Bodega → Ventas: ${summary.internal.storageToSales}`,
              summary.internal.other > 0 ? `Sin clasificar: ${summary.internal.other}` : null,
            ].filter(Boolean)}
            hint="Violet"
            valueClassName="text-violet-700"
          />
          <SummaryCard
            tone="border-amber-100"
            label="Devoluciones"
            value={summary.returns.total}
            subtitle="Total retornado a cuarentena"
            details={['Retornos físicos a cuarentena']}
            hint="Orange"
            valueClassName="text-amber-700"
          />
        </div>

        {summary.uncategorized.total > 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-3 text-[11px] text-gray-600 shadow-sm">
            Sin clasificar: {summary.uncategorized.total} unidades. Se conservan fuera del neteo automático para no inventar trazabilidad.
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[11px] text-gray-600 shadow-sm">
          Entradas externas suman stock, salidas externas lo restan, e internos solo reubican stock sin cambiar el saldo físico.
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-4">
        <div className="lg:hidden space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-16 text-center">
              <Loader2 className="animate-spin inline mr-3 text-purple-600" size={24} />
              <span className="text-sm font-black text-gray-400 uppercase tracking-widest">Consultando Ledger...</span>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-16 text-center text-gray-300 uppercase text-[11px] font-black tracking-widest italic">
              No se registran movimientos en este nodo
            </div>
          ) : (
            visibleRows.map((mov) => (
              <MobileKardexCard
                key={mov.id || `${mov.created_at}-${mov.reference_folio || 'movement'}`}
                mov={mov}
                activeWarehouseName={activeWarehouse.name}
                fmtDate={fmtDate}
                getTipoHumano={getTipoHumano}
                transferLookupByFolio={transferLookupByFolio}
              />
            ))
          )}
        </div>

        <div className="hidden lg:block overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg bg-white">
          <table className="min-w-full table-fixed text-left border-collapse text-xs sm:text-sm" style={{ width: `max(100%, ${tableMinWidth}px)` }}>
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={index} style={{ width: `${width}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-50/70 border-b border-gray-200">
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap relative resize-x overflow-hidden" style={{ width: columnWidths[0] }}>
                  Fecha
                  <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-[#4C3073]/30" onMouseDown={(e) => handleMouseDown(0, e)} title="Redimensionar columna"></div>
                </th>
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap relative resize-x overflow-hidden" style={{ width: columnWidths[1] }}>
                  Tipo
                  <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-[#4C3073]/30" onMouseDown={(e) => handleMouseDown(1, e)} title="Redimensionar columna"></div>
                </th>
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap relative min-w-[220px] lg:min-w-[280px] resize-x overflow-hidden" style={{ width: columnWidths[2] }}>
                  Origen ➔ Destino
                  <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-[#4C3073]/30" onMouseDown={(e) => handleMouseDown(2, e)} title="Redimensionar columna"></div>
                </th>
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap relative resize-x overflow-hidden" style={{ width: columnWidths[3] }}>
                  Lote
                  <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-[#4C3073]/30" onMouseDown={(e) => handleMouseDown(3, e)} title="Redimensionar columna"></div>
                </th>
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap text-right relative resize-x overflow-hidden" style={{ width: columnWidths[4] }}>
                  Entrada
                  <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-[#4C3073]/30" onMouseDown={(e) => handleMouseDown(4, e)} title="Redimensionar columna"></div>
                </th>
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap text-right relative resize-x overflow-hidden" style={{ width: columnWidths[5] }}>
                  Salida
                  <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-[#4C3073]/30" onMouseDown={(e) => handleMouseDown(5, e)} title="Redimensionar columna"></div>
                </th>
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-800 uppercase tracking-widest whitespace-nowrap text-right bg-gray-100 relative resize-x overflow-hidden" style={{ width: columnWidths[6] }}>
                  Saldo
                  <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-[#4C3073]/30" onMouseDown={(e) => handleMouseDown(6, e)} title="Redimensionar columna"></div>
                </th>
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap relative resize-x overflow-hidden" style={{ width: columnWidths[7] }}>
                  Folio / Ref
                  <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-[#4C3073]/30" onMouseDown={(e) => handleMouseDown(7, e)} title="Redimensionar columna"></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="8" className="px-6 py-24 text-center"><Loader2 className="animate-spin inline mr-3 text-purple-600" size={24} /> <span className="text-sm font-black text-gray-400 uppercase tracking-widest">Consultando Ledger...</span></td></tr>
                ) : visibleRows.length === 0 ? (
                  <tr><td colSpan="8" className="px-6 py-24 text-center text-gray-300 uppercase text-[11px] font-black tracking-widest italic">No se registran movimientos en este nodo</td></tr>
                ) : (
                  visibleRows.map((mov, idx) => {
                   const route = getRoutePresentation(mov, activeWarehouse.name, transferLookupByFolio);
                  const qty = Number(mov.quantity) || 0;
                  const textColor = mov.is_internal ? 'text-gray-400' : (qty > 0 ? 'text-green-700' : 'text-red-700');
                  const movementMeta = getMovementMeta(mov.movement_type);

                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors group" onDoubleClick={() => openMovementDetail(mov)}>
                        <td className="px-5 py-3 text-[11px] sm:text-xs font-bold text-gray-500 whitespace-nowrap" style={{ width: columnWidths[0] }}>{fmtDate(mov.created_at)}</td>
                        <td className="px-5 py-3 whitespace-nowrap" style={{ width: columnWidths[1] }}>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] sm:text-xs font-black uppercase tracking-wider ${movementMeta.className}`} title={movementMeta.label}>
                            {getTipoHumano(mov.movement_type, mov.is_internal)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs sm:text-sm text-gray-800 min-w-[220px] lg:min-w-[280px]" style={{ width: columnWidths[2] }}>
                           <RouteCompact route={route} />
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap" style={{ width: columnWidths[3] }}>
                          <span className="text-[11px] sm:text-xs font-mono text-gray-700 whitespace-nowrap truncate block">
                            {mov.inventory_batches?.batch_number || 'S/L'}
                         </span>
                       </td>

                       <td className={`px-5 py-3 text-right text-xs sm:text-sm font-mono font-medium whitespace-nowrap ${textColor}`} style={{ width: columnWidths[4] }}>
                         {qty > 0 ? `+${qty}` : ''}
                       </td>

                       <td className={`px-5 py-3 text-right text-xs sm:text-sm font-mono font-medium whitespace-nowrap ${textColor}`} style={{ width: columnWidths[5] }}>
                         {qty < 0 ? `${qty}` : ''}
                       </td>

                        <td className={`px-5 py-3 text-right text-xs sm:text-sm font-mono font-medium border-l border-gray-100 whitespace-nowrap ${
                          mov.calculated_balance >= 0 ? 'text-blue-700' : 'text-red-600'
                        }`} style={{ width: columnWidths[6] }}>
                          {mov.calculated_balance}
                        </td>

                         <td className="px-5 py-3 text-[11px] sm:text-xs font-medium text-gray-500 truncate" title={mov.reference_folio || mov.notes} style={{ width: columnWidths[7] }}>
                           <div className="space-y-1">
                             <span className="font-semibold text-gray-600 truncate block">{mov.reference_folio || '—'}</span>
                             <span className="italic truncate block text-gray-400">{mov.notes || ''}</span>
                             <button type="button" onClick={() => openMovementDetail(mov)} className="text-[10px] font-black uppercase tracking-widest text-[#4C3073] hover:underline">
                               Ver detalle
                             </button>
                           </div>
                        </td>
                     </tr>
                   );
                 })
               )}
            </tbody>
          </table>
        </div>
      </div>

      <MovementDetailModal
        open={Boolean(selectedMovement)}
        movement={selectedMovement}
        productRecord={product}
        activeWarehouseName={activeWarehouse.name}
        transferLookupByFolio={transferLookupByFolio}
        onClose={closeMovementDetail}
      />
    </div>
  );
}
