import React, { useState, useEffect } from 'react';
import { Pill, Search, ShieldAlert, BadgeInfo } from 'lucide-react';
import { fetchPharmacyProducts } from '../api/pharmacyClient';
import { supabase } from '../../api/supabaseClient';

export default function InventarioMedico() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadInventory = async () => {
      setLoading(true);
      try {
        // 🔥 LOG DE DIAGNÓSTICO: Verificando identidad y empresa actual antes de consultar
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log("🔒 Autenticación Activa:");
          console.log(" - User ID:", session.user.id);
          console.log(" - Rol de App:", session.user.app_metadata?.role || 'N/A');
          console.log(" - Company ID:", session.user.app_metadata?.company_id || 'SIN COMPANY_ID (RLS podría fallar)');
        } else {
          console.error("⚠️ No hay sesión activa detectada en el cliente.");
        }

        const { data, error } = await fetchPharmacyProducts();
        
        console.log("=== DEBUG FROM SUPABASE PHARMACY SCHEMA ===");
        console.log("Response Data:", data);
        console.log("Response Error:", error);
        console.log("===========================================");

        if (error) {
          console.error("Error fetching pharmacy products:", error);
        } else {
          setProducts(data || []);
        }
      } catch (err) {
        console.error("Exception loading inventory:", err);
      } finally {
        setLoading(false);
      }
    };
    
    loadInventory();
  }, []);

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase();
    const nameMatch = p.name?.toLowerCase().includes(term);
    const dciMatch = (p.dci || p.active_principle)?.toLowerCase().includes(term);
    return nameMatch || dciMatch;
  });

  const getSaleConditionBadge = (condition) => {
    switch (condition) {
      case 'VD':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-green-100 text-green-800 tracking-wider">VD (Venta Directa)</span>;
      case 'R':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-yellow-100 text-yellow-800 tracking-wider">R (Receta)</span>;
      case 'RR':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-black bg-red-100 text-red-800 tracking-wider">RR (Receta Retenida)</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 tracking-wider">{condition || 'N/A'}</span>;
    }
  };

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 text-emerald-700 mb-1">
            <Pill size={28} className="stroke-[2.5px]" />
            <h1 className="text-2xl font-black tracking-tight">Inventario Médico (ISP)</h1>
          </div>
          <p className="text-slate-500 text-sm md:ml-10">Gestión de maestro de medicamentos y niveles de existencias.</p>
        </div>

        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-slate-400" />
          </div>
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-sm transition-all"
            placeholder="Buscar por Nombre o DCI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Data Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-[11px]">Producto</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-[11px]">DCI (Principio Activo)</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-[11px]">Reg. ISP</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-[11px] text-center">Bioequivalente</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-[11px]">Condición Venta</th>
                <th className="px-6 py-4 font-bold text-slate-600 uppercase tracking-wider text-[11px] text-right">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-4"></div>
                      <p className="text-slate-500 font-medium">Cargando catálogo del inventario...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <ShieldAlert size={48} className="mb-4 opacity-50" />
                      <p className="text-lg font-bold text-slate-600">No se encontraron medicamentos</p>
                      <p className="text-sm mt-1">Ajusta los términos de búsqueda o revisa la base de datos.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-bold text-slate-800">{product.name}</p>
                        {(product.concentration || product.dosage) && (
                          <p className="text-xs text-slate-500 mt-0.5">{product.concentration || product.dosage}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-600">{product.dci || product.active_principle || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{product.isp_registry || product.registry_number || '-'}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {product.is_bioequivalent ? (
                        <div className="flex justify-center" title="Medicamento Bioequivalente">
                           <div className="bg-yellow-400 text-black text-[10px] font-black px-1.5 py-0.5 rounded border border-yellow-500 shadow-sm inline-flex items-center justify-center h-5">
                             <span>BIO</span>
                           </div>
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {getSaleConditionBadge(product.sale_condition)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold text-base ${
                        (product.stock || product.stock_quantity || 0) <= 0 
                          ? 'text-red-500' 
                          : 'text-emerald-600'
                      }`}>
                        {product.stock || product.stock_quantity || 0}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info - record count */}
        {!loading && products.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
            <p>Mostrando <span className="font-bold text-slate-700">{filteredProducts.length}</span> producto(s).</p>
          </div>
        )}
      </div>
    </div>
  );
}
