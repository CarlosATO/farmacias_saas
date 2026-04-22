import React, { useEffect, useState } from 'react';
import { getPharmacySchema, getMyCompanyId, getCurrentUserId } from '../../../farmacia/api/pharmacyClient';

const SALE_CONDITIONS = [
  { value: 'VD', label: 'VD - Venta Directa' },
  { value: 'R', label: 'R - Receta Simple' },
  { value: 'RR', label: 'RR - Receta Retenida' },
  { value: 'RCH', label: 'RCH - Receta Cheque' }
];

export default function CatalogoMedicamentos() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('ident');
  const emptyForm = { id: null, name: '', active_ingredient: '', laboratory_name: '', registro_sanitario: '', sale_condition: 'VD', unit_price: '', barcode: '' };
  const [form, setForm] = useState(emptyForm);

  const fetchList = async () => {
    setLoading(true);
    try {
      const schema = getPharmacySchema();
      const { data, error } = await schema.from('products').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error(err);
      alert('Error cargando medicamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const resetForm = () => setForm(emptyForm);

  const openCreate = () => {
    resetForm();
    setActiveTab('ident');
    setShowModal(true);
  };

  // Normalization helpers
  const setUpper = (key, value) => setForm(prev => ({ ...prev, [key]: typeof value === 'string' ? value.toUpperCase() : value }));

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const schema = getPharmacySchema();
      const companyId = await getMyCompanyId();
      const userId = await getCurrentUserId();
      if (!companyId) throw new Error('No company_id');
      if (!userId) throw new Error('No authenticated user');

      // Validate numeric
      if (isNaN(Number(form.unit_price)) || form.unit_price === '') {
        alert('El campo Precio debe ser numérico y no vacío');
        setLoading(false);
        return;
      }

      const payload = {
        name: (form.name || '').toUpperCase(),
        dci: (form.active_ingredient || '').toUpperCase(),
        laboratory_name: (form.laboratory_name || '').toUpperCase(),
        registro_sanitario: (form.registro_sanitario || '').toUpperCase(),
        sale_condition: form.sale_condition,
        unit_price: Number(form.unit_price) || 0,
        barcode: form.barcode || '',
        company_id: companyId
      };

      if (form.id) {
        const { error } = await schema.from('products').update({ ...payload, updated_by: userId }).eq('id', form.id);
        if (error) throw error;
        alert('Medicamento actualizado');
      } else {
        const insertPayload = { ...payload, stock_quantity: 0, created_by: userId };
        const { error } = await schema.from('products').insert([insertPayload]).select().single();
        if (error) throw error;
        alert('Medicamento creado');
      }

      resetForm();
      await fetchList();
    } catch (err) {
      console.error(err);
      alert('Error guardando medicamento: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row) => {
    setForm({
      id: row.id,
      name: (row.name || '').toUpperCase(),
      active_ingredient: (row.dci || '').toUpperCase(),
      laboratory_name: (row.laboratory_name || '').toUpperCase(),
      registro_sanitario: (row.registro_sanitario || '').toUpperCase(),
      sale_condition: row.sale_condition || 'VD',
      unit_price: row.unit_price ?? '',
      barcode: row.barcode || ''
    });
    setActiveTab('ident');
    setShowModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar medicamento?')) return;
    try {
      setLoading(true);
      const schema = getPharmacySchema();
      const { error } = await schema.from('products').delete().eq('id', id);
      if (error) throw error;
      await fetchList();
    } catch (err) {
      console.error(err);
      alert('Error eliminando medicamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[#4C3073]">Mantenedor: Catálogo de Medicamentos</h2>
        <div>
          <button onClick={openCreate} className="bg-[#4C3073] text-white px-4 py-2 rounded-sm">Nuevo Medicamento</button>
        </div>
      </div>

      {/* Modal / Panel for create/edit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-8">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-white w-full max-w-4xl rounded-lg shadow-lg z-10 overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Ficha Medicamento {form.id ? `#${form.id}` : ''}</h3>
                <p className="text-sm text-gray-500">Complete los datos del medicamento en pestañas</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowModal(false); }} className="px-3 py-1 border rounded">Cancelar</button>
                <button onClick={handleSave} className="bg-[#4C3073] text-white px-4 py-1 rounded">Guardar</button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <nav className="flex gap-2">
                  <button onClick={() => setActiveTab('ident')} className={`px-3 py-2 rounded-t ${activeTab === 'ident' ? 'bg-[#f3eafd] text-[#4C3073] font-bold' : 'bg-gray-100'}`}>Identificación</button>
                  <button onClick={() => setActiveTab('reg')} className={`px-3 py-2 rounded-t ${activeTab === 'reg' ? 'bg-[#f3eafd] text-[#4C3073] font-bold' : 'bg-gray-100'}`}>Regulación</button>
                  <button onClick={() => setActiveTab('commercial')} className={`px-3 py-2 rounded-t ${activeTab === 'commercial' ? 'bg-[#f3eafd] text-[#4C3073] font-bold' : 'bg-gray-100'}`}>Comercial</button>
                </nav>
              </div>

              <form onSubmit={handleSave}>
                {activeTab === 'ident' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">Nombre Comercial</label>
                      <input required placeholder="Nombre Comercial (ej: Amoval)" value={form.name} onChange={e => setUpper('name', e.target.value)} className="border px-3 py-2 rounded-sm w-full" />
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">DCI / Principio Activo</label>
                      <input placeholder="Principio Activo" value={form.active_ingredient} onChange={e => setUpper('active_ingredient', e.target.value)} className="border px-3 py-2 rounded-sm w-full" />
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">Laboratorio Fabricante</label>
                      <input placeholder="Laboratorio" value={form.laboratory_name} onChange={e => setUpper('laboratory_name', e.target.value)} className="border px-3 py-2 rounded-sm w-full" />
                    </div>
                  </div>
                )}

                {activeTab === 'reg' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">Registro ISP</label>
                      <input placeholder="Registro ISP" value={form.registro_sanitario} onChange={e => setUpper('registro_sanitario', e.target.value)} className="border px-3 py-2 rounded-sm w-full" />
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">Condición de Venta</label>
                      <select value={form.sale_condition} onChange={e => setForm({...form, sale_condition: e.target.value})} className="border px-3 py-2 rounded-sm w-full">
                        {SALE_CONDITIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {activeTab === 'commercial' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">Precio de Venta al Público</label>
                      <input required placeholder="0.00" type="number" step="0.01" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value.replace(/[^0-9.]/g, '')})} className="border px-3 py-2 rounded-sm w-full" />
                    </div>
                    <div>
                      <label className="text-[12px] font-bold text-gray-600 mb-1 block">Código de Barras (opcional)</label>
                      <input placeholder="Código de barras" value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} className="border px-3 py-2 rounded-sm w-full" />
                    </div>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button type="submit" className="bg-[#4C3073] text-white px-4 py-2 rounded-sm">{form.id ? 'Actualizar' : 'Crear'}</button>
                  <button type="button" onClick={() => { resetForm(); setShowModal(false); }} className="border px-4 py-2 rounded-sm">Cancelar / Limpiar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
        <div className="p-4 border-b">Listado de medicamentos {loading && '...'} </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50">
            <tr>
              <th className="p-3 text-left">Nombre</th>
              <th className="p-3 text-left">DCI</th>
              <th className="p-3 text-left">Laboratorio</th>
              <th className="p-3 text-left">Registro ISP</th>
              <th className="p-3 text-left">Condición</th>
              <th className="p-3 text-left">Precio</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.dci}</td>
                <td className="p-3">{p.laboratory_name}</td>
                <td className="p-3">{p.registro_sanitario}</td>
                <td className="p-3">{p.sale_condition}</td>
                <td className="p-3">{p.unit_price?.toFixed ? p.unit_price.toFixed(2) : p.unit_price}</td>
                <td className="p-3 text-right">
                  <button onClick={() => handleEdit(p)} className="text-sm text-[#4C3073] mr-3">Editar</button>
                  <button onClick={() => handleDelete(p.id)} className="text-sm text-red-500">Eliminar</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && !loading && (
              <tr><td colSpan={7} className="p-4 text-center text-gray-500">Sin medicamentos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
