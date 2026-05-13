import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, MapPin, Package, Calendar, AlertTriangle, 
  CheckCircle2, Info, Search, Send, Loader2, Pill, Building2
} from 'lucide-react';
import { getPharmacySchema, getMyCompanyId } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';

const getBatchQuarantineQty = (batch) => batch.location?.location_type === 'QUARANTINE' ? Number(batch.current_quantity || 0) : 0;

export default function MapaLotes() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeWarehouse } = useSucursal();

  const [product, setProduct] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyWithStock, setShowOnlyWithStock] = useState(true);

  useEffect(() => {
    if (location.state?.batchNumber) {
      setSearchTerm(location.state.batchNumber);
    }
  }, [location.state]);

  const loadData = useCallback(async () => {
    if (!activeWarehouse?.id || !productId) return;
    setLoading(true);
    try {
      const companyId = await getMyCompanyId();
      const schema = getPharmacySchema();

      // 1. Cargar datos del producto
      const { data: prodData } = await schema
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
      setProduct(prodData);

      // 2. Cargar lotes con su ubicación (Seguridad estricta aplicada)
      // Cruzamos con locations!inner para asegurar aislamiento por warehouse_id
      // También traemos el parent_location para determinar la jerarquía Bodega > Zona
      const { data: batchData, error: batchErr } = await schema
        .from('inventory_batches')
        .select(`
          *,
          location:location_id!inner(
            id, 
            name, 
            location_type,
            warehouse_id, 
            parent_location:parent_location_id(id, name)
          )
        `)
        .eq('company_id', companyId)
        .eq('product_id', productId)
        .eq('location.warehouse_id', activeWarehouse.id)
        .order('expiry_date', { ascending: true });

      if (batchErr) throw batchErr;
      setBatches(batchData || []);
    } catch (err) {
      console.error('Error cargando mapa de lotes:', err);
    } finally {
      setLoading(false);
    }
  }, [productId, activeWarehouse?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const getExpiryStatus = (expiryDate) => {
    if (!expiryDate) return { label: 'S/V', color: 'text-gray-400', border: 'border-gray-200', bg: 'bg-gray-50' };
    const today = new Date();
    const exp = new Date(expiryDate);
    const diffMonths = (exp.getFullYear() - today.getFullYear()) * 12 + (exp.getMonth() - today.getMonth());

    if (exp < today) return { label: 'VENCIDO', color: 'text-red-600', border: 'border-red-500', bg: 'bg-red-50', icon: <AlertTriangle size={12}/> };
    if (diffMonths <= 6) return { label: 'PRÓXIMO', color: 'text-amber-600', border: 'border-amber-400', bg: 'bg-amber-50', icon: <Info size={12}/> };
    return { label: 'VIGENTE', color: 'text-emerald-600', border: 'border-emerald-200', bg: 'bg-emerald-50', icon: <CheckCircle2 size={12}/> };
  };

  // Agrupar por ID de ubicación para mostrar cada zona física como una unidad
  const groupedBatches = batches.reduce((acc, batch) => {
    const locId = batch.location_id || 'unassigned';
    if (!acc[locId]) acc[locId] = [];
    acc[locId].push(batch);
    return acc;
  }, {});

  const filteredLocationIds = Object.keys(groupedBatches).filter(locId => {
    const batchesInLoc = groupedBatches[locId].filter(b => {
      const matchSearch = b.batch_number?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStock = showOnlyWithStock ? b.current_quantity > 0 : true;
      return matchSearch && matchStock;
    });
    return batchesInLoc.length > 0;
  });

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-50">
      <Loader2 size={40} className="animate-spin text-[#4C3073] mb-4" />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Escaneando Bodega...</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans">
      {/* Header ERP */}
      <div className="bg-white border-b border-gray-200 px-8 py-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
             <button onClick={() => navigate('/inventario')} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                <ArrowLeft size={20} className="text-gray-400" />
             </button>
             <div>
                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                   <MapPin size={10} /> {activeWarehouse?.name}
                   <span className="mx-2">/</span>
                   <span className="text-[#4C3073]">Mapa de Lotes</span>
                </div>
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                  <Pill size={28} className="text-[#4C3073]" />
                  {product?.name}
                </h1>
             </div>
          </div>

          <div className="flex gap-3">
             <button 
               onClick={() => navigate('/inventario')}
               className="px-6 py-2.5 rounded-xl border-2 border-gray-100 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-all flex items-center gap-2"
             >
               <ArrowLeft size={14} /> Volver al Inventario
             </button>
             <button 
               onClick={() => navigate('/traspasos', { state: { product } })}
               className="px-6 py-2.5 rounded-xl bg-[#4C3073] text-white text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-purple-200"
             >
               <Package size={14} /> Realizar Traspaso
             </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center gap-4 pt-6 border-t border-gray-100">
           <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input 
                placeholder="Filtrar por número de lote..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#4C3073] outline-none text-xs font-bold transition-all"
              />
           </div>
           
           <button 
             onClick={() => setShowOnlyWithStock(!showOnlyWithStock)}
             className={`px-4 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${showOnlyWithStock ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-400'}`}
           >
             Solo con Stock {showOnlyWithStock ? 'ACTIVO' : 'OFF'}
           </button>

           <div className="ml-auto flex gap-6">
              <div className="flex items-center gap-2">
                 <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                 <span className="text-[10px] font-black text-gray-400 uppercase">Vencido</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                 <span className="text-[10px] font-black text-gray-400 uppercase">Próximo (6m)</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                 <span className="text-[10px] font-black text-gray-400 uppercase">Vigente</span>
              </div>
           </div>
        </div>
      </div>

      {/* Grid de Ubicaciones */}
      <div className="flex-1 overflow-y-auto p-8">
        {filteredLocationIds.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-300">
             <MapPin size={64} className="mb-4 opacity-10" />
             <p className="text-sm font-black uppercase tracking-widest">No hay lotes en esta sucursal</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredLocationIds.map(locId => {
              const firstBatch = groupedBatches[locId][0];
              const locObj = firstBatch.location;
              
              // Título: Si tiene padre, el padre es la "Bodega". Si no, es ella misma.
              const bodegaName = locObj?.parent_location?.name || locObj?.name || 'Bodega Principal';
              
              // Subtítulo: Si tiene padre, ella es la "Zona". Si no, es "Zona única".
              const zonaName = locObj?.parent_location ? locObj.name : 'Zona única';

              return (
                <div key={locId} className="bg-white rounded-2xl border-2 border-gray-100 shadow-sm overflow-hidden flex flex-col">
                  {/* Cabecera Estándar ERP: Bodega > Zona */}
                  <div className="bg-gray-50 px-6 py-5 border-b border-gray-100 flex flex-col justify-center h-28 shrink-0">
                     <div className="flex items-center gap-2 mb-1">
                        <Building2 size={18} className="text-[#4C3073] shrink-0" />
                        <h3 className="font-black text-slate-900 uppercase tracking-tight text-base leading-tight truncate">
                          {bodegaName}
                        </h3>
                     </div>
                     <div className="flex items-center gap-2 text-gray-400">
                        <MapPin size={14} className="shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-widest truncate">
                          {zonaName}
                        </span>
                     </div>
                  </div>
                  
                  <div className="p-4 space-y-3 flex-1 bg-white">
                     {groupedBatches[locId]
                      .filter(b => {
                        const matchSearch = b.batch_number?.toLowerCase().includes(searchTerm.toLowerCase());
                        const matchStock = showOnlyWithStock ? b.current_quantity > 0 : true;
                        return matchSearch && matchStock;
                      })
                      .map(batch => {
                        const status = getExpiryStatus(batch.expiry_date);
                        return (
                          <div key={batch.id} className={`p-4 rounded-xl border-2 transition-all ${status.border} ${status.bg} hover:shadow-md`}>
                             <div className="flex justify-between items-start mb-2">
                                <div>
                                   <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">Lote</span>
                                   <span className="font-mono font-black text-slate-800 text-sm">{batch.batch_number}</span>
                                </div>
                                <div className="text-right">
                                   <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">Cantidad</span>
                                    <span className="text-xl font-black text-slate-900">{batch.current_quantity} <span className="text-[10px] text-gray-400">UN</span></span>
                                    {getBatchQuarantineQty(batch) > 0 && (
                                      <div className="mt-1 text-[9px] font-black uppercase text-amber-600">
                                        En cuarentena: {getBatchQuarantineQty(batch)}
                                      </div>
                                    )}
                                 </div>
                             </div>
                             
                             <div className="flex items-center justify-between pt-3 border-t border-gray-100/50 mt-1">
                                <div className="flex items-center gap-1.5">
                                   {status.icon}
                                   <span className={`text-[10px] font-black uppercase ${status.color}`}>
                                     {status.label}: {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString('es-CL') : 'Sin fecha'}
                                   </span>
                                </div>
                                <Calendar size={12} className="text-gray-300" />
                             </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
