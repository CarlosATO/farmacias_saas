import React, { useCallback, useEffect, useState } from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  FileText, 
  Filter, 
  RefreshCcw, 
  Search, 
  X, 
  Download, 
  ShieldCheck, 
  Box, 
  ClipboardList,
  Printer,
  MonitorSmartphone
} from 'lucide-react';
import { 
  fetchAuditLogDetail, 
  fetchAuditLogs,
  fetchBatchAudit,
  fetchPrescriptionAudit,
  fetchControlledAudit,
  fetchUniqueLotsByNumber
} from '../api/pharmacyClient';

const PAGE_SIZE = 50;

const maskSensitiveData = (obj) => {
    if (!obj) return obj;
    const sensitiveKeys = ['pin_hash', 'password', 'token', 'access_token', 'refresh_token', 'secret'];
    
    try {
        const cloned = JSON.parse(JSON.stringify(obj));
        const traverse = (o) => {
            for (let i in o) {
                if (o[i] !== null && typeof o[i] === 'object') {
                    traverse(o[i]);
                } else if (sensitiveKeys.includes(i)) {
                    o[i] = '••••••';
                }
            }
        };
        traverse(cloned);
        return cloned;
    } catch {
        return obj;
    }
};

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
};

const formatDateOnly = (value) => {
  if (!value) return 'S/D';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short' }).format(new Date(value));
};

const formatQuantity = (value) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return '0';

  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(numericValue);
};

const getOriginLabel = (item) => {
  if (item?.receipt_document_number) {
    return `${item.receipt_document_type || 'Doc'} ${item.receipt_document_number}`;
  }
  if (item?.po_number) return `OC ${item.po_number}`;
  if (item?.source_type === 'DEVOLUCION_LEGADO') return 'Devolución legado';
  return 'Sin recepción';
};

const getSupplierName = (item) => item?.supplier_name || item?.po?.supplier?.name || 'S/D';

const getStateClass = (state) => (
  state === 'CUARENTENA'
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-emerald-100 text-emerald-700 border-emerald-200'
);

