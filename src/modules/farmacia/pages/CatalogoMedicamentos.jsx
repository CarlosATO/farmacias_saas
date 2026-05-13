import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ArrowLeft, Save, Pill, Search, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fetchPharmacyProducts, getPharmacySchema, getMyCompanyId, getCurrentUserId, importProductsBulk, logAuditEvent } from '../../../farmacia/api/pharmacyClient';

const SALE_CONDITIONS = [
  { value: 'VD', label: 'VD - Venta Directa' },
  { value: 'R', label: 'R - Receta Simple' },
  { value: 'RR', label: 'RR - Receta Retenida' },
  { value: 'RCH', label: 'RCH - Receta Cheque' }
];

const BULK_TEMPLATE_COLUMNS = [
  'sku',
  'barcode',
  'nombre',
  'dci',
  'laboratorio',
  'registro_isp',
  'concentracion',
  'forma_farmaceutica',
  'sale_condition',
  'prescription_type',
  'is_controlled',
  'bioequivalente',
  'stock_minimo',
  'precio_venta'
];

const BULK_REQUIRED_COLUMNS = ['nombre', 'dci', 'sale_condition'];
const VALID_SALE_CONDITIONS = ['VD', 'R', 'RR', 'RCH'];
const VALID_PRESCRIPTION_TYPES = ['VENTA_LIBRE', 'RECETA_SIMPLE', 'RECETA_RETENIDA', 'RECETA_CHEQUE'];
const VALID_BOOLEAN_STRINGS = ['true', 'false', ''];

const normalizeImportRow = (row = {}) => ({
  sku: String(row.sku || '').trim(),
  barcode: String(row.barcode || '').trim(),
  nombre: String(row.nombre || '').trim(),
  dci: String(row.dci || '').trim(),
  laboratorio: String(row.laboratorio || '').trim(),
  registro_sanitario: String(row.registro_isp || '').trim().toUpperCase(),
  concentracion: String(row.concentracion || '').trim(),
  forma_farmaceutica: String(row.forma_farmaceutica || '').trim(),
  sale_condition: String(row.sale_condition || '').trim().toUpperCase(),
  prescription_type: String(row.prescription_type || '').trim().toUpperCase(),
  is_controlled: String(row.is_controlled ?? '').trim(),
  bioequivalente: String(row.bioequivalente ?? '').trim(),
  stock_minimo: String(row.stock_minimo ?? '').trim(),
  precio_venta: String(row.precio_venta ?? '').trim(),
});

const validateImportRow = (row) => {
  const errors = [];

  BULK_REQUIRED_COLUMNS.forEach((column) => {
    if (!row[column]) errors.push(`Falta ${column}`);
  });

  if (row.sale_condition && !VALID_SALE_CONDITIONS.includes(row.sale_condition)) {
    errors.push('sale_condition inválido');
  }

  if (row.prescription_type && !VALID_PRESCRIPTION_TYPES.includes(row.prescription_type)) {
    errors.push('prescription_type inválido');
  }

  if (!VALID_BOOLEAN_STRINGS.includes(row.is_controlled.toLowerCase())) {
    errors.push('is_controlled inválido');
  }

  if (!VALID_BOOLEAN_STRINGS.includes(row.bioequivalente.toLowerCase())) {
    errors.push('bioequivalente inválido');
  }

  if (row.precio_venta && (Number.isNaN(Number(row.precio_venta)) || Number(row.precio_venta) < 0)) {
    errors.push('precio_venta inválido');
  }

  if (row.stock_minimo && (Number.isNaN(Number(row.stock_minimo)) || Number(row.stock_minimo) < 0)) {
    errors.push('stock_minimo inválido');
  }

  return errors;
};

const buildCompositeKey = (row = {}) => [row.nombre, row.dci, row.concentracion, row.forma_farmaceutica, row.laboratorio, row.barcode, row.sku]
  .map(value => String(value || '').trim().toUpperCase())
  .join('|');

let xlsxModulePromise = null;
let exceljsModulePromise = null;

const loadXLSX = async () => {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import(/* @vite-ignore */ 'https://esm.sh/xlsx@0.18.5');
  }
  return xlsxModulePromise;
};

