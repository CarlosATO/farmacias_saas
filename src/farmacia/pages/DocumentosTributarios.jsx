import React, { useCallback, useEffect, useState, useRef } from 'react';
import { 
  FileText, 
  Search, 
  RefreshCcw, 
  ChevronRight, 
  ChevronLeft, 
  Download, 
  AlertTriangle,
  ExternalLink,
  Filter,
  X,
  Printer,
  Calendar,
  User as UserIcon,
  ShoppingBag,
  CreditCard,
  Hash
} from 'lucide-react';
import { fetchDteDocuments, fetchSaleItems } from '../api/pharmacyClient';

const formatDate = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
};

const formatCLP = (value) => {
  if (value === null || value === undefined || value === '') return '$0';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const getStatusBadge = (status) => {
  const styles = {
    PENDING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    GENERATED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    SENT: 'bg-purple-50 text-purple-700 border-purple-200',
    ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    CANCELLED: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  return styles[status] || styles.PENDING;
};

const getStatusLabel = (status) => {
  const labels = {
    PENDING: 'GENERADO INTERNO',
    GENERATED: 'GENERADO INTERNO',
    SENT: 'ENVIADO',
    ACCEPTED: 'ACEPTADO',
    REJECTED: 'RECHAZADO',
    CANCELLED: 'ANULADO',
  };
  return labels[status] || status;
};

export default function DocumentosTributarios() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ folio: '', dte_type: '', status: '' });
  
  // State for Detail Modal
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docItems, setDocItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const printRef = useRef();

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchDteDocuments(filters);
      setDocuments(data || []);
    } catch (error) {
      console.error("Error cargando DTEs:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleViewDetail = async (doc) => {
    setSelectedDoc(doc);
    setLoadingItems(true);
    try {
      const { data } = await fetchSaleItems(doc.sale_id);
      setDocItems(data || []);
    } catch (error) {
      console.error("Error cargando items del DTE:", error);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleDownloadCSV = (doc) => {
    const headers = ["Producto", "Cantidad", "Precio Unitario", "Subtotal"];
    const rows = docItems.map(item => [
      item.product?.name || 'Desconocido',
      item.quantity,
      item.unit_price,
      item.subtotal
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + "DOCUMENTO INTERNO NO VALIDO TRIBUTARIAMENTE\n"
      + `Folio: ${doc.folio}\n`
      + `Tipo: ${doc.dte_type}\n`
      + `Fecha: ${doc.issued_at}\n`
      + `Total: ${doc.total_amount}\n\n`
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `DTE_INTERNO_FOLIO_${doc.folio}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm print:h-auto print:border-none print:shadow-none print:overflow-visible">
      
      {/* Header - Hidden on Print */}
      <div className="border-b border-gray-200 px-6 py-5 bg-white shrink-0 print:hidden">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">
              <span>Farmacia</span>
              <ChevronRight size={12} className="mx-1" />
              <span className="text-gray-900">Módulo DTE</span>
            </div>
            <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-3">
              <FileText size={28} className="text-[#4C3073]" />
              Documentos Tributarios
            </h1>
            <div className="mt-2 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded-sm text-[10px] font-black uppercase tracking-widest animate-pulse">
              <AlertTriangle size={14} />
              DOCUMENTO INTERNO - NO VÁLIDO TRIBUTARIAMENTE
            </div>
          </div>
          <button 
            onClick={loadDocuments}
            disabled={loading}
            className="p-2 border border-gray-300 rounded-sm hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters - Hidden on Print */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex flex-wrap gap-4 items-end shrink-0 print:hidden">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Folio</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar folio..." 
              value={filters.folio}
              onChange={e => setFilters({...filters, folio: e.target.value})}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-sm text-xs font-bold outline-none focus:border-[#4C3073]"
            />
          </div>
        </div>
        <div className="w-48">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo</label>
          <select 
            value={filters.dte_type}
            onChange={e => setFilters({...filters, dte_type: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-xs font-bold outline-none focus:border-[#4C3073]"
          >
            <option value="">TODOS LOS TIPOS</option>
            <option value="BOLETA">BOLETA</option>
            <option value="FACTURA">FACTURA</option>
            <option value="NOTA_CREDITO">NOTA CRÉDITO</option>
          </select>
        </div>
        <div className="w-48">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estado</label>
          <select 
            value={filters.status}
            onChange={e => setFilters({...filters, status: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-xs font-bold outline-none focus:border-[#4C3073]"
          >
            <option value="">TODOS LOS ESTADOS</option>
            <option value="PENDING">GENERADO INTERNO</option>
            <option value="ACCEPTED">ACEPTADO POR SII</option>
            <option value="REJECTED">RECHAZADO POR SII</option>
          </select>
        </div>
        <button 
          onClick={() => setFilters({ folio: '', dte_type: '', status: '' })}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          title="Limpiar filtros"
        >
          <X size={20} />
        </button>
      </div>

      {/* Table Content - Hidden on Print */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6 print:hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <RefreshCcw size={48} className="animate-spin mb-4" />
            <p className="font-black uppercase tracking-widest">Cargando documentos...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white border border-gray-200 border-dashed rounded-sm">
            <FileText size={64} className="mb-4 opacity-20" />
            <p className="font-black uppercase tracking-widest">No se encontraron documentos</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-widest text-[10px]">Folio</th>
                  <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-widest text-[10px]">Tipo</th>
                  <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-widest text-[10px]">Cliente</th>
                  <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-widest text-[10px]">Estado</th>
                  <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-widest text-[10px] text-right">Total</th>
                  <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-widest text-[10px]">Fecha</th>
                  <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-widest text-[10px] text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="font-black text-gray-900 text-sm">#{doc.folio}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-gray-600 text-xs">{doc.dte_type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-800 text-xs uppercase">{doc.patient?.full_name || 'CLIENTE GENERAL'}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{doc.patient?.rut || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-sm text-[10px] font-black uppercase tracking-widest border ${getStatusBadge(doc.status)}`}>
                        {getStatusLabel(doc.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-black text-gray-900">{formatCLP(doc.total_amount)}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(doc.issued_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handleViewDetail(doc)}
                          className="p-2 text-[#4C3073] hover:bg-purple-50 rounded-sm transition-colors" 
                          title="Ver Detalle"
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedDoc(doc);
                            handleDownloadCSV(doc);
                          }}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-sm transition-colors" 
                          title="Descargar CSV"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Footer - Hidden on Print */}
      <div className="px-6 py-3 bg-white border-t border-gray-200 flex justify-between items-center shrink-0 print:hidden">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Mostrando {documents.length} documentos encontrados
        </p>
        <div className="flex gap-2">
          <button className="p-1 border border-gray-200 rounded-sm text-gray-400 cursor-not-allowed"><ChevronLeft size={16}/></button>
          <button className="p-1 border border-gray-200 rounded-sm text-gray-400 cursor-not-allowed"><ChevronRight size={16}/></button>
        </div>
      </div>

      {/* Detail Modal / Overlay */}
      {selectedDoc && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm print:p-0 print:bg-white print:relative print:z-0 print:block">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-sm shadow-2xl overflow-hidden print:shadow-none print:max-h-full print:rounded-none">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white print:hidden">
              <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
                <FileText size={20} className="text-[#4C3073]" />
                Detalle de Documento Interno
              </h2>
              <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-8 print:p-0">
              
              {/* Header Print View */}
              <div className="mb-8 flex justify-between items-start border-b-2 border-[#4C3073] pb-6">
                <div>
                  <h3 className="text-3xl font-black text-[#4C3073] uppercase tracking-tighter mb-1">BOLETA ELECTRÓNICA</h3>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">DOCUMENTO INTERNO SIMULADO</p>
                  <div className="mt-4 space-y-1">
                    <p className="text-sm font-black uppercase tracking-wider">{selectedDoc.patient?.full_name || 'CLIENTE GENERAL'}</p>
                    <p className="text-xs text-gray-500 font-mono">{selectedDoc.patient?.rut || 'RUT NO REGISTRADO'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="border-4 border-red-600 p-4 inline-block rounded-sm">
                    <p className="text-red-600 font-black text-xl leading-none mb-1 uppercase tracking-widest">R.U.T.: 76.XXX.XXX-X</p>
                    <p className="text-red-600 font-black text-2xl leading-none uppercase">{selectedDoc.dte_type}</p>
                    <p className="text-red-600 font-black text-3xl leading-none mt-2 italic">N° {selectedDoc.folio}</p>
                  </div>
                  <p className="mt-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">S.I.I. - SANTIAGO CENTRO</p>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Calendar size={16} className="text-gray-400 mt-1" />
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Fecha de Emisión</p>
                      <p className="text-xs font-bold text-gray-700">{formatDate(selectedDoc.issued_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ShoppingBag size={16} className="text-gray-400 mt-1" />
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Folio de Venta Asociado</p>
                      <p className="text-xs font-bold text-gray-700">{selectedDoc.sale?.document_number || 'N/A'}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Hash size={16} className="text-gray-400 mt-1" />
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Estado Interno</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-widest border ${getStatusBadge(selectedDoc.status)}`}>
                        {getStatusLabel(selectedDoc.status)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CreditCard size={16} className="text-gray-400 mt-1" />
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Caja / Terminal</p>
                      <p className="text-xs font-bold text-gray-700 uppercase">POS-001 MAIN</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-8 border border-gray-200 rounded-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-500 uppercase tracking-widest">Producto</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-500 uppercase tracking-widest text-center">Cant</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-500 uppercase tracking-widest text-right">Precio</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-500 uppercase tracking-widest text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loadingItems ? (
                      <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400 animate-pulse font-black uppercase tracking-widest text-[10px]">Cargando items...</td></tr>
                    ) : docItems.length === 0 ? (
                      <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400 font-black uppercase tracking-widest text-[10px]">No hay items registrados</td></tr>
                    ) : (
                      docItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3">
                            <p className="text-xs font-bold text-gray-800 uppercase">{item.product?.name || 'PRODUCTO DESCONOCIDO'}</p>
                            <p className="text-[9px] text-gray-400 font-mono">{item.product?.barcode || '-'}</p>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-xs text-gray-700">{item.quantity}</td>
                          <td className="px-4 py-3 text-right font-bold text-xs text-gray-700">{formatCLP(item.unit_price)}</td>
                          <td className="px-4 py-3 text-right font-black text-xs text-gray-900">{formatCLP(item.subtotal)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end mb-8">
                <div className="w-64 space-y-2 border-t-2 border-gray-100 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Neto</span>
                    <span className="text-xs font-bold text-gray-700">{formatCLP(selectedDoc.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">IVA (19%)</span>
                    <span className="text-xs font-bold text-gray-700">{formatCLP(selectedDoc.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 p-2 rounded-sm border border-gray-100">
                    <span className="text-xs font-black text-gray-800 uppercase tracking-widest">Total</span>
                    <span className="text-lg font-black text-[#4C3073]">{formatCLP(selectedDoc.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Footer Warning */}
              <div className="mt-8 border-t-2 border-dashed border-gray-200 pt-6 text-center">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-2">TIMBRE ELECTRÓNICO S.I.I.</p>
                <div className="w-full h-16 bg-gray-100 border border-gray-200 rounded-sm flex items-center justify-center mb-4">
                  <p className="text-[8px] text-gray-400 font-mono uppercase">[ CÓDIGO PDF417 SIMULADO - AMBIENTE DE PRUEBAS ]</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-sm p-4 print:bg-white print:border-red-600">
                  <p className="text-red-700 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 print:text-red-600">
                    <AlertTriangle size={16} />
                    DOCUMENTO INTERNO - NO VÁLIDO TRIBUTARIAMENTE
                  </p>
                  <p className="text-[9px] text-red-500 font-bold mt-1 uppercase tracking-tighter">ESTE DOCUMENTO ES UNA REPRESENTACIÓN ELECTRÓNICA DE UNA VENTA INTERNA EN MODO SIMULACIÓN.</p>
                </div>
              </div>

            </div>

            {/* Modal Footer - Hidden on Print */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center print:hidden">
              <div className="flex gap-2">
                <button 
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-sm text-xs font-black uppercase tracking-widest hover:bg-gray-700 transition-colors"
                >
                  <Printer size={16} />
                  Imprimir
                </button>
                <button 
                  onClick={() => handleDownloadCSV(selectedDoc)}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-sm text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-colors"
                >
                  <Download size={16} />
                  Descargar CSV
                </button>
              </div>
              <button 
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-2 text-gray-500 font-black uppercase tracking-widest text-xs hover:text-gray-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for Print */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .fixed, .fixed * { visibility: visible; }
          .fixed { position: absolute; left: 0; top: 0; width: 100%; height: auto; overflow: visible; background: white !important; padding: 0 !important; }
          .fixed button, .fixed .modal-header-actions { display: none !important; }
          @page { size: auto; margin: 1cm; }
        }
      `}} />
    </div>
  );
}
