import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ScrollText, Loader2 } from 'lucide-react';
import { fetchPharmacyProducts } from '../api/pharmacyClient';

export default function KardexIndex() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setLoading(true);
      try {
        const { data } = await fetchPharmacyProducts();
        if (!cancelled) setProducts(data || []);
      } catch (error) {
        console.error('Error cargando indice de Kardex:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProducts();
    return () => { cancelled = true; };
  }, []);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return products.filter(product => (
      product.name?.toLowerCase().includes(term)
      || product.dci?.toLowerCase().includes(term)
      || product.barcode?.includes(searchTerm)
      || product.barcode_purchase?.includes(searchTerm)
    ));
  }, [products, searchTerm]);

  return (
    <div className="p-6 md:p-8 bg-gray-50 min-h-full">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Inventario / Kardex</p>
              <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Kardex de Movimientos</h1>
              <p className="text-sm text-gray-500 mt-2">Selecciona un producto para abrir su libro mayor y trazabilidad de lotes.</p>
            </div>
            <div className="w-full md:w-80 relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, DCI o código"
                className="w-full rounded-xl border border-gray-200 pl-11 pr-4 py-3 text-sm outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <Loader2 size={28} className="animate-spin mx-auto mb-3 text-[#4C3073]" />
              <p className="text-sm font-black uppercase tracking-widest">Cargando catálogo...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <ScrollText size={40} className="mx-auto mb-3" />
              <p className="text-sm font-black uppercase tracking-widest">No hay productos para mostrar</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => navigate(`/kardex/${product.id}`)}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-black text-gray-900 uppercase">{product.name}</p>
                    <p className="text-xs text-gray-500 italic">{product.dci || 'Sin DCI'}{product.barcode ? ` · ${product.barcode}` : ''}</p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-xs font-black text-[#4C3073] uppercase">
                    Abrir Kardex
                    <ArrowRight size={14} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
