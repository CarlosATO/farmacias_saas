import React, { useEffect, useState } from 'react';
import { ChevronRight, ArrowLeft, Save, Building2, Search } from 'lucide-react';
import { fetchSuppliers, getPharmacySchema, getMyCompanyId, getCurrentUserId } from '../../../farmacia/api/pharmacyClient';

export default function ProveedoresMedicos() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('list');
  const [activeTab, setActiveTab] = useState('legal');
  const [searchTerm, setSearchTerm] = useState('');

  const emptyForm = {
    id: null,
    // Datos Legales
    rut: '',
    legal_name: '',
    commercial_name: '',
    legal_representative: '',
    isp_resolution_number: '',
    business_line: '',
    // Contacto y Ubicación
    address: '',
    address_commune: '',
    address_city: '',
    contact_person_name: '',
    contact_person_role: '',
    contact_email: '',
    contact_phone: '',
    website_url: '',
    // Social media broken-out fields
    instagram_url: '',
    linkedin_url: '',
    twitter_url: '',
    // Comercial
    payment_terms_days: 0,
    // Bank details broken-out fields
    bank_name: '',
    account_type: '',
    account_number: '',
    payment_email: '',
    observation_notes: ''
  };

  const [form, setForm] = useState(emptyForm);

  const fetchList = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchSuppliers();
      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      console.error('Error fetching suppliers', err);
      alert('Error cargando proveedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setActiveTab('legal');
    setView('form');
  };

  const handleEdit = (row) => {
    setForm({
      id: row.id,
      rut: row.rut || '',
      legal_name: (row.legal_name || '').toUpperCase(),
      commercial_name: (row.commercial_name || '').toUpperCase(),
      legal_representative: (row.legal_representative || '').toUpperCase(),
      isp_resolution_number: (row.isp_resolution_number || '').toUpperCase(),
      business_line: (row.business_line || '').toUpperCase(),
      address: (row.address || '').toUpperCase(),
      address_commune: (row.address_commune || '').toUpperCase(),
      address_city: (row.address_city || '').toUpperCase(),
      contact_person_name: (row.contact_person_name || '').toUpperCase(),
      contact_person_role: (row.contact_person_role || '').toUpperCase(),
      contact_email: (row.contact_email || '').toLowerCase(),
      contact_phone: row.contact_phone || '',
      website_url: (row.website_url || '').toLowerCase(),
      instagram_url: (row.social_media_links?.instagram || '').toLowerCase(),
      linkedin_url: (row.social_media_links?.linkedin || '').toLowerCase(),
      twitter_url: (row.social_media_links?.twitter || '').toLowerCase(),
      payment_terms_days: row.payment_terms_days || 0,
      bank_name: (row.bank_details?.bank_name || '').toUpperCase(),
      account_type: (row.bank_details?.account_type || '').toUpperCase(),
      account_number: row.bank_details?.account_number || '',
      payment_email: (row.bank_details?.payment_email || '').toLowerCase(),
      observation_notes: (row.observation_notes || '').toUpperCase()
    });
    setActiveTab('legal');
    setView('form');
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar proveedor? Esta acción es irreversible.')) return;
    try {
      setLoading(true);
      const schema = getPharmacySchema();
      const { error } = await schema.from('suppliers').delete().eq('id', id);
      if (error) throw error;
      await fetchList();
    } catch (err) {
      console.error(err);
      alert('Error eliminando proveedor');
    } finally {
      setLoading(false);
    }
  };

  // RUT helpers
  const formatRut = (value) => {
    if (!value) return '';
    const onlyDigitsK = value.toString().replace(/[^0-9kK]/g, '').toUpperCase();
    if (onlyDigitsK.length <= 1) return onlyDigitsK;
    const body = onlyDigitsK.slice(0, -1);
    const dv = onlyDigitsK.slice(-1);
    const reversed = body.split('').reverse().join('');
    const chunks = reversed.match(/.{1,3}/g) || [];
    const formattedBody = chunks.join('.').split('').reverse().join('');
    return formattedBody ? `${formattedBody}-${dv}` : onlyDigitsK;
  };

  const validateRut = (rut) => {
    if (!rut) return false;
    const clean = rut.toString().replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length < 2) return false;
    const dv = clean.slice(-1);
    const body = clean.slice(0, -1).split('').reverse();
    let sum = 0;
    let multiplier = 2;
    for (let n of body) {
      sum += Number(n) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const mod = 11 - (sum % 11);
    const expected = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
    return expected === dv;
  };

  const onRutChange = (val) => {
    const only = val.replace(/[^0-9kK]/g, '').toUpperCase();
    setForm({ ...form, rut: formatRut(only) });
  };

  // Compute DV and set formatted RUT on blur
  const computeRutDV = (body) => {
    const digits = body.replace(/\D/g, '');
    const reversed = digits.split('').reverse();
    let sum = 0;
    let mul = 2;
    for (let n of reversed) {
      sum += Number(n) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const mod = 11 - (sum % 11);
    if (mod === 11) return '0';
    if (mod === 10) return 'K';
    return String(mod);
  };

  const onRutBlur = () => {
    const clean = form.rut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (!clean) return;
    const body = clean.slice(0, -1);
    const dv = computeRutDV(body);
    setForm({ ...form, rut: formatRut(body + dv) });
  };

  // Helpers to normalize inputs in real time
  const setUpper = (key, value) => {
    setForm(prev => ({ ...prev, [key]: typeof value === 'string' ? value.toUpperCase() : value }));
  };

  const setLower = (key, value) => {
    setForm(prev => ({ ...prev, [key]: typeof value === 'string' ? value.toLowerCase() : value }));
  };

  const handleSave = async (e) => {
    e && e.preventDefault && e.preventDefault();
    try {
      setLoading(true);
      const schema = getPharmacySchema();
      const companyId = await getMyCompanyId();
      const userId = await getCurrentUserId();
      if (!companyId) throw new Error('No company_id');
      if (!userId) throw new Error('Usuario no autenticado');

      if (!validateRut(form.rut)) {
        alert('RUT inválido. Verifica formato y dígito verificador.');
        setLoading(false);
        return;
      }

      // Compose JSONB objects from individual inputs
      const socialLinks = {
        instagram: form.instagram_url || '',
        linkedin: form.linkedin_url || '',
        twitter: form.twitter_url || ''
      };

      const bankDetails = {
        bank_name: form.bank_name || '',
        account_type: form.account_type || '',
        account_number: form.account_number || '',
        payment_email: form.payment_email || ''
      };

      const payload = {
        rut: form.rut,
        legal_name: form.legal_name,
        commercial_name: form.commercial_name,
        legal_representative: form.legal_representative,
        isp_resolution_number: form.isp_resolution_number,
        business_line: form.business_line,
        address: form.address,
        address_commune: form.address_commune,
        address_city: form.address_city,
        contact_person_name: form.contact_person_name,
        contact_person_role: form.contact_person_role,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        website_url: form.website_url,
        social_media_links: socialLinks,
        payment_terms_days: Number(form.payment_terms_days) || 0,
        bank_details: bankDetails,
        observation_notes: form.observation_notes,
        company_id: companyId
      };

      // Normalize casing: emails/urls -> lowercase; most text fields -> UPPERCASE
      const toLowerKeys = new Set(['contact_email', 'payment_email', 'website_url', 'instagram_url', 'linkedin_url', 'twitter_url']);
      const noChangeKeys = new Set(['rut', 'payment_terms_days', 'company_id']);

      const normalizedPayload = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v === null || v === undefined) {
          normalizedPayload[k] = v;
          continue;
        }
        if (noChangeKeys.has(k)) {
          normalizedPayload[k] = v;
          continue;
        }
        if (toLowerKeys.has(k)) {
          normalizedPayload[k] = (typeof v === 'string') ? v.toLowerCase() : v;
          continue;
        }
        // bank_details and social_media_links are objects: normalize their inner emails/urls
        if (k === 'bank_details' && typeof v === 'object') {
          normalizedPayload[k] = {
            bank_name: (v.bank_name || '').toUpperCase(),
            account_type: (v.account_type || '').toUpperCase(),
            account_number: v.account_number || '',
            payment_email: (v.payment_email || '').toLowerCase()
          };
          continue;
        }
        if (k === 'social_media_links' && typeof v === 'object') {
          normalizedPayload[k] = {
            instagram: (v.instagram || '').toLowerCase(),
            linkedin: (v.linkedin || '').toLowerCase(),
            twitter: (v.twitter || '').toLowerCase()
          };
          continue;
        }
        // Default: string -> UPPERCASE, keep numbers as-is
        normalizedPayload[k] = (typeof v === 'string') ? v.toUpperCase() : v;
      }

      if (form.id) {
        const { error } = await schema.from('suppliers').update({ ...payload, updated_by: userId }).eq('id', form.id);
        if (error) throw error;
        alert('Proveedor actualizado');
      } else {
        const { error } = await schema.from('suppliers').insert([{ ...payload, created_by: userId }]).select().single();
        if (error) throw error;
        alert('Proveedor creado');
      }

      setView('list');
      await fetchList();
    } catch (err) {
      console.error(err);
      alert('Error guardando proveedor: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  if (view === 'form') {
    return (
      <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60] animate-in slide-in-from-right duration-300">
        <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
            <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <span className="hover:text-gray-900 cursor-pointer" onClick={() => setView('list')}>Proveedores Médicos</span>
                <ChevronRight size={12} className="mx-1" />
                <span className="text-[#4C3073]">{form.id ? `Editar Proveedor #${form.id}` : 'Nuevo Proveedor'}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
                <div className="flex gap-2">
                    <button onClick={() => setView('list')} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                        <ArrowLeft size={16} /> Cancelar y Volver
                    </button>
                </div>
                <div>
                   <button onClick={handleSave} disabled={loading} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
                       <Save size={16} /> {loading ? 'Guardando...' : 'Guardar Proveedor'}
                   </button>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-6 flex justify-between items-start">
                    <div>
                        <h1 className="text-xl font-black text-[#4C3073] tracking-tight flex items-center gap-2">
                            <Building2 size={24} /> {form.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                        </h1>
                        <p className="text-gray-500 font-medium mt-1">Complete los datos en las pestañas correspondientes</p>
                    </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
                    <div className="border-b border-gray-200 px-6 pt-4">
                        <nav className="flex gap-4">
                            <button onClick={() => setActiveTab('legal')} className={`pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'legal' ? 'border-[#4C3073] text-[#4C3073]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Datos Legales</button>
                            <button onClick={() => setActiveTab('contact')} className={`pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'contact' ? 'border-[#4C3073] text-[#4C3073]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Contacto / Ubicación</button>
                            <button onClick={() => setActiveTab('commercial')} className={`pb-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'commercial' ? 'border-[#4C3073] text-[#4C3073]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Configuración Comercial</button>
                        </nav>
                    </div>

                    <div className="p-8">
                        <form onSubmit={handleSave}>
                            {activeTab === 'legal' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">RUT</label>
                                        <input required placeholder="RUT (XX.XXX.XXX-X)" value={form.rut} onChange={e => onRutChange(e.target.value)} onBlur={onRutBlur} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Razón Social</label>
                                        <input required placeholder="Razón Social" value={form.legal_name} onChange={e => setUpper('legal_name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Nombre de Fantasía</label>
                                        <input placeholder="Nombre de Fantasía" value={form.commercial_name} onChange={e => setUpper('commercial_name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Representante Legal</label>
                                        <input placeholder="Representante Legal" value={form.legal_representative} onChange={e => setUpper('legal_representative', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Resolución ISP</label>
                                        <input placeholder="Resolución ISP" value={form.isp_resolution_number} onChange={e => setUpper('isp_resolution_number', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Giro / Línea de negocio</label>
                                        <input placeholder="Giro / Línea de negocio" value={form.business_line} onChange={e => setUpper('business_line', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'contact' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Dirección (calle)</label>
                                        <input placeholder="Dirección (calle)" value={form.address} onChange={e => setUpper('address', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Comuna</label>
                                            <input placeholder="Comuna" value={form.address_commune} onChange={e => setUpper('address_commune', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Ciudad</label>
                                            <input placeholder="Ciudad" value={form.address_city} onChange={e => setUpper('address_city', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Contacto Operativo (Nombre)</label>
                                        <input placeholder="Contacto Operativo (Nombre)" value={form.contact_person_name} onChange={e => setUpper('contact_person_name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Cargo contacto</label>
                                        <input placeholder="Cargo contacto" value={form.contact_person_role} onChange={e => setUpper('contact_person_role', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Email</label>
                                        <input placeholder="Email" type="email" value={form.contact_email} onChange={e => setLower('contact_email', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Teléfono</label>
                                        <input placeholder="Teléfono" value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Website URL</label>
                                        <input placeholder="Website URL" value={form.website_url} onChange={e => setLower('website_url', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Instagram URL</label>
                                            <input placeholder="Instagram URL" value={form.instagram_url} onChange={e => setLower('instagram_url', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">LinkedIn URL</label>
                                            <input placeholder="LinkedIn URL" value={form.linkedin_url} onChange={e => setLower('linkedin_url', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Twitter URL</label>
                                            <input placeholder="Twitter URL" value={form.twitter_url} onChange={e => setLower('twitter_url', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'commercial' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Días de Crédito</label>
                                        <input aria-label="payment_terms_days" placeholder="Ej: 30" type="number" value={form.payment_terms_days} onChange={e => setForm({...form, payment_terms_days: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                    </div>
                                    <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Banco</label>
                                            <input placeholder="Banco" value={form.bank_name} onChange={e => setUpper('bank_name', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Tipo de Cuenta</label>
                                            <input placeholder="Tipo de Cuenta" value={form.account_type} onChange={e => setUpper('account_type', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">N° de Cuenta</label>
                                            <input placeholder="N° de Cuenta" value={form.account_number} onChange={e => setForm({...form, account_number: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Email de Pago</label>
                                            <input placeholder="Email de Pago" type="email" value={form.payment_email} onChange={e => setLower('payment_email', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none" />
                                        </div>
                                    </div>
                                    <div className="col-span-1 sm:col-span-2 pt-4 border-t border-gray-100">
                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Notas de Observación</label>
                                        <textarea rows="3" placeholder="Observaciones..." value={form.observation_notes} onChange={e => setUpper('observation_notes', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none resize-none" />
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

  const filteredSuppliers = suppliers.filter(s => 
    (s.legal_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.commercial_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.rut || '').includes(searchTerm)
  );

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm">
      <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shrink-0">
        <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-widest font-bold">
          <span>Farmacia</span>
          <ChevronRight size={12} className="mx-1" />
          <span className="text-gray-900">Proveedores Médicos</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button 
              onClick={openCreate} 
              className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95"
            >
              Nuevo Proveedor
            </button>
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar proveedores..." 
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
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">RUT</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Razón Social</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Contacto Operativo</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Rigor Comercial (días)</th>
              <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredSuppliers.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => handleEdit(s)}>
                <td className="px-4 py-4 font-bold text-[#4C3073]">{s.rut}</td>
                <td className="px-4 py-4 font-semibold">{s.legal_name}</td>
                <td className="px-4 py-4 text-gray-500">{s.contact_person_name || '—'}</td>
                <td className="px-4 py-4 text-gray-500">{s.payment_terms_days ?? '—'}</td>
                <td className="px-4 py-4 text-right">
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(s); }} className="text-[11px] font-bold text-[#4C3073] mr-3 uppercase tracking-wider">Editar</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="text-[11px] font-bold text-red-500 uppercase tracking-wider">Eliminar</button>
                </td>
              </tr>
            ))}
            {filteredSuppliers.length === 0 && !loading && (
              <tr><td colSpan={5} className="p-8 text-center text-gray-500">Sin proveedores</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
