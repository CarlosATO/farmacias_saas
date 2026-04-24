import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Loader2, DollarSign, TrendingUp, TrendingDown, ChevronRight, AlertCircle, Filter, CheckSquare, Square, Calculator, Save, Info, Tag, MapPin } from 'lucide-react';
import { fetchPharmacyProducts, getPharmacySchema } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';

export default function GestionPrecios() {
    const { activeWarehouse } = useSucursal();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [strategy, setStrategy] = useState('average'); // 'average' | 'last'
    
    // New States for Bulk Actions & Filters
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [targetMargin, setTargetMargin] = useState(30);
    const [suggestedPrices, setSuggestedPrices] = useState({});
    const [showCriticalOnly, setShowCriticalOnly] = useState(false);
    const [filters, setFilters] = useState({
        family: 'ALL',
        laboratory: 'ALL',
        prescription: 'ALL'
    });

    // New states for searchable filters
    const [familySearch, setFamilySearch] = useState('');
    const [labSearch, setLabSearch] = useState('');

    const loadProducts = useCallback(async () => {
        try {
            setLoading(true);
            // 1. Fetch Global Master Products (SaaS Isolated)
            const { data, error } = await fetchPharmacyProducts();
            if (error) throw error;
            
            // 2. Data enrichment logic (The 'Cruce') would go here
            // For now, restore the master list to fix the critical view error
            setProducts(data || []);
        } catch (err) {
            console.error("Error cargando precios:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    // Clear suggestions when switching strategy to avoid confusion
    useEffect(() => {
        setSuggestedPrices({});
    }, [strategy]);

    const handleClearFilters = () => {
        setFilters({ family: 'ALL', laboratory: 'ALL', prescription: 'ALL' });
        setFamilySearch('');
        setLabSearch('');
        setShowCriticalOnly(false);
        setSearchTerm('');
    };

    const handleUpdatePrice = async (productId, newPrice) => {
        try {
            const { error } = await getPharmacySchema()
                .from('products')
                .update({ unit_price: Number(newPrice) })
                .eq('id', productId);
            
            if (error) throw error;
            
            setProducts(prev => prev.map(p => 
                p.id === productId ? { ...p, unit_price: Number(newPrice) } : p
            ));
            
            // Clear suggestion if saved
            setSuggestedPrices(prev => {
                const next = { ...prev };
                delete next[productId];
                return next;
            });
        } catch (err) {
            console.error("Error actualizando precio:", err);
            alert("No se pudo actualizar el precio.");
        }
    };

    const calculateMargin = (price, cost) => {
        if (!price || price <= 0) return 0;
        return ((price - cost) / price) * 100;
    };

    const getTargetPrice = (cost, marginPercent) => {
        if (marginPercent >= 100) return cost * 2; // Safety fallback
        return cost / (1 - (marginPercent / 100));
    };

    // Derived Data for Filters
    const uniqueFamilies = useMemo(() => {
        const families = [...new Set(products.map(p => p.family).filter(Boolean))];
        if (!familySearch) return ['ALL', ...families];
        return ['ALL', ...families.filter(f => f.toLowerCase().includes(familySearch.toLowerCase()))];
    }, [products, familySearch]);

    const uniqueLabs = useMemo(() => {
        const labs = [...new Set(products.map(p => p.laboratory_name).filter(Boolean))];
        if (!labSearch) return ['ALL', ...labs];
        return ['ALL', ...labs.filter(l => l.toLowerCase().includes(labSearch.toLowerCase()))];
    }, [products, labSearch]);

    const prescriptionTypes = ['ALL', 'VENTA_LIBRE', 'RECETA_SIMPLE', 'RECETA_RETENIDA', 'RECETA_CHEQUE'];

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.barcode && p.barcode.includes(searchTerm));
            const matchesFamily = filters.family === 'ALL' || p.family === filters.family;
            const matchesLab = filters.laboratory === 'ALL' || p.laboratory_name === filters.laboratory;
            const matchesPrescription = filters.prescription === 'ALL' || p.prescription_type === filters.prescription;
            
            const currentCost = strategy === 'average' ? (p.average_cost || 0) : (p.last_cost || 0);
            const margin = calculateMargin(p.unit_price, currentCost);
            const matchesCritical = !showCriticalOnly || margin < 25;

            return matchesSearch && matchesFamily && matchesLab && matchesPrescription && matchesCritical;
        });
    }, [products, searchTerm, filters, showCriticalOnly, strategy]);

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredProducts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredProducts.map(p => p.id)));
        }
    };

    const toggleSelect = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleCalculateBulk = () => {
        const newSuggestions = { ...suggestedPrices };
        filteredProducts.forEach(p => {
            if (selectedIds.has(p.id)) {
                const cost = strategy === 'average' ? (p.average_cost || 0) : (p.last_cost || 0);
                if (cost > 0) {
                    newSuggestions[p.id] = Math.ceil(getTargetPrice(cost, targetMargin));
                }
            }
        });
        setSuggestedPrices(newSuggestions);
    };

    const handleApplyBulk = async () => {
        // Map over selected IDs and find those that have a suggestion
        const idsToUpdate = Array.from(selectedIds).filter(id => suggestedPrices[id] !== undefined);
        
        if (idsToUpdate.length === 0) {
            alert("No hay precios sugeridos calculados para los ítems seleccionados.");
            return;
        }
        
        if (!confirm(`¿Aplicar ${idsToUpdate.length} nuevos precios a la base de datos?`)) return;

        setLoading(true);
        try {
            const schema = getPharmacySchema();
            // We do individual updates for now (Supabase doesn't have a bulk update by ID easily in a single call without RPC)
            for (const id of idsToUpdate) {
                const newPrice = suggestedPrices[id];
                const { error } = await schema.from('products').update({ unit_price: newPrice }).eq('id', id);
                if (error) throw error;
            }
            
            alert("Precios actualizados exitosamente.");
            await loadProducts();
            setSuggestedPrices({});
            setSelectedIds(new Set());
        } catch (err) {
            console.error("Error en actualización masiva:", err);
            alert("Hubo un error al aplicar los precios. Por favor, intente de nuevo.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm">
            
            {/* Left Sidebar Filters */}
            <div className="w-64 border-r border-gray-200 bg-white flex flex-col shrink-0 overflow-y-auto">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between font-black text-[#4C3073] uppercase tracking-tighter">
                    <div className="flex items-center gap-2">
                        <Filter size={16} /> Filtros
                    </div>
                    <button 
                        onClick={handleClearFilters}
                        className="text-[9px] text-gray-400 hover:text-red-500 transition-colors uppercase border border-gray-200 px-2 py-0.5 rounded shadow-sm bg-gray-50"
                    >
                        Limpiar
                    </button>
                </div>
                
                <div className="p-4 space-y-6">
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Familia Terapéutica</label>
                        <div className="relative mb-2">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
                            <input 
                                type="text"
                                placeholder="Escribe para buscar..."
                                value={familySearch}
                                onChange={e => setFamilySearch(e.target.value)}
                                className="w-full pl-7 pr-2 py-1.5 border border-gray-100 rounded-sm text-[11px] outline-none bg-gray-50 focus:bg-white focus:border-[#4C3073] transition-all"
                            />
                        </div>
                        <select 
                            value={filters.family} 
                            onChange={e => setFilters(prev => ({ ...prev, family: e.target.value }))}
                            className="w-full border border-gray-200 rounded-sm p-2 text-xs outline-none focus:border-[#4C3073]"
                            size={uniqueFamilies.length > 1 ? 5 : 1}
                        >
                            {uniqueFamilies.map(f => <option key={f} value={f} className="py-1">{f === 'ALL' ? '--- Todas ---' : f}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Laboratorio / Proveedor</label>
                        <div className="relative mb-2">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
                            <input 
                                type="text"
                                placeholder="Escribe para buscar..."
                                value={labSearch}
                                onChange={e => setLabSearch(e.target.value)}
                                className="w-full pl-7 pr-2 py-1.5 border border-gray-100 rounded-sm text-[11px] outline-none bg-gray-50 focus:bg-white focus:border-[#4C3073] transition-all"
                            />
                        </div>
                        <select 
                            value={filters.laboratory} 
                            onChange={e => setFilters(prev => ({ ...prev, laboratory: e.target.value }))}
                            className="w-full border border-gray-200 rounded-sm p-2 text-xs outline-none focus:border-[#4C3073]"
                            size={uniqueLabs.length > 1 ? 5 : 1}
                        >
                            {uniqueLabs.map(l => <option key={l} value={l} className="py-1">{l === 'ALL' ? '--- Todos ---' : l}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Tipo de Receta</label>
                        <select 
                            value={filters.prescription} 
                            onChange={e => setFilters(prev => ({ ...prev, prescription: e.target.value }))}
                            className="w-full border border-gray-200 rounded-sm p-2 text-xs outline-none focus:border-[#4C3073]"
                        >
                            {prescriptionTypes.map(t => <option key={t} value={t}>{t === 'ALL' ? '--- Todas ---' : t.replace('_', ' ')}</option>)}
                        </select>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div 
                                onClick={() => setShowCriticalOnly(!showCriticalOnly)}
                                className={`w-10 h-5 rounded-full relative transition-all ${showCriticalOnly ? 'bg-red-500' : 'bg-gray-200'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showCriticalOnly ? 'left-6' : 'left-1'}`}></div>
                            </div>
                            <span className="text-xs font-bold text-gray-600 group-hover:text-red-600 transition-colors">Solo Margen Crítico</span>
                        </label>
                        <p className="text-[10px] text-gray-400 mt-2 leading-tight">Muestra productos con rentabilidad inferior al 25%.</p>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
                
                {/* Top Actions Bar */}
                <div className="border-b border-gray-200 p-4 bg-white space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-widest font-bold">
                            <span>Gestión Gerencial</span>
                            <ChevronRight size={12} className="mx-1" />
                            <span className="text-gray-900">Precios y Márgenes</span>
                        </div>

                        <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-sm">
                            <MapPin size={14} className="text-[#4C3073]" />
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-gray-400 uppercase leading-none">Local</span>
                                <span className="text-[10px] font-black text-[#4C3073] uppercase">{activeWarehouse?.name || '---'}</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                             <div className="bg-amber-50 border border-amber-200 rounded px-3 py-1 flex items-center gap-2 text-amber-700">
                                <Info size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-tight">
                                    {strategy === 'last' 
                                        ? "Último Costo: Protege la rentabilidad contra alzas recientes" 
                                        : "Costo Promedio: Suaviza el impacto de precios al cliente"}
                                </span>
                             </div>
                             <div className="flex items-center gap-1 bg-gray-100 p-1 rounded border border-gray-200">
                                <button onClick={() => setStrategy('average')} className={`px-3 py-1 text-[10px] font-bold uppercase rounded ${strategy === 'average' ? 'bg-white shadow-sm text-[#4C3073]' : 'text-gray-400 hover:text-gray-600'}`}>Costo Promedio</button>
                                <button onClick={() => setStrategy('last')} className={`px-3 py-1 text-[10px] font-bold uppercase rounded ${strategy === 'last' ? 'bg-white shadow-sm text-[#4C3073]' : 'text-gray-400 hover:text-gray-600'}`}>Último Costo</button>
                             </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="relative w-72">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Buscar en resultados..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                className="w-full border border-gray-200 rounded-sm pl-9 pr-3 py-2 text-xs outline-none focus:border-[#4C3073]"
                            />
                        </div>

                        <div className="flex-1 flex items-center justify-end gap-3 border-l border-gray-100 pl-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Margen Obj %</span>
                                <input 
                                    type="number" 
                                    value={targetMargin} 
                                    onChange={e => setTargetMargin(e.target.value)}
                                    className="w-16 border border-gray-300 rounded-sm px-2 py-1.5 text-xs font-black text-[#4C3073] text-center"
                                />
                            </div>
                            <button 
                                onClick={handleCalculateBulk}
                                disabled={selectedIds.size === 0}
                                className="bg-white border border-[#4C3073] text-[#4C3073] px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-wider hover:bg-purple-50 transition-colors flex items-center gap-2 disabled:opacity-30"
                            >
                                <Calculator size={14} /> Calcular para {selectedIds.size} ítems
                            </button>

                            {Object.keys(suggestedPrices).length > 0 && (
                                <button 
                                    onClick={() => setSuggestedPrices({})}
                                    className="text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors uppercase px-2"
                                >
                                    Limpiar Sugerencias
                                </button>
                            )}

                            <button 
                                onClick={handleApplyBulk}
                                disabled={Object.keys(suggestedPrices).length === 0}
                                className="bg-[#4C3073] text-white px-4 py-1.5 rounded-sm text-[10px] font-black uppercase tracking-wider hover:bg-[#3d265c] transition-colors flex items-center gap-2 disabled:opacity-30 shadow-lg shadow-purple-900/10"
                            >
                                <Save size={14} /> Aplicar Nuevos Precios
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table Area */}
                <div className="flex-1 overflow-auto relative">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 bg-white">
                             <Loader2 className="animate-spin text-[#4C3073]" size={32} />
                             <span className="text-[10px] font-bold uppercase tracking-widest">Sincronizando motor financiero...</span>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse table-fixed">
                            <thead className="bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-20">
                                <tr>
                                    <th className="w-12 px-4 py-3">
                                        <button onClick={toggleSelectAll} className="text-gray-400 hover:text-[#4C3073] transition-colors">
                                            {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? <CheckSquare size={18} className="text-[#4C3073]" /> : <Square size={18} />}
                                        </button>
                                    </th>
                                    <th className="w-64 px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Producto</th>
                                    <th className="w-32 px-4 py-3 text-[10px] font-bold text-[#4C3073] uppercase tracking-widest text-right bg-purple-50/10 border-x border-purple-100/30">
                                        {strategy === 'average' ? 'Costo Promedio (PPP)' : 'Último Costo'}
                                    </th>
                                    <th className="w-32 px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Precio Actual</th>
                                    <th className="w-32 px-4 py-3 text-[10px] font-bold text-[#4C3073] uppercase tracking-widest text-right bg-purple-50/50 italic border-l border-r border-purple-100">Sugerido DX</th>
                                    <th className="w-24 px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Margen</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Familia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredProducts.map(p => {
                                    const currentCost = strategy === 'average' ? (p.average_cost || 0) : (p.last_cost || 0);
                                    const margin = calculateMargin(p.unit_price, currentCost);
                                    const isLowMargin = margin < 25;
                                    const suggestion = suggestedPrices[p.id];
                                    const suggestionMargin = suggestion ? calculateMargin(suggestion, currentCost) : null;

                                    return (
                                        <tr key={p.id} className={`hover:bg-gray-50 transition-colors group ${selectedIds.has(p.id) ? 'bg-blue-50/20' : ''}`}>
                                            <td className="px-4 py-3">
                                                <button onClick={() => toggleSelect(p.id)} className="text-gray-300 hover:text-[#4C3073]">
                                                    {selectedIds.has(p.id) ? <CheckSquare size={18} className="text-[#4C3073]" /> : <Square size={18} />}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 overflow-hidden">
                                                <div className="font-bold text-gray-900 truncate uppercase tracking-tight" title={p.name}>{p.name}</div>
                                                <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{p.laboratory_name || 'SIN LABORATORIO'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold bg-purple-50/5 border-x border-purple-100/20">
                                                {currentCost === 0 ? (
                                                    <span className="text-[9px] text-amber-500 bg-amber-50 px-1 py-0.5 border border-amber-100 rounded">S.H.</span>
                                                ) : (
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-gray-900">${Math.round(currentCost).toLocaleString('es-CL')}</span>
                                                        <span className="text-[8px] text-gray-400 font-sans uppercase tracking-tighter">Ref. {strategy === 'average' ? 'Promedio' : 'Último'}</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="relative inline-block w-full">
                                                    <input 
                                                        type="number"
                                                        defaultValue={p.unit_price}
                                                        onBlur={(e) => handleUpdatePrice(p.id, e.target.value)}
                                                        className={`w-full text-right bg-transparent border-b-2 border-transparent group-hover:border-gray-300 focus:border-[#4C3073] outline-none py-1 font-black text-sm ${Number(p.unit_price) === 0 ? 'text-red-500' : 'text-[#4C3073]'}`}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right bg-purple-50/30 border-l border-r border-purple-100/50">
                                                {suggestion ? (
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-black text-[#4C3073] text-sm">${suggestion.toLocaleString('es-CL')}</span>
                                                        <span className="text-[9px] font-bold text-emerald-600">+{suggestionMargin.toFixed(1)}%</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300 text-[10px]">---</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-black border ${
                                                    isLowMargin ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                }`}>
                                                    {isLowMargin ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                                                    {margin.toFixed(1)}%
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full truncate inline-block max-w-[120px] uppercase">
                                                    {p.family || 'S/F'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer Selection Summary */}
                <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <div className="flex gap-4 items-center">
                        <span className="bg-[#4C3073] text-white px-2 py-1 rounded-sm">{selectedIds.size} Seleccionados</span>
                        <span className="text-gray-300">|</span>
                        <span>Total Items en Vista: {filteredProducts.length}</span>
                    </div>
                    <div className="flex gap-4">
                        <span className="flex items-center gap-2">
                             <div className="w-3 h-3 bg-red-500 rounded-full shadow-sm"></div> Crítico
                        </span>
                        <span className="flex items-center gap-2">
                             <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-sm"></div> Saludable
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
