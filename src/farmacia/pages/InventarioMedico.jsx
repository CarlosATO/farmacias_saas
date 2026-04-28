import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, Search, ShieldAlert, ChevronRight, MapPin, Building2, BookOpen, Filter, Layers } from 'lucide-react';
import { fetchPharmacyProducts, fetchInventoryStock, getPharmacySchema, getMyCompanyId } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';

export default function InventarioMedico() {
  const { activeWarehouse } = useSucursal();
  const navigate = useNavigate();

  const [products, setProducts]       = useState([]);
  const [stockMap, setStockMap]       = useState({});   // { product_id: { local: 0, other: 0 } }
  const [locations, setLocations]     = useState([]);   // bodegas del local activo
  const [loading, setLoading]         = useState(true);
  const [searchTerm, setSearchTerm]   = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState(''); // '' = todo el local

  // ── Carga bodegas cuando cambia el local activo ─────────────────────────
  useEffect(() => {
    const loadLocations = async () => {
      if (!activeWarehouse?.id) return;
      const companyId = await getMyCompanyId();
      const schema = getPharmacySchema();
      // Solo bodegas de nivel superior del local activo (las zonas principales)
      const { data } = await schema
        .from('locations')
        .select('id, name, location_type')
        .eq('company_id', companyId)
        .eq('warehouse_id', activeWarehouse.id)
        .is('parent_location_id', null)   // solo zonas raíz
        .order('name');
      setLocations(data || []);
      setSelectedLocationId('');
    };
    loadLocations();
  }, [activeWarehouse?.id]);

  // ── Carga inventario (global del local o filtrado por zona) ─────────────
  const loadInventory = useCallback(async () => {
    if (!activeWarehouse?.id) return;
    setLoading(true);
    try {
      const schema = getPharmacySchema();
      const companyId = await getMyCompanyId();

      // Productos maestros + lotes del local
      let batchQuery = schema
        .from('inventory_batches')
        .select('product_id, current_quantity, location:location_id!inner(id, name, warehouse_id)')
        .eq('company_id', companyId)
        .eq('location.warehouse_id', activeWarehouse.id);

      // Si hay zona seleccionada, afinar más
      if (selectedLocationId) {
        // Incluir la zona raíz y todas sus sub-ubicaciones
        const { data: subLocs } = await schema
          .from('locations')
          .select('id')
          .eq('parent_location_id', selectedLocationId);
        const ids = [selectedLocationId, ...(subLocs || []).map(l => l.id)];
        batchQuery = batchQuery.in('location_id', ids);
      }

      const [prodRes, batchRes] = await Promise.all([
        fetchPharmacyProducts(),
        batchQuery
      ]);

      if (prodRes.error) throw prodRes.error;
      if (batchRes.error) throw batchRes.error;

      // Construir mapa de stock
      const newStockMap = {};
      (batchRes.data || []).forEach(batch => {
        const pId = batch.product_id;
        const qty = batch.current_quantity || 0;
        if (!newStockMap[pId]) newStockMap[pId] = { local: 0 };
        newStockMap[pId].local += qty;
      });

      // Stock de otros locales (solo cuando no hay filtro de zona)
      if (!selectedLocationId) {
        const { data: otherBatches } = await schema
          .from('inventory_batches')
          .select('product_id, current_quantity, location:location_id!inner(warehouse_id)')
          .eq('company_id', companyId)
          .neq('location.warehouse_id', activeWarehouse.id);

        (otherBatches || []).forEach(batch => {
          const pId = batch.product_id;
          if (!newStockMap[pId]) newStockMap[pId] = { local: 0 };
          newStockMap[pId].other = (newStockMap[pId].other || 0) + (batch.current_quantity || 0);
        });
      }

      setProducts(prodRes.data || []);
      setStockMap(newStockMap);
    } catch (err) {
      console.error('Error loading inventory:', err);
    } finally {
      setLoading(false);
    }
  }, [activeWarehouse?.id, selectedLocationId]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const term = searchTerm.toLowerCase();
      const inStock = (stockMap[p.id]?.local || 0) > 0 || !selectedLocationId;
      const nameMatch = p.name?.toLowerCase().includes(term);
      const dciMatch = (p.dci || p.active_principle)?.toLowerCase().includes(term);
      return (nameMatch || dciMatch) && inStock;
    });
  }, [products, searchTerm, stockMap, selectedLocationId]);

  const getSaleConditionBadge = (condition) => {
    switch (condition) {
      case 'VD': return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-green-100 text-green-700 border border-green-200 uppercase">Venta Directa</span>;
      case 'R':  return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-yellow-100 text-yellow-700 border border-yellow-200 uppercase">Receta</span>;
      case 'RR': return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-700 border border-red-200 uppercase">Receta Retenida</span>;
      default:   return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600 border border-gray-200 uppercase">{condition || 'N/A'}</span>;
    }
  };

  const selectedLocName = locations.find(l => l.id === selectedLocationId)?.name;

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans text-gray-800">

      {/* ── Header Odoo-style ────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col gap-4 shrink-0 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center text-[10px] text-gray-400 uppercase tracking-[0.2em] font-black mb-1">
              <span>Logística</span>
              <ChevronRight size={10} className="mx-1" />
              <span className="text-[#4C3073]">Stock e Inventario</span>
            </div>
            <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2 tracking-tight uppercase">
              <Pill className="text-[#4C3073]" />
              Inventario de Farmacia
            </h1>
          </div>
          <div className="bg-purple-50 border border-purple-100 px-3 py-2 rounded-lg flex items-center gap-3">
            <MapPin size={16} className="text-[#4C3073]" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase leading-none">Local Activo</span>
              <span className="text-xs font-black text-[#4C3073] uppercase">{activeWarehouse?.name || 'Cargando...'}</span>
            </div>
          </div>
        </div>

        {/* ── Barra de filtros ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* Selector de bodega/zona */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <Filter size={13} className="text-gray-400 shrink-0" />
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer min-w-[180px]"
            >
              <option value="">Todo el local ({activeWarehouse?.name})</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.location_type})</option>
              ))}
            </select>
          </div>

          {selectedLocationId && (
            <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-lg">
              <Layers size={12} className="text-[#4C3073]" />
              <span className="text-[10px] font-black text-[#4C3073] uppercase">Bodega: {selectedLocName}</span>
              <button
                onClick={() => setSelectedLocationId('')}
                className="ml-1 text-purple-400 hover:text-purple-700 font-black text-xs leading-none"
              >×</button>
            </div>
          )}

          <div className="relative w-80 ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por Nombre o DCI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2 text-xs font-bold
                focus:border-[#4C3073] focus:ring-4 focus:ring-purple-50 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto / DCI</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Bioequivalente</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Condición</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">
                  {selectedLocName ? `Stock en ${selectedLocName}` : 'Stock Local'}
                </th>
                {!selectedLocationId && (
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Otros Locales</th>
                )}
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Trazabilidad</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Kardex</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={selectedLocationId ? 5 : 6} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4C3073] mb-4"></div>
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Sincronizando Stock...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={selectedLocationId ? 5 : 6} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-300">
                      <ShieldAlert size={60} className="mb-4 opacity-10" />
                      <p className="text-sm font-black uppercase tracking-widest">No se encontraron resultados</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stock = stockMap[product.id] || { local: 0, other: 0 };
                  return (
                    <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-black text-[#4C3073] uppercase tracking-tight">{product.name}</span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase mt-0.5 tracking-tighter">
                            {product.dci || product.active_principle || 'Sin DCI especificado'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {product.is_bioequivalent ? (
                          <span className="bg-yellow-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded border border-yellow-500 shadow-sm">BIO</span>
                        ) : (
                          <span className="text-gray-200">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">{getSaleConditionBadge(product.sale_condition)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-black ${stock.local <= 0 ? 'text-red-400' : 'text-gray-900'}`}>
                          {stock.local} <span className="text-[9px] font-bold text-gray-400 ml-1">UN</span>
                        </span>
                      </td>
                      {!selectedLocationId && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Building2 size={10} className="text-gray-300" />
                            <span className="text-xs font-bold text-gray-400 italic">
                              {stock.other > 0 ? `${stock.other} UN` : '-'}
                            </span>
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => navigate(`/mapa-lotes/${product.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase
                            bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-600 hover:text-white
                            transition-all active:scale-95"
                        >
                          <Layers size={12} />
                          Ver Lotes
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => navigate(`/kardex/${product.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase
                            bg-purple-50 text-[#4C3073] border border-purple-100 hover:bg-[#4C3073] hover:text-white
                            transition-all active:scale-95"
                          title="Ver historial Kardex"
                        >
                          <BookOpen size={12} />
                          Kardex
                        </button>
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