const loadExcelJS = async () => {
  if (!exceljsModulePromise) {
    exceljsModulePromise = import(/* @vite-ignore */ 'https://esm.sh/exceljs@4.4.0').then((mod) => mod.default || mod);
  }
  return exceljsModulePromise;
};

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
  const [importRows, setImportRows] = useState([]);
  const [importSummary, setImportSummary] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const previewRows = useMemo(() => {
    const barcodeCount = new Map();
    const skuCount = new Map();
    const compositeCount = new Map();

    importRows.forEach((row) => {
      if (row.barcode) barcodeCount.set(row.barcode, (barcodeCount.get(row.barcode) || 0) + 1);
      if (row.sku) skuCount.set(row.sku.toUpperCase(), (skuCount.get(row.sku.toUpperCase()) || 0) + 1);
      const compositeKey = buildCompositeKey(row);
      compositeCount.set(compositeKey, (compositeCount.get(compositeKey) || 0) + 1);
    });

    return importRows.map((row, index) => {
      const errors = [...validateImportRow(row)];
      const compositeKey = buildCompositeKey(row);
      console.debug(`[Import] Fila ${index + 2} | duplicateKey: ${compositeKey}`);

      if (row.barcode && (barcodeCount.get(row.barcode) || 0) > 1) errors.push('barcode duplicado en Excel');
      if (row.sku && (skuCount.get(row.sku.toUpperCase()) || 0) > 1) errors.push('sku duplicado en Excel');
      if ((compositeCount.get(compositeKey) || 0) > 1) errors.push(`producto duplicado en Excel. Clave: [${compositeKey}]`);

      const existingProduct = products.find((product) => {
        const barcodeMatch = row.barcode && String(product.barcode || '').trim() === row.barcode;
        const skuMatch = row.sku && String(product.sku || '').trim().toUpperCase() === row.sku.toUpperCase();
        const compositeMatch = buildCompositeKey({
          nombre: product.name,
          dci: product.dci,
          concentracion: product.concentration,
          forma_farmaceutica: product.presentation,
          laboratorio: product.laboratory_name,
          barcode: product.barcode,
          sku: product.sku,
        }) === compositeKey;
        return barcodeMatch || skuMatch || compositeMatch;
      });

      console.debug(`[Import] Fila ${index + 2} | status: ${errors.length > 0 ? 'ERROR' : existingProduct ? 'ACTUALIZAR' : 'NUEVO'} | dupKey: ${compositeKey} | existingProduct: ${existingProduct ? existingProduct.name : 'none'}`);

      return {
        ...row,
        previewRow: index + 2,
        errors,
        existingProduct,
        status: errors.length > 0 ? 'ERROR' : existingProduct ? 'ACTUALIZAR' : 'NUEVO',
      };
    });
  }, [importRows, products]);

  const importErrors = useMemo(
    () => previewRows.filter((row) => row.status === 'ERROR').map((row) => ({ row: row.previewRow, errors: row.errors })),
    [previewRows]
  );

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

      let mappedPrescriptionType = 'VENTA_LIBRE';
      let isControlled = false;
      if (form.sale_condition === 'R') mappedPrescriptionType = 'RECETA_SIMPLE';
      if (form.sale_condition === 'RR') { mappedPrescriptionType = 'RECETA_RETENIDA'; isControlled = true; }
      if (form.sale_condition === 'RCH') { mappedPrescriptionType = 'RECETA_CHEQUE'; isControlled = true; }

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
        prescription_type: mappedPrescriptionType,
        is_controlled: isControlled,
        company_id: companyId
      };

      if (form.id) {
        const { data: savedProduct, error } = await schema
          .from('products')
          .update({ ...payload, updated_by: userId })
          .eq('company_id', companyId)
          .eq('id', form.id)
          .select('id')
          .single();
        if (error) throw error;
        await logAuditEvent('PRODUCT_UPDATED', 'Producto actualizado', {
          product_id: savedProduct?.id || form.id,
          amount: Number(payload.unit_price || 0),
        });
        alert('Medicamento actualizado');
      } else {
        const insertPayload = { ...payload, stock_quantity: 0, created_by: userId };
        const { data: savedProduct, error } = await schema.from('products').insert([insertPayload]).select('id').single();
        if (error) throw error;
        await logAuditEvent('PRODUCT_CREATED', 'Producto creado', {
          product_id: savedProduct?.id,
          amount: Number(payload.unit_price || 0),
        });
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

  const downloadTemplate = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'FarmaDATIX';
      const ws = workbook.addWorksheet('Catalogo');

      ws.columns = BULK_TEMPLATE_COLUMNS.map((col) => ({ header: col, key: col, width: Math.max(col.length + 4, 18) }));

      ws.addRow({
        sku: 'SKU-001',
        barcode: '780000000001',
        nombre: 'PARACETAMOL 500 MG',
        dci: 'PARACETAMOL',
        laboratorio: 'LABORATORIO DEMO',
        registro_isp: 'F-12345/24',
        concentracion: '500 MG',
        forma_farmaceutica: 'COMPRIMIDO',
        sale_condition: 'VD',
        prescription_type: 'VENTA_LIBRE',
        is_controlled: 'false',
        bioequivalente: 'true',
        stock_minimo: '10',
        precio_venta: '1990',
      });

      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C3073' } };

      const addDropdown = (colLetter, startRow, endRow, values) => {
        for (let r = startRow; r <= endRow; r++) {
          const cell = ws.getCell(`${colLetter}${r}`);
          cell.dataValidation = {
            type: 'list',
            formulae: [`"${values.join(',')}"`],
            allowBlank: true,
            showErrorMessage: true,
            errorTitle: 'Valor inválido',
            error: `Seleccione un valor de la lista: ${values.join(', ')}`,
          };
        }
      };

      addDropdown('I', 2, 1000, ['VD', 'R', 'RR', 'RCH']);
      addDropdown('J', 2, 1000, ['VENTA_LIBRE', 'RECETA_SIMPLE', 'RECETA_RETENIDA', 'RECETA_CHEQUE']);
      addDropdown('K', 2, 1000, ['true', 'false']);
      addDropdown('L', 2, 1000, ['true', 'false']);

      const vs = workbook.addWorksheet('Validaciones');
      vs.columns = [
        { header: 'Campo', key: 'campo', width: 28 },
        { header: 'Valores válidos', key: 'valores', width: 50 },
      ];
      vs.addRows([
        { campo: 'sale_condition', valores: 'VD | R | RR | RCH' },
        { campo: 'prescription_type', valores: 'VENTA_LIBRE | RECETA_SIMPLE | RECETA_RETENIDA | RECETA_CHEQUE' },
        { campo: 'is_controlled', valores: 'true | false' },
        { campo: 'bioequivalente', valores: 'true | false' },
        { campo: 'stock_minimo', valores: 'Número >= 0' },
        { campo: 'precio_venta', valores: 'Número >= 0' },
        { campo: 'Obligatorios', valores: 'nombre, dci, sale_condition' },
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_catalogo_farmaceutico.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('No se pudo generar la plantilla Excel.');
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await loadXLSX();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      setImportRows(rows.map(normalizeImportRow));
      setImportSummary(null);
    } catch (error) {
      console.error(error);
      alert('Error leyendo archivo Excel. Verifique formato .xlsx');
    } finally {
      event.target.value = '';
    }
  };

  const handleBulkImport = async () => {
    if (importRows.length === 0) {
      alert('No hay filas para importar.');
      return;
    }

    if (importErrors.length > 0) {
      alert('Corrija los errores críticos del archivo antes de importar.');
      return;
    }

    try {
      setImporting(true);
      const result = await importProductsBulk(importRows);
      setImportSummary(result);
      await fetchList();
      alert(`Importación finalizada. Insertados: ${result.inserted || 0}, actualizados: ${result.updated || 0}`);
      setImportRows([]);
      setImportSummary(null);
    } catch (error) {
      console.error(error);
      alert('Error en importación masiva: ' + (error.message || error));
    } finally {
      setImporting(false);
    }
  };

  if (view === 'form') {
    return (
      <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden animate-in fade-in duration-150">
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
            <button 
              onClick={downloadTemplate}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2"
            >
              <Download size={14} /> Descargar plantilla
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2"
            >
              <Upload size={14} /> Importar Excel
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
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
        {(importRows.length > 0 || importSummary) && (
          <div className="p-4 border-b border-gray-200 bg-white space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                  <FileSpreadsheet size={12} /> Importación masiva
                </div>
                <p className="text-sm font-black text-[#4C3073] uppercase">Preview de archivo</p>
                <p className="text-xs text-gray-500 mt-1">Filas detectadas: {importRows.length}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setImportRows([]); setImportSummary(null); }}
                  className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider"
                >
                  Limpiar
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={importing || importErrors.length > 0 || importRows.length === 0}
                  className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
                >
                  {importing ? <Save size={14} /> : <Upload size={14} />} Importar catálogo
                </button>
              </div>
            </div>

            {importSummary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Insertados</p>
                  <p className="text-2xl font-black text-emerald-800">{importSummary.inserted || 0}</p>
                </div>
                <div className="rounded-sm border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Actualizados</p>
                  <p className="text-2xl font-black text-blue-800">{importSummary.updated || 0}</p>
                </div>
                <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Errores backend</p>
                  <p className="text-2xl font-black text-red-800">{importSummary.errors?.length || 0}</p>
                </div>
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3">
                <div className="flex items-center gap-2 text-red-700 mb-2">
                  <AlertTriangle size={16} />
                  <p className="text-xs font-black uppercase tracking-widest">Errores por fila</p>
                </div>
                <div className="space-y-1 text-xs text-red-700 font-bold">
                  {importErrors.map((error) => (
                    <p key={error.row}>Fila {error.row}: {error.errors.join(', ')}</p>
                  ))}
                </div>
              </div>
            )}

            {importSummary?.errors?.length > 0 && (
              <div className="rounded-sm border border-red-200 bg-red-50 px-4 py-3">
                <div className="flex items-center gap-2 text-red-700 mb-2">
                  <AlertTriangle size={16} />
                  <p className="text-xs font-black uppercase tracking-widest">Errores backend</p>
                </div>
                <div className="space-y-1 text-xs text-red-700 font-bold">
                  {importSummary.errors.map((error, index) => (
                    <p key={`${error.row}-${index}`}>Fila {error.row}: {error.message}</p>
                  ))}
                </div>
              </div>
            )}

            {importRows.length > 0 && (
              <div className="overflow-auto border border-gray-200 rounded-sm">
                <table className="w-full text-left border-collapse bg-white">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Fila</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nombre</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">DCI</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Código</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Laboratorio</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Condición</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Precio</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Estado fila</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.slice(0, 50).map((row) => {
                      const hasError = row.status === 'ERROR';
                      return (
                        <tr key={`${row.nombre}-${row.previewRow}`} className={hasError ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2 text-xs font-mono text-gray-500">{row.previewRow}</td>
                          <td className="px-3 py-2 text-xs font-bold text-[#4C3073] uppercase">{row.nombre}</td>
                          <td className="px-3 py-2 text-xs font-semibold uppercase">{row.dci}</td>
                          <td className="px-3 py-2 text-xs font-mono text-gray-600">{row.barcode || row.sku || '-'}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 uppercase">{row.laboratorio || '-'}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 uppercase">{row.sale_condition || '-'}</td>
                          <td className="px-3 py-2 text-xs text-gray-900 font-bold">{row.precio_venta || '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-2 py-1 rounded-sm text-[10px] font-black uppercase ${row.status === 'NUEVO' ? 'bg-emerald-50 text-emerald-700' : row.status === 'ACTUALIZAR' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {hasError ? (
                              <div className="text-red-600 text-[10px] font-black uppercase space-y-1">
                                <div className="inline-flex items-center gap-1"><AlertTriangle size={12} /> Error</div>
                                {row.errors.map((error, idx) => <p key={idx} className="normal-case font-bold">{error}</p>)}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-600 text-[10px] font-black uppercase"><CheckCircle2 size={12} /> {row.existingProduct ? 'Actualizará' : 'Listo'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
