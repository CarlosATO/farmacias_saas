import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, Loader2, TrendingUp, TrendingDown, ChevronRight, Filter, CheckSquare, Square, Calculator, Save, Info, RefreshCw } from 'lucide-react';
import { fetchWarehouses, fetchPricingMatrix, bulkUpsertBranchPrices, saveBranchPriceConfig, updateCorporatePrice } from '../api/pharmacyClient';
import PriceSyncPanel from '../components/PriceSyncPanel';
import { roundPrice } from '../utils/pricing/roundPrice';

const ROUND_STEP_OPTIONS = [10, 50, 100, 500, 1000];
const ROUND_MODE_OPTIONS = [
    { value: 'nearest', label: 'Más cercano' },
    { value: 'up', label: 'Hacia arriba' },
    { value: 'down', label: 'Hacia abajo' },
];

export default function GestionPrecios() {
    const [products, setProducts] = useState([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isSavingPrices, setIsSavingPrices] = useState(false);
    const [savingProductIds, setSavingProductIds] = useState(new Set());
    const [saveError, setSaveError] = useState('');
    const [saveToast, setSaveToast] = useState(null);
    const saveToastTimerRef = useRef(null);
    const [isSyncingPrices, setIsSyncingPrices] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [strategy, setStrategy] = useState('average'); // 'average' | 'last'
    
    // New States for Bulk Actions & Filters
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [targetMargin, setTargetMargin] = useState(30);
    const [suggestedPrices, setSuggestedPrices] = useState({});
    const [roundingEnabled, setRoundingEnabled] = useState(false);
    const [roundStep, setRoundStep] = useState(10);
    const [roundMode, setRoundMode] = useState('nearest');
    const [showCriticalOnly, setShowCriticalOnly] = useState(false);
    const [filters, setFilters] = useState({
        family: 'ALL',
        laboratory: 'ALL',
        prescription: 'ALL'
    });

    // New states for searchable filters
    const [familySearch, setFamilySearch] = useState('');
    const [labSearch, setLabSearch] = useState('');

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);
    const [localPriceDrafts, setLocalPriceDrafts] = useState({});
    const [corporatePriceDrafts, setCorporatePriceDrafts] = useState({});

    const [selectedProductForModal, setSelectedProductForModal] = useState(null);
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [showSyncPanel, setShowSyncPanel] = useState(false);
    const [syncOriginId, setSyncOriginId] = useState('');
    const [syncDestinationId, setSyncDestinationId] = useState('');

    const pushToast = useCallback((type, message) => {
        setSaveToast({ type, message });
        if (saveToastTimerRef.current) {
            clearTimeout(saveToastTimerRef.current);
        }
        saveToastTimerRef.current = setTimeout(() => {
            setSaveToast(null);
            saveToastTimerRef.current = null;
        }, 3500);
    }, []);

    useEffect(() => () => {
        if (saveToastTimerRef.current) clearTimeout(saveToastTimerRef.current);
    }, []);

    const loadData = useCallback(async ({ silent = false } = {}) => {
        try {
            if (!silent) setIsInitialLoading(true);
            const [warehousesRes, matrixRes] = await Promise.all([
                fetchWarehouses(),
                fetchPricingMatrix('', 250),
            ]);

            if (warehousesRes.error) throw warehousesRes.error;
            if (matrixRes.error) throw matrixRes.error;

            setWarehouses(warehousesRes.data || []);

            const normalizedRows = (matrixRes.data || []).map((row) => ({
                id: row.product_id,
                name: row.product_name,
                barcode: row.barcode,
                family: row.family,
                laboratory_name: row.laboratory_name,
                dci: row.dci,
                average_cost: Number(row.average_cost || 0),
                last_cost: Number(row.last_cost || 0),
                corporatePrice: Number(row.corporate_price || 0),
                corporateMarginPercent: row.corporate_margin_percent,
                warehouses: Array.isArray(row.warehouses) ? row.warehouses : [],
            }));

            setProducts(normalizedRows);
        } catch (err) {
            console.error("Error cargando precios:", err);
        } finally {
            if (!silent) setIsInitialLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        setSuggestedPrices({});
        setSelectedIds(new Set());
        setLocalPriceDrafts({});
        setCorporatePriceDrafts({});
    }, [loadData]);

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

    const getWarehousePricing = useCallback((product, warehouseId) => (product?.warehouses || []).find((entry) => entry.warehouse_id === warehouseId) || null, []);

    const openProductModal = useCallback((product) => {
        setSelectedProductForModal(product);
        setShowSyncPanel(false);
        setSelectedRowId(product.id);
    }, []);

    const handleRowDoubleClick = useCallback((product) => {
        openProductModal(product);
    }, [openProductModal]);

    const replaceProductPricing = useCallback((product, warehouseId, nextPrice, useLocalPrice) => {
        const nextPriceValue = Number(nextPrice) || 0;
        const nextCorporatePrice = useLocalPrice ? Number(product.corporatePrice || 0) : nextPriceValue;

        return {
            ...product,
            corporatePrice: nextCorporatePrice,
            warehouses: (product.warehouses || []).map((entry) => {
                if (entry.warehouse_id !== warehouseId) return entry;

                if (!useLocalPrice) {
                    return {
                        ...entry,
                        use_local_price: false,
                        override_sale_price: null,
                        effective_price: nextCorporatePrice,
                        pricing_source: 'CORPORATE',
                    };
                }

                return {
                    ...entry,
                    use_local_price: true,
                    override_sale_price: nextPriceValue,
                    effective_price: nextPriceValue,
                    pricing_source: 'LOCAL',
                };
            }).map((entry) => {
                if (entry.warehouse_id === warehouseId) return entry;
                if (useLocalPrice) return entry;
                const usesLocal = Boolean(entry.use_local_price && entry.active);
                return usesLocal ? entry : {
                    ...entry,
                    effective_price: nextCorporatePrice,
                    pricing_source: 'CORPORATE',
                };
            }),
        };
    }, []);

    const replaceCorporatePrice = useCallback((product, nextPrice) => {
        const nextCorporatePrice = Number(nextPrice) || 0;
        return {
            ...product,
            corporatePrice: nextCorporatePrice,
            warehouses: (product.warehouses || []).map((entry) => {
                const usesLocal = Boolean(entry.use_local_price && entry.active);
                if (usesLocal) return entry;
                return {
                    ...entry,
                    effective_price: nextCorporatePrice,
                    pricing_source: 'CORPORATE',
                };
            }),
        };
    }, []);

    const setSavingIds = useCallback((ids) => {
        setSavingProductIds(new Set(ids));
    }, []);

    // eslint-disable-next-line no-unused-vars
    const handleStartCorporatePriceEdit = (productId, currentValue) => {
        setCorporatePriceDrafts(prev => ({
            ...prev,
            [productId]: currentValue,
        }));
    };

    // eslint-disable-next-line no-unused-vars
    const handleChangeCorporatePriceDraft = (productId, value) => {
        setCorporatePriceDrafts(prev => ({
            ...prev,
            [productId]: value,
        }));
    };

    // eslint-disable-next-line no-unused-vars
    const handleCancelCorporatePriceDraft = (productId) => {
        setCorporatePriceDrafts(prev => {
            const next = { ...prev };
            delete next[productId];
            return next;
        });
    };

    // eslint-disable-next-line no-unused-vars
    const handleSaveCorporatePrice = async (productId, draftValue) => {
        const parsed = Math.round(Number(draftValue));
        if (isNaN(parsed) || parsed < 0) {
            alert('Ingresa un precio corporativo válido.');
            return;
        }

        const snapshot = products.find((p) => p.id === productId) || null;
        if (!snapshot) return;

        setSaveError('');
        setSavingIds([productId]);
        setProducts((prev) => prev.map((p) => (p.id === productId ? replaceCorporatePrice(p, parsed) : p)));

        try {
            const { error } = await updateCorporatePrice(productId, parsed);
            if (error) throw error;

            setCorporatePriceDrafts(prev => {
                const next = { ...prev };
                delete next[productId];
                return next;
            });
            pushToast('success', 'Precio corporativo actualizado correctamente');
            await loadData({ silent: true });
        } catch (err) {
            console.error('Error actualizando precio corporativo:', err.message, err);
            setProducts((prev) => prev.map((p) => (p.id === productId ? snapshot : p)));
            const message = 'No se pudo actualizar el precio corporativo.';
            setSaveError(message);
            pushToast('error', message);
            alert(message);
        } finally {
            setSavingProductIds(new Set());
        }
    };

    const handleStartLocalPriceEdit = (productId, warehouseId, currentValue) => {
        setLocalPriceDrafts(prev => ({
            ...prev,
            [`${productId}:${warehouseId}`]: currentValue,
        }));
    };

    const handleActivateWarehousePriceCell = (productId, warehouseId, currentValue) => {
        setSelectedRowId(productId);
        setSelectedWarehouseId(warehouseId);
        handleStartLocalPriceEdit(productId, warehouseId, currentValue);
    };

    const handleChangeLocalPriceDraft = (productId, warehouseId, value) => {
        setLocalPriceDrafts(prev => ({
            ...prev,
            [`${productId}:${warehouseId}`]: value,
        }));
    };

    const handleCancelLocalPriceDraft = (productId, warehouseId) => {
        setLocalPriceDrafts(prev => {
            const next = { ...prev };
            delete next[`${productId}:${warehouseId}`];
            return next;
        });
    };

    const handleSaveLocalPriceDraft = async (productId, warehouseId) => {
        const draftValue = localPriceDrafts[`${productId}:${warehouseId}`];
        const parsed = Math.round(Number(draftValue));
        if (isNaN(parsed) || parsed < 0) {
            alert('Ingresa un precio local válido.');
            return;
        }

        const snapshot = products.find((p) => p.id === productId) || null;
        if (!snapshot) return;

        setSaveError('');
        setSavingIds([productId]);
        setProducts((prev) => prev.map((p) => (p.id === productId ? replaceProductPricing(p, warehouseId, parsed, true) : p)));

        try {
            const { error } = await saveBranchPriceConfig({
                productId,
                warehouseId,
                useLocalPrice: true,
                overrideSalePrice: parsed,
                active: true,
            });
            if (error) throw error;

            setLocalPriceDrafts(prev => {
                const next = { ...prev };
                delete next[`${productId}:${warehouseId}`];
                return next;
            });
            pushToast('success', 'Precio local actualizado correctamente');
            await loadData({ silent: true });
        } catch (err) {
            console.error('Error guardando precio local:', err.message, err);
            setProducts((prev) => prev.map((p) => (p.id === productId ? snapshot : p)));
            const message = 'No se pudo guardar el precio local.';
            setSaveError(message);
            pushToast('error', message);
            alert(message);
        } finally {
            setSavingProductIds(new Set());
        }
    };

    const handleRestoreCorporatePrice = async (productId, warehouseId) => {
        const snapshot = products.find((p) => p.id === productId) || null;
        if (!snapshot) return;

        setSaveError('');
        setSavingIds([productId]);
        setProducts((prev) => prev.map((p) => (p.id === productId ? replaceProductPricing(p, warehouseId, p.corporatePrice || 0, false) : p)));

        try {
            const { error } = await saveBranchPriceConfig({
                productId,
                warehouseId,
                useLocalPrice: false,
                overrideSalePrice: null,
                active: true,
            });
            if (error) throw error;

            setLocalPriceDrafts(prev => {
                const next = { ...prev };
                delete next[`${productId}:${warehouseId}`];
                return next;
            });
            pushToast('success', 'Se volvió a precio corporativo');
            await loadData({ silent: true });
        } catch (err) {
            console.error('Error restaurando corporativo:', err.message, err);
            setProducts((prev) => prev.map((p) => (p.id === productId ? snapshot : p)));
            const message = 'No se pudo volver a corporativo.';
            setSaveError(message);
            pushToast('error', message);
            alert(message);
        } finally {
            setSavingProductIds(new Set());
        }
    };

    const calculateMargin = (price, cost) => {
        if (!price || price <= 0) return 0;
        return ((price - cost) / price) * 100;
    };

    const getTargetPrice = (cost, marginPercent) => {
        if (marginPercent >= 100) return cost * 2; 
        return cost / (1 - (marginPercent / 100));
    };

    const buildSuggestion = useCallback((cost) => {
        if (!Number.isFinite(cost) || cost <= 0) return null;

        const calculatedPrice = Math.ceil(getTargetPrice(cost, Number(targetMargin) || 0));
        if (!Number.isFinite(calculatedPrice) || calculatedPrice <= 0) return null;

        const roundedPrice = roundingEnabled
            ? roundPrice(calculatedPrice, roundStep, roundMode)
            : calculatedPrice;

        const finalPrice = Math.max(0, Math.round(Number(roundedPrice)));
        const difference = finalPrice - calculatedPrice;
        const estimatedMargin = calculateMargin(finalPrice, cost);

        return {
            calculatedPrice,
            roundedPrice: finalPrice,
            difference,
            estimatedMargin,
            roundingApplied: roundingEnabled,
            roundStep,
            roundMode,
        };
    }, [roundMode, roundStep, roundingEnabled, targetMargin]);

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
            const selectedCell = selectedWarehouseId ? getWarehousePricing(p, selectedWarehouseId) : null;
            const effectivePrice = selectedCell
                ? Number(selectedCell?.effective_price ?? p.corporatePrice ?? 0)
                : Number(p.corporatePrice ?? 0);
            const margin = calculateMargin(effectivePrice, currentCost);
            const matchesCritical = !showCriticalOnly || !selectedWarehouseId || margin < 25;

            return matchesSearch && matchesFamily && matchesLab && matchesPrescription && matchesCritical;
        });
    }, [products, searchTerm, filters, showCriticalOnly, strategy, selectedWarehouseId, getWarehousePricing]);

    const buildSyncCandidates = useCallback(({ originId, destinationId, copyMode, overridePolicy }) => {
        const scope = copyMode === 'FILTERED' ? filteredProducts : products;
        const candidates = [];

        scope.forEach((product) => {
            const originCell = getWarehousePricing(product, originId);
            const destinationCell = getWarehousePricing(product, destinationId);
            const sourcePrice = Number(originCell?.effective_price ?? product.corporatePrice ?? 0) || 0;
            const destinationPrice = Number(destinationCell?.effective_price ?? 0) || 0;
            const destinationHasLocalOverride = Boolean(destinationCell?.use_local_price && destinationCell?.active);

            if (sourcePrice <= 0) return;
            if (copyMode === 'ONLY_WITHOUT_PRICE' && destinationPrice > 0) return;
            if (overridePolicy === 'KEEP_OVERRIDES' && destinationHasLocalOverride) return;

            candidates.push({
                productId: product.id,
                price: sourcePrice,
                snapshot: product,
            });
        });

        return candidates;
    }, [filteredProducts, getWarehousePricing, products]);

    const runWithConcurrency = useCallback(async (items, limit, worker) => {
        const queue = [...items];
        const workers = Array.from({ length: Math.max(1, limit) }, async () => {
            while (queue.length > 0) {
                const item = queue.shift();
                if (!item) break;
                await worker(item);
            }
        });

        await Promise.all(workers);
    }, []);

    const handleApplyPriceSync = useCallback(async ({ syncOriginId, syncDestinationId, copyMode, overridePolicy }) => {
        if (!syncOriginId || !syncDestinationId) return;

        const candidates = buildSyncCandidates({
            originId: syncOriginId,
            destinationId: syncDestinationId,
            copyMode,
            overridePolicy,
        });

        if (!candidates.length) {
            pushToast('error', 'No hay precios para sincronizar.');
            return;
        }

        const snapshots = new Map(candidates.map((item) => [item.productId, item.snapshot]));
        setSaveError('');
        setIsSyncingPrices(true);
        setSavingIds(candidates.map((item) => item.productId));
        setProducts((prev) => prev.map((product) => {
            const item = candidates.find((entry) => entry.productId === product.id);
            if (!item) return product;
            return replaceProductPricing(product, syncDestinationId, item.price, true);
        }));

        try {
            const settled = [];
            await runWithConcurrency(candidates, 8, async (item) => {
                const result = await saveBranchPriceConfig({
                    productId: item.productId,
                    warehouseId: syncDestinationId,
                    useLocalPrice: true,
                    overrideSalePrice: item.price,
                    active: true,
                });
                settled.push({ productId: item.productId, ok: !result?.error, error: result?.error || null });
            });

            const failedIds = settled.filter((item) => !item.ok).map((item) => item.productId);

            if (failedIds.length > 0) {
                setProducts((prev) => prev.map((product) => (failedIds.includes(product.id) ? (snapshots.get(product.id) || product) : product)));
                const message = `No se pudieron actualizar ${failedIds.length} precios. Se revirtieron esos cambios.`;
                setSaveError(message);
                pushToast('error', message);
            } else {
                const message = `${candidates.length} precios sincronizados correctamente`;
                setSaveError('');
                pushToast('success', message);
                setShowSyncPanel(false);
                setSyncOriginId('');
                setSyncDestinationId('');
            }

            await loadData({ silent: true });
        } catch (err) {
            console.error('Error sincronizando precios:', err.message, err);
            setProducts((prev) => prev.map((product) => (snapshots.get(product.id) ? snapshots.get(product.id) : product)));
            const message = 'Hubo un error al sincronizar precios.';
            setSaveError(message);
            pushToast('error', message);
        } finally {
            setIsSyncingPrices(false);
            setSavingProductIds(new Set());
        }
    }, [buildSyncCandidates, loadData, pushToast, replaceProductPricing, runWithConcurrency, setSavingIds]);

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
        if (!selectedWarehouseId) {
            alert('Seleccione un local para editar precios.');
            return;
        }
        const newSuggestions = { ...suggestedPrices };
        filteredProducts.forEach(p => {
            if (selectedIds.has(p.id)) {
                const cost = strategy === 'average' ? (p.average_cost || 0) : (p.last_cost || 0);
                const suggestion = buildSuggestion(cost);
                if (suggestion) newSuggestions[p.id] = suggestion;
            }
        });
        setSuggestedPrices(newSuggestions);
    };

    const handleApplyBulk = async () => {
        const idsToUpdate = Array.from(selectedIds).filter(id => suggestedPrices[id] !== undefined);
        if (idsToUpdate.length === 0) return;

        if (!selectedWarehouseId) {
            alert('Seleccione un local para editar precios.');
            return;
        }
        if (!confirm(`¿Aplicar ${idsToUpdate.length} nuevos precios para la columna activa?`)) return;

        const warehouseId = selectedWarehouseId;
        const validItems = idsToUpdate
            .map((id) => {
                const rawSuggestion = suggestedPrices[id];
                const rawPrice = rawSuggestion?.roundedPrice ?? rawSuggestion?.calculatedPrice ?? rawSuggestion;
                const parsedPrice = Math.round(Number(rawPrice));
                return { id, parsedPrice, rawPrice };
            })
            .filter((item) => {
                if (isNaN(item.parsedPrice) || item.parsedPrice < 0) {
                    console.warn(`Precio inválido para producto ${item.id}, saltando...`, { rawPrice: item.rawPrice });
                    return false;
                }
                return true;
            });

        if (!validItems.length) {
            setSaveError('No hay precios válidos para aplicar.');
            pushToast('error', 'No hay precios válidos para aplicar.');
            return;
        }

        const snapshots = new Map(validItems.map((item) => [item.id, products.find((p) => p.id === item.id)]));
        setSaveError('');
        setIsSavingPrices(true);
        setSavingIds(validItems.map((item) => item.id));
        setProducts((prev) => prev.map((product) => {
            const item = validItems.find((entry) => entry.id === product.id);
            if (!item) return product;
            return replaceProductPricing(product, warehouseId, item.parsedPrice, true);
        }));

        try {
            const { error } = await bulkUpsertBranchPrices(validItems.map((item) => ({
                productId: item.id,
                warehouseId,
                useLocalPrice: true,
                overrideSalePrice: item.parsedPrice,
                active: true,
            })));

            if (error) throw error;

            setSuggestedPrices((prev) => {
                const next = { ...prev };
                validItems.forEach((item) => delete next[item.id]);
                return next;
            });
            pushToast('success', `${validItems.length} precios actualizados correctamente`);

            loadData({ silent: true }).catch((loadErr) => {
                console.error('Error recargando precios después del bulk:', loadErr?.message, loadErr);
            });
        } catch (err) {
            console.error("Error en actualización masiva:", err.message, err);
            setProducts((prev) => prev.map((product) => snapshots.get(product.id) || product));
            const message = 'Hubo un error al aplicar los precios.';
            setSaveError(message);
            pushToast('error', message);
            alert(message);
        } finally {
            setIsSavingPrices(false);
            setSavingProductIds(new Set());
        }
    };

    return (
        <div className="flex h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-xs overflow-hidden border border-gray-200 rounded-sm shadow-sm relative">
            {saveToast && (
                <div className={`fixed top-4 right-4 z-50 rounded-sm border px-3 py-2 shadow-sm text-[10px] font-black uppercase tracking-widest ${saveToast.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {saveToast.message}
                </div>
            )}
            
            {/* Left Sidebar Filters - COMPACTED */}
            <div className="w-56 border-r border-gray-200 bg-white flex flex-col shrink-0 overflow-y-auto">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between font-black text-[#4C3073] uppercase tracking-tighter">
                    <div className="flex items-center gap-1.5 text-[11px]">
                        <Filter size={14} /> Filtros
                    </div>
                    <button 
                        onClick={handleClearFilters}
                        className="text-[9px] text-gray-400 hover:text-red-500 transition-colors uppercase border border-gray-200 px-1.5 py-0.5 rounded shadow-sm bg-gray-50"
                    >
                        Limpiar
                    </button>
                </div>
                
                <div className="p-3 space-y-3">
                    <div>
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Familia Terapéutica</label>
                        <div className="relative mb-1.5">
                            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
                            <input 
                                type="text"
                                placeholder="Buscar familia..."
                                value={familySearch}
                                onChange={e => setFamilySearch(e.target.value)}
                                className="w-full pl-6 pr-2 py-1 border border-gray-100 rounded-sm text-[10px] outline-none bg-gray-50 focus:bg-white focus:border-[#4C3073] transition-all"
                            />
                        </div>

                        <select 
                            value={filters.family} 
                            onChange={e => setFilters(prev => ({ ...prev, family: e.target.value }))}
                            className="w-full border border-gray-200 rounded-sm p-1.5 text-[10px] outline-none focus:border-[#4C3073]"
                            size={uniqueFamilies.length > 1 ? 4 : 1}
                        >
                            {uniqueFamilies.map(f => <option key={f} value={f} className="py-0.5">{f === 'ALL' ? '--- Todas ---' : f}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Laboratorio / Proveedor</label>
                        <div className="relative mb-1.5">
                            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
                            <input 
                                type="text"
                                placeholder="Buscar lab..."
                                value={labSearch}
                                onChange={e => setLabSearch(e.target.value)}
                                className="w-full pl-6 pr-2 py-1 border border-gray-100 rounded-sm text-[10px] outline-none bg-gray-50 focus:bg-white focus:border-[#4C3073] transition-all"
                            />
                        </div>
                        <select 
                            value={filters.laboratory} 
                            onChange={e => setFilters(prev => ({ ...prev, laboratory: e.target.value }))}
                            className="w-full border border-gray-200 rounded-sm p-1.5 text-[10px] outline-none focus:border-[#4C3073]"
                            size={uniqueLabs.length > 1 ? 4 : 1}
                        >
                            {uniqueLabs.map(l => <option key={l} value={l} className="py-0.5">{l === 'ALL' ? '--- Todos ---' : l}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Tipo de Receta</label>
                        <select 
                            value={filters.prescription} 
                            onChange={e => setFilters(prev => ({ ...prev, prescription: e.target.value }))}
                            className="w-full border border-gray-200 rounded-sm p-1.5 text-[10px] outline-none focus:border-[#4C3073]"
                        >
                            {prescriptionTypes.map(t => <option key={t} value={t}>{t === 'ALL' ? '--- Todas ---' : t.replace('_', ' ')}</option>)}
                        </select>
                    </div>

                    <div className="pt-3 border-t border-gray-100">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div 
                                onClick={() => selectedWarehouseId && setShowCriticalOnly(!showCriticalOnly)}
                                className={`w-8 h-4 rounded-full relative transition-all ${showCriticalOnly && selectedWarehouseId ? 'bg-red-500' : 'bg-gray-200'} ${selectedWarehouseId ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                            >
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${showCriticalOnly && selectedWarehouseId ? 'left-4.5' : 'left-0.5'}`}></div>
                            </div>
                            <span className={`text-[10px] font-bold transition-colors ${selectedWarehouseId ? 'text-gray-600 group-hover:text-red-600' : 'text-gray-400'}`}>Margen crítico del local seleccionado (&lt;25%)</span>
                        </label>
                        {!selectedWarehouseId && (
                            <p className="mt-1 text-[9px] text-amber-600 font-bold leading-tight">Seleccione un local para filtrar margen crítico.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Workspace Area */}
            <div className="flex-1 flex overflow-hidden bg-gray-50">
                {/* Left Table Panel */}
                <div className={`flex flex-col bg-white overflow-hidden transition-all duration-300 ease-in-out flex-1 min-w-0 ${(selectedProductForModal || showSyncPanel) ? 'border-r border-gray-200' : ''}`}>
                
                {/* Top Actions Bar - COMPACTED */}
                <div className="border-b border-gray-200 px-4 py-2 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                            <span>Gestión Gerencial</span>
                            <ChevronRight size={10} className="mx-1" />
                            <span className="text-[#4C3073]">Precios y Márgenes</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded border border-gray-200">
                                <button onClick={() => setStrategy('average')} className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${strategy === 'average' ? 'bg-white shadow-sm text-[#4C3073]' : 'text-gray-400 hover:text-gray-600'}`}>Costo Promedio</button>
                                <button onClick={() => setStrategy('last')} className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${strategy === 'last' ? 'bg-white shadow-sm text-[#4C3073]' : 'text-gray-400 hover:text-gray-600'}`}>Último Costo</button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 justify-between flex-wrap">
                        <div className="flex items-center gap-2">
                            <div className="relative w-48">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar en resultados..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full border border-gray-200 rounded-sm pl-7 pr-2 py-1 text-[10px] outline-none focus:border-[#4C3073] bg-white"
                                />
                            </div>
                            <div className="flex items-center gap-1.5 border border-gray-200 rounded-sm px-2 py-1 bg-white">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Margen obj.</span>
                                <input
                                    type="number"
                                    value={targetMargin}
                                    onChange={e => setTargetMargin(e.target.value)}
                                    disabled={!selectedWarehouseId}
                                    className="w-12 border border-gray-300 rounded-sm px-1 py-0.5 text-[10px] font-black text-[#4C3073] text-center outline-none focus:border-[#4C3073]"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 rounded-sm border border-gray-200 bg-white px-2 py-1">
                                <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={roundingEnabled}
                                        onChange={(e) => setRoundingEnabled(e.target.checked)}
                                        disabled={!selectedWarehouseId}
                                        className="h-3 w-3 rounded border-gray-300 text-[#4C3073] focus:ring-[#4C3073]"
                                    />
                                    Redondear
                                </label>
                                <div className="flex items-center gap-1">
                                    <select
                                        value={roundStep}
                                        onChange={(e) => setRoundStep(Number(e.target.value))}
                                        disabled={!roundingEnabled || !selectedWarehouseId}
                                        className="border border-gray-200 rounded-sm px-1 py-0.5 text-[9px] font-bold text-gray-700 disabled:opacity-50 outline-none"
                                    >
                                        {ROUND_STEP_OPTIONS.map((step) => (
                                            <option key={step} value={step}>${step.toLocaleString('es-CL')}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <select
                                        value={roundMode}
                                        onChange={(e) => setRoundMode(e.target.value)}
                                        disabled={!roundingEnabled || !selectedWarehouseId}
                                        className="border border-gray-200 rounded-sm px-1 py-0.5 text-[9px] font-bold text-gray-700 disabled:opacity-50 outline-none"
                                    >
                                        {ROUND_MODE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={handleCalculateBulk}
                                disabled={selectedIds.size === 0 || !selectedWarehouseId}
                                className="bg-white border border-[#4C3073] text-[#4C3073] px-3 py-1 rounded-sm text-[9px] font-black uppercase tracking-wider hover:bg-purple-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30"
                            >
                                <Calculator size={12} /> Calcular {selectedIds.size}
                            </button>

                            {Object.keys(suggestedPrices).length > 0 && (
                                <button
                                    onClick={() => setSuggestedPrices({})}
                                    className="text-[9px] font-bold text-gray-400 hover:text-red-500 transition-colors uppercase px-1"
                                >
                                    Limpiar
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    setShowSyncPanel(true);
                                    setSelectedProductForModal(null);
                                }}
                                className="bg-white border border-gray-300 text-gray-600 px-3 py-1 rounded-sm text-[9px] font-black uppercase tracking-wider hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                            >
                                <RefreshCw size={12} /> Sincronizar precios
                            </button>

                            <button
                                onClick={handleApplyBulk}
                                disabled={Object.keys(suggestedPrices).length === 0 || !selectedWarehouseId || isSavingPrices}
                                className="bg-[#4C3073] text-white px-3 py-1 rounded-sm text-[9px] font-black uppercase tracking-wider hover:bg-[#3d265c] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 shadow-sm"
                            >
                                {isSavingPrices ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {isSavingPrices ? 'Aplicando...' : 'Aplicar'}
                            </button>
                        </div>
                    </div>

                    {saveError && (
                        <div className="mt-2 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-red-700">
                            {saveError}
                        </div>
                    )}
                </div>

                {/* Table Area - COMPACTED ERP STYLE */}
                <div className="flex-1 overflow-auto relative">
                    {isInitialLoading ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 bg-white">
                             <Loader2 className="animate-spin text-[#4C3073]" size={24} />
                             <span className="text-[10px] font-bold uppercase tracking-widest">Sincronizando motor...</span>
                        </div>
                    ) : (
                        <table className="min-w-full table-fixed text-left border-collapse" style={{ width: `max(100%, ${700 + (warehouses.length * 110)}px)` }}>
                            <colgroup>
                                <col style={{ width: '36px' }} />
                                <col style={{ width: '220px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '90px' }} />
                                {warehouses.map((warehouse) => (
                                    <col key={warehouse.id} style={{ width: '100px' }} />
                                ))}
                                <col style={{ width: '100px' }} />
                            </colgroup>
                            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20 shadow-sm">
                                <tr>
                                    <th className="px-2 py-1.5 text-center">
                                        <button onClick={toggleSelectAll} className="text-gray-400 hover:text-[#4C3073] transition-colors">
                                            {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? <CheckSquare size={14} className="text-[#4C3073]" /> : <Square size={14} />}
                                        </button>
                                    </th>
                                    <th className="px-2 py-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Producto</th>
                                    <th className="px-2 py-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Laboratorio</th>
                                    <th className="px-2 py-1.5 text-[9px] font-bold text-[#4C3073] uppercase tracking-widest text-right bg-purple-50/20 border-x border-purple-100/30">Costo Ref.</th>
                                    {warehouses.map((warehouse) => (
                                        <th
                                            key={warehouse.id}
                                            className={`px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-right cursor-pointer transition-all duration-200 relative
                                            ${selectedWarehouseId === warehouse.id ? 'bg-[#4C3073]/10 text-[#4C3073] border-x border-[#4C3073]/20 shadow-inner' : 'text-gray-500 border-x border-gray-100 hover:bg-gray-100/50'}
                                            ${syncDestinationId === warehouse.id ? 'bg-[#F6F0FF] border-x-2 border-x-[#4C3073]/30 !text-[#4C3073] border-t-2 border-t-[#4C3073]' : ''}
                                            `}
                                            onClick={() => setSelectedWarehouseId(warehouse.id)}
                                            title={syncDestinationId === warehouse.id ? "LOCAL DESTINO (SYCHRONIZING)" : "Click para enfocar este local"}
                                        >
                                            <div className="truncate w-full flex flex-col items-end justify-center">
                                                {syncDestinationId === warehouse.id && (
                                                    <span className="text-[7px] font-black bg-[#4C3073] text-white px-1 rounded-sm mb-0.5 animate-pulse">DESTINO SYNC</span>
                                                )}
                                                <div className="flex items-center gap-1">
                                                    {syncDestinationId === warehouse.id && <RefreshCw size={8} className="animate-spin-slow" />}
                                                    {warehouse.name}
                                                </div>
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-2 py-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest border-l border-gray-100 text-center">Familia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredProducts.map(p => {
                                    const currentCost = strategy === 'average' ? (p.average_cost || 0) : (p.last_cost || 0);
                                    
                                    // Keep corporate calculations internal
                                    const corporatePrice = Number(p.corporatePrice || 0);
                                    const corporateDraft = Object.prototype.hasOwnProperty.call(corporatePriceDrafts, p.id) ? corporatePriceDrafts[p.id] : null;
                                    const hasCorporateDraft = corporateDraft !== null && corporateDraft !== undefined;
                                    const displayedCorporatePrice = hasCorporateDraft ? corporateDraft : corporatePrice;

                                    return (
                                        <tr
                                            key={p.id}
                                            onClick={() => setSelectedRowId(p.id)}
                                            onDoubleClick={() => handleRowDoubleClick(p)}
                                            className={`hover:bg-[#4C3073]/5 transition-colors cursor-pointer group ${selectedIds.has(p.id) ? 'bg-blue-50/30' : ''} ${selectedProductForModal?.id === p.id ? 'bg-[#4C3073]/10 shadow-[inset_3px_0_0_0_#4C3073]' : ''} ${selectedRowId === p.id ? 'ring-1 ring-inset ring-[#4C3073]/20' : ''}`}
                                        >
                                            <td className="px-2 py-1.5 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                                                <button onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }} className="text-gray-300 hover:text-[#4C3073]">
                                                    {selectedIds.has(p.id) ? <CheckSquare size={14} className="text-[#4C3073]" /> : <Square size={14} />}
                                                </button>
                                            </td>
                                            <td className="px-2 py-1.5 align-middle overflow-hidden">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <div className="font-bold text-gray-900 truncate uppercase tracking-tight text-[11px]" title={p.name}>{p.name}</div>
                                                    {savingProductIds.has(p.id) && (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-[#4C3073]/20 bg-[#4C3073]/5 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#4C3073] shrink-0">
                                                            <Loader2 size={8} className="animate-spin" /> Guardando
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-2 py-1.5 align-middle overflow-hidden">
                                                <div className="text-[9px] text-gray-400 font-mono truncate uppercase">{p.laboratory_name || 'SIN LAB'}</div>
                                            </td>
                                            <td className="px-2 py-1.5 align-middle text-right font-mono font-bold bg-purple-50/10 border-x border-purple-100/20">
                                                {currentCost === 0 ? (
                                                    <span className="text-[9px] text-amber-500 bg-amber-50 px-1 py-0.5 border border-amber-100 rounded">S.H.</span>
                                                ) : (
                                                    <div className="text-gray-900 text-xs">${Math.round(currentCost).toLocaleString('es-CL')}</div>
                                                )}
                                            </td>
                                            {warehouses.map((warehouse) => {
                                                const cell = getWarehousePricing(p, warehouse.id);
                                                const draftKey = `${p.id}:${warehouse.id}`;
                                                const hasLocalDraft = Object.prototype.hasOwnProperty.call(localPriceDrafts, draftKey);
                                                const isLocalActive = Boolean(cell?.use_local_price && cell?.active);
                                                const effectiveWarehousePrice = Number(cell?.effective_price ?? displayedCorporatePrice ?? 0);
                                                const localMargin = calculateMargin(effectiveWarehousePrice, currentCost);
                                                const draftPrice = hasLocalDraft ? localPriceDrafts[draftKey] : effectiveWarehousePrice;
                                                
                                                const canEditThisWarehouse = selectedWarehouseId === warehouse.id;
                                                const isSuggested = suggestedPrices[p.id] !== undefined && canEditThisWarehouse;
                                                
                                                const isSyncDest = syncDestinationId === warehouse.id;
                                                const focusClass = canEditThisWarehouse ? 'bg-[#4C3073]/5 border-x border-[#4C3073]/20 shadow-[inset_0_0_0_1px_rgba(76,48,115,0.05)]' : 'bg-transparent border-x border-gray-100';
                                                const syncDestClass = isSyncDest ? 'bg-[#F6F0FF]/60 border-x-2 border-x-[#4C3073]/10 !opacity-100 ring-[0.5px] ring-inset ring-[#4C3073]/5' : '';

                                                return (
                                                    <td key={warehouse.id} className={`px-2 py-1.5 align-middle transition-colors relative ${focusClass} ${syncDestClass} ${!canEditThisWarehouse && !isSyncDest ? 'opacity-80' : ''} ${isSuggested ? 'bg-amber-50/50' : ''}`}>
                                                        {savingProductIds.has(p.id) && <div className="absolute inset-0 pointer-events-none bg-white/35" />}
                                                        {canEditThisWarehouse && hasLocalDraft ? (
                                                            <input
                                                                autoFocus
                                                                type="number"
                                                                value={draftPrice}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={(e) => handleChangeLocalPriceDraft(p.id, warehouse.id, e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleSaveLocalPriceDraft(p.id, warehouse.id);
                                                                    if (e.key === 'Escape') handleCancelLocalPriceDraft(p.id, warehouse.id);
                                                                }}
                                                                onBlur={() => handleCancelLocalPriceDraft(p.id, warehouse.id)}
                                                                className="w-full rounded-sm border border-[#4C3073] bg-white px-1 py-0.5 text-right font-bold text-[11px] text-[#4C3073] outline-none shadow-sm"
                                                            />
                                                        ) : (
                                                            <div 
                                                                className={`group/cell relative flex flex-col items-end justify-center -m-1 p-1 rounded transition-colors ${canEditThisWarehouse ? 'cursor-text hover:bg-white/80' : 'cursor-pointer hover:bg-white/80'}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleActivateWarehousePriceCell(p.id, warehouse.id, effectiveWarehousePrice);
                                                                }}
                                                            >
                                                                <div className="flex items-center justify-end gap-1 w-full">
                                                                     <div className={`text-[11px] font-bold leading-none ${isLocalActive ? 'text-violet-700' : 'text-gray-800'} ${isSuggested ? 'text-amber-600' : ''}`}>
                                                                         ${Math.round(isSuggested ? (suggestedPrices[p.id]?.roundedPrice ?? suggestedPrices[p.id]?.calculatedPrice) : effectiveWarehousePrice).toLocaleString('es-CL')}
                                                                     </div>
                                                                </div>
                                                                <div className="flex items-center justify-end gap-1 mt-0.5 w-full text-[9px] font-bold">
                                                                     <span className={`${localMargin < 25 ? 'text-red-500' : 'text-gray-400'}`}>{isSuggested ? suggestedPrices[p.id]?.estimatedMargin?.toFixed(1) : localMargin.toFixed(1)}%</span>
                                                                     <span className={isLocalActive ? 'text-violet-600 bg-violet-50 px-1 rounded-sm' : 'text-gray-400'}>{isLocalActive ? 'Local' : 'Corp'}</span>
                                                                </div>
                                                                {canEditThisWarehouse && isLocalActive && !isSuggested && (
                                                                    <div className="absolute top-0 right-0 -translate-y-full opacity-0 group-hover/cell:opacity-100 transition-opacity z-10 bg-white border border-gray-200 shadow-md rounded px-1.5 py-0.5">
                                                                         <button 
                                                                             onMouseDown={(e) => { e.stopPropagation(); handleRestoreCorporatePrice(p.id, warehouse.id); }} 
                                                                             className="text-[9px] text-red-600 font-bold uppercase hover:underline whitespace-nowrap"
                                                                         >
                                                                             Revertir
                                                                         </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-2 py-1.5 align-middle text-center border-l border-gray-100">
                                                <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-sm truncate inline-block max-w-[80px] uppercase">
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

                {/* Footer Selection Summary - COMPACTED */}
                <div className="border-t border-gray-200 px-4 py-2 bg-gray-50 flex justify-between items-center text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                    <div className="flex gap-3 items-center">
                        <span className="bg-[#4C3073] text-white px-1.5 py-0.5 rounded-sm">{selectedIds.size} Sel.</span>
                        <span className="text-gray-300">|</span>
                        <span>Vista: {filteredProducts.length}</span>
                    </div>
                    <div className="flex gap-3">
                        <span className="flex items-center gap-1.5">
                             <div className="w-2 h-2 bg-red-500 rounded-full"></div> Crítico (&lt;25%)
                        </span>
                        <span className="flex items-center gap-1.5">
                             <div className="w-2 h-2 bg-emerald-500 rounded-full"></div> Saludable
                        </span>
                    </div>
                </div>
            </div> {/* This closes Left Table Panel */}

            {/* Right Product Detail Panel */}
            {selectedProductForModal && (
                    <div className="w-[420px] shrink-0 flex flex-col bg-white overflow-hidden transition-all duration-300 ease-in-out border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] relative z-30">
                        <ProductWorkspacePanel 
                            product={selectedProductForModal}
                            onClose={() => setSelectedProductForModal(null)}
                            warehouses={warehouses}
                            strategy={strategy}
                            getWarehousePricing={getWarehousePricing}
                            calculateMargin={calculateMargin}
                        />
                    </div>
                )}

                {/* Right Price Sync Panel */}
            {showSyncPanel && (
                                    <div className="w-[360px] shrink-0 flex flex-col bg-white overflow-hidden transition-all duration-300 ease-in-out border-l border-gray-200 relative z-30">
                                        <PriceSyncPanel 
                                            onClose={() => {
                                                setShowSyncPanel(false);
                                                setSyncOriginId('');
                                                setSyncDestinationId('');
                                            }}
                                            warehouses={warehouses}
                                            products={products}
                                            filteredProducts={filteredProducts}
                                            syncOriginId={syncOriginId}
                                            setSyncOriginId={setSyncOriginId}
                                            syncDestinationId={syncDestinationId}
                                            setSyncDestinationId={setSyncDestinationId}
                                            onApplySync={handleApplyPriceSync}
                                            isSyncing={isSyncingPrices}
                                        />
                                    </div>
                                )}
            </div>
        </div>
    );
}

const ProductWorkspacePanel = ({ product, onClose, warehouses, strategy, getWarehousePricing, calculateMargin }) => {
    return (
        <div className="h-full flex flex-col font-sans text-xs bg-gray-50">
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
                <div className="pr-4">
                    <h2 className="text-[14px] font-black text-[#4C3073] uppercase tracking-tight leading-tight">{product.name}</h2>
                    <div className="flex flex-col gap-1 mt-1.5">
                        <span className="text-[10px] text-gray-500 font-mono font-bold">SKU/REF: {product.barcode || 'N/A'}</span>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{product.laboratory_name || 'SIN LAB'}</span>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1 bg-gray-100 hover:bg-red-50 rounded shrink-0"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-6">
                
                {/* IDENTIFICACION */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest border-b border-gray-200 pb-1">Identificación</h3>
                    <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-4 space-y-4">
                        <div>
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Nombre Comercial</label>
                            <div className="font-black text-gray-800 text-[11px] uppercase">{product.name}</div>
                        </div>
                        <div>
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Principio Activo (DCI)</label>
                            <div className="font-bold text-gray-800 text-[10px] uppercase">{product.dci || 'N/A'}</div>
                        </div>
                        <div className="pt-2 border-t border-gray-100">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Laboratorio Fabricante</label>
                            <div className="font-bold text-gray-800 uppercase text-[10px]">{product.laboratory_name || 'SIN LAB'}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                            <div>
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Familia</label>
                                <div className="font-bold text-gray-800 uppercase text-[10px]">{product.family || 'S/F'}</div>
                            </div>
                            <div>
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Subfamilia</label>
                                <div className="font-bold text-gray-400 uppercase text-[10px]">N/A</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* REGULACION */}
                <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest border-b border-gray-200 pb-1">Regulación</h3>
                    <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Registro ISP</label>
                                <div className="font-bold text-gray-400 uppercase text-[10px]">N/A</div>
                            </div>
                            <div>
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Condición de Venta</label>
                                <div className="font-bold text-gray-800 uppercase text-[10px] bg-gray-100 inline-block px-1.5 py-0.5 rounded-sm">{product.prescription_type?.replace('_', ' ') || 'Venta Libre'}</div>
                            </div>
                            <div className="pt-2 border-t border-gray-100">
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Bioequivalente</label>
                                <div className="font-bold text-gray-400 uppercase text-[10px]">NO DEFINIDO</div>
                            </div>
                            <div className="pt-2 border-t border-gray-100">
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Psicotrópico</label>
                                <div className="font-bold text-gray-400 uppercase text-[10px]">NO DEFINIDO</div>
                            </div>
                            <div className="pt-2 border-t border-gray-100">
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Receta Retenida</label>
                                <div className="font-bold text-gray-800 uppercase text-[10px]">{product.prescription_type === 'RECETA_RETENIDA' ? 'SÍ' : 'NO'}</div>
                            </div>
                            <div className="pt-2 border-t border-gray-100">
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Estado Sanitario</label>
                                <div className="font-bold text-emerald-600 uppercase text-[10px] flex items-center gap-1"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>ACTIVO</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* COMERCIAL */}
                <div className="space-y-3 pb-8">
                    <h3 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest border-b border-gray-200 pb-1">Comercial y Precios</h3>
                    <div className="space-y-4">
                        {/* Costs and Codes */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="border border-[#4C3073]/20 rounded-sm p-3 bg-purple-50/50 shadow-sm">
                                <div className="text-[8px] font-black text-[#4C3073] uppercase tracking-widest mb-1">Costo Promedio</div>
                                <div className="font-black text-gray-900 text-[12px]">${Math.round(product.average_cost || 0).toLocaleString('es-CL')}</div>
                            </div>
                            <div className="border border-gray-200 rounded-sm p-3 bg-white shadow-sm">
                                <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Último Costo</div>
                                <div className="font-black text-gray-900 text-[12px]">${Math.round(product.last_cost || 0).toLocaleString('es-CL')}</div>
                            </div>
                            <div className="border border-gray-200 rounded-sm p-3 bg-white shadow-sm">
                                <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Unidad Venta</div>
                                <div className="font-bold text-gray-800 text-[10px] uppercase">CAJA</div>
                            </div>
                            <div className="border border-gray-200 rounded-sm p-3 bg-white shadow-sm">
                                <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Factor Conv.</div>
                                <div className="font-bold text-gray-800 text-[10px]">1</div>
                            </div>
                        </div>

                        {/* Pricing Table */}
                        <div className="border border-gray-200 rounded-sm overflow-hidden shadow-sm bg-white">
                            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                                <h3 className="text-[9px] font-black text-[#4C3073] uppercase tracking-widest">Matriz de Precios</h3>
                            </div>
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white border-b border-gray-200">
                                    <tr>
                                        <th className="px-3 py-1.5 text-[8px] font-black text-gray-500 uppercase tracking-widest border-r border-gray-100">Local</th>
                                        <th className="px-3 py-1.5 text-[8px] font-black text-gray-500 uppercase tracking-widest text-right border-r border-gray-100">Precio</th>
                                        <th className="px-3 py-1.5 text-[8px] font-black text-gray-500 uppercase tracking-widest text-right border-r border-gray-100">Mg%</th>
                                        <th className="px-3 py-1.5 text-[8px] font-black text-gray-500 uppercase tracking-widest text-center border-r border-gray-100">Org</th>
                                        <th className="px-3 py-1.5 text-[8px] font-black text-gray-500 uppercase tracking-widest text-right">Stk</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {warehouses.map(w => {
                                        const cell = getWarehousePricing(product, w.id);
                                        const isLocalActive = Boolean(cell?.use_local_price && cell?.active);
                                        const effectivePrice = Number(cell?.effective_price ?? product.corporatePrice ?? 0);
                                        const currentCost = strategy === 'average' ? (product.average_cost || 0) : (product.last_cost || 0);
                                        const margin = calculateMargin(effectivePrice, currentCost);
                                        return (
                                            <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-3 py-1.5 font-bold text-gray-800 border-r border-gray-100 text-[9px] uppercase tracking-tight">{w.name}</td>
                                                <td className="px-3 py-1.5 text-right font-black border-r border-gray-100 text-[#4C3073] text-[10px]">${Math.round(effectivePrice).toLocaleString('es-CL')}</td>
                                                <td className={`px-3 py-1.5 text-right font-black border-r border-gray-100 text-[9px] ${margin < 25 ? 'text-red-500' : 'text-emerald-600'}`}>
                                                    {margin.toFixed(1)}%
                                                </td>
                                                <td className="px-3 py-1.5 text-center border-r border-gray-100">
                                                    <span className={`text-[8px] px-1 py-0.5 rounded-[2px] font-black uppercase tracking-wider ${isLocalActive ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {isLocalActive ? 'Loc' : 'Corp'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-1.5 text-right text-gray-400 font-mono text-[9px]">--</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
