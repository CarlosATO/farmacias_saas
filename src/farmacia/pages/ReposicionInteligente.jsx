import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Package, RefreshCcw, ShieldAlert, ShoppingCart, TrendingUp } from 'lucide-react';
import { useSucursal } from '../context/SucursalContext';
import { createRepositionPurchaseDraft, fetchPurchaseRecommendations } from '../api/pharmacyClient';

const riskConfig = {
  CRITICO: {
    label: 'Crítico',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  BAJO: {
    label: 'Bajo',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  NORMAL: {
    label: 'Normal',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  SOBRE_STOCK: {
    label: 'Sobre stock',
    className: 'bg-slate-50 text-slate-700 border-slate-200',
  },
};

const riskOptions = [
  { value: 'ALL', label: 'Todos' },
  { value: 'CRITICO', label: 'Crítico' },
  { value: 'BAJO', label: 'Bajo' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'SOBRE_STOCK', label: 'Sobre stock' },
];

const fmtQty = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const fmtDays = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

const formatQty = (value) => fmtQty.format(Number(value || 0));
const formatDays = (value) => (value === null || value === undefined ? '—' : `${fmtDays.format(Number(value || 0))} días`);

export default function ReposicionInteligente() {
  const { activeWarehouse } = useSucursal();
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [selection, setSelection] = useState({});
  const [savingDraft, setSavingDraft] = useState(false);
  const [createdDraft, setCreatedDraft] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!activeWarehouse?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await fetchPurchaseRecommendations(activeWarehouse.id);
        if (fetchError) throw fetchError;
        setRecommendations(data || []);
      } catch (err) {
        console.error(err);
        setError(err.message || 'No se pudieron cargar las recomendaciones.');
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [activeWarehouse?.id]);

  useEffect(() => {
    setSelection((prev) => {
      const next = {};
      recommendations.forEach((row) => {
        next[row.product_id] = prev[row.product_id] || {
          selected: false,
          quantity: Number(row.suggested_purchase_qty || 0),
        };
      });
      return next;
    });
  }, [recommendations]);

  const refresh = async () => {
    if (!activeWarehouse?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await fetchPurchaseRecommendations(activeWarehouse.id);
      if (fetchError) throw fetchError;
      setRecommendations(data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudieron cargar las recomendaciones.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(
    () => recommendations.filter((row) => riskFilter === 'ALL' || row.risk_state === riskFilter),
    [recommendations, riskFilter]
  );

  const selectedCount = useMemo(
    () => Object.values(selection).filter((item) => item.selected && Number(item.quantity || 0) > 0).length,
    [selection]
  );

  const selectedRows = useMemo(
    () => recommendations.filter((row) => selection[row.product_id]?.selected && Number(selection[row.product_id]?.quantity || 0) > 0),
    [recommendations, selection]
  );

  const summary = useMemo(() => {
    const countByRisk = (risk) => recommendations.filter((row) => row.risk_state === risk).length;
    const suggestedTotal = recommendations.reduce((acc, row) => acc + Number(row.suggested_purchase_qty || 0), 0);
    return {
      total: recommendations.length,
      critical: countByRisk('CRITICO'),
      low: countByRisk('BAJO'),
      normal: countByRisk('NORMAL'),
      over: countByRisk('SOBRE_STOCK'),
      suggestedTotal,
    };
  }, [recommendations]);

  const openProduct = (productId) => {
    if (productId) navigate(`/kardex/${productId}`);
  };

  const openLots = (productId) => {
    if (productId) navigate(`/mapa-lotes/${productId}`);
  };

  const toggleSelection = (productId, row, checked) => {
    setSelection((prev) => ({
      ...prev,
      [productId]: {
        selected: checked,
        quantity: Number(prev[productId]?.quantity ?? row.suggested_purchase_qty ?? 0),
      },
    }));
  };

  const updateSelectionQuantity = (productId, value) => {
    const quantity = Math.max(0, Number(value || 0));
    setSelection((prev) => ({
      ...prev,
      [productId]: {
        selected: true,
        quantity,
      },
    }));
  };

  const generateDraft = async () => {
    if (!selectedRows.length) {
      alert('Seleccione al menos un producto para generar la pre-orden.');
      return;
    }

    setSavingDraft(true);
    try {
      const payload = selectedRows.map((row) => ({
        product_id: row.product_id,
        quantity: Number(selection[row.product_id]?.quantity || row.suggested_purchase_qty || 0),
        unit_cost: Number(row.last_purchase_unit_cost || 0),
        conversion_factor: Number(row.conversion_factor || 1),
      }));

      const { data, error: draftError } = await createRepositionPurchaseDraft(activeWarehouse.id, payload);
      if (draftError) throw draftError;

      setCreatedDraft(data || null);
      alert(`Pre-orden generada (${data?.po_number ? `OC-${String(data.po_number).padStart(5, '0')}` : 'borrador'}).`);
      navigate('/logistica', { state: { draftPurchaseOrderId: data?.po_id || null } });
    } catch (err) {
      console.error(err);
      alert(err.message || 'No se pudo generar la pre-orden.');
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f3f4f6] text-slate-800">
      <div className="mx-auto max-w-[1440px] px-4 py-8 space-y-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#4C3073]">
              <ShoppingCart size={14} />
              Reposición Inteligente v1
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Sugerencias de compra</h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeWarehouse?.name || 'Seleccione una sucursal'} · cobertura, riesgo y prioridad por rotación real.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={refresh}
              disabled={loading || !activeWarehouse?.id}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={generateDraft}
              disabled={loading || savingDraft || !activeWarehouse?.id || selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-[#4C3073] bg-[#4C3073] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-[#402862] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart size={14} className={savingDraft ? 'animate-pulse' : ''} />
              Generar pre-orden {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>
        </div>

        {createdDraft?.po_id && (
          <div className="rounded-2xl border border-[#4C3073]/20 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#4C3073]">Pre-orden generada</p>
                <p className="mt-1 text-sm text-slate-600">
                  {createdDraft.po_number ? `OC-${String(createdDraft.po_number).padStart(5, '0')}` : 'Borrador'} · {createdDraft.items_count || 0} líneas · origen {createdDraft.origin_source?.replaceAll('_', ' ') || 'REPOSICION INTELIGENTE'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/logistica', { state: { draftPurchaseOrderId: createdDraft.po_id } })}
                className="inline-flex items-center justify-center rounded-xl border border-[#4C3073] bg-[#4C3073] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#402862]"
              >
                Ver pre-orden
              </button>
            </div>
          </div>
        )}

        {!activeWarehouse?.id ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            <Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            Selecciona una sucursal para ver la reposición inteligente.
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <h2 className="text-sm font-semibold text-red-900">Error al cargar datos</h2>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <SummaryCard label="Productos" value={summary.total} icon={Package} tone="slate" />
              <SummaryCard label="Críticos" value={summary.critical} icon={ShieldAlert} tone="red" />
              <SummaryCard label="Bajos" value={summary.low} icon={AlertTriangle} tone="amber" />
              <SummaryCard label="Normales" value={summary.normal} icon={CheckCircle2} tone="emerald" />
              <SummaryCard label="Sobre stock" value={summary.over} icon={ArrowLeftRight} tone="slate" />
              <SummaryCard label="Sugerido total" value={formatQty(summary.suggestedTotal)} icon={TrendingUp} tone="indigo" suffix="un" />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Tabla ejecutiva</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Fórmula: cobertura = stock SALES / promedio diario. Sugerencia = objetivo 30 días - stock actual.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {riskOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRiskFilter(option.value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${riskFilter === option.value ? 'border-[#4C3073] bg-[#4C3073] text-white' : 'border-gray-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold">Producto</th>
                      <th className="px-5 py-3 text-left font-semibold">Riesgo</th>
                      <th className="px-5 py-3 text-right font-semibold">Stock SALES</th>
                      <th className="px-5 py-3 text-right font-semibold">Ventas 30d</th>
                      <th className="px-5 py-3 text-right font-semibold">Prom. diario</th>
                      <th className="px-5 py-3 text-right font-semibold">Cobertura</th>
                      <th className="px-5 py-3 text-right font-semibold">Sugerencia</th>
                      <th className="px-5 py-3 text-right font-semibold">Editar</th>
                      <th className="px-5 py-3 text-left font-semibold">Estado</th>
                      <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {loading ? (
                      Array.from({ length: 6 }).map((_, index) => (
                        <tr key={index}>
                          <td colSpan="10" className="px-5 py-4">
                            <div className="h-6 animate-pulse rounded bg-slate-100" />
                          </td>
                        </tr>
                      ))
                    ) : filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan="10" className="px-5 py-12 text-center text-sm text-slate-400">
                          Sin recomendaciones para este filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => {
                        const risk = riskConfig[row.risk_state] || riskConfig.NORMAL;
                        const selected = Boolean(selection[row.product_id]?.selected);
                        const draftQty = selection[row.product_id]?.quantity ?? row.suggested_purchase_qty ?? 0;
                        return (
                          <tr key={row.product_id} className="hover:bg-slate-50/70">
                            <td className="px-5 py-4 align-top">
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(e) => toggleSelection(row.product_id, row, e.target.checked)}
                                  className="mt-1 h-4 w-4 rounded border-gray-300 text-[#4C3073] focus:ring-[#4C3073]"
                                />
                                <div>
                                  <div className="font-semibold text-slate-900">{row.product_name}</div>
                                  <div className="mt-1 text-xs text-slate-500">{row.dci || 'Sin DCI'} · Min {formatQty(row.min_stock)}</div>
                                  <div className="mt-1 text-[11px] text-slate-400">
                                    Compra: {row.purchase_uom || 'CAJA'} · Equiv.: 1 {row.purchase_uom || 'CAJA'} = {formatQty(row.conversion_factor || 1)} {row.sale_uom || 'UNIDAD'}
                                  </div>
                                  <div className="mt-1 text-[11px] text-emerald-700">
                                    Último costo compra: {Number(row.last_purchase_unit_cost || 0) > 0 ? `$${Number(row.last_purchase_unit_cost).toLocaleString('es-CL')}` : 'Sin último costo confiable'}
                                  </div>
                                </div>
                              </div>
                              {row.is_controlled && (
                                <span className="mt-2 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                                  Controlado
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 align-top">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${risk.className}`}>
                                {risk.label}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right align-top tabular-nums">{formatQty(row.stock_actual_sales)}</td>
                            <td className="px-5 py-4 text-right align-top tabular-nums">{formatQty(row.sales_30d)}</td>
                            <td className="px-5 py-4 text-right align-top tabular-nums">{formatQty(row.average_daily_sales)}</td>
                            <td className="px-5 py-4 text-right align-top tabular-nums">{formatDays(row.coverage_days)}</td>
                            <td className="px-5 py-4 text-right align-top font-semibold tabular-nums text-slate-900">
                              {formatQty(row.suggested_purchase_qty)} <span className="text-xs font-medium text-slate-500">{row.purchase_uom || 'CAJA'}</span>
                            </td>
                            <td className="px-5 py-4 align-top text-right">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={draftQty}
                                onChange={(e) => updateSelectionQuantity(row.product_id, e.target.value)}
                                disabled={!selected}
                                className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 text-right text-sm font-semibold text-slate-900 outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] disabled:bg-slate-50 disabled:text-slate-400"
                              />
                              <div className="mt-1 text-[10px] text-slate-400">{row.purchase_uom || 'CAJA'}</div>
                            </td>
                            <td className="px-5 py-4 align-top text-xs text-slate-500">{row.is_controlled ? 'Prioridad controlada' : 'Reposición estándar'}</td>
                            <td className="px-5 py-4 align-top">
                              <div className="flex justify-end gap-2 text-[11px]">
                                <button type="button" onClick={() => openProduct(row.product_id)} className="rounded-full border border-gray-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50">Kardex</button>
                                <button type="button" onClick={() => openLots(row.product_id)} className="rounded-full border border-gray-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50">Lotes</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: CardIcon, tone, suffix = '' }) {
  const toneMap = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {value}{suffix ? <span className="ml-1 text-sm font-semibold text-slate-500">{suffix}</span> : null}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${toneMap[tone] || toneMap.slate}`}>
          {React.createElement(CardIcon, { size: 18 })}
        </div>
      </div>
    </div>
  );
}