export default function Auditoria() {
  const [activeTab, setActiveTab] = useState('GENERAL'); // GENERAL, LOTES, RECETAS, CONTROLADOS
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Tab General
  const [logs, setLogs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', eventType: '', userId: '' });
  const [appliedFilters, setAppliedFilters] = useState({ startDate: '', endDate: '', eventType: '', userId: '' });
  
  
  // Tab Lotes
  const [batchData, setBatchData] = useState([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [uniqueLots, setUniqueLots] = useState([]); // List of possible lots for a batch number

  // Tab Recetas
  const [prescriptionData, setPrescriptionData] = useState([]);
  const [prescriptionFilters, setPrescriptionFilters] = useState({ folio: '', patient_rut: '', startDate: '', endDate: '' });

  // Tab Controlados
  const [controlledData, setControlledData] = useState([]);
  const [controlledFilters, setControlledFilters] = useState({ startDate: '', endDate: '' });

  // Detalle Modal
  const [selectedLog, setSelectedLog] = useState(null);
  const [auditDetail, setAuditDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadGeneralLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, count: totalCount } = await fetchAuditLogs({
        ...appliedFilters,
        page,
        limit: PAGE_SIZE,
      });
      setLogs(data || []);
      setCount(totalCount || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page]);

  const loadBatchAudit = useCallback(async (batchId = null) => {
    if (!batchSearch && !batchId) return;
    setLoading(true);
    setUniqueLots([]);
    setError(null);

    try {
      if (batchId) {
        // Rastrear un ID específico
        const { data } = await fetchBatchAudit({ batch_id: batchId });
        setBatchData(data || []);
      } else {
        // Buscar por número de lote primero para ver si hay duplicidad
        const { data: lots } = await fetchUniqueLotsByNumber(batchSearch.trim());
        
        if (!lots || lots.length === 0) {
          setBatchData([]);
          setError('No se encontraron lotes con ese número.');
        } else if (lots.length === 1) {
          // Solo hay uno, cargar directamente
          const { data } = await fetchBatchAudit({ batch_id: lots[0].id });
          setBatchData(data || []);
        } else {
          // Hay varios, mostrar selector
          setUniqueLots(lots);
          setBatchData([]);
        }
      }
    } catch (err) {
      setError('Error al cargar auditoría de lote: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [batchSearch]);

  const loadPrescriptionAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchPrescriptionAudit(prescriptionFilters);
      setPrescriptionData(data || []);
    } finally {
      setLoading(false);
    }
  }, [prescriptionFilters]);

  const loadControlledAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchControlledAudit(controlledFilters);
      setControlledData(data || []);
    } finally {
      setLoading(false);
    }
  }, [controlledFilters]);

  useEffect(() => {
    if (activeTab === 'GENERAL') loadGeneralLogs();
    if (activeTab === 'RECETAS') loadPrescriptionAudit();
    if (activeTab === 'CONTROLADOS') loadControlledAudit();
  }, [activeTab, loadControlledAudit, loadGeneralLogs, loadPrescriptionAudit]);

  useEffect(() => {
    if (!selectedLog?.id) {
      setAuditDetail(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const { data } = await fetchAuditLogDetail(selectedLog.id);
        if (!cancelled) setAuditDetail(data || null);
      } catch {
        if (!cancelled) setAuditDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedLog]);

  const exportToCSV = (data, filename) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${String(row[header] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm print:h-auto print:overflow-visible print:border-none print:shadow-none">
      
      {/* Header & Tabs */}
      <div className="border-b border-gray-200 px-6 py-4 bg-white flex flex-col gap-4 shrink-0 print:hidden">
        <div className="flex justify-between items-center">
            <div>
                <div className="flex items-center text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">
                    <span>Farmacia</span>
                    <ChevronRight size={12} className="mx-1" />
                    <span className="text-gray-900">Auditoria ISP</span>
                </div>
                <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-3">
                    <ShieldCheck size={28} className="text-[#4C3073]" />
                    Bitácora Farmacéutica Fiscalizable
                </h1>
            </div>
            <div className="flex gap-2">
                <button onClick={handlePrint} className="flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider">
                    <Printer size={16} /> Imprimir
                </button>
            </div>
        </div>

        <div className="flex border-b border-gray-200 -mb-4">
            {[
                { id: 'GENERAL', label: 'Eventos Generales', icon: <FileText size={16}/> },
                { id: 'LOTES', label: 'Trazabilidad Lotes', icon: <Box size={16}/> },
                { id: 'RECETAS', label: 'Despacho Recetas', icon: <ClipboardList size={16}/> },
                { id: 'CONTROLADOS', label: 'Medicamentos Controlados', icon: <ShieldCheck size={16}/> }
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === tab.id ? 'border-[#4C3073] text-[#4C3073] bg-purple-50/30' : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                >
                    {tab.icon} {tab.label}
                </button>
            ))}
        </div>
      </div>

      {/* Filters Area */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 print:hidden">
        {activeTab === 'GENERAL' && (
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Desde</label>
                    <input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} className="w-full rounded-sm border border-gray-300 px-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073]" />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Hasta</label>
                    <input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} className="w-full rounded-sm border border-gray-300 px-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073]" />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Evento</label>
                    <input type="text" value={filters.eventType} onChange={e => setFilters({...filters, eventType: e.target.value})} placeholder="SALE, PRESCRIPTION..." className="w-full rounded-sm border border-gray-300 px-3 py-2 text-xs font-bold uppercase outline-none focus:border-[#4C3073]" />
                </div>
                <button onClick={() => setAppliedFilters(filters)} className="bg-[#4C3073] text-white px-6 py-2 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <Search size={16} /> Buscar
                </button>
                <button onClick={() => exportToCSV(logs, 'auditoria_general')} className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <Download size={16} /> Excel
                </button>
            </div>
        )}

        {error && (
          <div className="mt-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
            {error}
          </div>
        )}

        {activeTab === 'LOTES' && (
            <div className="flex flex-col gap-4">
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Número de Lote</label>
                        <input 
                            type="text" 
                            value={batchSearch} 
                            onChange={e => setBatchSearch(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && loadBatchAudit()}
                            placeholder="Ej: LT-123456" 
                            className="w-full rounded-sm border border-gray-300 px-4 py-2 text-sm font-black uppercase outline-none focus:border-[#4C3073]" 
                        />
                    </div>
                    <button onClick={() => loadBatchAudit()} className="bg-[#4C3073] text-white px-6 py-2 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <Search size={16} /> Rastrear Lote
                    </button>
                    <button onClick={() => exportToCSV(batchData, `auditoria_lote_${batchSearch}`)} className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <Download size={16} /> Excel
                    </button>
                </div>

                {uniqueLots.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 p-6 rounded-sm animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="bg-amber-100 p-3 rounded-lg text-amber-700">
                                <Box size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight">Múltiples registros encontrados</h3>
                                <p className="text-xs text-amber-700 font-bold mt-1">El número de lote "{batchSearch}" está asociado a varias recepciones, ubicaciones o estados. Seleccione el registro específico para auditar:</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {uniqueLots.map(lot => (
                                <button 
                                    key={lot.id} 
                                    onClick={() => loadBatchAudit(lot.id)}
                                    className="text-left p-4 border border-amber-200 bg-white hover:border-amber-500 hover:shadow-md transition-all rounded-sm group relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <Eye size={16} className="text-amber-500" />
                                    </div>
                                    
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black text-[#4C3073] uppercase tracking-tight mb-0.5 truncate">{lot.product?.name}</p>
                                            <p className="text-[9px] font-bold text-gray-400 font-mono uppercase truncate">{lot.product?.dci}</p>
                                        </div>
                                        <span className={`shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm border uppercase ${lot.source_type === 'RECEPCION_REAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                            {lot.source_type === 'RECEPCION_REAL' ? 'Recepción real' : lot.source_type === 'DEVOLUCION_LEGADO' ? 'Dev. legado' : 'Sin recepción'}
                                        </span>
                                    </div>
                                     
                                     <div className="space-y-2">
                                        <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded-sm">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Recepción / OC</span>
                                            <span className="text-[10px] font-black text-gray-700 truncate max-w-[140px]">{getOriginLabel(lot)}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded-sm">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Proveedor</span>
                                            <span className="text-[10px] font-black text-gray-700 truncate max-w-[140px]">{getSupplierName(lot)}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded-sm">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ingreso</span>
                                            <span className="text-[10px] font-black text-gray-700">{formatDateOnly(lot.received_date || lot.purchase_order_date || lot.created_at)}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded-sm">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Vence</span>
                                            <span className="text-[10px] font-black text-gray-700">{lot.expiry_date || 'S/V'}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded-sm">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ubicación</span>
                                            <span className="text-[10px] font-black text-gray-700 truncate max-w-[140px]">{lot.location?.warehouse?.name} / {lot.location?.name}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded-sm">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Estado</span>
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm border uppercase ${getStateClass(lot.warehouse_state)}`}>{lot.warehouse_state || 'ACTIVO'}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 pt-1">
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 uppercase">Stock</p>
                                                <p className="text-xs font-black text-gray-900">{formatQuantity(lot.current_quantity)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-emerald-600 uppercase">Activo</p>
                                                <p className="text-xs font-black text-gray-900">{formatQuantity(lot.active_quantity)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-amber-600 uppercase">Cuar.</p>
                                                <p className="text-xs font-black text-gray-900">{formatQuantity(lot.quarantine_stock)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                                        <span className="text-[8px] text-gray-300 font-mono">ID: {lot.id.split('-')[0]}...</span>
                                        <span className="text-[8px] text-gray-300 font-mono">LOTE: {lot.batch_number}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'RECETAS' && (
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Folio Receta</label>
                    <input type="text" value={prescriptionFilters.folio} onChange={e => setPrescriptionFilters({...prescriptionFilters, folio: e.target.value})} placeholder="REC-001" className="w-full rounded-sm border border-gray-300 px-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073]" />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">RUT Paciente</label>
                    <input type="text" value={prescriptionFilters.patient_rut} onChange={e => setPrescriptionFilters({...prescriptionFilters, patient_rut: e.target.value})} placeholder="12.345.678-9" className="w-full rounded-sm border border-gray-300 px-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073]" />
                </div>
                <button onClick={loadPrescriptionAudit} className="bg-[#4C3073] text-white px-6 py-2 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <Search size={16} /> Filtrar
                </button>
                <button onClick={() => exportToCSV(prescriptionData, 'auditoria_recetas')} className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <Download size={16} /> Excel
                </button>
            </div>
        )}

        {activeTab === 'CONTROLADOS' && (
            <div className="flex items-end gap-3">
                <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Fecha Desde</label>
                    <input type="date" value={controlledFilters.startDate} onChange={e => setControlledFilters({...controlledFilters, startDate: e.target.value})} className="w-full rounded-sm border border-gray-300 px-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073]" />
                </div>
                <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Fecha Hasta</label>
                    <input type="date" value={controlledFilters.endDate} onChange={e => setControlledFilters({...controlledFilters, endDate: e.target.value})} className="w-full rounded-sm border border-gray-300 px-3 py-2 text-xs font-bold outline-none focus:border-[#4C3073]" />
                </div>
                <button onClick={loadControlledAudit} className="bg-[#4C3073] text-white px-6 py-2 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <Search size={16} /> Generar Informe
                </button>
                <button onClick={() => exportToCSV(controlledData, 'auditoria_controlados')} className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-sm text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <Download size={16} /> Excel
                </button>
            </div>
        )}
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-white p-6">
        {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <RefreshCcw size={48} className="animate-spin mb-4" />
                <p className="font-black uppercase tracking-widest">Cargando registros...</p>
            </div>
        ) : (
            <div className="border border-gray-200 rounded-sm">
                <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        {activeTab === 'GENERAL' && (
                            <tr>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Usuario</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Evento</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Descripción</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest text-right">Acción</th>
                            </tr>
                        )}
                        {activeTab === 'LOTES' && (
                            <tr>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Producto / Lote</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Recepción / Proveedor</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Movimiento</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest text-right">Cant.</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest text-right">Saldo</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest text-right">Stock</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest text-center">Ubicación</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Ref.</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Operador</th>
                            </tr>
                        )}
                        {activeTab === 'RECETAS' && (
                            <tr>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Fecha Venta</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Folio Receta</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Paciente</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Producto</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest text-right">Cant.</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Médico</th>
                            </tr>
                        )}
                        {activeTab === 'CONTROLADOS' && (
                            <tr>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Producto</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest text-center">Condición</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest text-right">Cant.</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Paciente</th>
                                <th className="px-4 py-3 font-black text-gray-500 uppercase tracking-widest">Folio Receta</th>
                            </tr>
                        )}
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                        {activeTab === 'GENERAL' && logs.map(log => (
                            <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">{formatDate(log.created_at)}</td>
                                <td className="px-4 py-3 text-gray-500">{log.user_name || 'Sistema'}</td>
                                <td className="px-4 py-3">
                                    <span className="bg-purple-100 text-[#4C3073] px-2 py-0.5 rounded-sm text-[10px] font-black uppercase tracking-tighter">
                                        {log.event_type}
                                    </span>
                                </td>
                                <td className="px-4 py-3">{log.description}</td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => setSelectedLog(log)} className="text-[#4C3073] hover:underline uppercase text-[10px] font-black">Ver Detalles</button>
                                </td>
                            </tr>
                        ))}
                        {activeTab === 'LOTES' && batchData.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">{formatDate(item.created_at)}</td>
                                <td className="px-4 py-3">
                                    <p className="text-gray-900 font-black uppercase text-[11px]">{item.product_name}</p>
                                    <p className="text-[9px] text-gray-400 font-mono uppercase tracking-tighter">{item.product_dci}</p>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-sm border border-blue-100 font-black">LOTE: {item.batch_number}</span>
                                        <span className="text-[9px] text-gray-300 font-mono">ID: {item.batch_id?.split('-')[0]}...</span>
                                    </div>
                                    <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase">Vence: {item.expiry_date || 'S/V'}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="text-[10px] font-black text-gray-800 uppercase">{getOriginLabel(item)}</p>
                                    <p className="text-[9px] font-bold text-gray-500 uppercase truncate max-w-[160px]">{getSupplierName(item)}</p>
                                    <p className="text-[9px] text-gray-400 font-mono">ING: {formatDateOnly(item.received_date || item.purchase_order_date)}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`uppercase tracking-widest text-[9px] font-black px-1.5 py-0.5 rounded-sm ${item.movement_type === 'RETURN' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {item.movement_type}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right font-black text-gray-900">{item.quantity}</td>
                                <td className="px-4 py-3 text-right font-black bg-gray-50/50">{item.balance_after}</td>
                                <td className="px-4 py-3 text-right">
                                    <p className="text-[10px] font-black text-gray-900">{formatQuantity(item.current_quantity)}</p>
                                    <p className="text-[9px] font-bold text-emerald-600">Act: {formatQuantity(item.active_quantity)}</p>
                                    <p className="text-[9px] font-bold text-amber-600">Cuar: {formatQuantity(item.quarantine_stock)}</p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <p className="text-[10px] font-black text-gray-600 uppercase">{item.warehouse_name}</p>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase">{item.location_name}</p>
                                    <span className={`inline-flex mt-1 text-[8px] font-black px-1.5 py-0.5 rounded-sm border uppercase ${getStateClass(item.warehouse_state)}`}>{item.warehouse_state || 'ACTIVO'}</span>
                                </td>
                                <td className="px-4 py-3 text-gray-400 font-mono text-[10px]">{item.reference_folio}</td>
                                <td className="px-4 py-3 text-[10px] text-gray-500 uppercase">{item.operator_name}</td>
                            </tr>
                        ))}
                        {activeTab === 'RECETAS' && prescriptionData.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">{formatDate(item.sale_date)}</td>
                                <td className="px-4 py-3 text-[#4C3073] font-black">{item.folio_electronico}</td>
                                <td className="px-4 py-3">
                                    <p>{item.patient_name}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">{item.patient_rut}</p>
                                </td>
                                <td className="px-4 py-3 font-black text-gray-600">{item.product_name}</td>
                                <td className="px-4 py-3 text-right font-black text-gray-900">{item.quantity}</td>
                                <td className="px-4 py-3">
                                    <p className="text-gray-600">{item.prescriber_name}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">{item.prescriber_rut}</p>
                                </td>
                            </tr>
                        ))}
                        {activeTab === 'CONTROLADOS' && controlledData.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap">{formatDate(item.created_at)}</td>
                                <td className="px-4 py-3 font-black text-gray-900">{item.product_name}</td>
                                <td className="px-4 py-3 text-center">
                                    <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-sm text-[10px] font-black border border-red-100">
                                        {item.sale_condition}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right font-black text-gray-900">{item.quantity}</td>
                                <td className="px-4 py-3">
                                    <p>{item.patient_name || 'S/D'}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">{item.patient_rut}</p>
                                </td>
                                <td className="px-4 py-3 text-[#4C3073] font-black">{item.prescription_folio || 'S/D'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {logs.length === 0 && activeTab === 'GENERAL' && !loading && <p className="p-12 text-center text-gray-400 italic">No hay registros generales</p>}
                {batchData.length === 0 && activeTab === 'LOTES' && !loading && <p className="p-12 text-center text-gray-400 italic">Busque un número de lote para rastrear su historia</p>}
                {prescriptionData.length === 0 && activeTab === 'RECETAS' && !loading && <p className="p-12 text-center text-gray-400 italic">No hay registros de despacho de recetas</p>}
                {controlledData.length === 0 && activeTab === 'CONTROLADOS' && !loading && <p className="p-12 text-center text-gray-400 italic">No hay movimientos de productos controlados en el periodo</p>}
            </div>
        )}
      </div>

      {/* Pagination (Only for General) */}
      {activeTab === 'GENERAL' && (
        <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between shrink-0 print:hidden">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Mostrando {logs.length} de {count} registros
            </p>
            <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border border-gray-200 rounded-sm disabled:opacity-30"><ChevronLeft size={16}/></button>
                <div className="flex items-center px-4 font-black text-xs text-[#4C3073]">Página {page}</div>
                <button onClick={() => setPage(p => p + 1)} disabled={logs.length < PAGE_SIZE} className="p-2 border border-gray-200 rounded-sm disabled:opacity-30"><ChevronRight size={16}/></button>
            </div>
        </div>
      )}

      {/* Log Detail Drawer */}
      {selectedLog && (
        <div 
            className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-[150] transition-opacity flex justify-end print:hidden"
            onClick={() => setSelectedLog(null)}
        >
            <div 
                className="w-full max-w-[600px] xl:max-w-[760px] bg-white h-full shadow-[-10px_0_30px_rgba(0,0,0,0.1)] flex flex-col animate-in slide-in-from-right duration-300"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.key === 'Escape' && setSelectedLog(null)}
                tabIndex={0}
                ref={el => el && el.focus()}
            >
                <div className="absolute top-4 right-4 z-50">
                    <button 
                        onClick={() => setSelectedLog(null)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-500 p-1.5 rounded-full transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {(() => {
                    const eventData = auditDetail?.audit_log || selectedLog;
                    const metadata = eventData?.metadata;
                    const maskedMetadata = maskSensitiveData(metadata);

                    return (
                        <div className="flex flex-col h-full bg-gray-50">
                            {/* Header */}
                            <div className="bg-white border-b border-gray-200 px-6 py-5 shrink-0 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#4C3073]/5 rounded-bl-full -z-0"></div>
                                <div className="relative z-10 pr-8">
                                    <div className="flex items-center gap-2 mb-1">
                                        <ShieldCheck size={20} className="text-[#4C3073]" />
                                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Detalle de Auditoría</h2>
                                    </div>
                                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <span>ID: {eventData?.id?.split('-')[0] || 'S/D'}</span>
                                        <span>•</span>
                                        <span className="bg-purple-100 text-[#4C3073] px-1.5 py-0.5 rounded-sm">{eventData?.event_type || 'DESCONOCIDO'}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {detailLoading ? (
                                    <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-4">
                                        <RefreshCcw size={32} className="animate-spin text-[#4C3073]" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Cargando contexto operacional...</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* SECCION A: RESUMEN DEL EVENTO */}
                                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50 flex items-center gap-2">
                                                <FileText size={14} className="text-[#4C3073]" />
                                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Resumen del Evento</h4>
                                            </div>
                                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="col-span-full">
                                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Descripción</label>
                                                    <p className="text-[13px] font-bold text-gray-800">{eventData?.description || 'Sin descripción'}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Fecha / Hora</label>
                                                    <p className="text-[11px] font-black text-gray-700">{formatDate(eventData?.created_at)}</p>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Actor / Usuario</label>
                                                    <p className="text-[11px] font-black text-gray-700">{eventData?.user_name || 'Usuario no identificado'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECCION B: CONTEXTO OPERACIONAL */}
                                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50 flex items-center gap-2">
                                                <Box size={14} className="text-[#4C3073]" />
                                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Contexto Operacional</h4>
                                            </div>
                                            <div className="p-5">
                                                {(!metadata || Object.keys(metadata).length === 0) && !auditDetail?.batch && (
                                                    <p className="text-[11px] font-bold text-gray-400 italic">Sin contexto operacional específico para este evento.</p>
                                                )}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {metadata?.warehouse_name && (
                                                        <div>
                                                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Sucursal / Local</label>
                                                            <p className="text-[11px] font-black text-gray-700">{metadata.warehouse_name}</p>
                                                        </div>
                                                    )}
                                                    {metadata?.pos_operator && (
                                                        <div>
                                                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Operador POS</label>
                                                            <p className="text-[11px] font-black text-gray-700">{metadata.pos_operator}</p>
                                                        </div>
                                                    )}
                                                    {auditDetail?.batch && (
                                                        <div className="col-span-full p-3 bg-blue-50 border border-blue-100 rounded-sm">
                                                            <label className="block text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Lote / Producto Vinculado</label>
                                                            <p className="text-[11px] font-black text-blue-800 uppercase">{auditDetail.batch.product_name} - {auditDetail.batch.batch_number}</p>
                                                        </div>
                                                    )}
                                                    {metadata?.sale_id && (
                                                        <div>
                                                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Venta / Transacción</label>
                                                            <p className="text-[11px] font-black text-gray-700 font-mono">ID: {metadata.sale_id}</p>
                                                        </div>
                                                    )}
                                                    {metadata?.status && (
                                                        <div>
                                                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Resultado / Estado</label>
                                                            <p className="text-[11px] font-black text-gray-700">{metadata.status}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECCION C: METADATA TECNICA */}
                                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50 flex items-center gap-2">
                                                <MonitorSmartphone size={14} className="text-[#4C3073]" />
                                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Metadata Técnica (JSON)</h4>
                                            </div>
                                            <div className="p-0 bg-gray-900 border-t border-gray-800">
                                                {maskedMetadata && Object.keys(maskedMetadata).length > 0 ? (
                                                    <pre className="p-5 text-emerald-400 text-[10px] font-mono overflow-x-auto max-h-[300px] leading-relaxed">
                                                        {JSON.stringify(maskedMetadata, null, 2)}
                                                    </pre>
                                                ) : (
                                                    <div className="p-8 text-center">
                                                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Sin metadata técnica adicional</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
      )}
    </div>
  );
}
