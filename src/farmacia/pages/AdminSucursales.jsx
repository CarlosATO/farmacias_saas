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
    ArrowRight,
    Edit2,
    X,
    Activity,
    Box,
    Users,
    Clock
} from 'lucide-react';

/**
 * AdminSucursales: Gestión de locales y sedes siguiendo el estándar Datix ERP.
 * Arquitectura: Document-Centric (LIST/FORM) con Drawer Lateral.
 * Estética: Sobria, elegante, estilo Odoo / SaaS Ejecutivo.
 */
export default function AdminSucursales() {
    // --- ESTADO ---
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // UI States
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState('DETAIL'); // 'DETAIL' | 'FORM'
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    
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
            if (selectedWarehouse && drawerMode === 'FORM') {
                await updateWarehouse(selectedWarehouse.id, formData);
            } else {
                await createWarehouse(formData);
            }
            setDrawerOpen(false);
            await loadWarehouses();
        } catch (err) {
            console.error("Error guardando sucursal:", err);
            alert("Error al guardar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id, e) => {
        if (e) e.stopPropagation();
        if (window.confirm("¿Está seguro de desactivar esta sucursal?")) {
            try {
                await deleteWarehouse(id);
                if (selectedWarehouse?.id === id) {
                    setDrawerOpen(false);
                }
                await loadWarehouses();
            } catch (err) {
                console.error("Error eliminando sucursal:", err);
            }
        }
    };

    // --- MANEJO DE VISTA ---
    const handleNew = () => {
        setSelectedWarehouse(null);
        setFormData({
            name: '',
            address: '',
            city: '',
            manager_name: '',
            phone: '',
            opening_hours: '',
            is_active: true
        });
        setDrawerMode('FORM');
        setDrawerOpen(true);
    };

    const handleViewDetail = (warehouse) => {
        setSelectedWarehouse(warehouse);
        setDrawerMode('DETAIL');
        setDrawerOpen(true);
    };

    const handleEdit = (warehouse, e) => {
        if (e) e.stopPropagation();
        setSelectedWarehouse(warehouse);
        setFormData({
            name: warehouse.name || '',
            address: warehouse.address || '',
            city: warehouse.city || '',
            manager_name: warehouse.manager_name || '',
            phone: warehouse.phone || '',
            opening_hours: warehouse.opening_hours || '',
            is_active: warehouse.is_active ?? true
        });
        setDrawerMode('FORM');
        setDrawerOpen(true);
    };

    // --- FILTRADO Y METRICAS ---
    const filteredWarehouses = warehouses.filter(w => 
        w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.city?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalWarehouses = warehouses.length;
    const activeWarehouses = warehouses.filter(w => w.is_active).length;
    const inactiveWarehouses = totalWarehouses - activeWarehouses;

    // --- RENDER DRAWER ---
    const renderDrawerContent = () => {
        if (drawerMode === 'FORM') {
            return (
                <div className="flex flex-col h-full bg-gray-50">
                    <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shrink-0">
                        <div>
                            <h2 className="text-lg font-black text-[#4C3073] uppercase tracking-tight">
                                {selectedWarehouse ? 'Editar Sucursal' : 'Nueva Sucursal'}
                            </h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Ficha Técnica WMS</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {selectedWarehouse && (
                                <button 
                                    onClick={() => setDrawerMode('DETAIL')}
                                    className="text-[11px] font-bold text-gray-500 hover:text-[#4C3073] uppercase px-3 py-1.5 transition-colors"
                                >
                                    Cancelar Edición
                                </button>
                            )}
                            <button 
                                onClick={handleSave}
                                disabled={loading}
                                className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-5 py-2 rounded text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
                            >
                                <Save size={14} /> {selectedWarehouse ? 'Guardar Cambios' : 'Crear Sucursal'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50">
                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Identificación y Contacto</h4>
                            </div>
                            
                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Nombre Comercial del Local *</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm focus:border-[#4C3073] outline-none transition-all font-bold text-[13px] text-gray-800"
                                        placeholder="Ej: Farmacia Alameda Central"
                                    />
                                </div>

                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Dirección Física Exacta</label>
                                    <input 
                                        type="text" 
                                        value={formData.address}
                                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm focus:border-[#4C3073] outline-none transition-all text-[12px]"
                                        placeholder="Av. Providencia 1234, Local 5"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Ciudad / Comuna</label>
                                    <input 
                                        type="text" 
                                        value={formData.city}
                                        onChange={(e) => setFormData({...formData, city: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm focus:border-[#4C3073] outline-none transition-all text-[12px]"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Teléfono de Contacto</label>
                                    <input 
                                        type="text" 
                                        value={formData.phone}
                                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm focus:border-[#4C3073] outline-none transition-all text-[12px]"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Responsable / Químico Regente</label>
                                    <input 
                                        type="text" 
                                        value={formData.manager_name}
                                        onChange={(e) => setFormData({...formData, manager_name: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm focus:border-[#4C3073] outline-none transition-all font-bold text-[12px] text-gray-700"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Horarios de Atención</label>
                                    <input 
                                        type="text" 
                                        value={formData.opening_hours}
                                        onChange={(e) => setFormData({...formData, opening_hours: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm focus:border-[#4C3073] outline-none transition-all text-[12px]"
                                        placeholder="Ej: Lunes a Sábado 09:00 - 21:00"
                                    />
                                </div>

                                {!selectedWarehouse && (
                                    <div className="col-span-full bg-[#4C3073]/5 border border-[#4C3073]/20 p-4 rounded-sm flex gap-3 mt-2">
                                        <AlertCircle className="text-[#4C3073] shrink-0" size={18} />
                                        <div>
                                            <p className="font-black text-[#4C3073] text-[10px] uppercase tracking-widest">Provisionamiento WMS Automático</p>
                                            <p className="text-[11px] text-gray-600 leading-tight mt-1 font-medium">
                                                Al crear la sucursal, el sistema generará automáticamente las bodegas lógicas base: <b className="text-[#4C3073]">QUARANTINE, STORAGE y SALES</b>.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="col-span-full pt-4 border-t border-gray-100 mt-2">
                                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-[#4C3073] border-gray-300 rounded focus:ring-[#4C3073]"
                                            checked={formData.is_active}
                                            onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                                        />
                                        <span className="text-[11px] font-black text-gray-600 group-hover:text-[#4C3073] uppercase tracking-widest transition-colors">
                                            Sucursal Operativa / Activa
                                        </span>
                                    </label>
                                </div>

                                {/* Bottom Save Button */}
                                <div className="col-span-full pt-6 mt-4 border-t border-gray-100 flex justify-end">
                                    <button 
                                        onClick={handleSave}
                                        disabled={loading}
                                        className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-3 rounded-sm text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 w-full justify-center"
                                    >
                                        <Save size={16} /> {selectedWarehouse ? 'Guardar Cambios' : 'Crear Sucursal'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // DETAIL MODE
        if (!selectedWarehouse) return null;

        return (
            <div className="flex flex-col h-full bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 px-6 py-5 shrink-0 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#4C3073]/5 rounded-bl-full -z-0"></div>
                    <div className="relative z-10 flex justify-between items-start">
                        <div className="flex gap-4">
                            <div className={`h-14 w-14 rounded-md flex items-center justify-center border shadow-sm ${selectedWarehouse.is_active ? 'bg-gradient-to-br from-purple-50 to-white border-purple-200 text-[#4C3073]' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>
                                <Building2 size={28} strokeWidth={1.5} />
                            </div>
                            <div className="pt-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">{selectedWarehouse.name}</h2>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${selectedWarehouse.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                        {selectedWarehouse.is_active ? 'Activa' : 'Inactiva'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                                    <span className="flex items-center gap-1"><MapPin size={12} /> {selectedWarehouse.city || 'Ciudad N/D'}</span>
                                    <span>•</span>
                                    <span>ID: {selectedWarehouse.id.slice(0,8)}</span>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={(e) => handleEdit(selectedWarehouse, e)}
                            className="bg-white border border-gray-200 hover:border-[#4C3073] hover:text-[#4C3073] text-gray-600 px-4 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm"
                        >
                            <Edit2 size={12} /> Editar Ficha
                        </button>
                    </div>
                </div>

                {/* Content Sections */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* A) General Info */}
                    <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                        <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50">
                            <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Información General</h4>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-y-5 gap-x-6">
                            <div>
                                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Dirección Exacta</div>
                                <div className="text-[12px] font-bold text-gray-800">{selectedWarehouse.address || '---'}</div>
                            </div>
                            <div>
                                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Responsable Operativo</div>
                                <div className="text-[12px] font-bold text-gray-800 uppercase">{selectedWarehouse.manager_name || '---'}</div>
                            </div>
                            <div>
                                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Teléfono</div>
                                <div className="text-[12px] font-bold text-gray-800">{selectedWarehouse.phone || '---'}</div>
                            </div>
                            <div>
                                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Horarios</div>
                                <div className="text-[12px] font-bold text-gray-800">{selectedWarehouse.opening_hours || '---'}</div>
                            </div>
                        </div>
                    </div>

                    {/* B) Infraestructura Interna */}
                    <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                        <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50 flex justify-between items-center">
                            <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest flex items-center gap-2">
                                <Box size={14} /> Infraestructura Interna WMS
                            </h4>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded">3 Ubicaciones Base</span>
                        </div>
                        <div className="p-5">
                            <p className="text-[11px] text-gray-500 font-medium mb-4 italic">Ubicaciones lógicas generadas automáticamente por el sistema al crear la sucursal.</p>
                            <div className="grid grid-cols-3 gap-4">
                                {['SALES', 'STORAGE', 'QUARANTINE'].map(loc => (
                                    <div key={loc} className="border border-gray-200 rounded-sm p-3 bg-gray-50 flex flex-col items-center justify-center gap-2">
                                        <Box size={16} className={loc === 'QUARANTINE' ? 'text-amber-500' : 'text-[#4C3073]'} />
                                        <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">{loc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* C & D) Operación y Auditoría */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50">
                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest flex items-center gap-2">
                                    <Users size={14} /> Operación (POS)
                                </h4>
                            </div>
                            <div className="p-5 flex flex-col items-center justify-center text-center h-32">
                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Módulo en Desarrollo</span>
                                <span className="text-[10px] text-gray-400 mt-1">Cajas y operadores asignados se mostrarán aquí.</span>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50">
                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest flex items-center gap-2">
                                    <Clock size={14} /> Auditoría
                                </h4>
                            </div>
                            <div className="p-5 flex flex-col items-center justify-center text-center h-32">
                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Actividad Reciente</span>
                                <span className="text-[10px] text-gray-400 mt-1">Registro de operaciones pendiende de integración.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- RENDER PRINCIPAL (LISTA) ---
    return (
        <div className="relative h-full flex flex-col bg-[#f8f9fa] overflow-hidden">
            {/* Main Content */}
            <div className={`flex-1 overflow-y-auto p-6 lg:p-8 transition-all duration-300 ${drawerOpen ? 'mr-[500px] xl:mr-[600px] opacity-50 pointer-events-none' : ''}`}>
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                        <div>
                            <h1 className="text-2xl font-black text-[#4C3073] flex items-center gap-3 tracking-tight uppercase">
                                <Building2 size={28} /> Administración de Sucursales
                            </h1>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">SaaS Red de Locales y Bodegas</p>
                        </div>
                        <button 
                            onClick={handleNew}
                            className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2.5 rounded-sm shadow-sm font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            <Plus size={14} /> Nueva Sucursal
                        </button>
                    </div>

                    {/* Metrics Row */}
                    {!loading && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                            <div className="bg-white border border-gray-200 rounded-sm p-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Registradas</div>
                                    <div className="text-2xl font-black text-[#4C3073]">{totalWarehouses}</div>
                                </div>
                                <div className="h-10 w-10 bg-[#4C3073]/10 rounded-full flex items-center justify-center text-[#4C3073]">
                                    <Building2 size={20} />
                                </div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-sm p-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Operativas (Activas)</div>
                                    <div className="text-2xl font-black text-green-600">{activeWarehouses}</div>
                                </div>
                                <div className="h-10 w-10 bg-green-50 rounded-full flex items-center justify-center text-green-600">
                                    <Activity size={20} />
                                </div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-sm p-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Inactivas</div>
                                    <div className="text-2xl font-black text-gray-400">{inactiveWarehouses}</div>
                                </div>
                                <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                                    <AlertCircle size={20} />
                                </div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-sm p-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Locaciones Base / Sucursal</div>
                                    <div className="text-2xl font-black text-[#4C3073]">3</div>
                                </div>
                                <div className="h-10 w-10 bg-[#4C3073]/10 rounded-full flex items-center justify-center text-[#4C3073]">
                                    <Box size={20} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Búsqueda */}
                    <div className="relative mb-6 max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4C3073] h-4 w-4" />
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre, ciudad o dirección..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-sm shadow-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] transition-all outline-none font-bold text-gray-700 text-[12px]"
                        />
                    </div>

                    {/* Lista / Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {loading ? (
                            <div className="col-span-full py-24 flex flex-col items-center justify-center text-gray-400 gap-4">
                                <div className="w-8 h-8 border-4 border-gray-200 border-t-[#4C3073] rounded-full animate-spin"></div>
                                <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando directorio...</p>
                            </div>
                        ) : filteredWarehouses.length === 0 ? (
                            <div className="col-span-full flex flex-col items-center justify-center py-24 text-gray-300 bg-white border border-dashed border-gray-300 rounded-sm">
                                <Building2 size={48} className="opacity-20 mb-4" />
                                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Sin coincidencias encontradas</p>
                            </div>
                        ) : (
                            filteredWarehouses.map(warehouse => (
                                <div 
                                    key={warehouse.id} 
                                    className={`bg-white rounded-sm border border-gray-200 transition-all hover:border-[#4C3073]/40 group flex flex-col shadow-sm hover:shadow-md ${!warehouse.is_active && 'opacity-75 bg-gray-50/50'}`}
                                >
                                    <div className="p-5 flex-1 relative">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-11 w-11 rounded-sm flex items-center justify-center border transition-colors shrink-0 ${warehouse.is_active ? 'border-purple-100 bg-purple-50 text-[#4C3073]' : 'border-gray-200 bg-gray-100 text-gray-400'}`}>
                                                    <Building2 size={20} />
                                                </div>
                                                <div className="overflow-hidden">
                                                    <h3 className="font-black text-gray-800 uppercase tracking-tight text-[13px] truncate" title={warehouse.name}>{warehouse.name}</h3>
                                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate">{warehouse.city || 'Ubicación no definida'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2.5">
                                            <div className="flex items-start gap-2 text-[11px] text-gray-600 font-medium">
                                                <MapPin size={13} className="shrink-0 text-gray-400 mt-0.5" />
                                                <span className="leading-snug line-clamp-2" title={warehouse.address}>{warehouse.address || 'Sin dirección registrada'}</span>
                                            </div>
                                            <div className="bg-gray-50 border border-gray-100 rounded px-2.5 py-1.5 flex justify-between items-center">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Químico / Encargado</span>
                                                <span className="text-[10px] font-black text-gray-700 uppercase truncate max-w-[100px]" title={warehouse.manager_name}>{warehouse.manager_name || 'Sin Asignar'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="px-5 py-3 bg-gray-50/80 border-t border-gray-100 flex justify-between items-center shrink-0">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`h-2 w-2 rounded-full ${warehouse.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${warehouse.is_active ? 'text-green-700' : 'text-red-700'}`}>
                                                {warehouse.is_active ? 'Operativa' : 'Inactiva'}
                                            </span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={(e) => handleEdit(warehouse, e)}
                                                className="p-1.5 text-gray-400 hover:text-[#4C3073] hover:bg-[#4C3073]/10 rounded transition-colors"
                                                title="Editar sucursal"
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                            <button 
                                                onClick={(e) => handleDelete(warehouse.id, e)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                title="Desactivar sucursal"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                            <button 
                                                onClick={() => handleViewDetail(warehouse)}
                                                className="bg-white border border-gray-200 text-gray-600 hover:text-[#4C3073] hover:border-[#4C3073] px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest ml-1 transition-colors flex items-center gap-1 shadow-sm"
                                            >
                                                Detalle <ArrowRight size={10} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Right Drawer Overlay */}
            {drawerOpen && (
                <div 
                    className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-[150] transition-opacity flex justify-end"
                    onClick={() => setDrawerOpen(false)}
                >
                    <div 
                        className="w-full max-w-[500px] xl:max-w-[600px] bg-white h-full shadow-[-10px_0_30px_rgba(0,0,0,0.1)] flex flex-col animate-in slide-in-from-right duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drawer Header Close Button */}
                        <div className="absolute top-4 right-4 z-50">
                            <button 
                                onClick={() => setDrawerOpen(false)}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-500 p-1.5 rounded-full transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        
                        {/* Drawer Content */}
                        {renderDrawerContent()}
                    </div>
                </div>
            )}
        </div>
    );
}

