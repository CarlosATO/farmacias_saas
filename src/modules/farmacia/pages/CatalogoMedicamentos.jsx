import React, { useEffect, useState } from 'react';
import { ChevronRight, ArrowLeft, Save, Pill, Search } from 'lucide-react';
import { fetchPharmacyProducts, getPharmacySchema, getMyCompanyId, getCurrentUserId } from '../../../farmacia/api/pharmacyClient';

const SALE_CONDITIONS = [
  { value: 'VD', label: 'VD - Venta Directa' },
  { value: 'R', label: 'R - Receta Simple' },
  { value: 'RR', label: 'RR - Receta Retenida' },
  { value: 'RCH', label: 'RCH - Receta Cheque' }
];

export default function CatalogoMedicamentos() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('list');
  const [activeTab, setActiveTab] = useState('ident');
  const [searchTerm, setSearchTerm] = useState('');
  const emptyForm = { 
    id: null, 
    name: '', 
    active_ingredient: '', 
    laboratory_name: '', 
    registro_sanitario: '', 
    sale_condition: 'VD', 
    unit_price: '', 
    barcode: '',
    purchase_uom: '',
    sale_uom: '',
    conversion_factor: 1,
    barcode_purchase: '',
    family: '',
    subfamily: '',
    prescription_type: 'VENTA_LIBRE'
  };
  const [form, setForm] = useState(emptyForm);

  const fetchList = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchPharmacyProducts(); // Global/Master data
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
    setView('form');
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
        purchase_uom: (form.purchase_uom || '').toUpperCase(),
        sale_uom: (form.sale_uom || '').toUpperCase(),
        conversion_factor: Number(form.conversion_factor) || 1,
        barcode_purchase: form.barcode_purchase || '',
        family: (form.family || '').toUpperCase(),
        subfamily: (form.subfamily || '').toUpperCase(),
        prescription_type: form.prescription_type,
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
      setView('list');
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
      barcode: row.barcode || '',
      purchase_uom: row.purchase_uom || '',
      sale_uom: row.sale_uom || '',
      conversion_factor: row.conversion_factor || 1,
      barcode_purchase: row.barcode_purchase || '',
      family: row.family || '',
      subfamily: row.subfamily || '',
      prescription_type: row.prescription_type || 'VENTA_LIBRE'
    });
    setActiveTab('ident');
    setView('form');
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

  if (view === 'form') {
    return (
      <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60] animate-in slide-in-from-right duration-300">
        <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
            <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <span className="hover:text-gray-900 cursor-pointer" onClick={() => { setView('list'); resetForm(); }}>Catálogo de Medicamentos</span>
                <ChevronRight size={12} className="mx-1" />
                <span className="text-[#4C3073]">{form.id ? `Editar Medicamento #${form.id}` : 'Nuevo Medicamento'}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
                <div className="flex gap-2">
                    <button type="button" onClick={() => { setView('list'); resetForm(); }} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                        <ArrowLeft size={16} /> Cancelar y Volver
                    </button>
                </div>
                <div>
                   <button onClick={handleSave} disabled={loading} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
                       <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Medicamento'}
                   </button>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-6 flex justify-between items-start">
                    <div>
                        <h1 className="text-xl font-black text-[#4C3073] tracking-tight flex items-center gap-2">
                            <Pill size={24} /> {form.id ? 'Editar Medicamento' : 'Nuevo Medicamento'}
                        </h1>
                        <p className="text-gray-500 font-medium mt-1">Complete los datos en las pestañas correspondientes</p>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
                    <div className="border-b border-gray-200 px-6 pt-4">
                        <nav className="flex gap-4">
                            <button type="button" onClick={() => setActiveTab('ident')} className={`pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'ident' ? 'border-[#4C3073] text-[#4C3073]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Identificación</button>
                            <button type="button" onClick={() => setActiveTab('reg')} className={`pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'reg' ? 'border-[#4C3073] text-[#4C3073]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Regulación</button>
                            <button type="button" onClick={() => setActiveTab('commercial')} className={`pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'commercial' ? 'border-[#4C3073] text-[#4C3073]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Comercial</button>
                        </nav>
                    </div>

                    <div className="p-8">
                        <form onSubmit={handleSave}>
                            {activeTab === 'ident' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Nombre Comercial</label>
                                        <input required placeholder="Nombre Comercial (ej: Amoval)" value={form.name} onChange={e => setUpper('name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">DCI / Principio Activo</label>
                                        <input placeholder="Principio Activo" value={form.active_ingredient} onChange={e => setUpper('active_ingredient', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Laboratorio Fabricante</label>
                                        <input placeholder="Laboratorio" value={form.laboratory_name} onChange={e => setUpper('laboratory_name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div className="col-span-1 sm:col-span-2 grid grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Familia</label>
                                            <input placeholder="Ej: Analgésicos" value={form.family} onChange={e => setUpper('family', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Sub-familia</label>
                                            <input placeholder="Ej: Adulto" value={form.subfamily} onChange={e => setUpper('subfamily', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'reg' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Registro ISP</label>
                                        <input placeholder="Registro ISP" value={form.registro_sanitario} onChange={e => setUpper('registro_sanitario', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Condición de Venta (Resumen)</label>
                                        <select value={form.sale_condition} onChange={e => setForm({...form, sale_condition: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none bg-white">
                                            {SALE_CONDITIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Tipo de Receta (Control Financiero/Legal)</label>
                                        <select value={form.prescription_type} onChange={e => setForm({...form, prescription_type: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none bg-white font-bold text-[#4C3073]">
                                            <option value="VENTA_LIBRE">VENTA LIBRE</option>
                                            <option value="RECETA_SIMPLE">RECETA SIMPLE</option>
                                            <option value="RECETA_RETENIDA">RECETA RETENIDA</option>
                                            <option value="RECETA_CHEQUE">RECETA CHEQUE</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'commercial' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Precio de Venta al Público</label>
                                        <input required placeholder="0.00" type="number" step="0.01" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value.replace(/[^0-9.]/g, '')})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Código de Barras Venta (Dispensación)</label>
                                        <input placeholder="Código de barras dispensación" value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Unidad de Compra (ej: CAJA CLÍNICA)</label>
                                            <input placeholder="Unidad Compra" value={form.purchase_uom} onChange={e => setUpper('purchase_uom', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Unidad de Venta (ej: COMPRIMIDO)</label>
                                            <input placeholder="Unidad Venta" value={form.sale_uom} onChange={e => setUpper('sale_uom', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Factor de Conversión</label>
                                            <input type="number" placeholder="1" value={form.conversion_factor} onChange={e => setForm({...form, conversion_factor: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                    </div>
                                    <div className="col-span-1 sm:col-span-2 pt-4 border-t border-gray-100">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Código de Barras Compra (Caja Mayor)</label>
                                        <input placeholder="Código de barras compra" value={form.barcode_purchase} onChange={e => setForm({...form, barcode_purchase: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
  }

  const filteredProducts = products.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.dci || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.laboratory_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.registro_sanitario || '').includes(searchTerm)
  );

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm">
      <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shrink-0">
        <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-widest font-bold">
          <span>Farmacia</span>
          <ChevronRight size={12} className="mx-1" />
          <span className="text-gray-900">Catálogo de Medicamentos</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button 
              onClick={openCreate} 
              className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95"
            >
              Nuevo Medicamento
            </button>
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar medicamentos..." 
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
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">DCI</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Laboratorio</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Registro ISP</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Condición</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Precio</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredProducts.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => handleEdit(p)}>
                <td className="px-4 py-4 font-bold text-[#4C3073]">{p.name}</td>
                <td className="px-4 py-4 font-semibold">{p.dci}</td>
                <td className="px-4 py-4 text-gray-500">{p.laboratory_name}</td>
                <td className="px-4 py-4 text-gray-500">{p.registro_sanitario}</td>
                <td className="px-4 py-4 text-gray-500">{p.sale_condition}</td>
                <td className="px-4 py-4 font-black text-gray-900">${p.unit_price?.toFixed ? p.unit_price.toFixed(2) : p.unit_price}</td>
                <td className="px-4 py-4 text-right">
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(p); }} className="text-[11px] font-bold text-[#4C3073] mr-3 uppercase tracking-wider">Editar</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="text-[11px] font-bold text-red-500 uppercase tracking-wider">Eliminar</button>
                </td>
              </tr>
            ))}
            {filteredProducts.length === 0 && !loading && (
              <tr><td colSpan={7} className="p-8 text-center text-gray-500">Sin medicamentos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
