import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Eye, FileText, Filter, RefreshCcw, Search, User, X } from 'lucide-react';
import { fetchAuditLogDetail, fetchAuditLogs } from '../api/pharmacyClient';

const PAGE_SIZE = 50;
const initialFilters = { startDate: '', endDate: '', eventType: '', userId: '' };

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
};

const getEventClass = (eventType = '') => {
  if (eventType.includes('SALE')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (eventType.includes('PRESCRIPTION')) return 'bg-purple-50 text-purple-700 border-purple-100';
  if (eventType.includes('CASH') || eventType.includes('SESSION')) return 'bg-blue-50 text-blue-700 border-blue-100';
  if (eventType.includes('TRANSFER') || eventType.includes('INVENTORY')) return 'bg-orange-50 text-orange-700 border-orange-100';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const isMissing = (value) => value === null || value === undefined || value === '';

const formatCLP = (value) => {
  if (isMissing(value)) return 'Sin dato';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);

  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(numericValue);
};

const formatMetadataValue = (value) => {
  if (isMissing(value)) return 'Sin dato';
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const SUMMARY_KEYS = ['sale_id', 'prescription_id', 'warehouse_id', 'session_id', 'operator_id', 'payment_method', 'amount'];

const getItemValue = (item, keys) => {
  const match = keys.find(key => !isMissing(item?.[key]));
  return match ? item[match] : null;
};

const makeDisplay = (primary) => ({
  primary: isMissing(primary) ? 'No disponible' : formatMetadataValue(primary),
});

const getPrescriptionDisplay = (prescription) => {
  if (!prescription) return makeDisplay(null);

  const folio = prescription.folio_electronico || prescription.folio || 'No disponible';
  const patientName = prescription.patient?.full_name;
  const patientLabel = patientName ? ` - ${patientName}` : '';

  return {
    primary: `${folio}${patientLabel}`,
  };
};

const getSessionDisplay = (session) => {
  if (!session) return makeDisplay(null);
  
  const opName = session.operator?.full_name || 'Operador desconocido';
  const openDate = session.start_time ? new Date(session.start_time).toLocaleDateString() : '';
  const closeDate = session.end_time ? ` - ${new Date(session.end_time).toLocaleDateString()}` : '';
  
  return {
    primary: `${opName} (${openDate}${closeDate})`,
  };
};

export default function Auditoria() {
  const [logs, setLogs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [selectedLog, setSelectedLog] = useState(null);
  const [auditDetail, setAuditDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showTechnicalJson, setShowTechnicalJson] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)), [count]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError, count: totalCount } = await fetchAuditLogs({
        ...appliedFilters,
        page,
        limit: PAGE_SIZE,
      });

      if (fetchError) throw fetchError;
      setLogs(data || []);
      setCount(totalCount || 0);
    } catch (err) {
      setLogs([]);
      setCount(0);
      setError(err.message || 'No se pudo cargar la bitacora.');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    let isActive = true;

    if (!selectedLog) {
      setAuditDetail(null);
      setDetailLoading(false);
      return undefined;
    }

    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const { data } = await fetchAuditLogDetail(selectedLog.metadata || {});
        if (isActive) setAuditDetail(data || null);
      } catch (err) {
        if (isActive) setAuditDetail(null);
      } finally {
        if (isActive) setDetailLoading(false);
      }
    };

    loadDetail();

    return () => {
      isActive = false;
    };
  }, [selectedLog]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPage(1);
  };

  const metadataJson = selectedLog
    ? JSON.stringify(selectedLog.metadata || {}, null, 2)
    : '{}';
  const selectedMetadata = selectedLog?.metadata || {};
  const saleDisplay = auditDetail?.sale
    ? makeDisplay(auditDetail.sale.document_number || 'Venta POS')
    : makeDisplay(selectedMetadata.sale_id ? 'Venta POS' : null);
  const prescriptionDisplay = getPrescriptionDisplay(auditDetail?.prescription);
  const warehouseDisplay = auditDetail?.warehouse
    ? makeDisplay(auditDetail.warehouse.name)
    : makeDisplay(null);
  const operatorDisplay = auditDetail?.operator
    ? makeDisplay(auditDetail.operator.full_name)
    : makeDisplay(null);
  const sessionDisplay = getSessionDisplay(auditDetail?.session);

  const summaryRows = [
    { label: 'Venta', ...saleDisplay },
    { label: 'Receta', ...prescriptionDisplay },
    { label: 'Sucursal', ...warehouseDisplay },
    { label: 'Sesion Caja', ...sessionDisplay },
    { label: 'Operador', ...operatorDisplay },
    { label: 'Medio de pago', ...makeDisplay(selectedMetadata.payment_method) },
    { label: 'Total', primary: formatCLP(selectedMetadata.amount) },
  ];
  const items = Array.isArray(selectedMetadata.items) ? selectedMetadata.items : [];
  const knownKeys = new Set([...SUMMARY_KEYS, 'items']);
  const otherRows = Object.entries(selectedMetadata)
    .filter(([key, value]) => !knownKeys.has(key) && !Array.isArray(value) && (value === null || typeof value !== 'object'))
    .map(([key, value]) => ({ label: key, value: formatMetadataValue(value) }));

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3 bg-white flex flex-col gap-3 shrink-0">
        <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-widest font-bold">
          <span>Farmacia</span>
          <ChevronRight size={12} className="mx-1" />
          <span className="text-gray-900">Bitacora de Auditoria</span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
              <FileText size={22} className="text-[#4C3073]" />
              Auditoria Legal
            </h1>
            <p className="text-xs text-gray-500 font-bold mt-1">Registros solo lectura desde pharmacy.audit_logs.</p>
          </div>

          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider disabled:opacity-50"
          >
            <RefreshCcw size={14} /> Actualizar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 bg-gray-50 border border-gray-200 rounded-sm p-3">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Desde</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
                className="w-full rounded-sm border border-gray-300 pl-8 pr-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Hasta</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
                className="w-full rounded-sm border border-gray-300 pl-8 pr-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Evento</label>
            <div className="relative">
              <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="eventType"
                value={filters.eventType}
                onChange={handleFilterChange}
                placeholder="SALE, CASH, PRESCRIPTION..."
                className="w-full rounded-sm border border-gray-300 pl-8 pr-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Usuario</label>
            <div className="relative">
              <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="userId"
                value={filters.userId}
                onChange={handleFilterChange}
                placeholder="user_id"
                className="w-full rounded-sm border border-gray-300 pl-8 pr-3 py-2 text-xs font-mono outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
              />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-[#4C3073] hover:bg-[#3d265c] text-white px-4 py-2 rounded-sm text-xs font-black uppercase tracking-wider"
            >
              <Search size={14} /> Filtrar
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center justify-center border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-sm text-xs font-black uppercase"
              title="Limpiar filtros"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/30">
        {error && (
          <div className="m-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-xs font-bold uppercase tracking-widest">
            {error}
          </div>
        )}

        <table className="w-full text-left border-collapse">
          <thead className="bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-44">Fecha</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-72">Usuario</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-56">Evento</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Descripcion</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right w-32">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan="5" className="px-4 py-16 text-center text-gray-400 font-bold">Cargando bitacora...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-4 py-16 text-center text-gray-400 font-bold">No hay registros para los filtros seleccionados.</td>
              </tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-xs font-bold text-gray-700 whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td className="px-4 py-3">
                  <span className="font-bold text-[11px] text-gray-700 break-all">
                    {log.user_name || log.user_email || log.user?.full_name || log.user?.email || 'Usuario del sistema'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-sm text-[10px] font-black uppercase tracking-wider border ${getEventClass(log.event_type)}`}>
                    {log.event_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-bold text-gray-700">{log.description || '-'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLog(log);
                      setShowTechnicalJson(false);
                    }}
                    className="inline-flex items-center gap-1.5 text-[#4C3073] hover:text-[#3d265c] text-[11px] font-black uppercase tracking-wider"
                  >
                    <Eye size={14} /> Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <p className="text-xs font-bold text-gray-500">
          Mostrando {logs.length} de {count || 0} registros. Pagina {page} de {totalPages}.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            disabled={page <= 1 || loading}
            className="inline-flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-sm text-xs font-black uppercase tracking-wider disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages || loading}
            className="inline-flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-sm text-xs font-black uppercase tracking-wider disabled:opacity-40"
          >
            Siguiente <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm border border-gray-200 shadow-sm w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Detalle de Auditoria</p>
                <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">{selectedLog.event_type}</h2>
                <p className="text-xs font-bold text-gray-500 mt-1">{formatDate(selectedLog.created_at)} | {selectedLog.user_name || selectedLog.user_email || selectedLog.user?.full_name || selectedLog.user?.email || 'Usuario del sistema'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedLog(null);
                  setShowTechnicalJson(false);
                }}
                className="p-2 rounded-sm border border-gray-200 hover:bg-gray-50 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-auto space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Descripcion</label>
                <p className="text-sm font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-sm p-3">{selectedLog.description || '-'}</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Resumen de metadata</h3>
                    {detailLoading && <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resolviendo nombres...</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200">
                  {summaryRows.map(row => (
                    <div key={row.label} className="bg-white p-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{row.label}</p>
                      <p className="text-xs font-bold text-gray-800 break-all">
                        {detailLoading ? <span className="text-gray-400">Cargando...</span> : row.primary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Productos</h3>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{items.length} item(s)</span>
                </div>
                {items.length > 0 ? (
                  <div className="overflow-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-white border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Cantidad</th>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Precio</th>
                          <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Receta asociada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map((item, index) => {
                          const price = getItemValue(item, ['amount', 'unit_price', 'price', 'unit_cost']);
                          const product = auditDetail?.productsById?.[item.product_id];
                          const itemPrescriptionId = item.prescription_id || selectedMetadata.prescription_id;
                          const itemPrescription = auditDetail?.prescriptionsById?.[itemPrescriptionId];
                          const itemPrescriptionDisplay = getPrescriptionDisplay(itemPrescription, itemPrescriptionId);
                          return (
                            <tr key={`${item.product_id || 'item'}-${index}`}>
                              <td className="px-4 py-3">
                                <p className="text-xs font-bold text-gray-800 break-all">
                                  {detailLoading ? <span className="text-gray-400">Cargando...</span> : formatMetadataValue(item.product_name || 'Producto no encontrado')}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-xs font-bold text-gray-800 text-right">{formatMetadataValue(getItemValue(item, ['cantidad', 'quantity']))}</td>
                              <td className="px-4 py-3 text-xs font-bold text-gray-800 text-right">{formatCLP(price)}</td>
                              <td className="px-4 py-3">
                                <p className="text-xs font-bold text-gray-800 break-all">
                                  {detailLoading ? <span className="text-gray-400">Cargando...</span> : itemPrescriptionDisplay.primary}
                                </p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-4 py-6 text-center text-xs font-bold text-gray-400">Sin dato</p>
                )}
              </div>

              {otherRows.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Otros datos</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200">
                    {otherRows.map(row => (
                      <div key={row.label} className="bg-white p-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{row.label}</p>
                        <p className="text-xs font-bold text-gray-800 break-all">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border border-gray-200 rounded-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTechnicalJson(prev => !prev)}
                  className="w-full bg-gray-50 hover:bg-gray-100 px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center justify-between"
                >
                  <span>{showTechnicalJson ? 'Ocultar JSON tecnico' : 'Ver JSON tecnico'}</span>
                  <ChevronRight size={14} className={`transition-transform ${showTechnicalJson ? 'rotate-90' : ''}`} />
                </button>
                {showTechnicalJson && (
                  <pre className="bg-gray-950 text-gray-100 p-4 text-xs overflow-auto max-h-[35vh] font-mono leading-relaxed whitespace-pre-wrap">
                    {metadataJson}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
