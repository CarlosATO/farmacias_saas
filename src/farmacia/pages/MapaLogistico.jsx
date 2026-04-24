import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPharmacySchema, getMyCompanyId } from '../api/pharmacyClient';
import { 
    Warehouse, 
    MapPin, 
    Clock, 
    Package, 
    ShoppingCart, 
    Shield, 
    Snowflake,
    Plus,
    Edit2,
    Check,
    X,
    Building,
    Trash2,
    ArrowRightLeft
} from 'lucide-react';

import { useSucursal } from '../context/SucursalContext';

const LOCATION_ICONS = {
    'QUARANTINE': { icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
    'STORAGE': { icon: Package, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
    'SALES': { icon: ShoppingCart, color: 'text-green-500', bg: 'bg-green-50', border: 'border-green-200' },
    'COLD_CHAIN': { icon: Snowflake, color: 'text-cyan-500', bg: 'bg-cyan-50', border: 'border-cyan-200' },
    'SECURE': { icon: Shield, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
};

const LOCATION_TYPES = [
    { value: 'QUARANTINE', label: 'Cuarentena / Recepción' },
    { value: 'STORAGE', label: 'Almacenamiento General' },
    { value: 'SALES', label: 'Sala de Ventas' },
    { value: 'COLD_CHAIN', label: 'Cadena de Frío' },
    { value: 'SECURE', label: 'Controlados / Seguridad' }
];

export default function MapaLogistico() {
    const navigate = useNavigate();
    const { activeWarehouse } = useSucursal();
    const [warehouses, setWarehouses] = useState([]);
    const [locations, setLocations] = useState([]);
    const [batchCounts, setBatchCounts] = useState({});
    const [loading, setLoading] = useState(true);

    const [editingEntity, setEditingEntity] = useState(null); // { type: 'location', id, name }
    const [newLocation, setNewLocation] = useState(null); // { warehouse_id, name, location_type, parent_location_id }

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const companyId = await getMyCompanyId();
            if (!companyId) return;

            const schema = getPharmacySchema();
            
            // Si hay un local activo, solo traemos ese. Si no, traemos todos.
            let whQuery = schema.from('warehouses').select('*').eq('company_id', companyId);
            if (activeWarehouse?.id) {
                whQuery = whQuery.eq('id', activeWarehouse.id);
            }
            
            const [whRes, locRes, batchRes] = await Promise.all([
                whQuery.order('name'),
                schema.from('locations').select('*').eq('company_id', companyId).order('name'),
                schema.from('inventory_batches').select('location_id, id').eq('company_id', companyId).gt('current_quantity', 0)
            ]);

            setWarehouses(whRes.data || []);
            setLocations(locRes.data || []);

            // Calculate counts
            const counts = {};
            (batchRes.data || []).forEach(b => {
                if (b.location_id) {
                    counts[b.location_id] = (counts[b.location_id] || 0) + 1;
                }
            });
            setBatchCounts(counts);

        } catch (error) {
            console.error('Error fetching map data:', error);
        } finally {
            setLoading(false);
        }
    }, [activeWarehouse]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveEdit = async () => {
        if (!editingEntity || !editingEntity.name.trim()) return;
        const schema = getPharmacySchema();
        
        try {
            await schema.from('locations').update({ name: editingEntity.name }).eq('id', editingEntity.id);
            setEditingEntity(null);
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Error al guardar el nombre.');
        }
    };

    const handleAddLocation = async (warehouseId, parentId = null, locationType = '') => {
        if (!newLocation || !newLocation.name.trim() || (!parentId && !newLocation.location_type)) {
            alert('Complete el nombre y tipo de ubicación.');
            return;
        }
        try {
            const companyId = await getMyCompanyId();
            const schema = getPharmacySchema();

            await schema.from('locations').insert([{
                company_id: companyId,
                warehouse_id: warehouseId,
                name: newLocation.name,
                location_type: parentId ? locationType : newLocation.location_type,
                parent_location_id: parentId
            }]);
            
            setNewLocation(null);
            fetchData();
        } catch (error) {
            console.error(error);
            alert('Error al crear ubicación.');
        }
    };

    const handleDeleteLocation = async (location) => {
        if (location.location_type === 'QUARANTINE') {
            alert('La ubicación de Recepción (QUARANTINE) está protegida y no se puede borrar.');
            return;
        }

        const confirmDelete = window.confirm(`¿Está seguro de eliminar la ubicación ${location.name}?`);
        if (!confirmDelete) return;

        const schema = getPharmacySchema();
        
        const { data: batches } = await schema.from('inventory_batches')
            .select('id').eq('location_id', location.id).limit(1);
            
        const { data: moveFrom } = await schema.from('inventory_movements')
            .select('id').eq('from_location_id', location.id).limit(1);
            
        const { data: moveTo } = await schema.from('inventory_movements')
            .select('id').eq('to_location_id', location.id).limit(1);
            
        const { data: moveSource } = await schema.from('inventory_movements')
            .select('id').eq('source_location_id', location.id).limit(1);
            
        const { data: moveDest } = await schema.from('inventory_movements')
            .select('id').eq('destination_location_id', location.id).limit(1);

        if ((batches && batches.length > 0) || 
            (moveFrom && moveFrom.length > 0) || 
            (moveTo && moveTo.length > 0) ||
            (moveSource && moveSource.length > 0) ||
            (moveDest && moveDest.length > 0)) {
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

    if (loading) {
        return <div className="h-full flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4C3073]"></div></div>;
    }

    return (
        <div className="h-full flex flex-col bg-gray-50 overflow-auto">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-6 flex justify-between items-center shrink-0 shadow-sm">
                <div>
                    <h1 className="text-2xl font-black text-[#4C3073] flex items-center gap-2 tracking-tight">
                        <MapPin className="h-6 w-6" />
                        Bodegas y Ubicaciones
                    </h1>
                    <p className="text-gray-500 text-sm font-medium mt-1">
                        {warehouses.length > 0 ? `Gestionando infraestructura de sucursal: ${warehouses[0].name}` : 'Gestión visual de infraestructura y zonas de inventario'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado Sucursal</span>
                        <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div> Operativa
                        </span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                {warehouses.length > 0 ? (
                    warehouses.map(warehouse => (
                        <div key={warehouse.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-w-5xl mx-auto">
                            
                            {/* Warehouse Header */}
                            <div className="bg-gray-100 px-6 py-5 border-b border-gray-200 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-200 text-[#4C3073]">
                                        <Warehouse className="h-6 w-6" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Configuración de Local</span>
                                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-wide leading-tight">
                                            {warehouse.name}
                                        </h2>
                                    </div>
                                </div>
                                <div className="hidden md:flex flex-col items-end text-right">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ID Sucursal</span>
                                    <span className="text-[10px] font-mono text-gray-400">{warehouse.id.substring(0,8)}...</span>
                                </div>
                            </div>

                            {/* Locations Grid */}
                            <div className="p-6 bg-gray-50/50">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Zonas de Operación y Almacenaje</h3>
                                    <span className="text-[10px] font-bold text-[#4C3073] bg-purple-50 px-2 py-1 rounded">
                                        {locations.filter(l => l.warehouse_id === warehouse.id && !l.parent_location_id).length} Zonas activas
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {locations.filter(l => l.warehouse_id === warehouse.id && !l.parent_location_id).map(location => {
                                        const locConfig = LOCATION_ICONS[location.location_type] || LOCATION_ICONS['STORAGE'];
                                        const Icon = locConfig.icon;
                                        const count = batchCounts[location.id] || 0;

                                        return (
                                            <div key={location.id} className={`relative p-4 rounded-xl border-2 transition-all hover:shadow-md group flex flex-col ${locConfig.border} ${locConfig.bg}`}>
                                                {editingEntity?.id === location.id && editingEntity?.type === 'location' ? (
                                                    <div className="flex flex-col gap-2">
                                                        <input
                                                            type="text"
                                                            value={editingEntity.name}
                                                            onChange={e => setEditingEntity({...editingEntity, name: e.target.value})}
                                                            className="text-sm font-bold px-3 py-2 border border-purple-300 rounded-lg outline-none w-full shadow-sm"
                                                            autoFocus
                                                        />
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={handleSaveEdit} className="text-green-600 p-2 bg-white rounded-lg border border-green-200 hover:bg-green-50"><Check className="h-4 w-4" /></button>
                                                            <button onClick={() => setEditingEntity(null)} className="text-red-600 p-2 bg-white rounded-lg border border-red-200 hover:bg-red-50"><X className="h-4 w-4" /></button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`p-2 rounded-xl bg-white shadow-sm ${locConfig.color} border border-black/5`}>
                                                                    <Icon className="h-5 w-5" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-[13px] font-black text-gray-800 uppercase tracking-tight">{location.name}</p>
                                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{LOCATION_TYPES.find(t => t.value === location.location_type)?.label || location.location_type}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button 
                                                                    onClick={() => setEditingEntity({ type: 'location', id: location.id, name: location.name })}
                                                                    className="text-gray-400 hover:text-[#4C3073] p-1.5 hover:bg-white rounded-lg transition-all"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                {location.location_type !== 'QUARANTINE' && (
                                                                    <button 
                                                                        onClick={() => handleDeleteLocation(location)}
                                                                        className="text-gray-400 hover:text-red-600 p-1.5 hover:bg-white rounded-lg transition-all"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="mt-4 flex justify-between items-center border-t border-black/5 pt-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Stock:</span>
                                                                <span className={`text-[11px] font-black ${count > 0 ? 'text-[#4C3073]' : 'text-gray-400'}`}>
                                                                    {count} <span className="font-bold">LOTES</span>
                                                                </span>
                                                            </div>
                                                            
                                                            {location.location_type !== 'QUARANTINE' && (
                                                                <button 
                                                                    onClick={() => navigate(`/mapa-logistico/gestor/${location.id}`)}
                                                                    className="text-[10px] font-black uppercase text-[#4C3073] hover:text-[#3d265c] flex items-center gap-1 group/btn"
                                                                >
                                                                    Configurar <ArrowRightLeft size={10} className="transition-transform group-hover/btn:translate-x-0.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Add Level 2 Location Card */}
                                    {newLocation?.warehouse_id === warehouse.id && !newLocation?.parent_location_id ? (
                                        <div className="p-4 rounded-xl border-2 border-dashed border-[#4C3073] bg-purple-50 flex flex-col gap-3 animate-in zoom-in-95 duration-200">
                                            <input
                                                type="text"
                                                placeholder="Nombre de la zona..."
                                                value={newLocation.name}
                                                onChange={e => setNewLocation({...newLocation, name: e.target.value})}
                                                className="text-sm px-3 py-2 border border-purple-200 rounded-lg outline-none w-full shadow-sm"
                                                autoFocus
                                            />
                                            <select
                                                value={newLocation.location_type}
                                                onChange={e => setNewLocation({...newLocation, location_type: e.target.value})}
                                                className="text-[11px] px-3 py-2 border border-purple-200 rounded-lg outline-none w-full text-gray-700 font-black uppercase"
                                            >
                                                <option value="">Tipo de zona...</option>
                                                {LOCATION_TYPES.map(t => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleAddLocation(warehouse.id)} className="flex-1 bg-[#4C3073] hover:bg-[#3d265c] text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">Guardar</button>
                                                <button onClick={() => setNewLocation(null)} className="px-3 bg-white border border-gray-200 text-gray-500 py-2 rounded-lg transition-all"><X size={16} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => setNewLocation({ warehouse_id: warehouse.id, name: '', location_type: '' })}
                                            className="p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#4C3073] hover:bg-purple-50/50 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-[#4C3073] transition-all min-h-[120px]"
                                        >
                                            <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                                                <Plus size={24} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Añadir Nueva Zona</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-24 flex flex-col items-center justify-center text-gray-400 animate-in fade-in duration-700">
                        <Building size={80} className="mb-6 opacity-10" />
                        <h2 className="text-xl font-black text-gray-400 uppercase tracking-widest">Sin sucursal seleccionada</h2>
                        <p className="text-sm mt-2 font-medium">Seleccione un local activo en el menú superior para gestionar su infraestructura.</p>
                        <button 
                            onClick={() => navigate('/sucursales')}
                            className="mt-8 bg-[#4C3073] hover:bg-[#3d265c] text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg active:scale-95"
                        >
                            Ir a Administración de Locales
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
