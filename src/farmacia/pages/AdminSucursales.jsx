import React, { useEffect, useState } from 'react';
import { 
    fetchWarehouses, 
    createWarehouse, 
    updateWarehouse, 
    deleteWarehouse 
} from '../api/pharmacyClient';
import { 
    Plus, 
    Trash2, 
    MapPin, 
    Building2,
    Save,
    Search,
    AlertCircle,
    ArrowLeft,
    ArrowRight
} from 'lucide-react';

/**
 * AdminSucursales: Gestión de locales y sedes siguiendo el estándar Datix ERP.
 * Arquitectura: Document-Centric (LIST/FORM).
 * Estética: Sobria, elegante, estilo Odoo.
 */
export default function AdminSucursales() {
    // --- ESTADO ---
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('LIST'); // 'LIST' o 'FORM'
    const [editingWarehouse, setEditingWarehouse] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        city: '',
        manager_name: '',
        phone: '',
        opening_hours: '',
        is_active: true
    });

    // --- EFECTOS ---
    useEffect(() => {
        loadWarehouses();
    }, []);

    // --- ACCIONES API ---
    const loadWarehouses = async () => {
        try {
            setLoading(true);
            const { data, error } = await fetchWarehouses();
            if (error) throw error;
            setWarehouses(data || []);
        } catch (err) {
            console.error("Error cargando sucursales:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name.trim()) {
            alert("El nombre es obligatorio");
            return;
        }

        try {
            setLoading(true);
            if (editingWarehouse) {
                await updateWarehouse(editingWarehouse.id, formData);
            } else {
                await createWarehouse(formData);
            }
            setViewMode('LIST');
            loadWarehouses();
        } catch (err) {
            console.error("Error guardando sucursal:", err);
            alert("Error al guardar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("¿Está seguro de desactivar esta sucursal?")) {
            try {
                await deleteWarehouse(id);
                loadWarehouses();
            } catch (err) {
                console.error("Error eliminando sucursal:", err);
            }
        }
    };

    // --- MANEJO DE VISTA ---
    const handleNew = () => {
        setEditingWarehouse(null);
        setFormData({
            name: '',
            address: '',
            city: '',
            manager_name: '',
            phone: '',
            opening_hours: '',
            is_active: true
        });
        setViewMode('FORM');
    };

    const handleEdit = (warehouse) => {
        setEditingWarehouse(warehouse);
        setFormData({
            name: warehouse.name || '',
            address: warehouse.address || '',
            city: warehouse.city || '',
            manager_name: warehouse.manager_name || '',
            phone: warehouse.phone || '',
            opening_hours: warehouse.opening_hours || '',
            is_active: warehouse.is_active ?? true
        });
        setViewMode('FORM');
    };

    // --- FILTRADO ---
    const filteredWarehouses = warehouses.filter(w => 
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.city?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- RENDER FORMULARIO ---
    if (viewMode === 'FORM') {
        return (
            <div className="flex flex-col h-full bg-[#f8f9fa]">
                <div className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center sticky top-0 z-10">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            <span>CATÁLOGO DE SUCURSALES</span>
                            <span>/</span>
                            <span className="text-[#4C3073]">{editingWarehouse ? editingWarehouse.name : 'NUEVA SUCURSAL'}</span>
                        </div>
                        <button 
                            onClick={() => setViewMode('LIST')}
                            className="flex items-center gap-2 text-[11px] font-bold text-gray-600 hover:text-[#4C3073] uppercase border border-gray-300 px-3 py-1.5 rounded bg-white transition-colors"
                        >
                            <ArrowLeft size={14} /> Cancelar y Volver
                        </button>
                    </div>
                    <button 
                        onClick={handleSave}
                        className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded text-[11px] font-bold uppercase flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                    >
                        <Save size={16} /> {editingWarehouse ? 'Guardar Cambios' : 'Guardar Sucursal'}
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 md:p-8">
                    <div className="max-w-5xl mx-auto space-y-6">
                        <div className="bg-white border border-gray-200 p-6 rounded-sm">
                            <h3 className="text-2xl font-bold text-[#4C3073] flex items-center gap-3">
                                <Building2 size={24} /> {editingWarehouse ? 'Editar Sucursal' : 'Nueva Sucursal'}
                            </h3>
                            <p className="text-gray-400 text-sm mt-1 font-medium">Complete los datos técnicos del local para el sistema WMS.</p>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
                            <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                                <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Identificación y Contacto</h4>
                            </div>
                            
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                <div className="md:col-span-2">
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-2">Nombre Comercial del Local *</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded focus:border-[#4C3073] outline-none transition-all font-bold"
                                        placeholder="Ej: Farmacia Alameda Central"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-2">Dirección Física Exacta</label>
                                    <input 
                                        type="text" 
                                        value={formData.address}
                                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded focus:border-[#4C3073] outline-none transition-all"
                                        placeholder="Av. Providencia 1234, Local 5"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-2">Ciudad / Comuna</label>
                                    <input 
                                        type="text" 
                                        value={formData.city}
                                        onChange={(e) => setFormData({...formData, city: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded focus:border-[#4C3073] outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-2">Teléfono de Contacto</label>
                                    <input 
                                        type="text" 
                                        value={formData.phone}
                                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded focus:border-[#4C3073] outline-none transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-2">Responsable / Químico Regente</label>
                                    <input 
                                        type="text" 
                                        value={formData.manager_name}
                                        onChange={(e) => setFormData({...formData, manager_name: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded focus:border-[#4C3073] outline-none transition-all font-medium"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-gray-500 uppercase mb-2">Horarios de Atención</label>
                                    <input 
                                        type="text" 
                                        value={formData.opening_hours}
                                        onChange={(e) => setFormData({...formData, opening_hours: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded focus:border-[#4C3073] outline-none transition-all"
                                        placeholder="Ej: Lunes a Sábado 09:00 - 21:00"
                                    />
                                </div>

                                {!editingWarehouse && (
                                    <div className="col-span-full bg-blue-50 border border-blue-100 p-4 rounded flex gap-3">
                                        <AlertCircle className="text-blue-500 shrink-0" size={20} />
                                        <div>
                                            <p className="font-bold text-blue-900 text-xs">Provisionamiento WMS Automático</p>
                                            <p className="text-[11px] text-blue-800 leading-tight mt-1 font-medium">
                                                Al crear la sucursal, el sistema generará las bodegas base: <b className="text-blue-900">CUARENTENA, STORAGE y SALA DE VENTAS</b>.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="col-span-full pt-4">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-[#4C3073] border-gray-300 rounded focus:ring-[#4C3073]"
                                            checked={formData.is_active}
                                            onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                                        />
                                        <span className="text-[11px] font-bold text-gray-500 group-hover:text-gray-700 uppercase tracking-tighter transition-colors">Sucursal Operativa / Activa</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- RENDER LISTA ---
    return (
        <div className="p-6 max-w-7xl mx-auto bg-[#f8f9fa] min-h-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-[#4C3073] flex items-center gap-3 tracking-tight">
                        <Building2 size={32} /> ADMINISTRACIÓN DE SUCURSALES
                    </h1>
                    <p className="text-gray-400 text-sm font-medium">Panel de gestión de infraestructura física y red de locales.</p>
                </div>
                <button 
                    onClick={handleNew}
                    className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded shadow-sm font-bold uppercase text-[11px] flex items-center gap-2 transition-all active:scale-95"
                >
                    <Plus size={16} /> Nueva Sucursal
                </button>
            </div>

            {/* Búsqueda */}
            <div className="relative mb-8">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input 
                    type="text" 
                    placeholder="Filtrar por nombre, ciudad o dirección..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-6 py-3 bg-white border border-gray-200 rounded shadow-sm focus:border-[#4C3073] transition-all outline-none font-medium text-gray-700 text-sm"
                />
            </div>

            {/* Lista / Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full py-24 flex flex-col items-center justify-center text-gray-400 gap-4">
                        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#4C3073] rounded-full animate-spin"></div>
                        <p className="text-[11px] font-bold uppercase tracking-widest">Sincronizando con base de datos...</p>
                    </div>
                ) : filteredWarehouses.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-24 text-gray-300 border-2 border-dashed border-gray-200 rounded">
                        <Building2 size={64} className="opacity-10 mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest">Sin sucursales registradas</p>
                    </div>
                ) : (
                    filteredWarehouses.map(warehouse => (
                        <div 
                            key={warehouse.id} 
                            onClick={() => handleEdit(warehouse)}
                            className={`bg-white rounded border border-gray-200 cursor-pointer transition-all hover:border-[#4C3073] group relative shadow-sm hover:shadow-md ${!warehouse.is_active && 'opacity-60 bg-gray-50'}`}
                        >
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-10 w-10 rounded flex items-center justify-center border transition-colors ${warehouse.is_active ? 'border-purple-100 bg-purple-50 text-[#4C3073] group-hover:bg-[#4C3073] group-hover:text-white' : 'border-gray-200 bg-gray-100 text-gray-400'}`}>
                                            <Building2 size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-800 uppercase tracking-tight text-sm truncate max-w-[150px]">{warehouse.name}</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{warehouse.city || 'Ubicación no definida'}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDelete(warehouse.id); }} 
                                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                                        title="Desactivar sucursal"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="space-y-3 py-3 border-y border-gray-50">
                                    <div className="flex items-start gap-2 text-[11px] text-gray-500">
                                        <MapPin size={14} className="shrink-0 text-gray-300 mt-0.5" />
                                        <span className="leading-tight line-clamp-2">{warehouse.address || 'Sin dirección registrada'}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px] font-medium">
                                        <span className="text-gray-400 uppercase tracking-tighter">Responsable:</span>
                                        <span className="text-gray-700 truncate ml-2 font-bold uppercase">{warehouse.manager_name || 'Sin asignar'}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="px-6 py-3 bg-gray-50/50 flex justify-between items-center rounded-b">
                                <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${warehouse.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    <span className={`text-[10px] font-black uppercase ${warehouse.is_active ? 'text-green-700' : 'text-red-700'}`}>
                                        {warehouse.is_active ? 'Operativa' : 'Inactiva'}
                                    </span>
                                </div>
                                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest group-hover:text-[#4C3073] transition-colors flex items-center gap-1">
                                    Ver Detalle <ArrowRight size={10} />
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
