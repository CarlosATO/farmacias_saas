import React, { useState, useEffect } from 'react';
import { Stethoscope, ChevronRight, Search, Plus, ArrowLeft, Save, Calendar } from 'lucide-react';
import { fetchDoctors, createDoctor, updateDoctor } from '../api/pharmacyClient';

export default function Medicos() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState('list');
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [formData, setFormData] = useState({ rut: '', full_name: '', specialty: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchDoctors();
      if (!error) setDoctors(data || []);
    } catch (err) {
      console.error("Error cargando médicos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = doctors.filter(d => {
    const term = searchTerm.toLowerCase();
    return d.full_name?.toLowerCase().includes(term) || d.rut?.toLowerCase().includes(term);
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openCreate = () => {
    setEditingDoctor(null);
    setFormData({ rut: '', full_name: '', specialty: '' });
    setFormError(null);
    setView('create');
  };

  const openEdit = (doctor) => {
    setEditingDoctor(doctor);
    setFormData({
      rut: doctor.rut || '',
      full_name: doctor.full_name || '',
      specialty: doctor.specialty || ''
    });
    setFormError(null);
    setView('edit');
  };

  const handleSubmit = async () => {
    if (!formData.rut.trim()) { setFormError('RUT es obligatorio.'); return; }
    if (!formData.full_name.trim()) { setFormError('Nombre Completo es obligatorio.'); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        rut: formData.rut.trim(),
        full_name: formData.full_name.trim(),
        specialty: formData.specialty.trim() || null
      };
      if (editingDoctor) {
        await updateDoctor(editingDoctor.id, payload);
      } else {
        await createDoctor(payload);
      }
      setView('list');
      loadData();
    } catch (err) {
      setFormError(err.message || 'Error al guardar médico.');
    } finally {
      setSubmitting(false);
    }
  };

  if (view === 'create' || view === 'edit') {
    const isEdit = view === 'edit';
    return (
      <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60]">
        <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
          <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            <span className="hover:text-gray-900 cursor-pointer" onClick={() => setView('list')}>Directorio Médico</span>
            <ChevronRight size={12} className="mx-1" />
            <span className="text-[#4C3073]">{isEdit ? 'Editar Médico' : 'Nuevo Médico'}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <button onClick={() => setView('list')} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
              <ArrowLeft size={16} /> Cancelar y Volver
            </button>
            <button onClick={handleSubmit} disabled={submitting} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
              <Save size={16} /> {submitting ? 'GUARDANDO...' : (isEdit ? 'ACTUALIZAR' : 'GUARDAR MÉDICO')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                <div className="p-2 bg-[#4C3073]/10 rounded">
                  <Stethoscope size={24} className="text-[#4C3073]" />
                </div>
                <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">
                  {isEdit ? 'Editar Médico' : 'Nuevo Médico'}
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">RUT *</label>
                  <input type="text" name="rut" value={formData.rut} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none font-mono"
                    placeholder="12.345.678-9" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Nombre Completo *</label>
                  <input type="text" name="full_name" value={formData.full_name} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                    placeholder="Dr. Juan Pérez" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Especialidad</label>
                  <input type="text" name="specialty" value={formData.specialty} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none"
                    placeholder="Medicina General" />
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-gray-100 mt-6">
                <button onClick={() => setView('list')} className="px-8 py-3 border border-gray-300 text-gray-600 hover:bg-gray-100 rounded-sm text-xs font-bold uppercase tracking-wider transition-all">
                  Cancelar
                </button>
                <button onClick={handleSubmit} disabled={submitting} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-8 py-3 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50">
                  {submitting ? 'GUARDANDO...' : (isEdit ? 'ACTUALIZAR MÉDICO' : 'GUARDAR MÉDICO')}
                </button>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-xs font-bold uppercase tracking-widest">{formError}</div>
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
          <span className="text-gray-900">Directorio Médico</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button onClick={openCreate}
              className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 flex items-center gap-1.5">
              <Plus size={14} /> Nuevo Médico
            </button>
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar por RUT o Nombre..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-sm border-gray-300 border pl-8 pr-3 py-1.5 text-xs focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/30">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 font-bold text-sm">Cargando médicos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="bg-white rounded-sm shadow-sm border border-gray-200 p-12 text-center max-w-md w-full">
              <Stethoscope size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-black text-gray-800 mb-2">
                {searchTerm ? 'Sin resultados' : 'Directorio Médico'}
              </h3>
              <p className="text-sm text-gray-500">
                {searchTerm ? `No se encontraron médicos para "${searchTerm}".` : 'Registra el primer médico para comenzar.'}
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">RUT</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre Completo</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Especialidad</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Fecha Registro</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-gray-700 font-bold">{d.rut}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-800">{d.full_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{d.specialty || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <Calendar size={12} />
                      <span className="text-xs">{d.created_at ? new Date(d.created_at).toLocaleDateString('es-CL') : '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(d)}
                      className="text-[11px] font-bold text-[#4C3073] hover:text-[#3d265c] uppercase tracking-wider">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
