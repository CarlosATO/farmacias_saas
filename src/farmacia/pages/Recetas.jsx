import React, { useState, useEffect } from 'react';
import { FileText, Search, Plus, ShieldAlert, X, Activity, Pill, Trash2, Eye, Calendar, User, UserCheck, ChevronRight, ArrowLeft, Save } from 'lucide-react';
import { 
  fetchPrescriptions, 
  fetchPharmacyPatients, 
  fetchPharmacyProducts,
  createPrescriptionWithItems,
  fetchPrescriptionItems 
} from '../api/pharmacyClient';

export default function Recetas() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [view, setView] = useState('list'); // 'list', 'create', 'detail'
  
  // Registro
  const [formData, setFormData] = useState({
    folio_electronico: '',
    prescriber_rut: '',
    prescriber_name: '',
    patient_id: '',
    status: 'PENDING'
  });
  const [selectedItems, setSelectedItems] = useState([]); 
  
  // Modal de Detalle
  const [detailPrescription, setDetailPrescription] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // States para UI
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [productSearch, setProductSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [prescriptionsObj, patientsObj, productsObj] = await Promise.all([
        fetchPrescriptions(),
        fetchPharmacyPatients(),
        fetchPharmacyProducts()
      ]);

      if (!prescriptionsObj.error) setPrescriptions(prescriptionsObj.data || []);
      if (!patientsObj.error) setPatients(patientsObj.data || []);
      if (!productsObj.error) setProducts(productsObj.data || []);
      
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

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      setFormError("Debes agregar al menos un medicamento a la receta.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const prescriptionData = { ...formData };
      
      // FORMATEO EXACTO PARA LA BASE DE DATOS:
      // Quitamos 'product_name' que solo es para UI local
      const itemsToInsert = selectedItems.map(({ product_id, quantity_prescribed, dosage_instructions }) => ({
        product_id,
        quantity_prescribed: parseInt(quantity_prescribed),
        dosage_instructions
      }));

      const { error } = await createPrescriptionWithItems(prescriptionData, itemsToInsert);
      
      if (error) {
        setFormError(error.message || "Error al procesar la receta transaccional");
      } else {
        setView('list');
        resetForm();
        loadData();
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
    setFormError(null);
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
    return p.folio_electronico?.toLowerCase().includes(term) || 
           p.prescriber_name?.toLowerCase().includes(term);
  });

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) && 
    !selectedItems.find(si => si.product_id === p.id)
  ).slice(0, 5);

  const getStatusBadge = (status) => {
    const colors = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'DISPENSED': 'bg-green-100 text-green-800',
      'CANCELLED': 'bg-red-100 text-red-800'
    };
    return <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${colors[status] || 'bg-slate-100'}`}>{status}</span>;
  };

  if (view === 'create') {
    return (
      <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60] animate-in slide-in-from-right duration-300">
        {/* Control Panel Superior */}
        <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
            <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <span className="hover:text-gray-900 cursor-pointer" onClick={() => setView('list')}>Gestión de Recetas</span>
                <ChevronRight size={12} className="mx-1" />
                <span className="text-[#4C3073]">Nueva Receta</span>
            </div>
            <div className="flex justify-between items-center mt-1">
                <div className="flex gap-2">
                    <button onClick={() => setView('list')} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                        <ArrowLeft size={16} /> Cancelar y Volver
                    </button>
                </div>
                <div>
                   <button onClick={handleFormSubmit} disabled={submitting} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
                       <Save size={16} /> {submitting ? 'GUARDANDO...' : 'GUARDAR RECETA'}
                   </button>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-6xl mx-auto space-y-6">
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
                                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Paciente</label>
                                <select name="patient_id" required value={formData.patient_id} onChange={handleInputChange} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none">
                                <option value="">Seleccionar...</option>
                                {patients.map(p => <option key={p.id} value={p.id}>{p.rut} - {p.first_name} {p.last_name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Nombre Médico</label>
                                <input type="text" name="prescriber_name" required value={formData.prescriber_name} onChange={handleInputChange} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" placeholder="Dr. Nome L. Olvido" />
                            </div>
                            
                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">RUT Médico</label>
                                <input type="text" name="prescriber_rut" required value={formData.prescriber_rut} onChange={handleInputChange} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" placeholder="12.345.678-9" />
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
            </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && detailPrescription) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60] animate-in slide-in-from-right duration-300">
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
                        <p className="text-gray-500 font-medium mt-1">Paciente: {detailPrescription.patient?.first_name} {detailPrescription.patient?.last_name}</p>
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
              placeholder="Buscar folio o médico..." 
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
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tipo</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Estado</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredPrescriptions.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => openDetail(p)}>
                <td className="px-4 py-4">
                  <p className="font-bold text-[#4C3073]">{p.folio || p.id.split('-')[0]}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{new Date(p.prescription_date).toLocaleDateString()}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.patient_name}</span>
                  </div>
                  {p.patient_rut && <p className="text-[10px] text-gray-500 mt-0.5">{p.patient_rut}</p>}
                </td>
                <td className="px-4 py-4 text-gray-600">{p.doctor_name}</td>
                <td className="px-4 py-4 text-gray-500">
                  <span className="bg-gray-100 px-2 py-0.5 rounded-sm text-[10px] font-bold border border-gray-200">{p.prescription_type}</span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-wider border uppercase ${
                    p.status === 'DESPACHADA' ? 'bg-green-50 text-green-700 border-green-200' : 
                    p.status === 'ANULADA' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-indigo-50 text-indigo-700 border-indigo-200'
                  }`}>
                    {p.status || 'INGRESADA'}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <button onClick={(e) => { e.stopPropagation(); openDetail(p); }} className="text-[11px] font-bold text-[#4C3073] mr-3 uppercase tracking-wider">Ver</button>
                </td>
              </tr>
            ))}
            {filteredPrescriptions.length === 0 && !loading && (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500">No hay recetas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
