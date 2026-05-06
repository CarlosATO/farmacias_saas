import React, { useState, useEffect } from 'react';
import { FileText, Search, Plus, ShieldAlert, X, Activity, Pill, Trash2, Eye, Calendar, User, UserCheck, ChevronRight, ArrowLeft, Save, CheckCircle2 } from 'lucide-react';
import { 
  fetchPrescriptions, 
  fetchPharmacyPatients, 
  fetchPharmacyProducts,
  createPrescriptionWithItems,
  fetchPrescriptionItems,
  fetchDoctors,
  createDoctor,
  createPharmacyPatient,
  derivePrescriptionTypeFromItems
} from '../api/pharmacyClient';

export default function Recetas() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [products, setProducts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [view, setView] = useState('list'); // 'list', 'create', 'detail'
  
  const [formData, setFormData] = useState({
    folio_electronico: '',
    prescriber_rut: '',
    prescriber_name: '',
    patient_id: '',
    status: 'PENDING'
  });
  const [selectedItems, setSelectedItems] = useState([]); 
  const [derivedType, setDerivedType] = useState('RECETA_SIMPLE');

  useEffect(() => {
    const recalculateType = async () => {
      if (selectedItems.length === 0) {
        setDerivedType('RECETA_SIMPLE');
        return;
      }
      const newType = await derivePrescriptionTypeFromItems(selectedItems);
      if (newType) {
        setDerivedType(newType);
      }
    };
    recalculateType();
  }, [selectedItems]);

  
  // Modal de Detalle
  const [detailPrescription, setDetailPrescription] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // States para UI
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  
  // Gestión rápido de paciente dentro del formulario
  const [patientSearch, setPatientSearch] = useState('');
  const [showQuickPatient, setShowQuickPatient] = useState(false);
  const [quickPatient, setQuickPatient] = useState({ rut: '', full_name: '', phone: '', email: '', birth_date: '', gender: '' });
  
  // Gestión rápido de médico
  const [doctorSearch, setDoctorSearch] = useState('');
  const [showNewDoctor, setShowNewDoctor] = useState(false);
  const [newDoctor, setNewDoctor] = useState({ rut: '', full_name: '', specialty: '' });
  
  // Feedback post-save
  const [savedFolio, setSavedFolio] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prescriptionsObj, patientsObj, productsObj, doctorsObj] = await Promise.all([
        fetchPrescriptions(),
        fetchPharmacyPatients(),
        fetchPharmacyProducts(),
        fetchDoctors()
      ]);

      if (!prescriptionsObj.error) setPrescriptions(prescriptionsObj.data || []);
      if (!patientsObj.error) setPatients(patientsObj.data || []);
      if (!productsObj.error) setProducts(productsObj.data || []);
      if (!doctorsObj.error) setDoctors(doctorsObj.data || []);
      
    } catch (err) {
      console.error("Exception loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addItem = (product) => {
    if (selectedItems.find(i => i.product_id === product.id)) return;
    setSelectedItems([...selectedItems, {
      product_id: product.id,
      product_name: product.name,
      sale_condition: product.sale_condition,
      is_controlled: product.is_controlled,
      quantity_prescribed: 1,
      dosage_instructions: ''
    }]);
    setProductSearch('');
  };

  const removeItem = (productId) => {
    setSelectedItems(selectedItems.filter(i => i.product_id !== productId));
  };

  const updateItem = (productId, field, value) => {
    setSelectedItems(selectedItems.map(item => 
      item.product_id === productId ? { ...item, [field]: value } : item
    ));
  };

  // ── Creación rápida de paciente desde el formulario ──
  const handleQuickPatientSave = async () => {
    if (!quickPatient.rut.trim() || !quickPatient.full_name.trim()) return;
    try {
      const { data, error } = await createPharmacyPatient({
        rut: quickPatient.rut.trim(),
        full_name: quickPatient.full_name.trim(),
        phone: quickPatient.phone?.trim() || null,
        email: quickPatient.email?.trim() || null,
        birth_date: quickPatient.birth_date || null,
        gender: quickPatient.gender || null
      });
      if (error) throw error;
      setPatients(prev => [data, ...prev]);
      setFormData(prev => ({ ...prev, patient_id: data.id }));
      setShowQuickPatient(false);
      setQuickPatient({ rut: '', full_name: '', phone: '', email: '', birth_date: '', gender: '' });
    } catch (err) {
      console.error("Error creando paciente:", err);
    }
  };

  // ── Creación rápida de médico ──
  const handleNewDoctorSave = async () => {
    if (!newDoctor.rut.trim() || !newDoctor.full_name.trim()) return;
    try {
      const { data, error } = await createDoctor({
        rut: newDoctor.rut.trim(),
        full_name: newDoctor.full_name.trim(),
        specialty: newDoctor.specialty.trim() || null
      });
      if (error) throw error;
      setDoctors(prev => [data, ...prev]);
      setFormData(prev => ({
        ...prev,
        prescriber_rut: data.rut,
        prescriber_name: data.full_name
      }));
      setShowNewDoctor(false);
      setNewDoctor({ rut: '', full_name: '', specialty: '' });
    } catch (err) {
      console.error("Error creando médico:", err);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      setFormError("Debes agregar al menos un medicamento a la receta.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setSavedFolio(null);

    try {
      const prescriptionData = { ...formData };
      
      const itemsToInsert = selectedItems.map(({ product_id, quantity_prescribed, dosage_instructions }) => ({
        product_id,
        quantity_prescribed: parseInt(quantity_prescribed),
        dosage_instructions
      }));

      const { data, error } = await createPrescriptionWithItems(prescriptionData, itemsToInsert);
      
      if (error) {
        setFormError(error.message || "Error al procesar la receta transaccional");
      } else {
        const folio = data?.header?.folio_electronico || 'GUARDADO';
        setSavedFolio(folio);
        setTimeout(() => {
          setView('list');
          resetForm();
          loadData();
        }, 2500);
      }
    } catch (err) {
      console.error('Error creando receta:', err);
      setFormError("Excepción al comunicarse con la base de datos.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      folio_electronico: '',
      prescriber_rut: '',
      prescriber_name: '',
      patient_id: '',
      status: 'PENDING'
    });
    setSelectedItems([]);
    setDerivedType('RECETA_SIMPLE');
    setFormError(null);
    setSavedFolio(null);
    setPatientSearch('');
    setDoctorSearch('');
    setQuickPatient({ rut: '', full_name: '', phone: '', email: '', birth_date: '', gender: '' });
  };

  const openDetail = async (prescription) => {
    setDetailPrescription(prescription);
    setView('detail');
    setLoadingDetail(true);
    try {
      const { data, error } = await fetchPrescriptionItems(prescription.id);
      if (!error) setDetailItems(data || []);
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredPrescriptions = prescriptions.filter(p => {
    const term = searchTerm.toLowerCase();
    return (p.folio_electronico || p.folio || '').toLowerCase().includes(term) || 
           (p.prescriber_name || '').toLowerCase().includes(term) ||
           (p.patient?.full_name || '').toLowerCase().includes(term);
  });

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) && 
    !selectedItems.find(si => si.product_id === p.id)
  ).slice(0, 5);

  const filteredPatients = patients.filter(p => {
    if (!patientSearch) return true;
    const s = patientSearch.toLowerCase();
    return p.full_name?.toLowerCase().includes(s) || p.rut?.toLowerCase().includes(s);
  }).slice(0, 8);

  const filteredDoctors = doctors.filter(d => {
    if (!doctorSearch) return true;
    const s = doctorSearch.toLowerCase();
    return d.full_name?.toLowerCase().includes(s) || d.rut?.toLowerCase().includes(s);
  }).slice(0, 5);

  const getStatusBadge = (status) => {
    const colors = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'PARTIAL': 'bg-blue-100 text-blue-800',
      'DISPENSED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800'
    };
    return <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${colors[status] || 'bg-slate-100'}`}>{status}</span>;
  };

  if (view === 'create') {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden animate-in fade-in duration-150">
        <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
            <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <span className="hover:text-gray-900 cursor-pointer" onClick={() => { setView('list'); resetForm(); }}>Gestión de Recetas</span>
                <ChevronRight size={12} className="mx-1" />
                <span className="text-[#4C3073]">Nueva Receta</span>
            </div>
            <div className="flex justify-between items-center mt-1">
                <div className="flex gap-2">
                    <button onClick={() => { setView('list'); resetForm(); }} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                        <ArrowLeft size={16} /> Cancelar y Volver
                    </button>
                </div>
                <div>
                   <button onClick={handleFormSubmit} disabled={submitting || !!savedFolio} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
                       <Save size={16} /> {submitting ? 'GUARDANDO...' : savedFolio ? 'GUARDADO' : 'Guardar Receta (Pre-ingreso)'}
                   </button>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Feedback de guardado exitoso */}
                {savedFolio && (
                  <div className="bg-emerald-50 border-2 border-emerald-400 rounded-sm p-6 text-center animate-in fade-in duration-300">
                    <div className="flex justify-center mb-3">
                      <div className="p-3 bg-emerald-100 rounded-full">
                        <CheckCircle2 size={40} className="text-emerald-600" />
                      </div>
                    </div>
                    <h2 className="text-2xl font-black text-emerald-800 tracking-tight mb-1">RECETA REGISTRADA</h2>
                    <p className="text-sm text-emerald-600 mb-3">Correlativo generado:</p>
                    <span className="inline-block bg-white border-2 border-emerald-300 text-emerald-800 font-mono font-black text-3xl px-6 py-3 rounded-sm tracking-[0.15em]">
                      {savedFolio}
                    </span>
                    <p className="text-xs text-emerald-500 mt-4 font-bold uppercase tracking-widest">Redirigiendo al listado...</p>
                  </div>
                )}

                <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-6 flex justify-between items-start">
                    <div>
                        <h1 className="text-xl font-black text-[#4C3073] tracking-tight flex items-center gap-2">
                            <Pill size={24} /> REGISTRAR PRESCRIPCIÓN MÉDICA
                        </h1>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* Columna Izquierda: Datos Cabecera */}
                    <div className="md:col-span-4 space-y-6">
                        <div className="p-6 bg-white shadow-sm rounded-sm border border-gray-200 space-y-4">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest border-b pb-2">Datos de la Receta</h3>
                            
                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Folio Electrónico</label>
                                <input type="text" name="folio_electronico" required value={formData.folio_electronico} onChange={handleInputChange} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" placeholder="REC-001" />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Tipo requerido</label>
                                <div className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-sm text-sm font-bold text-[#4C3073] flex items-center gap-2">
                                  <ShieldAlert size={14} className="text-purple-500"/>
                                  {derivedType === 'RECETA_RETENIDA' ? 'RETENIDA' : derivedType === 'RECETA_CHEQUE' ? 'CHEQUE' : 'RECETA_SIMPLE'}
                                </div>
                            </div>

                            {/* ── SELECTOR DE PACIENTE CON BÚSQUEDA + BOTÓN "+" ── */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[11px] font-bold text-gray-500 uppercase">Paciente *</label>
                                  <button type="button" onClick={() => { setShowQuickPatient(!showQuickPatient); setShowNewDoctor(false); }}
                                    className="text-[10px] font-black text-[#4C3073] hover:text-[#3d265c] uppercase flex items-center gap-1">
                                    <Plus size={12} /> Nuevo
                                  </button>
                                </div>
                                {!showQuickPatient ? (
                                  <div>
                                    <input type="text" placeholder="Buscar por RUT o nombre..." value={patientSearch}
                                      onChange={(e) => setPatientSearch(e.target.value)}
                                      onFocus={() => setPatientSearch('')}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    {patientSearch && filteredPatients.length > 0 && (
                                      <div className="relative">
                                        <div className="absolute z-20 top-1 left-0 w-full bg-white border shadow-xl rounded-sm max-h-40 overflow-y-auto">
                                          {filteredPatients.map(p => (
                                            <button type="button" key={p.id}
                                              onClick={() => { setFormData(prev => ({ ...prev, patient_id: p.id })); setPatientSearch(`${p.rut} - ${p.full_name}`); }}
                                              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0">
                                              <span className="font-bold text-xs text-gray-800">{p.full_name}</span>
                                              <span className="text-[10px] text-gray-400 ml-2 font-mono">{p.rut}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-2 bg-purple-50 border border-purple-200 rounded-sm p-3">
                                    <p className="text-[10px] font-black text-purple-700 uppercase">Nuevo Paciente</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[9px] font-bold text-purple-500 uppercase mb-0.5 block">RUT *</label>
                                        <input type="text" placeholder="12.345.678-9" value={quickPatient.rut}
                                          onChange={(e) => setQuickPatient(prev => ({ ...prev, rut: e.target.value }))}
                                          className="w-full px-2 py-1.5 border border-purple-200 rounded-sm text-xs outline-none font-mono" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] font-bold text-purple-500 uppercase mb-0.5 block">Nombre *</label>
                                        <input type="text" placeholder="Juan Pérez" value={quickPatient.full_name}
                                          onChange={(e) => setQuickPatient(prev => ({ ...prev, full_name: e.target.value }))}
                                          className="w-full px-2 py-1.5 border border-purple-200 rounded-sm text-xs outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] font-bold text-purple-500 uppercase mb-0.5 block">Teléfono</label>
                                        <input type="text" placeholder="+56912345678" value={quickPatient.phone || ''}
                                          onChange={(e) => setQuickPatient(prev => ({ ...prev, phone: e.target.value }))}
                                          className="w-full px-2 py-1.5 border border-purple-200 rounded-sm text-xs outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] font-bold text-purple-500 uppercase mb-0.5 block">Email</label>
                                        <input type="email" placeholder="paciente@mail.com" value={quickPatient.email || ''}
                                          onChange={(e) => setQuickPatient(prev => ({ ...prev, email: e.target.value }))}
                                          className="w-full px-2 py-1.5 border border-purple-200 rounded-sm text-xs outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] font-bold text-purple-500 uppercase mb-0.5 block">Fecha Nac.</label>
                                        <input type="date" value={quickPatient.birth_date || ''}
                                          onChange={(e) => setQuickPatient(prev => ({ ...prev, birth_date: e.target.value }))}
                                          className="w-full px-2 py-1.5 border border-purple-200 rounded-sm text-xs outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] font-bold text-purple-500 uppercase mb-0.5 block">Género</label>
                                        <select value={quickPatient.gender || ''}
                                          onChange={(e) => setQuickPatient(prev => ({ ...prev, gender: e.target.value }))}
                                          className="w-full px-2 py-1.5 border border-purple-200 rounded-sm text-xs outline-none bg-white">
                                          <option value="">...</option>
                                          <option value="M">Masculino</option>
                                          <option value="F">Femenino</option>
                                          <option value="O">Otro</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div className="flex gap-2 mt-1">
                                      <button type="button" onClick={() => setShowQuickPatient(false)}
                                        className="flex-1 py-1 text-[10px] font-bold text-gray-500 uppercase">Cancelar</button>
                                      <button type="button" onClick={handleQuickPatientSave}
                                        className="flex-1 py-1 bg-purple-600 text-white rounded-sm text-[10px] font-black uppercase">Crear</button>
                                    </div>
                                  </div>
                                )}
                                {formData.patient_id && (
                                  <p className="text-[10px] text-emerald-600 font-bold mt-1 uppercase">
                                    Seleccionado: {patients.find(p => p.id === formData.patient_id)?.full_name || 'Paciente'}
                                  </p>
                                )}
                            </div>

                            {/* ── SELECTOR DE MÉDICO CON BÚSQUEDA + BOTÓN "+" ── */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[11px] font-bold text-gray-500 uppercase">Médico *</label>
                                  <button type="button" onClick={() => { setShowNewDoctor(!showNewDoctor); setShowQuickPatient(false); }}
                                    className="text-[10px] font-black text-[#4C3073] hover:text-[#3d265c] uppercase flex items-center gap-1">
                                    <Plus size={12} /> Nuevo
                                  </button>
                                </div>
                                {!showNewDoctor ? (
                                  <div>
                                    <input type="text" placeholder="Buscar por RUT o nombre..." value={doctorSearch}
                                      onChange={(e) => setDoctorSearch(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    {doctorSearch && filteredDoctors.length > 0 && (
                                      <div className="relative">
                                        <div className="absolute z-20 top-1 left-0 w-full bg-white border shadow-xl rounded-sm max-h-40 overflow-y-auto">
                                          {filteredDoctors.map(d => (
                                            <button type="button" key={d.id}
                                              onClick={() => { 
                                                setFormData(prev => ({ ...prev, prescriber_rut: d.rut, prescriber_name: d.full_name })); 
                                                setDoctorSearch(`${d.rut} - ${d.full_name}`); 
                                              }}
                                              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0">
                                              <span className="font-bold text-xs text-gray-800">{d.full_name}</span>
                                              <span className="text-[10px] text-gray-400 ml-2 font-mono">{d.rut}</span>
                                              {d.specialty && <span className="text-[10px] text-gray-400 ml-2">· {d.specialty}</span>}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-2 bg-yellow-50 border border-yellow-200 rounded-sm p-3">
                                    <p className="text-[10px] font-black text-yellow-700 uppercase">Nuevo Médico</p>
                                    <input type="text" placeholder="RUT" value={newDoctor.rut}
                                      onChange={(e) => setNewDoctor(prev => ({ ...prev, rut: e.target.value }))}
                                      className="w-full px-2 py-1.5 border border-yellow-200 rounded-sm text-xs outline-none font-mono" />
                                    <input type="text" placeholder="Nombre Completo" value={newDoctor.full_name}
                                      onChange={(e) => setNewDoctor(prev => ({ ...prev, full_name: e.target.value }))}
                                      className="w-full px-2 py-1.5 border border-yellow-200 rounded-sm text-xs outline-none" />
                                    <input type="text" placeholder="Especialidad (opcional)" value={newDoctor.specialty}
                                      onChange={(e) => setNewDoctor(prev => ({ ...prev, specialty: e.target.value }))}
                                      className="w-full px-2 py-1.5 border border-yellow-200 rounded-sm text-xs outline-none" />
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => setShowNewDoctor(false)}
                                        className="flex-1 py-1 text-[10px] font-bold text-gray-500 uppercase">Cancelar</button>
                                      <button type="button" onClick={handleNewDoctorSave}
                                        className="flex-1 py-1 bg-yellow-600 text-white rounded-sm text-[10px] font-black uppercase">Crear</button>
                                    </div>
                                  </div>
                                )}
                                {formData.prescriber_rut && (
                                  <p className="text-[10px] text-emerald-600 font-bold mt-1 uppercase">
                                    Seleccionado: {formData.prescriber_name} ({formData.prescriber_rut})
                                  </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Columna Derecha: Selector de Medicamentos */}
                    <div className="md:col-span-8 space-y-4">
                        <div className="bg-white shadow-sm rounded-sm border border-gray-200 p-6">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4 border-b pb-2">
                                <Search size={14} /> Medicamentos Recetados
                            </h3>

                            <div className="relative mb-6">
                                <input
                                    type="text"
                                    className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:outline-none focus:ring-1 focus:ring-[#4C3073]"
                                    placeholder="Escribe el nombre del medicamento..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                />
                                {productSearch && filteredProducts.length > 0 && (
                                    <div className="absolute z-20 top-full left-0 w-full bg-white border shadow-xl rounded-sm mt-1 overflow-hidden">
                                    {filteredProducts.map(p => (
                                        <button key={p.id} onClick={() => addItem(p)} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-0 flex justify-between items-center group">
                                        <span className="font-bold text-gray-700 group-hover:text-[#4C3073]">{p.name}</span>
                                        <Plus size={16} className="text-[#4C3073]" />
                                        </button>
                                    ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3 min-h-[300px]">
                                {selectedItems.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-gray-200 rounded-sm text-gray-400 italic text-sm bg-gray-50">
                                        No hay medicamentos seleccionados
                                    </div>
                                ) : (
                                    selectedItems.map(item => (
                                    <div key={item.product_id} className="p-4 bg-gray-50 border border-gray-200 rounded-sm shadow-sm flex flex-col gap-3 group hover:border-[#4C3073] transition-all">
                                        <div className="flex items-center justify-between border-b pb-2 border-gray-200">
                                            <span className="font-black text-gray-800 flex items-center gap-2">
                                                <Pill size={16} className="text-[#4C3073]" /> {item.product_name}
                                            </span>
                                            <button onClick={() => removeItem(item.product_id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                                        </div>
                                        <div className="grid grid-cols-4 gap-4 mt-2">
                                            <div className="col-span-1">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cant.</label>
                                                <input type="number" min="1" value={item.quantity_prescribed} onChange={(e) => updateItem(item.product_id, 'quantity_prescribed', e.target.value)} 
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded-sm bg-white font-bold outline-none focus:border-[#4C3073]" />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Indicaciones</label>
                                                <input type="text" value={item.dosage_instructions} onChange={(e) => updateItem(item.product_id, 'dosage_instructions', e.target.value)} 
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded-sm bg-white italic text-sm outline-none focus:border-[#4C3073]" placeholder="Ej: 1 cada 8 horas" />
                                            </div>
                                        </div>
                                    </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                {formError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-xs font-bold uppercase tracking-widest">{formError}</div>}
                {/* Botón de guardado al final del formulario */}
                <div className="flex justify-center">
                  <button onClick={handleFormSubmit} disabled={submitting || !!savedFolio} 
                    className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-12 py-4 rounded-sm text-sm font-black uppercase tracking-wider transition-all shadow-md disabled:opacity-50 flex items-center gap-3">
                    <Save size={20} /> {submitting ? 'GUARDANDO...' : savedFolio ? 'RECETA GUARDADA ✓' : 'Guardar Receta (Pre-ingreso)'}
                  </button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && detailPrescription) {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden animate-in fade-in duration-150">
        <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
            <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <span className="hover:text-gray-900 cursor-pointer" onClick={() => setView('list')}>Gestión de Recetas</span>
                <ChevronRight size={12} className="mx-1" />
                <span className="text-[#4C3073]">{detailPrescription.folio_electronico}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
                <div className="flex gap-2">
                    <button onClick={() => setView('list')} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                        <ArrowLeft size={16} /> Volver
                    </button>
                </div>
                <div>{getStatusBadge(detailPrescription.status)}</div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-8 flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-black text-[#4C3073] tracking-tight">{detailPrescription.folio_electronico}</h1>
                        <p className="text-gray-500 font-medium mt-1">Paciente: {detailPrescription.patient?.full_name}</p>
                    </div>
                    <div className="text-right text-xs space-y-1">
                        <p><span className="text-gray-400 font-bold uppercase tracking-widest mr-2">Fecha:</span> <span className="font-mono">{new Date(detailPrescription.created_at).toLocaleDateString()}</span></p>
                        <p><span className="text-gray-400 font-bold uppercase tracking-widest mr-2">Médico:</span> <span>{detailPrescription.prescriber_name}</span></p>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-6">
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-4 border-b pb-2">Detalle de Medicamentos</h4>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-gray-500 text-left font-bold text-[11px] uppercase tracking-widest">
                                <th className="py-3 px-4">Producto</th>
                                <th className="py-3 px-4 text-center">Cant.</th>
                                <th className="py-3 px-4 text-center">Despachado</th>
                                <th className="py-3 px-4">Indicaciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loadingDetail ? (
                                <tr><td colSpan="3" className="py-10 text-center text-gray-400 font-bold">Cargando items...</td></tr>
                            ) : detailItems.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="py-4 px-4 font-bold text-gray-800 flex items-center gap-3">
                                        <Pill size={16} className="text-[#4C3073]" />
                                        {item.product?.name}
                                    </td>
                                    <td className="py-4 px-4 text-center font-black text-gray-900">{item.quantity_prescribed}</td>
                                    <td className="py-4 px-4 text-center font-black text-blue-600">{item.quantity_dispensed || 0}</td>
                                    <td className="py-4 px-4 italic text-gray-500">{item.dosage_instructions || 'Sin instrucciones adicionales'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {detailItems.length === 0 && !loadingDetail && (
                        <div className="text-center py-12 text-gray-400 italic">No hay items vinculados.</div>
                    )}
                </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm">
      <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shrink-0">
        <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-widest font-bold">
          <span>Farmacia</span>
          <ChevronRight size={12} className="mx-1" />
          <span className="text-gray-900">Gestión de Recetas</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button 
              onClick={() => setView('create')} 
              className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95"
            >
              Nueva Receta
            </button>
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar folio, médico o paciente..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-sm border-gray-300 border pl-8 pr-3 py-1.5 text-xs focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all" 
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/30">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Folio / Fecha</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Paciente</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Médico</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Estado</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredPrescriptions.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => openDetail(p)}>
                <td className="px-4 py-4">
                  <p className="font-bold text-[#4C3073]">{p.folio_electronico || p.folio || p.id.split('-')[0]}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{new Date(p.created_at).toLocaleDateString()}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-gray-400" />
                    <span className="font-semibold">{p.patient?.full_name || 'Sin paciente'}</span>
                  </div>
                  {p.patient?.rut && <p className="text-[10px] text-gray-500 mt-0.5 font-mono ml-6">{p.patient.rut}</p>}
                </td>
                <td className="px-4 py-4">
                  <span className="text-gray-600">{p.prescriber_name}</span>
                  {p.prescriber_rut && <p className="text-[10px] text-gray-400 font-mono">{p.prescriber_rut}</p>}
                </td>
                <td className="px-4 py-4">
                  {getStatusBadge(p.status)}
                  <p className="text-[10px] text-gray-500 mt-1 font-bold">
                    {p.prescription_type === 'RECETA_RETENIDA' ? 'RETENIDA' : 
                     p.prescription_type === 'RECETA_CHEQUE' ? 'CHEQUE' : 'SIMPLE'}
                  </p>
                </td>
                <td className="px-4 py-4 text-right">
                  <button onClick={(e) => { e.stopPropagation(); openDetail(p); }} className="text-[11px] font-bold text-[#4C3073] mr-3 uppercase tracking-wider">Ver</button>
                </td>
              </tr>
            ))}
            {filteredPrescriptions.length === 0 && !loading && (
              <tr><td colSpan={5} className="p-8 text-center text-gray-500">No hay recetas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
