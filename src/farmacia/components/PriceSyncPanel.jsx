import React, { useMemo, useState } from 'react';
import {
    RefreshCw,
    X,
    ArrowRight,
    AlertTriangle,
    Activity,
    ChevronDown,
    Eye,
    ChevronUp,
    Loader2,
    Info,
} from 'lucide-react';

const AccordionSection = ({ title, icon: Icon, isExpanded, onToggle, children, badge }) => (
    <div className="border-b border-gray-200 bg-white">
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors group"
        >
            <div className="flex items-center gap-2">
                <div className={`p-1 rounded ${isExpanded ? 'bg-[#4C3073] text-white' : 'bg-gray-100 text-gray-400 group-hover:text-gray-600'}`}>
                    {React.createElement(Icon, { size: 12 })}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${isExpanded ? 'text-gray-800' : 'text-gray-500'}`}>
                    {title}
                </span>
                {badge && (
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-[#4C3073]/10 text-[#4C3073]">
                        {badge}
                    </span>
                )}
            </div>
            {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>
        {isExpanded && (
            <div className="px-5 pb-5 pt-0 animate-in fade-in slide-in-from-top-1 duration-200">
                {children}
            </div>
        )}
    </div>
);

const PriceSyncPanel = ({
    onClose,
    warehouses,
    products = [],
    filteredProducts = [],
    syncOriginId,
    setSyncOriginId,
    syncDestinationId,
    setSyncDestinationId,
    onApplySync,
    isSyncing = false,
}) => {
    const [copyMode, setCopyMode] = useState('ALL');
    const [overridePolicy, setOverridePolicy] = useState('KEEP_OVERRIDES');
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [expandedSections, setExpandedSections] = useState({
        config: true,
        rules: true,
        preview: false,
        warnings: true,
    });

    const toggleSection = (section) => {
        setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    const getWarehousePricing = (product, warehouseId) => (product?.warehouses || []).find((entry) => entry.warehouse_id === warehouseId) || null;

    const preview = useMemo(() => {
        if (!syncOriginId || !syncDestinationId) {
            return {
                affectedProducts: 0,
                omittedProducts: 0,
                overwritesDetected: 0,
                hasOverrides: false,
                totalScope: 0,
            };
        }

        const scope = copyMode === 'FILTERED' ? filteredProducts : products;
        let affectedProducts = 0;
        let overwritesDetected = 0;

        scope.forEach((product) => {
            const originCell = getWarehousePricing(product, syncOriginId);
            const destinationCell = getWarehousePricing(product, syncDestinationId);
            const sourcePrice = Number(originCell?.effective_price ?? product.corporatePrice ?? 0) || 0;
            const destinationPrice = Number(destinationCell?.effective_price ?? 0) || 0;
            const destinationHasLocalOverride = Boolean(destinationCell?.use_local_price && destinationCell?.active);
            const skipForPolicy = overridePolicy === 'KEEP_OVERRIDES' && destinationHasLocalOverride;
            const skipForMode = copyMode === 'ONLY_WITHOUT_PRICE' && destinationPrice > 0;

            if (sourcePrice <= 0 || skipForPolicy || skipForMode) {
                if (destinationHasLocalOverride) overwritesDetected += 1;
                return;
            }

            affectedProducts += 1;
            if (destinationHasLocalOverride) overwritesDetected += 1;
        });

        return {
            affectedProducts,
            omittedProducts: Math.max(0, scope.length - affectedProducts),
            overwritesDetected,
            hasOverrides: overwritesDetected > 0,
            totalScope: scope.length,
        };
    }, [copyMode, filteredProducts, products, overridePolicy, syncDestinationId, syncOriginId]);

    const handleSync = () => {
        if (!syncOriginId || !syncDestinationId || isSyncing) return;
        onApplySync?.({
            syncOriginId,
            syncDestinationId,
            copyMode,
            overridePolicy,
            preview,
        });
    };

    const destName = warehouses.find((w) => w.id === syncDestinationId)?.name || '---';

    return (
        <div className="h-full flex flex-col font-sans text-xs bg-gray-50 border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] relative z-40 w-full max-w-[420px]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white shrink-0">
                <div className="flex items-center gap-2">
                    <div className="bg-[#4C3073]/10 p-1.5 rounded">
                        <RefreshCw size={14} className="text-[#4C3073]" />
                    </div>
                    <div>
                        <h2 className="text-[12px] font-black text-[#4C3073] uppercase tracking-tight">Sync Multi-Sucursal</h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] text-emerald-600 font-black uppercase tracking-widest bg-emerald-50 px-1 rounded border border-emerald-100 flex items-center gap-1">
                                <Eye size={8} /> Previsualización
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1 bg-gray-100 hover:bg-red-50 rounded shrink-0"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50/30 divide-y divide-gray-100">
                <AccordionSection
                    title="Sucursales"
                    icon={Activity}
                    isExpanded={expandedSections.config}
                    onToggle={() => toggleSection('config')}
                    badge={syncOriginId && syncDestinationId ? 'Listas' : null}
                >
                    <div className="grid grid-cols-1 gap-3 pt-2">
                        <div className="space-y-1">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block ml-1">Maestra (Origen)</label>
                            <div className="relative">
                                <select
                                    value={syncOriginId}
                                    onChange={(e) => { setSyncOriginId(e.target.value); setIsPreviewing(false); setShowConfirmation(false); }}
                                    className="w-full appearance-none bg-white border border-gray-200 rounded-sm px-2.5 py-1.5 text-[10px] font-bold text-gray-700 outline-none focus:border-[#4C3073] transition-colors"
                                >
                                    <option value="">Seleccionar origen...</option>
                                    {warehouses.map((w) => (
                                        <option key={w.id} value={w.id} disabled={w.id === syncDestinationId}>{w.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                        </div>

                        <div className="flex justify-center -my-1">
                            <div className="bg-gray-100 p-1 rounded-full border border-gray-200">
                                <ArrowRight size={10} className="text-gray-400" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block ml-1">Destino (Actualizar)</label>
                            <div className="relative">
                                <select
                                    value={syncDestinationId}
                                    onChange={(e) => { setSyncDestinationId(e.target.value); setIsPreviewing(false); setShowConfirmation(false); }}
                                    className="w-full appearance-none bg-white border border-gray-200 rounded-sm px-2.5 py-1.5 text-[10px] font-bold text-gray-700 outline-none focus:border-[#4C3073] transition-colors shadow-[0_0_0_1px_rgba(251,191,36,0.1)]"
                                >
                                    <option value="">Seleccionar destino...</option>
                                    {warehouses.map((w) => (
                                        <option key={w.id} value={w.id} disabled={w.id === syncOriginId}>{w.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </AccordionSection>

                <AccordionSection
                    title="Alcance y Políticas"
                    icon={RefreshCw}
                    isExpanded={expandedSections.rules}
                    onToggle={() => toggleSection('rules')}
                >
                    <div className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-[#4C3073] uppercase tracking-widest block ml-1">Modo de copia</label>
                            <div className="bg-white border border-gray-200 rounded-sm divide-y divide-gray-100">
                                {[
                                    { id: 'ONLY_WITHOUT_PRICE', label: 'Solo productos sin precio' },
                                    { id: 'ALL', label: 'Todos los productos' },
                                    { id: 'FILTERED', label: 'Solo productos visibles/filtrados' },
                                ].map((option) => (
                                    <label key={option.id} className="flex items-center gap-2.5 p-2 hover:bg-gray-50 cursor-pointer transition-colors group">
                                        <input
                                            type="radio"
                                            name="copyMode"
                                            checked={copyMode === option.id}
                                            onChange={() => { setCopyMode(option.id); setIsPreviewing(false); setShowConfirmation(false); }}
                                            className="h-3 w-3 border-gray-300 text-[#4C3073] focus:ring-[#4C3073] cursor-pointer"
                                        />
                                        <span className="text-[10px] font-bold text-gray-700 uppercase tracking-tight">{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[8px] font-black text-[#4C3073] uppercase tracking-widest block ml-1">Política sobre existentes</label>
                            <div className="bg-white border border-gray-200 rounded-sm divide-y divide-gray-100">
                                {[
                                    { id: 'KEEP_OVERRIDES', label: 'Mantener overrides locales' },
                                    { id: 'OVERWRITE', label: 'Sobrescribir precios existentes' },
                                ].map((option) => (
                                    <label key={option.id} className="flex items-center gap-2.5 p-2 hover:bg-gray-50 cursor-pointer transition-colors group">
                                        <input
                                            type="radio"
                                            name="overridePolicy"
                                            checked={overridePolicy === option.id}
                                            onChange={() => { setOverridePolicy(option.id); setIsPreviewing(false); setShowConfirmation(false); }}
                                            className="h-3 w-3 border-gray-300 text-[#4C3073] focus:ring-[#4C3073] cursor-pointer"
                                        />
                                        <span className="text-[10px] font-bold text-gray-700 uppercase tracking-tight">{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </AccordionSection>

                {isPreviewing && (
                    <AccordionSection
                        title="Impacto Operacional"
                        icon={Eye}
                        isExpanded={expandedSections.preview}
                        onToggle={() => toggleSection('preview')}
                        badge={`${preview.affectedProducts} Items`}
                    >
                        <div className="space-y-3 pt-2">
                            <div className="bg-gray-50 border border-gray-200 rounded-sm p-3 grid grid-cols-2 gap-3">
                                <div className="space-y-0.5">
                                    <div className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Sincronizará</div>
                                    <div className="text-[14px] font-black text-[#4C3073]">{preview.affectedProducts}</div>
                                </div>
                                <div className="space-y-0.5 text-right border-l border-gray-200 pl-3">
                                    <div className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Omitirá</div>
                                    <div className="text-[14px] font-black text-gray-400">{preview.omittedProducts}</div>
                                </div>
                            </div>

                            <div className="bg-white border border-gray-100 rounded-sm p-2 space-y-2">
                                <div className="flex justify-between text-[9px] border-b border-gray-50 pb-1">
                                    <span className="text-gray-400 uppercase font-black tracking-widest">Sucursal Destino</span>
                                    <span className="text-gray-800 font-bold uppercase">{destName}</span>
                                </div>
                                <div className="flex justify-between text-[9px]">
                                    <span className="text-gray-400 uppercase font-black tracking-widest">Sobrescrituras</span>
                                    <span className={`font-black ${preview.overwritesDetected > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {preview.overwritesDetected}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </AccordionSection>
                )}

                <AccordionSection
                    title="Advertencias Operacionales"
                    icon={AlertTriangle}
                    isExpanded={expandedSections.warnings}
                    onToggle={() => toggleSection('warnings')}
                >
                    <div className="space-y-2 pt-2">
                        {overridePolicy === 'OVERWRITE' && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-100 p-2.5 rounded-sm">
                                <AlertTriangle size={14} className="text-red-500 shrink-0" />
                                <span className="text-[9px] font-bold text-red-700 leading-snug">Se sobrescribirán precios manuales existentes en la sucursal destino.</span>
                            </div>
                        )}
                        {preview.hasOverrides && (
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 p-2.5 rounded-sm">
                                <Info size={14} className="text-amber-500 shrink-0" />
                                <span className="text-[9px] font-bold text-amber-700 leading-snug">La sucursal destino contiene overrides locales configurados.</span>
                            </div>
                        )}
                        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 p-2.5 rounded-sm">
                            <Activity size={14} className="text-blue-500 shrink-0" />
                            <span className="text-[9px] font-bold text-blue-700 leading-snug">Esta operación no es reversible una vez aplicada en producción.</span>
                        </div>
                    </div>
                </AccordionSection>
            </div>

            <div className="p-4 bg-white border-t border-gray-200 shrink-0 space-y-3">
                {syncOriginId && syncDestinationId && (
                    <div className="flex items-center justify-center gap-2 text-[9px] font-black text-[#4C3073] uppercase tracking-widest">
                        {isSyncing ? <Loader2 size={10} className="animate-spin" /> : <Activity size={10} />}
                        <span>{preview.affectedProducts} productos serán sincronizados</span>
                    </div>
                )}

                {!isPreviewing ? (
                    <button
                        onClick={() => { setIsPreviewing(true); setExpandedSections((prev) => ({ ...prev, preview: true })); }}
                        disabled={!syncOriginId || !syncDestinationId}
                        className="w-full bg-[#4C3073] text-white py-2.5 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-[#3d265c] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:grayscale"
                    >
                        <RefreshCw size={12} className={!syncOriginId || !syncDestinationId ? '' : 'animate-spin-slow'} /> Previsualizar Sincronización
                    </button>
                ) : !showConfirmation ? (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsPreviewing(false)}
                            className="flex-1 bg-white border border-gray-200 text-gray-500 py-2.5 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-colors"
                        >
                            Modificar
                        </button>
                        <button
                            onClick={() => setShowConfirmation(true)}
                            className="flex-[2] bg-emerald-600 text-white py-2.5 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-md"
                        >
                            Confirmar y Aplicar
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="bg-red-50 p-3 border border-red-200 rounded-sm space-y-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={14} className="text-red-500" />
                                <span className="text-[10px] font-black text-red-700 uppercase tracking-tight">Confirmación Crítica</span>
                            </div>
                            <p className="text-[9px] text-red-600 font-bold leading-tight">
                                ¿Ejecutar sincronización de {preview.affectedProducts} precios hacia {destName}?
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowConfirmation(false)}
                                className="flex-1 bg-white border border-gray-200 text-gray-500 py-2.5 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-colors"
                            >
                                Volver
                            </button>
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="flex-[2] bg-red-600 text-white py-2.5 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-md shadow-red-100 disabled:opacity-60"
                            >
                                {isSyncing ? 'Sincronizando...' : 'Ejecutar Ahora'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PriceSyncPanel;
