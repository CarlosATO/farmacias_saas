import React, { useState, useEffect } from 'react';
import { FileText, Search, Plus, ShieldAlert, X, Activity, Pill, Trash2, Eye, Calendar, User, UserCheck } from 'lucide-react';
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
  
  // Modal de Registro
  const [isModalOpen, setIsModalOpen] = useState(false);
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
        setIsModalOpen(false);
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

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col relative space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 text-emerald-700 mb-1">
            <FileText size={28} className="stroke-[2.5px]" />
            <h1 className="text-2xl font-black tracking-tight uppercase">Gestión de Recetas</h1>
          </div>
          <p className="text-slate-500 text-sm">Registro transaccional de prescripciones médicas y despacho.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-emerald-500 shadow-sm"
              placeholder="Folio o Médico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all active:scale-95"
          >
            <Plus size={18} />
            Nueva Receta
          </button>
        </div>
      </div>

      {/* Grid Principal */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[11px] tracking-widest">Folio</th>
              <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[11px] tracking-widest">Paciente</th>
              <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[11px] tracking-widest">Médico</th>
              <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[11px] tracking-widest">Estado</th>
              <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[11px] tracking-widest text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="5" className="py-20 text-center text-slate-400">Cargando prescripciones...</td></tr>
            ) : filteredPrescriptions.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-emerald-700">{p.folio_electronico}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-700">{p.patient?.first_name} {p.patient?.last_name}</span>
                    <span className="text-[11px] text-slate-400">{p.patient?.rut}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{p.prescriber_name}</td>
                <td className="px-6 py-4">{getStatusBadge(p.status)}</td>
                <td className="px-6 py-4 text-center">
                  <button 
                    onClick={() => openDetail(p)}
                    className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-xs"
                  >
                    <Eye size={16} /> Ver Detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Nueva Receta */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/30">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Pill size={24} className="text-emerald-500" />
                REGISTRAR PRESCRIPCIÓN MÉDICA
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-8">
              {/* Columna Izquierda: Datos Cabecera */}
              <div className="md:col-span-4 space-y-6">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Datos de la Receta</h3>
                  
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Folio Electrónico</label>
                    <input type="text" name="folio_electronico" required value={formData.folio_electronico} onChange={handleInputChange} 
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500" placeholder="REC-001" />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Paciente</label>
                    <select name="patient_id" required value={formData.patient_id} onChange={handleInputChange} 
                      className="w-full px-3 py-2 border rounded-lg text-sm">
                      <option value="">Seleccionar...</option>
                      {patients.map(p => <option key={p.id} value={p.id}>{p.rut} - {p.first_name} {p.last_name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Nombre Médico</label>
                    <input type="text" name="prescriber_name" required value={formData.prescriber_name} onChange={handleInputChange} 
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Dr. Nome L. Olvido" />
                  </div>
                  
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">RUT Médico</label>
                    <input type="text" name="prescriber_rut" required value={formData.prescriber_rut} onChange={handleInputChange} 
                      className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="12.345.678-9" />
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Selector de Medicamentos */}
              <div className="md:col-span-8 space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Search size={14} /> Medicamentos Recetados
                </h3>

                <div className="relative">
                  <input
                    type="text"
                    className="w-full pl-4 pr-10 py-3 bg-emerald-50/50 border-2 border-dashed border-emerald-200 rounded-xl text-sm italic focus:border-emerald-500 focus:outline-none"
                    placeholder="Escribe el nombre del medicamento..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  {productSearch && filteredProducts.length > 0 && (
                    <div className="absolute z-20 top-full left-0 w-full bg-white border shadow-xl rounded-lg mt-1 overflow-hidden">
                      {filteredProducts.map(p => (
                        <button key={p.id} onClick={() => addItem(p)} className="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b last:border-0 flex justify-between items-center group">
                          <span className="font-bold text-slate-700 group-hover:text-emerald-700">{p.name}</span>
                          <Plus size={16} className="text-emerald-500" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 min-h-[300px]">
                  {selectedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-100 rounded-xl text-slate-400 italic text-sm">
                      No hay medicamentos seleccionados
                    </div>
                  ) : (
                    selectedItems.map(item => (
                      <div key={item.product_id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col gap-3 group hover:border-emerald-200 transition-all">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800 flex items-center gap-2 underline decoration-emerald-200">
                             <Pill size={16} className="text-emerald-500" /> {item.product_name}
                          </span>
                          <button onClick={() => removeItem(item.product_id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          <div className="col-span-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Cant.</label>
                            <input type="number" min="1" value={item.quantity_prescribed} onChange={(e) => updateItem(item.product_id, 'quantity_prescribed', e.target.value)} 
                              className="w-full px-2 py-1 border rounded bg-slate-50 font-bold" />
                          </div>
                          <div className="col-span-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Indicaciones</label>
                            <input type="text" value={item.dosage_instructions} onChange={(e) => updateItem(item.product_id, 'dosage_instructions', e.target.value)} 
                              className="w-full px-2 py-1 border rounded bg-slate-50 italic text-sm" placeholder="Ej: 1 cada 8 horas" />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-between items-center">
              <div className="text-sm font-bold text-slate-500">
                Total Items: <span className="text-emerald-600 font-black">{selectedItems.length}</span>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 font-bold text-slate-400 hover:text-slate-600">Cerrar</button>
                <button 
                  onClick={handleFormSubmit}
                  disabled={submitting} 
                  className="bg-emerald-600 text-white px-8 py-2 rounded-xl font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? 'GUARDANDO...' : 'GUARDAR RECETA COMPLETA'}
                </button>
              </div>
            </div>
            {formError && <div className="bg-red-600 text-white text-center py-2 text-[10px] font-black uppercase tracking-widest">{formError}</div>}
          </div>
        </div>
      )}

      {/* Modal Detalle */}
      {detailPrescription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-4 border-emerald-500">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black italic uppercase tracking-tighter">FOLIO: {detailPrescription.folio_electronico}</h2>
                <div className="flex gap-4 mt-2 text-xs text-slate-400 font-bold">
                  <span className="flex items-center gap-1"><User size={14}/> {detailPrescription.patient?.first_name} {detailPrescription.patient?.last_name}</span>
                  <span className="flex items-center gap-1 text-emerald-400"><Calendar size={14}/> {new Date(detailPrescription.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button onClick={() => setDetailPrescription(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24}/></button>
            </div>
            
            <div className="p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-100 text-slate-400 text-left font-black text-[11px] uppercase tracking-widest">
                    <th className="py-3">Producto</th>
                    <th className="py-3 text-center">Cant.</th>
                    <th className="py-3">Indicaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingDetail ? (
                    <tr><td colSpan="3" className="py-10 text-center animate-pulse text-emerald-600 font-bold">Recuperando items de la receta...</td></tr>
                  ) : detailItems.map(item => (
                    <tr key={item.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-4 font-bold text-slate-700 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0"><Pill size={16}/></div>
                        {item.product?.name}
                      </td>
                      <td className="py-4 text-center font-black text-emerald-600 bg-emerald-50/30 rounded-lg">{item.quantity_prescribed}</td>
                      <td className="py-4 italic text-slate-500 text-xs pl-4">{item.dosage_instructions || 'Sin instrucciones adicionales'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detailItems.length === 0 && !loadingDetail && (
                <div className="text-center py-12 text-slate-300 italic flex flex-col items-center gap-2">
                   <ShieldAlert size={48} opacity={0.3} />
                   <span>No hay items vinculados a esta receta</span>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <button onClick={() => setDetailPrescription(null)} className="bg-slate-800 hover:bg-slate-900 text-white px-10 py-2 rounded-xl font-black text-xs tracking-widest transition-all">CERRAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
