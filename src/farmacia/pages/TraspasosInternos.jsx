import React, { useState, useEffect, useMemo } from 'react';
import { getPharmacySchema, getMyCompanyId, createTransferRequest } from '../api/pharmacyClient';
import { ArrowRightLeft, Search, Package, MapPin, ShoppingCart, FileText, X, CheckCircle2, GripVertical, CheckSquare, Square, Check, ArrowRight, ChevronLeft } from 'lucide-react';
import { useSucursal } from '../context/SucursalContext';

export default function TraspasosInternos() {
    const { activeWarehouse } = useSucursal();
    const [warehouses, setWarehouses] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);

    const [transferData, setTransferData] = useState({
        source_warehouse_id: activeWarehouse?.id || '',
        source_zone_id: '',
        dest_warehouse_id: '',
        dest_zone_id: '',
        dest_location_id: '',
        notes: ''
    });

    // Sincronizar origen cuando cambia el local activo global
    useEffect(() => {
        if (activeWarehouse?.id) {
            setTransferData(prev => ({
                ...prev,
                source_warehouse_id: activeWarehouse.id,
                source_zone_id: '' // Reiniciar zona al cambiar local
            }));
            setCartItems([]);
            setAssignedDestinations([]);
        }
    }, [activeWarehouse]);

    const [allSourceBatches, setAllSourceBatches] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [stagingItems, setStagingItems] = useState({}); // { batchId: quantity }
    
    // Workflow Step: 'PICKING' or 'PUTAWAY'
    const [workflowStep, setWorkflowStep] = useState('PICKING');
    
    // Unassigned Cart Items
    const [cartItems, setCartItems] = useState([]); // { batch, transferQuantity }
    const [selectedCartIds, setSelectedCartIds] = useState(new Set());
    
    // Assigned Destinations (Distributed Putaway)
    const [assignedDestinations, setAssignedDestinations] = useState([]); // { batch, transferQuantity, dest_location_id }
    
    const [isTransferring, setIsTransferring] = useState(false);

    // UX States
    const [dropHoveredId, setDropHoveredId] = useState(null);
    const [dropModal, setDropModal] = useState({ open: false, items: [], targetId: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const companyId = await getMyCompanyId();
            if (!companyId) return;

            const schema = getPharmacySchema();
            
            const [whRes, locRes] = await Promise.all([
                schema.from('warehouses').select('*').eq('company_id', companyId).order('name'),
                schema.from('locations').select('*').eq('company_id', companyId).order('name')
            ]);

            setWarehouses(whRes.data || []);
            setLocations(locRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Motor de ruteo inteligente y carga de inventario origen
    useEffect(() => {
        if (transferData.source_zone_id) {
            fetchSourceInventory(transferData.source_zone_id);
            setSearchQuery('');
            setStagingItems({});
        } else {
            setAllSourceBatches([]);
        }
    }, [transferData.source_zone_id, locations]);

    useEffect(() => {
        if (transferData.dest_warehouse_id) {
            if (transferData.dest_warehouse_id !== transferData.source_warehouse_id) {
                const quarantineLoc = locations.find(l => l.warehouse_id === transferData.dest_warehouse_id && l.location_type === 'QUARANTINE' && !l.parent_location_id);
                if (quarantineLoc) {
                    setTransferData(prev => ({ ...prev, dest_zone_id: quarantineLoc.id, dest_location_id: quarantineLoc.id }));
                } else {
                    setTransferData(prev => ({ ...prev, dest_zone_id: '', dest_location_id: '' }));
                }
            } else {
                const currentDestZone = locations.find(l => l.id === transferData.dest_zone_id);
                if (currentDestZone && currentDestZone.location_type === 'QUARANTINE') {
                    setTransferData(prev => ({ ...prev, dest_zone_id: '', dest_location_id: '' }));
                }
            }
        }
    }, [transferData.dest_warehouse_id, transferData.source_warehouse_id, transferData.dest_zone_id, locations]);

    const fetchSourceInventory = async (zoneId) => {
        try {
            const childIds = locations.filter(l => l.parent_location_id === zoneId).map(l => l.id);
            const allIds = [zoneId, ...childIds];
            
            const schema = getPharmacySchema();
            const { data } = await schema
                .from('inventory_batches')
                .select('*, product:product_id(*), location:location_id(*)')
                .in('location_id', allIds)
                .gt('current_quantity', 0);

            setAllSourceBatches(data || []);
        } catch (error) {
            console.error('Error fetching inventory:', error);
        }
    };

    const handleStagingQtyChange = (batch, qty) => {
        const val = parseInt(qty) || 0;
        const validQty = Math.max(0, Math.min(val, batch.current_quantity));
        setStagingItems(prev => ({
            ...prev,
            [batch.id]: validQty
        }));
    };

    const handleAddToCart = () => {
        const newCartItems = [...cartItems];
        Object.keys(stagingItems).forEach(batchId => {
            const qty = stagingItems[batchId];
            if (qty > 0) {
                const batch = allSourceBatches.find(b => b.id === batchId);
                if (batch) {
                    const existingIdx = newCartItems.findIndex(i => i.batch.id === batchId);
                    if (existingIdx >= 0) {
                        newCartItems[existingIdx].transferQuantity += qty;
                    } else {
                        newCartItems.push({ batch, transferQuantity: qty });
                    }
                }
            }
        });
        setCartItems(newCartItems);
        setStagingItems({});
        setSearchQuery('');
        // NOTE: workflowStep remains 'PICKING' to allow continuous searching
    };

    const removeFromCart = (batchId) => {
        setCartItems(cartItems.filter(item => item.batch.id !== batchId));
        setAssignedDestinations(assignedDestinations.filter(item => item.batch.id !== batchId));
        setSelectedCartIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(batchId);
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedCartIds.size === cartItems.length) {
            setSelectedCartIds(new Set());
        } else {
            setSelectedCartIds(new Set(cartItems.map(i => i.batch.id)));
        }
    };

    const toggleSelectItem = (batchId) => {
        setSelectedCartIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(batchId)) newSet.delete(batchId);
            else newSet.add(batchId);
            return newSet;
        });
    };

    // --- Drag & Drop Logic ---
    const handleDragStart = (e, batchId) => {
        let idsToDrag = [batchId];
        if (selectedCartIds.has(batchId)) {
            idsToDrag = Array.from(selectedCartIds);
        }
        e.dataTransfer.setData('batchIds', JSON.stringify(idsToDrag));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e, targetId) => {
        e.preventDefault();
        setDropHoveredId(targetId);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setDropHoveredId(null);
    };

    const handleDrop = (e, targetLocationId) => {
        e.preventDefault();
        setDropHoveredId(null);
        const batchIdsStr = e.dataTransfer.getData('batchIds');
        if (!batchIdsStr) return;
        
        try {
            const batchIds = JSON.parse(batchIdsStr);
            const itemsToDrop = cartItems.filter(i => batchIds.includes(i.batch.id));
            if (itemsToDrop.length === 0) return;

            setDropModal({
                open: true,
                items: itemsToDrop.map(i => ({ ...i, inputQty: i.transferQuantity })),
                targetId: targetLocationId
            });
        } catch (err) {
            console.error("Error parsing drop data:", err);
        }
    };

    const handleConfirmDistribution = (customItems) => {
        const itemsToProcess = customItems || dropModal.items;
        
        setAssignedDestinations(prev => {
            const newAssigned = [...prev];
            itemsToProcess.forEach(item => {
                const existingIdx = newAssigned.findIndex(a => a.batch.id === item.batch.id && a.dest_location_id === dropModal.targetId);
                if (existingIdx >= 0) {
                    newAssigned[existingIdx].transferQuantity += item.inputQty;
                } else {
                    newAssigned.push({ batch: item.batch, transferQuantity: item.inputQty, dest_location_id: dropModal.targetId });
                }
            });
            return newAssigned;
        });

        setCartItems(prev => {
            return prev.map(item => {
                const dropItem = itemsToProcess.find(d => d.batch.id === item.batch.id);
                if (dropItem) {
                    return { ...item, transferQuantity: item.transferQuantity - dropItem.inputQty };
                }
                return item;
            }).filter(i => i.transferQuantity > 0);
        });

        setSelectedCartIds(new Set());
        setDropModal({ open: false, items: [], targetId: '' });
    };

    // --- Submit Logic ---
    const handleConfirmTransfer = async () => {
        const finalDestLoc = transferData.dest_location_id || transferData.dest_zone_id;
        
        const itemsToSubmit = [
            ...assignedDestinations,
            ...cartItems.map(item => ({ ...item, dest_location_id: finalDestLoc }))
        ];

        if (itemsToSubmit.length === 0) {
            alert("Agregue al menos un producto al carrito.");
            return;
        }

        if (cartItems.length > 0 && (!transferData.dest_warehouse_id || !finalDestLoc)) {
            alert("Existen ítems en el carrito sin asignar a una celda y no se ha definido un destino por defecto.");
            return;
        }

        setIsTransferring(true);

        try {
            const txData = { ...transferData, dest_location_id: finalDestLoc, source_location_id: transferData.source_zone_id };
            const result = await createTransferRequest(txData, itemsToSubmit);
            
            alert(result.message);

            // Limpieza Post-Operación
            setCartItems([]);
            setAssignedDestinations([]);
            setSelectedCartIds(new Set());
            setTransferData({ 
                ...transferData, 
                notes: '', 
                dest_location_id: '', 
                dest_warehouse_id: '', 
                dest_zone_id: '' 
            });
            setWorkflowStep('PICKING');
            fetchSourceInventory(transferData.source_zone_id);
        } catch (error) {
            console.error("Error en operación de traspaso:", error);
            alert("Error al procesar: " + error.message);
        } finally {
            setIsTransferring(false);
        }
    };

    const sourceZones = locations.filter(l => l.warehouse_id === transferData.source_warehouse_id && !l.parent_location_id);
    const isInterSucursal = transferData.source_warehouse_id && transferData.dest_warehouse_id && transferData.source_warehouse_id !== transferData.dest_warehouse_id;

    let destZones = [];
    if (transferData.dest_warehouse_id) {
        if (isInterSucursal) {
            destZones = locations.filter(l => l.warehouse_id === transferData.dest_warehouse_id && l.location_type === 'QUARANTINE' && !l.parent_location_id);
        } else {
            destZones = locations.filter(l => l.warehouse_id === transferData.dest_warehouse_id && l.location_type !== 'QUARANTINE' && !l.parent_location_id);
        }
    }
    const destSpecifics = locations.filter(l => l.parent_location_id === transferData.dest_zone_id);

    const filteredSourceBatches = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return allSourceBatches.filter(b => 
            b.product?.name?.toLowerCase().includes(q) || 
            b.product?.sku?.toLowerCase().includes(q) ||
            b.batch_number?.toLowerCase().includes(q)
        );
    }, [allSourceBatches, searchQuery]);

    const consolidatedSummary = useMemo(() => {
        const summary = {};
        const allItems = [...cartItems, ...assignedDestinations];
        allItems.forEach(item => {
            const name = item.batch.product?.name || 'Desconocido';
            if (!summary[name]) summary[name] = 0;
            summary[name] += item.transferQuantity;
        });
        return summary;
    }, [cartItems, assignedDestinations]);

    const { shelvesData, specialZones } = useMemo(() => {
        const regex = /(.+)-C(\d+)-N(\d+)/;
        const shelves = {};
        const specials = [];

        destSpecifics.forEach(loc => {
            const match = loc.name.match(regex);
            if (match) {
                const [, prefix, col, level] = match;
                if (!shelves[prefix]) shelves[prefix] = {};
                if (!shelves[prefix][col]) shelves[prefix][col] = [];
                shelves[prefix][col].push({ ...loc, level: parseInt(level, 10) });
            } else {
                specials.push(loc);
            }
        });

        Object.keys(shelves).forEach(prefix => {
            Object.keys(shelves[prefix]).forEach(col => {
                shelves[prefix][col].sort((a, b) => b.level - a.level);
            });
        });

        return { shelvesData: shelves, specialZones: specials };
    }, [destSpecifics]);

    if (loading) return <div className="h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4C3073]"></div></div>;

    const totalLotesCount = cartItems.length + assignedDestinations.length;

    return (
        <div className="h-full flex flex-col bg-gray-50 overflow-hidden relative">
            
            {/* MODAL DE DISTRIBUCIÓN */}
            {dropModal.open && (
                <div className="absolute inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-[#4C3073] p-4 text-white flex justify-between items-center">
                            <h3 className="font-black uppercase tracking-tighter text-sm flex items-center gap-2">
                                <Package className="h-4 w-4" /> Distribuir en {locations.find(l => l.id === dropModal.targetId)?.name}
                            </h3>
                            <button onClick={() => setDropModal({ ...dropModal, open: false })} className="hover:bg-white/20 p-1 rounded-full"><X className="h-5 w-5" /></button>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); handleConfirmDistribution(); }} className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Confirma las cantidades a depositar:</p>
                                {dropModal.items.map((item, idx) => (
                                    <div key={item.batch.id} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="flex justify-between items-start">
                                            <div className="min-w-0">
                                                <div className="text-xs font-black text-[#4C3073] truncate">{item.batch.product?.name}</div>
                                                <div className="text-[9px] text-gray-500 font-mono">Lote: {item.batch.batch_number} | Disponible: {item.transferQuantity}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1">
                                            <input 
                                                type="number"
                                                className="w-24 border border-gray-300 rounded px-2 py-1 text-sm font-bold outline-none focus:border-[#4C3073]"
                                                value={item.inputQty}
                                                autoFocus={idx === 0}
                                                onChange={(e) => {
                                                    const val = Math.max(0, Math.min(item.transferQuantity, parseInt(e.target.value) || 0));
                                                    const newItems = [...dropModal.items];
                                                    newItems[idx].inputQty = val;
                                                    setDropModal({ ...dropModal, items: newItems });
                                                }}
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const newItems = [...dropModal.items];
                                                    newItems[idx].inputQty = item.transferQuantity;
                                                    setDropModal({ ...dropModal, items: newItems });
                                                }}
                                                className="text-[9px] font-black text-[#4C3073] bg-purple-100 px-2 py-1 rounded hover:bg-purple-200 transition-colors uppercase"
                                            >
                                                Máximo
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-gray-50 border-t flex gap-3">
                                <button 
                                    type="submit"
                                    className="flex-1 bg-[#4C3073] hover:bg-[#3d265c] text-white py-3 rounded-lg font-black text-xs uppercase tracking-widest shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Check className="h-4 w-4" /> Confirmar Distribución (Enter)
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setDropModal({ ...dropModal, open: false })}
                                    className="px-6 py-3 border border-gray-300 text-gray-600 rounded-lg font-bold text-xs uppercase hover:bg-white"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4 lg:p-6 flex justify-between items-center shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    {workflowStep === 'PUTAWAY' && (
                        <button 
                            onClick={() => setWorkflowStep('PICKING')}
                            className="bg-gray-100 p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-600"
                            title="Volver al Picking"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-xl lg:text-2xl font-black text-[#4C3073] flex items-center gap-2 tracking-tight">
                            <ArrowRightLeft className="h-5 w-5 lg:h-6 lg:w-6" />
                            Consola WMS
                        </h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${workflowStep === 'PICKING' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>
                                {workflowStep === 'PICKING' ? 'Fase 1: Picking' : 'Fase 2: Putaway'}
                            </span>
                        </div>
                    </div>
                </div>
                {workflowStep === 'PUTAWAY' && totalLotesCount > 0 && (
                    <button 
                        onClick={handleConfirmTransfer}
                        disabled={isTransferring}
                        className={`text-white px-4 lg:px-6 py-2 lg:py-3 rounded-md shadow-md font-bold text-xs lg:text-sm flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 ${isInterSucursal ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                        {isTransferring ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : isInterSucursal ? (
                            <FileText className="h-4 w-4" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4" />
                        )}
                        {isInterSucursal ? 'Generar Reserva de Envío' : 'Ejecutar Acomodo Inmediato'}
                    </button>
                )}
            </div>

            <div className="p-4 lg:p-6 flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
                
                {/* COLUMNA IZQUIERDA: Origen (Solo en PICKING) */}
                {workflowStep === 'PICKING' && (
                    <div className="flex flex-col gap-4 lg:w-1/2 w-full overflow-y-auto pr-2 animate-in slide-in-from-left duration-300">
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col gap-4 shrink-0">
                            <div className="flex justify-between items-center border-b pb-2">
                                <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    <Search className="h-4 w-4 text-orange-500" /> Búsqueda en Origen
                                </h2>
                            </div>
                            
                            <div className="flex flex-col gap-3">
                                <select 
                                    className="border-b border-gray-200 bg-gray-100 px-3 py-2 text-xs font-bold text-gray-400 outline-none cursor-not-allowed"
                                    value={transferData.source_warehouse_id}
                                    disabled
                                >
                                    <option value="">Seleccione Local / Sucursal Origen...</option>
                                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>

                                <select 
                                    className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-orange-400 disabled:opacity-50"
                                    value={transferData.source_zone_id}
                                    onChange={e => setTransferData({...transferData, source_zone_id: e.target.value})}
                                    disabled={!transferData.source_warehouse_id}
                                >
                                    <option value="">Seleccione Bodega / Zona Origen...</option>
                                    {sourceZones.map(l => <option key={l.id} value={l.id}>{l.name} ({l.location_type})</option>)}
                                </select>
                            </div>
                            
                            {transferData.source_zone_id && (
                                <div className="relative mt-2">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Escanear o buscar producto por nombre/SKU..."
                                        className="w-full border border-gray-300 rounded-md pl-10 pr-4 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-shadow"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            )}
                        </div>

                        {transferData.source_zone_id && searchQuery.length > 0 && (
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col flex-1 min-h-[300px]">
                                <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex justify-between items-center shrink-0">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase">Resultados ({filteredSourceBatches.length})</span>
                                    {Object.values(stagingItems).some(q => q > 0) && (
                                        <button 
                                            onClick={handleAddToCart}
                                            className="bg-[#4C3073] text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm hover:bg-[#3d265c] transition-colors"
                                        >
                                            Añadir al Carrito
                                        </button>
                                    )}
                                </div>
                                <div className="p-0 overflow-y-auto flex-1">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-white sticky top-0 shadow-sm z-10">
                                            <tr>
                                                <th className="px-3 py-2 font-black text-[9px] uppercase text-gray-400">Producto / Lote</th>
                                                <th className="px-3 py-2 font-black text-[9px] uppercase text-gray-400">Disp</th>
                                                <th className="px-3 py-2 font-black text-[9px] uppercase text-gray-400 text-center">Añadir</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {filteredSourceBatches.map(batch => {
                                                const stagedQty = stagingItems[batch.id] || 0;
                                                const inCartQty = cartItems.find(i => i.batch.id === batch.id)?.transferQuantity || 0;
                                                const inAssignedQty = assignedDestinations.filter(a => a.batch.id === batch.id).reduce((acc, curr) => acc + curr.transferQuantity, 0);
                                                const maxAvail = batch.current_quantity - (inCartQty + inAssignedQty);
                                                return (
                                                    <tr key={batch.id} className="hover:bg-orange-50/30 transition-colors">
                                                        <td className="px-3 py-2">
                                                            <div className="font-bold text-gray-800">{batch.product?.name}</div>
                                                            <div className="text-[9px] text-gray-500 uppercase flex gap-2 mt-0.5">
                                                                <span>{batch.product?.sku}</span>
                                                                <span className="text-orange-600 font-mono">Lote: {batch.batch_number}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-[10px] font-bold text-gray-600">{maxAvail}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            {maxAvail > 0 ? (
                                                                <input 
                                                                    type="number" min="0" max={maxAvail}
                                                                    className={`w-14 text-center text-xs font-bold border rounded py-1 outline-none ${stagedQty > 0 ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200'}`}
                                                                    placeholder="0" value={stagedQty || ''}
                                                                    onChange={e => handleStagingQtyChange(batch, e.target.value)}
                                                                />
                                                            ) : (
                                                                <div className="text-[9px] font-bold text-green-600">Completo</div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* COLUMNA DERECHA: Carrito y Plano */}
                <div className={`flex flex-col gap-4 h-full overflow-hidden transition-all duration-500 ${workflowStep === 'PICKING' ? 'lg:w-1/2 w-full' : 'w-full'}`}>
                    
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 transition-all duration-500 ${workflowStep === 'PICKING' ? 'h-full' : 'h-[450px]'}`}>
                        {/* Carrito */}
                        <div className="bg-white rounded-lg border border-[#4C3073] shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="p-3 border-b border-[#4C3073]/20 bg-[#4C3073]/5 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-[11px] font-black text-[#4C3073] uppercase tracking-widest flex items-center gap-1">
                                        <ShoppingCart className="h-4 w-4" /> Picking en Proceso
                                    </h2>
                                    {cartItems.length > 0 && (
                                        <button 
                                            onClick={toggleSelectAll}
                                            className="text-[9px] font-black uppercase text-purple-600 hover:bg-purple-100 px-2 py-0.5 rounded transition-colors"
                                        >
                                            {selectedCartIds.size === cartItems.length ? 'Deseleccionar' : 'Marcar Todos'}
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="bg-[#4C3073] text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm">{cartItems.length}</span>
                                    {workflowStep === 'PICKING' && cartItems.length > 0 && (
                                        <button 
                                            onClick={() => setWorkflowStep('PUTAWAY')}
                                            className="bg-[#4C3073] hover:bg-[#3d265c] text-white text-[10px] font-black px-4 py-1.5 rounded shadow-md flex items-center gap-2 transition-all active:scale-95"
                                        >
                                            Confirmar Picking <ArrowRight className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="p-3 overflow-y-auto flex-1 flex flex-col gap-2.5 bg-gray-50/30">
                                {cartItems.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-40">
                                        <Package className="h-12 w-12 mb-3" />
                                        <p className="text-[11px] uppercase font-black tracking-widest">El carrito está vacío</p>
                                    </div>
                                ) : (
                                    cartItems.map(item => (
                                        <div 
                                            key={item.batch.id} 
                                            draggable={workflowStep === 'PUTAWAY'}
                                            onDragStart={(e) => handleDragStart(e, item.batch.id)}
                                            className={`bg-white border-2 border-dashed p-3 rounded-lg flex items-center justify-between transition-all group shadow-sm ${workflowStep === 'PUTAWAY' ? 'cursor-grab active:cursor-grabbing hover:border-purple-400 hover:shadow-md' : ''} ${selectedCartIds.has(item.batch.id) ? 'border-[#4C3073] bg-purple-50' : 'border-gray-200'}`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); toggleSelectItem(item.batch.id); }}
                                                    className="text-gray-300 hover:text-[#4C3073] transition-colors"
                                                >
                                                    {selectedCartIds.has(item.batch.id) ? <CheckSquare className="h-5 w-5 text-[#4C3073]" /> : <Square className="h-5 w-5" />}
                                                </button>
                                                {workflowStep === 'PUTAWAY' && <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />}
                                                <div className="min-w-0 pr-2">
                                                    <div className="text-[11px] font-black text-[#4C3073] truncate leading-tight">{item.batch.product?.name}</div>
                                                    <div className="text-[9px] text-gray-500 uppercase mt-0.5 font-medium">Lote: {item.batch.batch_number}</div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <button onClick={() => removeFromCart(item.batch.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><X className="h-4 w-4" /></button>
                                                <span className="text-[11px] font-black text-white bg-[#4C3073] px-2.5 py-1 rounded-md shadow-sm border border-white/20">x{item.transferQuantity}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            
                            {Object.keys(consolidatedSummary).length > 0 && (
                                <div className="bg-gray-100 border-t border-gray-200 p-3 shrink-0">
                                    <h3 className="text-[9px] font-black text-gray-500 uppercase mb-2 tracking-widest flex justify-between">
                                        <span>Resumen Consolidado</span>
                                        <span className="text-[#4C3073]">{Object.keys(consolidatedSummary).length} productos</span>
                                    </h3>
                                    <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                                        {Object.entries(consolidatedSummary).map(([name, qty]) => (
                                            <div key={name} className="flex justify-between text-[10px] bg-white px-2 py-1 rounded border border-gray-200/50">
                                                <span className="text-gray-700 truncate pr-2 font-bold uppercase tracking-tighter">{name}</span>
                                                <span className="font-black text-[#4C3073] shrink-0">{qty} UN</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Ruteo (Solo en PUTAWAY o visible en Picking lateral si hay espacio) */}
                        <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col gap-3 transition-all ${workflowStep === 'PICKING' ? 'hidden md:flex' : 'flex h-full'}`}>
                            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b pb-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-blue-500" /> Destino de Mercancía
                            </h2>
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[8px] font-black text-gray-400 uppercase">Local / Sucursal</label>
                                    <select 
                                        className="border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-bold text-gray-700 outline-none focus:border-blue-400"
                                        value={transferData.dest_warehouse_id}
                                        onChange={e => setTransferData({...transferData, dest_warehouse_id: e.target.value, dest_zone_id: '', dest_location_id: ''})}
                                    >
                                        <option value="">Seleccione Destino...</option>
                                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[8px] font-black text-gray-400 uppercase">Bodega / Área</label>
                                    <select 
                                        className="border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-bold text-gray-700 outline-none focus:border-blue-400 disabled:opacity-50"
                                        value={transferData.dest_zone_id}
                                        onChange={e => setTransferData({...transferData, dest_zone_id: e.target.value, dest_location_id: ''})}
                                        disabled={!transferData.dest_warehouse_id || isInterSucursal}
                                    >
                                        <option value="">Seleccione Área...</option>
                                        {destZones.map(l => <option key={l.id} value={l.id}>{l.name} ({l.location_type})</option>)}
                                    </select>
                                </div>
                            </div>
                            {isInterSucursal && (
                                <p className="text-[9px] text-blue-700 bg-blue-50 p-2 rounded border border-blue-100 font-medium leading-tight">
                                    <b>Ruteo Externo:</b> Forzado a zona de Cuarentena. No requiere distribución manual.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* GEMELO DIGITAL (Solo en PUTAWAY) */}
                    {workflowStep === 'PUTAWAY' && (
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col flex-1 min-h-[350px] overflow-hidden animate-in slide-in-from-bottom duration-500">
                            <div className="p-3 border-b border-gray-200 bg-slate-50 shrink-0 flex justify-between items-center">
                                <h2 className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                    <Package className="h-3 w-3" /> Distribución en Plano (Putaway)
                                </h2>
                                <span className="text-[9px] text-slate-500 font-medium italic">Suelte los ítems sobre los estantes para asignar ubicación</span>
                            </div>
                            
                            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                                {!transferData.dest_zone_id ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <MapPin className="h-8 w-8 mb-2 opacity-20" />
                                        <p className="text-xs uppercase font-black tracking-widest">Seleccione Bodega Destino</p>
                                    </div>
                                ) : destSpecifics.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <div 
                                            className={`w-40 h-40 border-4 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-300 ${dropHoveredId === transferData.dest_zone_id ? 'ring-8 ring-purple-500/20 border-purple-600 bg-purple-100 scale-95 shadow-inner' : 'border-gray-200 bg-white shadow-sm'}`}
                                            onDragOver={e => e.preventDefault()}
                                            onDragEnter={e => handleDragEnter(e, transferData.dest_zone_id)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={e => handleDrop(e, transferData.dest_zone_id)}
                                        >
                                            <span className="text-[10px] font-black uppercase text-center p-4">Zona General<br/>(Drop Here)</span>
                                            {assignedDestinations.filter(a => a.dest_location_id === transferData.dest_zone_id).length > 0 && (
                                                <span className="bg-[#4C3073] text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg">
                                                    {assignedDestinations.filter(a => a.dest_location_id === transferData.dest_zone_id).reduce((sum, a) => sum + a.transferQuantity, 0)} UN
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-10">
                                        {specialZones.length > 0 && (
                                            <div className="flex flex-col gap-4">
                                                <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-l-2 border-gray-300 pl-2">Zonas Especiales</h4>
                                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                    {specialZones.map(shelf => {
                                                        const droppedQty = assignedDestinations.filter(a => a.dest_location_id === shelf.id).reduce((sum, a) => sum + a.transferQuantity, 0);
                                                        const isHovered = dropHoveredId === shelf.id;
                                                        return (
                                                            <div 
                                                                key={shelf.id} 
                                                                onDragOver={e => e.preventDefault()}
                                                                onDragEnter={e => handleDragEnter(e, shelf.id)}
                                                                onDragLeave={handleDragLeave}
                                                                onDrop={e => handleDrop(e, shelf.id)}
                                                                className={`relative flex flex-col items-center justify-center p-3 h-24 border-b-[6px] rounded-t-lg shadow-sm transition-all duration-300 group ${isHovered ? 'ring-8 ring-purple-500/20 border-purple-600 bg-purple-100 scale-90 shadow-inner' : droppedQty > 0 ? 'bg-purple-50 border-[#4C3073] ring-1 ring-purple-200' : 'bg-white border-gray-300 hover:border-purple-300'}`}
                                                            >
                                                                <Package className={`h-5 w-5 mb-1.5 ${droppedQty > 0 || isHovered ? 'text-[#4C3073]' : 'text-gray-300'}`} />
                                                                <span className={`text-[10px] font-black text-center uppercase tracking-tighter px-1 ${droppedQty > 0 || isHovered ? 'text-[#4C3073]' : 'text-gray-500'}`}>
                                                                    {shelf.name}
                                                                </span>
                                                                {droppedQty > 0 && (
                                                                    <span className="absolute -top-3 -right-2 bg-green-500 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-lg animate-bounce">
                                                                        +{droppedQty}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {Object.keys(shelvesData).length > 0 && (
                                            <div className="flex flex-col gap-8">
                                                <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-l-2 border-gray-300 pl-2">Estantería Matricial</h4>
                                                {Object.keys(shelvesData).sort().map(prefix => (
                                                    <div key={prefix} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-gray-800 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-md tracking-widest shadow-md">PASILLO: {prefix}</div>
                                                            <div className="h-[1px] flex-1 bg-gray-100"></div>
                                                        </div>
                                                        <div className="flex flex-row overflow-x-auto gap-4 pb-4 px-2">
                                                            {Object.keys(shelvesData[prefix]).sort((a,b) => parseInt(a) - parseInt(b)).map(col => (
                                                                <div key={col} className="flex flex-col border-r-4 border-gray-100 pr-4 last:border-r-0">
                                                                    <span className="text-[10px] font-black text-gray-300 text-center mb-2 uppercase italic">Col {col}</span>
                                                                    <div className="flex flex-col gap-2">
                                                                        {shelvesData[prefix][col].map(loc => {
                                                                            const droppedQty = assignedDestinations.filter(a => a.dest_location_id === loc.id).reduce((sum, a) => sum + a.transferQuantity, 0);
                                                                            const isHovered = dropHoveredId === loc.id;
                                                                            return (
                                                                                <div 
                                                                                    key={loc.id} 
                                                                                    onDragOver={e => e.preventDefault()}
                                                                                    onDragEnter={e => handleDragEnter(e, loc.id)}
                                                                                    onDragLeave={handleDragLeave}
                                                                                    onDrop={e => handleDrop(e, loc.id)}
                                                                                    className={`relative flex flex-col items-center justify-center w-20 h-16 border-b-[5px] rounded-t-lg transition-all duration-300 ${isHovered ? 'ring-8 ring-purple-500/20 border-purple-600 bg-purple-100 scale-90 shadow-inner z-20' : droppedQty > 0 ? 'bg-purple-50 border-[#4C3073] ring-2 ring-purple-300 transform scale-105 z-10 shadow-md' : 'bg-gray-50 border-gray-200 hover:bg-white hover:border-purple-300'}`}
                                                                                >
                                                                                    <span className={`text-[12px] font-black ${droppedQty > 0 || isHovered ? 'text-[#4C3073]' : 'text-gray-400'}`}>N {loc.level}</span>
                                                                                    {droppedQty > 0 && (
                                                                                        <div className="absolute -top-3 -right-2 bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg z-20 animate-bounce">
                                                                                            +{droppedQty}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
