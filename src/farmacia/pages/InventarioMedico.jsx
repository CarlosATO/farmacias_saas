import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Pill, Search, ShieldAlert, ChevronRight, MapPin, Building2 } from 'lucide-react';
import { fetchPharmacyProducts, fetchInventoryStock } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';

export default function InventarioMedico() {
  const { activeWarehouse } = useSucursal();
  const [products, setProducts] = useState([]);
  const [stockMap, setStockMap] = useState({}); // { product_id: { local: 0, other: 0 } }
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadInventory = useCallback(async () => {
    if (!activeWarehouse?.id) return;
    
    setLoading(true);
    try {
      const [prodRes, stockRes] = await Promise.all([
        fetchPharmacyProducts(),
        fetchInventoryStock()
      ]);

      if (prodRes.error) throw prodRes.error;
      if (stockRes.error) throw stockRes.error;

      // Procesar stock
      const newStockMap = {};
      (stockRes.data || []).forEach(batch => {
        const pId = batch.product_id;
        const qty = batch.current_quantity || 0;
        const whId = batch.location?.warehouse_id;

        if (!newStockMap[pId]) {
          newStockMap[pId] = { local: 0, other: 0 };
        }

        if (whId === activeWarehouse.id) {
          newStockMap[pId].local += qty;
        } else {
          newStockMap[pId].other += qty;
        }
      });

      setProducts(prodRes.data || []);
      setStockMap(newStockMap);
    } catch (err) {
      console.error("Error loading inventory:", err);
    } finally {
      setLoading(false);
    }
  }, [activeWarehouse?.id]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const term = searchTerm.toLowerCase();
      const nameMatch = p.name?.toLowerCase().includes(term);
      const dciMatch = (p.dci || p.active_principle)?.toLowerCase().includes(term);
      return nameMatch || dciMatch;
    });
  }, [products, searchTerm]);

  const getSaleConditionBadge = (condition) => {
    switch (condition) {
      case 'VD':
        return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-green-100 text-green-700 border border-green-200 uppercase tracking-tighter">Venta Directa</span>;
      case 'R':
        return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-yellow-100 text-yellow-700 border border-yellow-200 uppercase tracking-tighter">Receta</span>;
      case 'RR':
        return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-700 border border-red-200 uppercase tracking-tighter">Receta Retenida</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600 border border-gray-200 uppercase tracking-tighter">{condition || 'N/A'}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans text-gray-800">
      
      {/* Header Estilo Odoo */}
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
          
          <div className="flex items-center gap-3">
             <div className="bg-purple-50 border border-purple-100 px-3 py-2 rounded-lg flex items-center gap-3">
                <MapPin size={16} className="text-[#4C3073]" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-gray-400 uppercase leading-none">Local Activo</span>
                  <span className="text-xs font-black text-[#4C3073] uppercase">{activeWarehouse?.name || 'Cargando...'}</span>
                </div>
             </div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            {/* Acciones si fueran necesarias */}
          </div>
          <div className="relative w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por Nombre, SKU o DCI..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-lg border-gray-200 border pl-10 pr-4 py-2 text-xs font-bold focus:border-[#4C3073] focus:ring-4 focus:ring-purple-50 outline-none transition-all" 
            />
          </div>
        </div>
      </div>

      {/* Tabla Estilo Odoo */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto / DCI</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Bioequivalente</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Condición</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Stock Local</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Otros Locales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4C3073] mb-4"></div>
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Sincronizando Stock...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-24 text-center">
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
                          <span className="font-black text-[#4C3073] uppercase tracking-tight group-hover:underline cursor-pointer">{product.name}</span>
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
                      <td className="px-6 py-4">
                        {getSaleConditionBadge(product.sale_condition)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-black ${stock.local <= 0 ? 'text-red-400' : 'text-gray-900'}`}>
                          {stock.local} <span className="text-[9px] font-bold text-gray-400 ml-1">UN</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Building2 size={10} className="text-gray-300" />
                          <span className="text-xs font-bold text-gray-400 italic">
                            {stock.other > 0 ? `${stock.other} UN` : '-'}
                          </span>
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
    </div>
  );
}
