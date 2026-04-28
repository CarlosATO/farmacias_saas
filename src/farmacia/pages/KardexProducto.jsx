import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, MapPin, Search,
  Loader2, Calendar, Pill
} from 'lucide-react';
import { getPharmacySchema, getMyCompanyId } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';

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
  const resizingRef = useRef(null);

  const handleMouseDown = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { index, startX: e.clientX, startWidth: columnWidths[index] };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  return { columnWidths, handleMouseDown };
};

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

  // Anchos iniciales de columnas
  const initialWidths = [140, 140, 420, 140, 96, 96, 96, 240];
  const { columnWidths, handleMouseDown } = useResizableColumns(initialWidths);
  const tableMinWidth = useMemo(() => columnWidths.reduce((total, width) => total + width, 0), [columnWidths]);

  const formatLoc = (loc, warehouseName) => {
    if (!loc) return warehouseName || 'N/A';
    const finalWarehouse = (loc.warehouses && !Array.isArray(loc.warehouses))
      ? loc.warehouses.name
      : warehouseName;
    return `${finalWarehouse} / ${loc.name}`;
  };

  const formatRoute = (m) => {
    const type = m.movement_type;
    let origin = '—';
    let destination = '—';

    const fromWarehouseName = m.from_loc?.warehouses?.name || activeWarehouse.name;
    const toWarehouseName = m.to_loc?.warehouses?.name || activeWarehouse.name;

    if (type === 'SALE') {
      origin = formatLoc(m.from_loc, fromWarehouseName);
      destination = "Venta a Público";
    } else if (type === 'RECEIPT') {
      origin = m.inventory_receipts?.suppliers?.legal_name 
               ? 'Proveedor: ' + m.inventory_receipts.suppliers.legal_name 
               : 'Ingreso Externo';
      destination = formatLoc(m.to_loc, toWarehouseName);
    } else if (type === 'TRANSFER') {
      origin = formatLoc(m.from_loc, fromWarehouseName);
      destination = formatLoc(m.to_loc, toWarehouseName);
    } else if (type === 'ADJUSTMENT') {
      origin = formatLoc(m.from_loc, fromWarehouseName);
      destination = formatLoc(m.to_loc, toWarehouseName);
    } else {
      origin = formatLoc(m.from_loc, fromWarehouseName) || '—';
      destination = formatLoc(m.to_loc, toWarehouseName) || '—';
    }
    return { origin, destination };
  };

  useEffect(() => {
    if (!productId || !activeWarehouse?.id) return;
    let cancelled = false;
    setLoading(true);

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
          .select('id, warehouse_id')
          .eq('company_id', companyId);
        
        const warehouseLocationIds = (locs || [])
          .filter(l => l.warehouse_id === activeWarehouse.id)
          .map(l => l.id);

        if (warehouseLocationIds.length === 0) {
          if (!cancelled) setRows([]);
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

        if (!cancelled) {
          if (error) {
            console.error('[Kardex] Error:', error);
            setRows([]);
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
        const originDest = formatRoute(r);
        return (
          r.movement_type?.toLowerCase().includes(term) ||
          r.inventory_batches?.batch_number?.toLowerCase().includes(term) ||
          r.reference_folio?.toLowerCase().includes(term) ||
          r.notes?.toLowerCase().includes(term) ||
          originDest.origin.toLowerCase().includes(term) ||
          originDest.destination.toLowerCase().includes(term)
        );
      });
    }
    return filteredData;
  }, [rows, searchTerm]);

  const visibleRows = useMemo(() => {
    let filteredData = [...processedRows];

    if (hideInternals) {
      filteredData = filteredData.filter(r => r.movement_type === 'SALE' || !r.is_internal);
    }

    return filteredData;
  }, [processedRows, hideInternals]);

  const totals = useMemo(() => {
    return processedRows.reduce((acc, r) => {
      if (r.is_internal) return acc;
      const qty = Number(r.quantity) || 0;
      return {
        entradas: acc.entradas + (qty > 0 ? qty : 0),
        salidas:  acc.salidas  + (qty < 0 ? Math.abs(qty) : 0),
      };
    }, { entradas: 0, salidas: 0 });
  }, [processedRows]);

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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Ingresos Totales</p>
            <p className="text-2xl font-black text-green-700 font-mono text-right">+{totals.entradas}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Egresos Totales</p>
            <p className="text-2xl font-black text-red-700 font-mono text-right">-{totals.salidas}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Saldo Actual</p>
            <p className={`text-2xl font-black font-mono text-right ${
              (totals.entradas - totals.salidas) >= 0 ? 'text-blue-700' : 'text-red-600'
            }`}>
              {totals.entradas - totals.salidas}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg bg-white">
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
                <th className="px-5 py-4 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap relative min-w-[300px] lg:min-w-[400px] resize-x overflow-hidden" style={{ width: columnWidths[2] }}>
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
                  const { origin, destination } = formatRoute(mov);
                  const qty = Number(mov.quantity) || 0;
                  const textColor = mov.is_internal ? 'text-gray-400' : (qty > 0 ? 'text-green-700' : 'text-red-700');

                  return (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                       <td className="px-5 py-3 text-[11px] sm:text-xs font-bold text-gray-500 whitespace-nowrap" style={{ width: columnWidths[0] }}>{fmtDate(mov.created_at)}</td>
                       <td className="px-5 py-3 whitespace-nowrap" style={{ width: columnWidths[1] }}>
                         <span className="text-[10px] sm:text-xs font-black text-gray-600 whitespace-nowrap">
                           {getTipoHumano(mov.movement_type, mov.is_internal)}
                         </span>
                       </td>
                       <td className="px-5 py-3 text-xs sm:text-sm text-gray-800 whitespace-nowrap min-w-[300px] lg:min-w-[400px]" style={{ width: columnWidths[2] }}>
                          <span className="inline-block max-w-full truncate align-middle" title={origin}>{origin}</span>
                          <span className="text-gray-400 font-light mx-2">➔</span>
                          <span className="inline-block max-w-full truncate font-semibold align-middle" title={destination}>{destination}</span>
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
                         <span className="font-semibold text-gray-600">{mov.reference_folio || ''}</span>
                         {mov.reference_folio && mov.notes && <span className="mx-1 text-gray-300">|</span>}
                         <span className="italic">{mov.notes || ''}</span>
                        {!mov.reference_folio && !mov.notes && '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
