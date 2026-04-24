import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPharmacySchema, getMyCompanyId } from '../api/pharmacyClient';
import { ArrowLeft, Check, Plus, Trash2, Package, Edit2, X } from 'lucide-react';

export default function GestorUbicaciones() {
    const { locationId } = useParams();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [managerParentLocation, setManagerParentLocation] = useState(null);
    const [locations, setLocations] = useState([]);
    const [batchCounts, setBatchCounts] = useState({});
    
    const [managerTab, setManagerTab] = useState('individual'); // 'individual' | 'massive'
    const [newLocationName, setNewLocationName] = useState('');
    
    const [massPrefix, setMassPrefix] = useState('E');
    const [massCols, setMassCols] = useState(1);
    const [massLevels, setMassLevels] = useState(1);
    const [massDepth, setMassDepth] = useState('1');
    const [massPreviews, setMassPreviews] = useState([]);
    const [isSavingMassive, setIsSavingMassive] = useState(false);

    // Editing States
    const [editingPrefix, setEditingPrefix] = useState(null);
    const [newPrefixValue, setNewPrefixValue] = useState('');

    const { shelvesData, specialZones } = useMemo(() => {
        const regex = /(.+)-C(\d+)-N(\d+)/;
        const shelves = {};
        const specials = [];

        locations.forEach(loc => {
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
    }, [locations]);

    useEffect(() => {
        fetchData();
    }, [locationId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const companyId = await getMyCompanyId();
            if (!companyId) return;

            const schema = getPharmacySchema();
            
            // Get parent location
            const { data: parentLoc, error: parentError } = await schema.from('locations').select('*').eq('id', locationId).single();
            if (parentError) throw parentError;
            setManagerParentLocation(parentLoc);

            // Get child locations
            const { data: childLocs } = await schema.from('locations').select('*').eq('parent_location_id', locationId).order('name');
            setLocations(childLocs || []);

            // Get batches for these children
            const childIds = (childLocs || []).map(l => l.id);
            if (childIds.length > 0) {
                const { data: batches } = await schema.from('inventory_batches').select('location_id, id').in('location_id', childIds).gt('current_quantity', 0);
                const counts = {};
                (batches || []).forEach(b => {
                    counts[b.location_id] = (counts[b.location_id] || 0) + 1;
                });
                setBatchCounts(counts);
            } else {
                setBatchCounts({});
            }

        } catch (error) {
            console.error('Error fetching data:', error);
            alert('Error al cargar datos del gestor.');
            navigate('/mapa-logistico');
        } finally {
            setLoading(false);
        }
    };

    const handleAddIndividual = async () => {
        if (!newLocationName.trim()) {
            alert('Ingrese un nombre para la ubicación.');
            return;
        }
        try {
            const companyId = await getMyCompanyId();
            const schema = getPharmacySchema();

            await schema.from('locations').insert([{
                company_id: companyId,
                warehouse_id: managerParentLocation.warehouse_id,
                name: newLocationName,
                location_type: managerParentLocation.location_type,
                parent_location_id: managerParentLocation.id
            }]);
            
            setNewLocationName('');
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Error al crear ubicación.');
        }
    };

    const handleDeleteLocation = async (location) => {
        const confirmDelete = window.confirm(`¿Está seguro de eliminar la ubicación ${location.name}?`);
        if (!confirmDelete) return;

        const schema = getPharmacySchema();
        
        const { data: batches } = await schema.from('inventory_batches').select('id').eq('location_id', location.id).limit(1);
        const { data: moveFrom } = await schema.from('inventory_movements').select('id').eq('from_location_id', location.id).limit(1);
        const { data: moveTo } = await schema.from('inventory_movements').select('id').eq('to_location_id', location.id).limit(1);
        const { data: moveSource } = await schema.from('inventory_movements').select('id').eq('source_location_id', location.id).limit(1);
        const { data: moveDest } = await schema.from('inventory_movements').select('id').eq('destination_location_id', location.id).limit(1);

        if ((batches && batches.length > 0) || (moveFrom && moveFrom.length > 0) || (moveTo && moveTo.length > 0) || (moveSource && moveSource.length > 0) || (moveDest && moveDest.length > 0)) {
            alert('No se puede eliminar porque existen registros históricos o stock asociado a esta ubicación.');
            return;
        }

        const { error } = await schema.from('locations').delete().eq('id', location.id);
        if (error) {
            console.error(error);
            alert('Error al eliminar la ubicación.');
        } else {
            fetchData();
        }
    };

    const handleGeneratePreviews = () => {
        const previews = [];
        for (let c = 1; c <= massCols; c++) {
            for (let n = 1; n <= massLevels; n++) {
                const cStr = c.toString().padStart(2, '0');
                const nStr = n.toString().padStart(2, '0');
                if (massDepth === '2') {
                    previews.push(`${massPrefix}-C${cStr}-N${nStr}-F1`);
                    previews.push(`${massPrefix}-C${cStr}-N${nStr}-F2`);
                } else {
                    previews.push(`${massPrefix}-C${cStr}-N${nStr}`);
                }
            }
        }
        setMassPreviews(previews);
    };

    const handleSaveMassive = async () => {
        if (!managerParentLocation || massPreviews.length === 0) return;
        
        try {
            setIsSavingMassive(true);
            const companyId = await getMyCompanyId();
            const schema = getPharmacySchema();

            const insertData = massPreviews.map(name => ({
                company_id: companyId,
                warehouse_id: managerParentLocation.warehouse_id,
                name: name,
                location_type: managerParentLocation.location_type,
                parent_location_id: managerParentLocation.id
            }));

            const { error } = await schema.from('locations').insert(insertData);
            if (error) throw error;

            alert(`Se crearon ${massPreviews.length} ubicaciones exitosamente.`);
            setMassPreviews([]);
            fetchData();
        } catch (error) {
            console.error('Error in bulk creation:', error);
            alert('Error al crear ubicaciones masivas.');
        } finally {
            setIsSavingMassive(false);
        }
    };

    const handleRenamePrefix = async (oldPrefix) => {
        const trimmedNewPrefix = newPrefixValue.trim();
        if (!trimmedNewPrefix || trimmedNewPrefix === oldPrefix) {
            setEditingPrefix(null);
            return;
        }

        try {
            setLoading(true);
            const schema = getPharmacySchema();
            
            // Get all locations with this prefix
            const prefixLocations = [];
            if (shelvesData[oldPrefix]) {
                Object.values(shelvesData[oldPrefix]).forEach(col => {
                    col.forEach(loc => prefixLocations.push(loc));
                });
            }

            console.log(`Renaming ${prefixLocations.length} locations from "${oldPrefix}" to "${trimmedNewPrefix}"`);

            // Prepare updates
            const updatePromises = prefixLocations.map(async (loc) => {
                // Ensure we only replace the prefix at the start
                const newName = loc.name.startsWith(oldPrefix) 
                    ? trimmedNewPrefix + loc.name.substring(oldPrefix.length) 
                    : loc.name;
                
                const { error } = await schema.from('locations').update({ name: newName }).eq('id', loc.id);
                if (error) {
                    console.error(`Error updating location ${loc.id} (${loc.name}):`, error);
                    throw error;
                }
            });

            await Promise.all(updatePromises);
            console.log("Bulk rename completed successfully");
            
            setEditingPrefix(null);
            setNewPrefixValue('');
            await fetchData();
        } catch (error) {
            console.error('Error renaming prefix:', error);
            alert('Error al renombrar el pasillo. Verifique la consola para más detalles.');
        } finally {
            setLoading(false);
        }
    };

    if (loading || !managerParentLocation) {
        return <div className="h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4C3073]"></div></div>;
    }

    return (
        <div className="h-full flex flex-col bg-gray-50 overflow-auto">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-6 flex items-center gap-4 shrink-0 shadow-sm">
                <button onClick={() => navigate('/mapa-logistico')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                    <ArrowLeft className="h-6 w-6" />
                </button>
                <div>
                    <h1 className="text-2xl font-black text-[#4C3073] uppercase tracking-tight">Gestor de Ubicaciones</h1>
                    <p className="text-gray-500 text-sm font-medium mt-1 uppercase">BODEGA: {managerParentLocation.name}</p>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 flex flex-col items-center">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-4xl flex flex-col">
                    <div className="flex border-b border-gray-200 shrink-0">
                        <button 
                            onClick={() => setManagerTab('individual')}
                            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${managerTab === 'individual' ? 'border-b-2 border-[#4C3073] text-[#4C3073] bg-purple-50/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            Creación Individual
                        </button>
                        <button 
                            onClick={() => setManagerTab('massive')}
                            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${managerTab === 'massive' ? 'border-b-2 border-[#4C3073] text-[#4C3073] bg-purple-50/30' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            Creación Masiva (Matriz)
                        </button>
                    </div>

                    <div className="p-8">
                        {managerTab === 'individual' && (
                            <div className="flex flex-col gap-8">
                                <div className="flex flex-col gap-3">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Añadir Estante / Vitrina</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Ej: Vitrina 1..."
                                            value={newLocationName}
                                            onChange={e => setNewLocationName(e.target.value)}
                                            className="flex-1 px-4 py-3 border border-gray-300 rounded-sm outline-none focus:border-[#4C3073]"
                                        />
                                        <button 
                                            onClick={handleAddIndividual}
                                            className="bg-[#4C3073] text-white px-6 py-3 rounded-sm text-sm font-bold flex items-center gap-2 hover:bg-[#3d265c] transition-colors"
                                        >
                                            <Plus className="h-5 w-5" /> Añadir
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-6">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase border-b pb-2">Mapa de Ubicaciones (Digital Twin)</h3>
                                    
                                    {locations.length === 0 ? (
                                        <p className="text-sm text-gray-400 italic py-8 text-center bg-gray-50 rounded border border-dashed border-gray-200">No hay ubicaciones creadas aún.</p>
                                    ) : (
                                        <div className="flex flex-col gap-8">
                                            {/* ZONAS ESPECIALES */}
                                            {specialZones.length > 0 && (
                                                <div className="flex flex-col gap-3">
                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Zonas Individuales</h4>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                        {specialZones.map(shelf => {
                                                            const shelfCount = batchCounts[shelf.id] || 0;
                                                            const isActive = shelfCount > 0;
                                                            return (
                                                                <div key={shelf.id} className={`relative flex flex-col items-center justify-center p-3 h-24 border-b-[6px] rounded-t-sm shadow-sm transition-colors group ${isActive ? 'bg-purple-50 border-[#4C3073]' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
                                                                    <div className={`mb-1 ${isActive ? 'text-[#4C3073]' : 'text-gray-400'}`}>
                                                                        <Package className="h-5 w-5" />
                                                                    </div>
                                                                    <span className={`text-[11px] font-black text-center uppercase tracking-tight leading-tight px-1 ${isActive ? 'text-[#4C3073]' : 'text-gray-700'}`}>
                                                                        {shelf.name}
                                                                    </span>
                                                                    <span className={`text-[9px] font-bold mt-1 ${isActive ? 'text-purple-600' : 'text-gray-400'}`}>
                                                                        {shelfCount > 0 ? `${shelfCount} lotes` : 'Vacío'}
                                                                    </span>
                                                                    <button 
                                                                        onClick={() => handleDeleteLocation(shelf)} 
                                                                        className="absolute top-0 right-0 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-bl-sm"
                                                                        title="Eliminar zona"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* ESTANTERÍAS (PASILLOS) */}
                                            {Object.keys(shelvesData).length > 0 && (
                                                <div className="flex flex-col gap-6">
                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estanterías (Matriz)</h4>
                                                    {Object.keys(shelvesData).sort().map(prefix => (
                                                        <div key={prefix} className="bg-gray-100 p-4 rounded-lg border border-gray-200 shadow-inner flex flex-col gap-4">
                                                            <div className="flex items-center gap-2">
                                                                {editingPrefix === prefix ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <input 
                                                                            type="text" 
                                                                            value={newPrefixValue} 
                                                                            onChange={e => setNewPrefixValue(e.target.value)}
                                                                            className="bg-white text-gray-800 text-xs font-black uppercase px-2 py-1 rounded-sm border border-[#4C3073] outline-none"
                                                                            autoFocus
                                                                        />
                                                                        <button onClick={() => handleRenamePrefix(prefix)} className="text-green-600 hover:text-green-700 bg-white p-1 rounded-sm shadow-sm"><Check className="h-3.5 w-3.5" /></button>
                                                                        <button onClick={() => setEditingPrefix(null)} className="text-red-600 hover:text-red-700 bg-white p-1 rounded-sm shadow-sm"><X className="h-3.5 w-3.5" /></button>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <span className="bg-gray-800 text-white text-xs font-black uppercase px-3 py-1 rounded-sm tracking-wider flex items-center gap-2">
                                                                            Pasillo: {prefix}
                                                                            <button 
                                                                                onClick={() => { setEditingPrefix(prefix); setNewPrefixValue(prefix); }}
                                                                                className="hover:text-purple-300 transition-colors"
                                                                            >
                                                                                <Edit2 className="h-3 w-3" />
                                                                            </button>
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-row overflow-x-auto gap-2 pb-2">
                                                                {Object.keys(shelvesData[prefix]).sort((a,b) => parseInt(a) - parseInt(b)).map(col => (
                                                                    <div key={col} className="flex flex-col border-r-4 border-gray-300 pr-2 last:border-r-0">
                                                                        <span className="text-[10px] font-bold text-gray-400 text-center mb-1">Columna {col}</span>
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {shelvesData[prefix][col].map(loc => {
                                                                                const count = batchCounts[loc.id] || 0;
                                                                                const isActive = count > 0;
                                                                                return (
                                                                                    <div key={loc.id} className={`relative flex flex-col items-center justify-center w-24 h-16 border-b-[6px] rounded-t-sm group transition-colors ${isActive ? 'bg-purple-50 border-[#4C3073]' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
                                                                                        <span className={`text-sm font-black ${isActive ? 'text-[#4C3073]' : 'text-gray-600'}`}>Nivel {loc.level}</span>
                                                                                        <span className={`text-[10px] font-bold ${isActive ? 'text-purple-600' : 'text-gray-400'}`}>{count > 0 ? `${count} lotes` : 'Vacío'}</span>
                                                                                        <button 
                                                                                            onClick={() => handleDeleteLocation(loc)} 
                                                                                            className="absolute top-0 right-0 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-bl-sm"
                                                                                            title="Eliminar celda"
                                                                                        >
                                                                                            <Trash2 className="h-3 w-3" />
                                                                                        </button>
                                                                                        {/* Show depth if name contains -F */}
                                                                                        {loc.name.includes('-F') && (
                                                                                            <span className="absolute bottom-0 right-0 text-[9px] font-black text-gray-400 bg-gray-100 px-1 rounded-tl-sm border-l border-t border-gray-200">{loc.name.split('-').pop()}</span>
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

                        {managerTab === 'massive' && (
                            <div className="flex flex-col gap-8">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Prefijo</label>
                                        <input type="text" value={massPrefix} onChange={e => setMassPrefix(e.target.value)} className="border border-gray-300 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#4C3073]" placeholder="Ej: P1" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Columnas</label>
                                        <input type="number" min="1" value={massCols} onChange={e => setMassCols(parseInt(e.target.value) || 1)} className="border border-gray-300 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#4C3073]" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Niveles</label>
                                        <input type="number" min="1" value={massLevels} onChange={e => setMassLevels(parseInt(e.target.value) || 1)} className="border border-gray-300 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#4C3073]" />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Profundidad</label>
                                        <select value={massDepth} onChange={e => setMassDepth(e.target.value)} className="border border-gray-300 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#4C3073]">
                                            <option value="1">Simple</option>
                                            <option value="2">Doble</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={handleGeneratePreviews}
                                    className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold text-sm py-3 rounded-sm transition-colors w-full"
                                >
                                    Previsualizar Matriz
                                </button>

                                {massPreviews.length > 0 && (
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                                            <h3 className="text-xs font-bold text-gray-500 uppercase">Previsualización</h3>
                                            <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Se crearán {massPreviews.length} ubicaciones</span>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-4 bg-gray-50 border border-gray-200 rounded-sm">
                                            {massPreviews.map((p, idx) => (
                                                <div key={idx} className="text-sm font-mono bg-white p-2 text-center rounded border border-gray-200 text-gray-700 shadow-sm">{p}</div>
                                            ))}
                                        </div>
                                        <button 
                                            onClick={handleSaveMassive}
                                            disabled={isSavingMassive}
                                            className="mt-4 bg-[#4C3073] hover:bg-[#3d265c] text-white font-bold py-3.5 rounded-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isSavingMassive ? (
                                                <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> Guardando...</>
                                            ) : (
                                                <><Check className="h-5 w-5" /> Confirmar Creación Masiva</>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
