import React, { useCallback, useEffect, useState } from 'react';
import { 
    KeyRound, 
    Loader2, 
    Pencil, 
    Plus, 
    ShieldCheck, 
    UserRound,
    X,
    Building2,
    Users,
    Activity,
    AlertCircle,
    ArrowRight,
    Trash2,
    Clock,
    MonitorSmartphone,
    Save
} from 'lucide-react';
import { useSucursal } from '../context/SucursalContext';
import { 
    createPosOperator, 
    deactivatePosOperator, 
    fetchPosOperators, 
    resetPosOperatorPin, 
    updatePosOperator 
} from '../api/pharmacyClient';

export default function OperadoresPOS() {
    const { activeWarehouse } = useSucursal();
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [operators, setOperators] = useState([]);
    
    // UI States
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState('DETAIL'); // 'DETAIL' | 'FORM'
    const [selectedOperator, setSelectedOperator] = useState(null);
    
    const [formData, setFormData] = useState({
        fullName: '',
        pinCode: '',
        isActive: true
    });

    const loadOperators = useCallback(async () => {
        if (!activeWarehouse?.id) {
            setOperators([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await fetchPosOperators(activeWarehouse.id);
            if (error) throw error;
            setOperators(data || []);
        } catch (error) {
            console.error('Error cargando operadores POS:', error);
            alert(`No se pudieron cargar los operadores POS: ${error.message || error}`);
        } finally {
            setLoading(false);
        }
    }, [activeWarehouse?.id]);

    useEffect(() => {
        loadOperators();
    }, [loadOperators]);

    // --- MANEJO DE VISTAS ---
    const handleNew = () => {
        if (!activeWarehouse?.id) {
            alert('Debes seleccionar una sucursal antes de crear operadores.');
            return;
        }
        setSelectedOperator(null);
        setFormData({
            fullName: '',
            pinCode: '',
            isActive: true
        });
        setDrawerMode('FORM');
        setDrawerOpen(true);
    };

    const handleViewDetail = (operator) => {
        setSelectedOperator(operator);
        setDrawerMode('DETAIL');
        setDrawerOpen(true);
    };

    const handleEdit = (operator, e) => {
        if (e) e.stopPropagation();
        setSelectedOperator(operator);
        setFormData({
            fullName: operator.full_name || '',
            pinCode: '', // Empty on edit unless they want to change it
            isActive: operator.is_active ?? true
        });
        setDrawerMode('FORM');
        setDrawerOpen(true);
    };

    // --- ACCIONES API ---
    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!activeWarehouse?.id) return;
        
        if (!formData.fullName.trim()) {
            alert('Debes ingresar el nombre del operador.');
            return;
        }

        // On Create: PIN is required and must be 4 digits
        // On Edit: PIN is optional, but if provided must be 4 digits
        if (!selectedOperator && !/^\d{4}$/.test(formData.pinCode.trim())) {
            alert('El PIN debe tener exactamente 4 dígitos.');
            return;
        }
        
        if (selectedOperator && formData.pinCode.trim() !== '' && !/^\d{4}$/.test(formData.pinCode.trim())) {
            alert('El nuevo PIN debe tener exactamente 4 dígitos.');
            return;
        }

        setSaving(true);
        try {
            if (selectedOperator) {
                // UPDATE
                const { error: updateError } = await updatePosOperator({
                    operatorId: selectedOperator.id,
                    fullName: formData.fullName.trim().toUpperCase(),
                    warehouseId: activeWarehouse.id,
                    isActive: formData.isActive,
                });
                if (updateError) throw updateError;

                if (formData.pinCode.trim()) {
                    const { error: pinError } = await resetPosOperatorPin({
                        operatorId: selectedOperator.id,
                        warehouseId: activeWarehouse.id,
                        pinCode: formData.pinCode.trim(),
                    });
                    if (pinError) throw pinError;
                }
            } else {
                // CREATE
                const { error } = await createPosOperator({
                    warehouseId: activeWarehouse.id,
                    fullName: formData.fullName.trim().toUpperCase(),
                    pinCode: formData.pinCode.trim(),
                });
                
                if (error) {
                    if (error.code === '23505') {
                        await loadOperators();
                        alert('Ya existe un operador POS con ese nombre en esta sucursal.');
                        return;
                    }
                    throw error;
                }
            }

            setDrawerOpen(false);
            await loadOperators();
        } catch (error) {
            console.error('Error guardando operador POS:', error);
            alert(`No se pudo guardar el operador POS: ${error.message || error}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async (operator, e) => {
        if (e) e.stopPropagation();
        const action = operator.is_active ? 'desactivar' : 'activar';
        if (!window.confirm(`¿Está seguro de ${action} a este operador?`)) return;
        
        setSaving(true);
        try {
            if (operator.is_active) {
                const { error } = await deactivatePosOperator({ operatorId: operator.id });
                if (error) throw error;
            } else {
                const { error } = await updatePosOperator({
                    operatorId: operator.id,
                    fullName: operator.full_name,
                    warehouseId: activeWarehouse.id,
                    isActive: true,
                });
                if (error) throw error;
            }
            if (selectedOperator?.id === operator.id && operator.is_active) {
                // Si lo desactivamos desde el detalle, podríamos cerrar el panel o dejarlo abierto.
                // Lo dejamos abierto para ver el cambio de estado.
            }
            await loadOperators();
        } catch (error) {
            console.error(`Error al ${action} operador POS:`, error);
            alert(`No se pudo ${action} el operador POS: ${error.message || error}`);
        } finally {
            setSaving(false);
        }
    };

    // --- METRICAS LOCALES ---
    const totalOperators = operators.length;
    const activeOperators = operators.filter(o => o.is_active).length;
    const inactiveOperators = totalOperators - activeOperators;

    // --- RENDER DRAWER CONTENT ---
    const renderDrawerContent = () => {
        if (drawerMode === 'FORM') {
            return (
                <div className="flex flex-col h-full bg-gray-50">
                    <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shrink-0">
                        <div>
                            <h2 className="text-lg font-black text-[#4C3073] uppercase tracking-tight">
                                {selectedOperator ? 'Editar Operador' : 'Nuevo Operador POS'}
                            </h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Gestión de Accesos de Caja</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {selectedOperator && (
                                <button 
                                    onClick={() => setDrawerMode('DETAIL')}
                                    className="text-[11px] font-bold text-gray-500 hover:text-[#4C3073] uppercase px-3 py-1.5 transition-colors"
                                >
                                    Cancelar Edición
                                </button>
                            )}
                            <button 
                                onClick={handleSave}
                                disabled={saving}
                                className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-5 py-2 rounded text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 
                                {selectedOperator ? 'Guardar Cambios' : 'Crear Operador'}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50">
                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Credenciales del Cajero</h4>
                            </div>
                            
                            <div className="p-5 grid grid-cols-1 gap-5 text-sm">
                                <div className="space-y-1.5">
                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Nombre Completo *</label>
                                    <input 
                                        type="text" 
                                        value={formData.fullName}
                                        onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm focus:border-[#4C3073] outline-none transition-all font-bold text-[13px] text-gray-800 uppercase"
                                        placeholder="Ej: MARIA PEREZ"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">
                                        {selectedOperator ? 'Nuevo PIN (4 Dígitos) - Opcional' : 'PIN de Acceso (4 Dígitos) *'}
                                    </label>
                                    <input 
                                        type="text" 
                                        value={formData.pinCode}
                                        onChange={(e) => setFormData({...formData, pinCode: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm focus:border-[#4C3073] outline-none transition-all font-bold text-[16px] tracking-[0.5em]"
                                        placeholder="0000"
                                        inputMode="numeric"
                                    />
                                    {selectedOperator && (
                                        <p className="text-[9px] text-gray-400 font-bold px-1">Dejar en blanco para conservar el PIN actual.</p>
                                    )}
                                </div>

                                {selectedOperator && (
                                    <div className="pt-4 border-t border-gray-100 mt-2">
                                        <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                            <input 
                                                type="checkbox" 
                                                className="w-4 h-4 text-[#4C3073] border-gray-300 rounded focus:ring-[#4C3073]"
                                                checked={formData.isActive}
                                                onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                                            />
                                            <span className="text-[11px] font-black text-gray-600 group-hover:text-[#4C3073] uppercase tracking-widest transition-colors">
                                                Operador Activo / Habilitado
                                            </span>
                                        </label>
                                    </div>
                                )}

                                {/* Bottom Save Button */}
                                <div className="pt-6 mt-4 border-t border-gray-100 flex justify-end">
                                    <button 
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-3 rounded-sm text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 w-full justify-center"
                                    >
                                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                                        {selectedOperator ? 'Guardar Cambios' : 'Crear Operador POS'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // DETAIL MODE
        if (!selectedOperator) return null;

        return (
            <div className="flex flex-col h-full bg-gray-50">
                <div className="bg-white border-b border-gray-200 px-6 py-5 shrink-0 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#4C3073]/5 rounded-bl-full -z-0"></div>
                    <div className="relative z-10 flex justify-between items-start">
                        <div className="flex gap-4">
                            <div className={`h-14 w-14 rounded-md flex items-center justify-center border shadow-sm ${selectedOperator.is_active ? 'bg-gradient-to-br from-purple-50 to-white border-purple-200 text-[#4C3073]' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>
                                <UserRound size={28} strokeWidth={1.5} />
                            </div>
                            <div className="pt-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight truncate max-w-[250px]">{selectedOperator.full_name}</h2>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${selectedOperator.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                        {selectedOperator.is_active ? 'Activo' : 'Inactivo'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                                    <span className="flex items-center gap-1"><KeyRound size={12} /> PIN Protegido</span>
                                    <span>•</span>
                                    <span>ID: {selectedOperator.id.slice(0,8)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={(e) => handleEdit(selectedOperator, e)}
                                className="bg-white border border-gray-200 hover:border-[#4C3073] hover:text-[#4C3073] text-gray-600 px-3 py-2 rounded-sm text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm"
                            >
                                <Pencil size={12} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* A) General Info */}
                    <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                        <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50 flex justify-between items-center">
                            <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Seguridad y Acceso</h4>
                            <span className="text-[9px] font-black uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded">Sucursal {activeWarehouse?.name}</span>
                        </div>
                        <div className="p-5 flex justify-between items-center bg-gray-50 border border-dashed border-gray-200 m-4 rounded">
                            <div className="flex items-center gap-3">
                                <ShieldCheck size={20} className="text-emerald-500" />
                                <div>
                                    <p className="text-[11px] font-black text-gray-800 uppercase">Credencial Segura</p>
                                    <p className="text-[10px] text-gray-500 font-medium">Autenticación requerida para aperturas de caja.</p>
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleEdit(selectedOperator, e)}
                                className="text-[10px] font-black uppercase text-[#4C3073] bg-[#4C3073]/10 hover:bg-[#4C3073]/20 px-3 py-1.5 rounded transition-colors"
                            >
                                Reset PIN
                            </button>
                        </div>
                    </div>

                    {/* Placeholders Operacionales */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50 flex items-center gap-2">
                                <MonitorSmartphone size={14} className="text-[#4C3073]" />
                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Aperturas de Caja</h4>
                            </div>
                            <div className="p-5 flex flex-col items-center justify-center text-center h-32">
                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Sin Sesiones Recientes</span>
                                <span className="text-[10px] text-gray-400 mt-1">El historial de caja se mostrará aquí.</span>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
                            <div className="border-b border-gray-100 px-5 py-3 bg-gray-50/50 flex items-center gap-2">
                                <Clock size={14} className="text-[#4C3073]" />
                                <h4 className="text-[10px] font-black text-[#4C3073] uppercase tracking-widest">Auditoría</h4>
                            </div>
                            <div className="p-5 flex flex-col items-center justify-center text-center h-32">
                                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Módulo en Desarrollo</span>
                                <span className="text-[10px] text-gray-400 mt-1">Registro de actividad del cajero.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- RENDER PRINCIPAL ---
    return (
        <div className="relative h-full flex flex-col bg-[#f8f9fa] overflow-hidden">
            <div className={`flex-1 overflow-y-auto p-6 lg:p-8 transition-all duration-300 ${drawerOpen ? 'mr-[500px] xl:mr-[600px] opacity-50 pointer-events-none' : ''}`}>
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                        <div>
                            <h1 className="text-2xl font-black text-[#4C3073] flex items-center gap-3 tracking-tight uppercase">
                                <Users size={28} /> Operadores POS
                            </h1>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Control de Cajeros por Sucursal</p>
                        </div>
                        <button 
                            onClick={handleNew}
                            disabled={!activeWarehouse?.id}
                            className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2.5 rounded-sm shadow-sm font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={14} /> Nuevo Operador POS
                        </button>
                    </div>

                    {/* Metrics Row */}
                    {!loading && activeWarehouse && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                            <div className="bg-white border border-gray-200 rounded-sm p-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Registrados</div>
                                    <div className="text-2xl font-black text-[#4C3073]">{totalOperators}</div>
                                </div>
                                <div className="h-10 w-10 bg-[#4C3073]/10 rounded-full flex items-center justify-center text-[#4C3073]">
                                    <Users size={20} />
                                </div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-sm p-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Activos</div>
                                    <div className="text-2xl font-black text-green-600">{activeOperators}</div>
                                </div>
                                <div className="h-10 w-10 bg-green-50 rounded-full flex items-center justify-center text-green-600">
                                    <Activity size={20} />
                                </div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-sm p-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Inactivos</div>
                                    <div className="text-2xl font-black text-gray-400">{inactiveOperators}</div>
                                </div>
                                <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                                    <AlertCircle size={20} />
                                </div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-sm p-4 flex items-center justify-between shadow-sm">
                                <div>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Sucursal Contexto</div>
                                    <div className="text-sm font-black text-[#4C3073] uppercase mt-1 truncate max-w-[120px]" title={activeWarehouse.name}>{activeWarehouse.name}</div>
                                </div>
                                <div className="h-10 w-10 bg-[#4C3073]/10 rounded-full flex items-center justify-center text-[#4C3073]">
                                    <Building2 size={20} />
                                </div>
                            </div>
                        </div>
                    )}

                    {!activeWarehouse?.id && (
                        <div className="bg-amber-50 border border-amber-200 p-6 rounded-sm text-center">
                            <AlertCircle size={32} className="mx-auto text-amber-500 mb-3" />
                            <h3 className="text-[13px] font-black text-amber-800 uppercase tracking-widest">Selecciona una sucursal</h3>
                            <p className="text-xs text-amber-700 mt-1">Usa el selector global de sucursales para gestionar operadores POS.</p>
                        </div>
                    )}

                    {/* Cards Grid */}
                    {activeWarehouse?.id && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {loading ? (
                                <div className="col-span-full py-24 flex flex-col items-center justify-center text-gray-400 gap-4">
                                    <Loader2 size={32} className="animate-spin text-[#4C3073]" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Cargando credenciales...</p>
                                </div>
                            ) : operators.length === 0 ? (
                                <div className="col-span-full flex flex-col items-center justify-center py-24 text-gray-300 bg-white border border-dashed border-gray-300 rounded-sm">
                                    <UserRound size={48} className="opacity-20 mb-4" />
                                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Sin operadores registrados</p>
                                </div>
                            ) : (
                                operators.map(operator => (
                                    <div 
                                        key={operator.id} 
                                        className={`bg-white rounded-sm border border-gray-200 transition-all hover:border-[#4C3073]/40 group flex flex-col shadow-sm hover:shadow-md ${!operator.is_active && 'opacity-75 bg-gray-50/50'}`}
                                    >
                                        <div className="p-5 flex-1 relative">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-11 w-11 rounded-sm flex items-center justify-center border transition-colors shrink-0 ${operator.is_active ? 'border-purple-100 bg-purple-50 text-[#4C3073]' : 'border-gray-200 bg-gray-100 text-gray-400'}`}>
                                                        <UserRound size={20} />
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <h3 className="font-black text-gray-800 uppercase tracking-tight text-[13px] truncate" title={operator.full_name}>{operator.full_name}</h3>
                                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest truncate">{activeWarehouse.name}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-2.5 mt-2">
                                                <div className="bg-gray-50 border border-gray-100 rounded px-2.5 py-1.5 flex justify-between items-center">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Autenticación</span>
                                                    <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                        <KeyRound size={10} /> PIN Protegido
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="px-5 py-3 bg-gray-50/80 border-t border-gray-100 flex justify-between items-center shrink-0">
                                            <div className="flex items-center gap-1.5">
                                                <div className={`h-2 w-2 rounded-full ${operator.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${operator.is_active ? 'text-green-700' : 'text-red-700'}`}>
                                                    {operator.is_active ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </div>
                                            <div className="flex gap-1">
                                                <button 
                                                    onClick={(e) => handleEdit(operator, e)}
                                                    disabled={saving}
                                                    className="p-1.5 text-gray-400 hover:text-[#4C3073] hover:bg-[#4C3073]/10 rounded transition-colors disabled:opacity-50"
                                                    title="Editar o Resetear PIN"
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button 
                                                    onClick={(e) => handleDeactivate(operator, e)}
                                                    disabled={saving}
                                                    className={`p-1.5 rounded transition-colors disabled:opacity-50 ${operator.is_active ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-emerald-500 hover:bg-emerald-50'}`}
                                                    title={operator.is_active ? 'Desactivar operador' : 'Activar operador'}
                                                >
                                                    {operator.is_active ? <Trash2 size={13} /> : <ShieldCheck size={13} />}
                                                </button>
                                                <button 
                                                    onClick={() => handleViewDetail(operator)}
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
                    )}
                </div>
            </div>

            {/* Drawer Overlay */}
            {drawerOpen && (
                <div 
                    className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-[150] transition-opacity flex justify-end"
                    onClick={() => setDrawerOpen(false)}
                >
                    <div 
                        className="w-full max-w-[500px] xl:max-w-[600px] bg-white h-full shadow-[-10px_0_30px_rgba(0,0,0,0.1)] flex flex-col animate-in slide-in-from-right duration-300"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="absolute top-4 right-4 z-50">
                            <button 
                                onClick={() => setDrawerOpen(false)}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-500 p-1.5 rounded-full transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        {renderDrawerContent()}
                    </div>
                </div>
            )}
        </div>
    );
}

