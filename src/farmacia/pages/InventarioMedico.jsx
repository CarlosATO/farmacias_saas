import React, { useState, useEffect } from 'react';
import { Pill, Search, ShieldAlert, ChevronRight, BadgeInfo } from 'lucide-react';
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
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm">
      <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shrink-0">
        <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-widest font-bold">
          <span>Farmacia</span>
          <ChevronRight size={12} className="mx-1" />
          <span className="text-gray-900">Inventario Médico (ISP)</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            {/* Buttons space if needed */}
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por Nombre o DCI..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-sm border-gray-300 border pl-8 pr-3 py-1.5 text-xs focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all" 
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/30">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Producto</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">DCI (Principio Activo)</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Reg. ISP</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Bioequivalente</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Condición Venta</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-20 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4C3073] mb-4"></div>
                    <p className="text-gray-500 font-medium">Cargando inventario...</p>
                  </div>
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-20 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <ShieldAlert size={48} className="mb-4 opacity-50" />
                    <p className="text-lg font-bold text-gray-600">No se encontraron medicamentos</p>
                    <p className="text-sm mt-1">Ajusta los términos de búsqueda.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-bold text-[#4C3073]">{product.name}</p>
                      {(product.concentration || product.dosage) && (
                        <p className="text-xs text-gray-500 mt-0.5">{product.concentration || product.dosage}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-gray-700">
                    {product.dci || product.active_principle || '-'}
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-sm border border-gray-200">{product.isp_registry || product.registry_number || '-'}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {product.is_bioequivalent ? (
                      <div className="flex justify-center" title="Medicamento Bioequivalente">
                          <div className="bg-yellow-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded border border-yellow-500 shadow-sm inline-flex items-center justify-center">
                            <span>BIO</span>
                          </div>
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {getSaleConditionBadge(product.sale_condition)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className={`font-black text-lg ${
                      (product.stock || product.stock_quantity || 0) <= 0 
                        ? 'text-red-500' 
                        : 'text-gray-900'
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
    </div>
  );
}
