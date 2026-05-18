import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Package,
  Pill,
  ReceiptText,
  RefreshCcw,
  ShieldAlert,
  ShoppingCart,
  TrendingUp,
  ChevronRight,
  Activity,
  AlertCircle,
  Ban,
  Stethoscope,
  FlaskConical,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSucursal } from '../context/SucursalContext';
import {
  fetchManagementDashboardExpirations,
  fetchManagementDashboardKpis,
  fetchManagementDashboardOperationalAlerts,
  fetchManagementDashboardQuarantine,
  fetchManagementDashboardStockCritical,
} from '../api/pharmacyClient';

const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('es-CL');

const fmtMoney = (value) => money.format(Number(value || 0));
const fmtNumber = (value) => number.format(Number(value || 0));

const kpiCard = (key, label, value, Icon, tone = 'slate', detail = null, trend = null) => ({
  key, label, value, Icon, tone, detail, trend,
});

const ALERT_LABELS = {
  SIN_STOCK: 'Sin stock',
  STOCK_CRITICO: 'Stock crítico',
  VENCIDO: 'Lote vencido',
  VENCE_30: 'Vence en 30 días',
  CUARENTENA: 'En cuarentena',
};

const ALERT_HINTS = {
  SIN_STOCK: 'Revisar inventario y reabastecer.',
  STOCK_CRITICO: 'Priorizar reposición o traspaso.',
  VENCIDO: 'Retirar o bloquear el lote.',
  VENCE_30: 'Revisar FEFO y rotación.',
  CUARENTENA: 'Revisar causa y posible liberación.',
};

const ALERT_LOCATIONS = {
  QUARANTINE: 'Inventario general',
};

export default function DashboardGerencial() {
  const { activeWarehouse } = useSucursal();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [operationalAlerts, setOperationalAlerts] = useState([]);
  const [expirations, setExpirations] = useState([]);
  const [stockCritical, setStockCritical] = useState([]);
  const [quarantine, setQuarantine] = useState([]);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState(null);

  const loadKpis = useCallback(async () => {
    if (!activeWarehouse?.id) return;
    setLoadingKpis(true);
    setError(null);
    try {
      const { data, error: fetchError } = await fetchManagementDashboardKpis(activeWarehouse.id);
      if (fetchError) throw fetchError;
      setKpis(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudo cargar el dashboard.');
      setKpis(null);
    } finally {
      setLoadingKpis(false);
    }
  }, [activeWarehouse?.id]);

  const loadLists = useCallback(async () => {
    if (!activeWarehouse?.id) return;
    setLoadingLists(true);
    try {
      const [alerts, expirationsResult, criticalResult, quarantineResult] = await Promise.all([
        fetchManagementDashboardOperationalAlerts(activeWarehouse.id, 8),
        fetchManagementDashboardExpirations(activeWarehouse.id, 10),
        fetchManagementDashboardStockCritical(activeWarehouse.id, 10),
        fetchManagementDashboardQuarantine(activeWarehouse.id, 5),
      ]);

      const listError =
        alerts.error || expirationsResult.error || criticalResult.error || quarantineResult.error;
      if (listError) throw listError;

      setOperationalAlerts(alerts.data || []);
      setExpirations(expirationsResult.data || []);
      setStockCritical(criticalResult.data || []);
      setQuarantine(quarantineResult.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudieron cargar las listas del dashboard.');
      setOperationalAlerts([]);
      setExpirations([]);
      setStockCritical([]);
      setQuarantine([]);
    } finally {
      setLoadingLists(false);
    }
  }, [activeWarehouse?.id]);

  const refreshDashboard = useCallback(async () => {
    await loadKpis();
    await loadLists();
  }, [loadKpis, loadLists]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  const cards = [
    kpiCard('sales_today', 'Ventas del día', fmtMoney(kpis?.sales_today_amount), TrendingUp, 'emerald', `${fmtNumber(kpis?.sales_today_count)} ventas`, '+12%'),
    kpiCard('sales_month', 'Ventas del mes', fmtMoney(kpis?.sales_month_amount), CalendarDays, 'indigo', 'Acumulado mes en curso'),
    kpiCard('ticket', 'Ticket promedio', fmtMoney(kpis?.ticket_average_day), ShoppingCart, 'slate', 'Promedio diario'),
    kpiCard('controlled', 'Ventas controladas', fmtNumber(kpis?.controlled_sales_count), ShieldAlert, 'amber', 'Con productos controlados'),
    kpiCard('critical', 'Stock crítico', fmtNumber(kpis?.products_critical_count), AlertTriangle, 'orange', 'Stock total <= mínimo'),
    kpiCard('out', 'Sin stock', fmtNumber(kpis?.products_without_stock_count), Package, 'red', 'Stock total en cero'),
    kpiCard('expired', 'Lotes vencidos', fmtNumber(kpis?.expired_batches_count), Clock3, 'red', 'Lotes con vencimiento pasado'),
    kpiCard('expiring', 'Vencen en 30 días', fmtNumber(kpis?.expiring_batches_30d_count), ReceiptText, 'amber', 'Lotes próximos a vencer'),
    kpiCard('quarantine', 'En cuarentena', fmtNumber(kpis?.products_in_quarantine_count), Pill, 'slate', 'Con stock en cuarentena'),
    kpiCard('recipes_pending', 'Recetas pendientes', fmtNumber(kpis?.prescriptions_pending_count), RefreshCcw, 'indigo', 'Pendientes o parciales'),
    kpiCard('recipes_active', 'Recetas vigentes', fmtNumber(kpis?.prescriptions_active_count), ArrowUpRight, 'emerald', 'Pendientes válidas'),
  ];

  const quickAccess = [
    { label: 'POS', to: '/pos', detail: 'Venta y dispensación', icon: ShoppingCart, tone: 'emerald' },
    { label: 'Inventario', to: '/inventario', detail: 'Stock y alertas', icon: Package, tone: 'indigo' },
    { label: 'Reposición', to: '/reposicion-inteligente', detail: 'Sugerencias de compra', icon: ShoppingCart, tone: 'emerald' },
    { label: 'Recetas', to: '/recetas', detail: 'Pendientes y vigentes', icon: Stethoscope, tone: 'amber' },
    { label: 'Auditoría', to: '/auditoria', detail: 'Trazabilidad operativa', icon: Activity, tone: 'slate' },
    { label: 'Lotes', to: '/mapa-lotes', detail: 'FEFO y vencimientos', icon: FlaskConical, tone: 'orange' },
    { label: 'Caja', to: '/control-caja', detail: 'Estado de turno', icon: ReceiptText, tone: 'violet' },
  ];

  const toneConfig = {
    slate: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-700',
      iconBg: 'bg-slate-100',
      iconText: 'text-slate-600',
      lightText: 'text-slate-500',
      badgeBg: 'bg-slate-100',
      badgeBorder: 'border-slate-200',
    },
    emerald: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      iconBg: 'bg-emerald-100',
      iconText: 'text-emerald-600',
      lightText: 'text-emerald-600',
      badgeBg: 'bg-emerald-100',
      badgeBorder: 'border-emerald-200',
    },
    indigo: {
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      text: 'text-indigo-700',
      iconBg: 'bg-indigo-100',
      iconText: 'text-indigo-600',
      lightText: 'text-indigo-600',
      badgeBg: 'bg-indigo-100',
      badgeBorder: 'border-indigo-200',
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      iconBg: 'bg-amber-100',
      iconText: 'text-amber-600',
      lightText: 'text-amber-600',
      badgeBg: 'bg-amber-100',
      badgeBorder: 'border-amber-200',
    },
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-700',
      iconBg: 'bg-orange-100',
      iconText: 'text-orange-600',
      lightText: 'text-orange-600',
      badgeBg: 'bg-orange-100',
      badgeBorder: 'border-orange-200',
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      iconBg: 'bg-red-100',
      iconText: 'text-red-600',
      lightText: 'text-red-600',
      badgeBg: 'bg-red-100',
      badgeBorder: 'border-red-200',
    },
    violet: {
      bg: 'bg-violet-50',
      border: 'border-violet-200',
      text: 'text-violet-700',
      iconBg: 'bg-violet-100',
      iconText: 'text-violet-600',
      lightText: 'text-violet-600',
      badgeBg: 'bg-violet-100',
      badgeBorder: 'border-violet-200',
    },
  };

  const severityConfig = {
    CRITICAL: {
      badgeBg: 'bg-red-50',
      badgeBorder: 'border-red-200',
      badgeText: 'text-red-700',
      dot: 'bg-red-500',
      label: 'Crítico',
    },
    HIGH: {
      badgeBg: 'bg-orange-50',
      badgeBorder: 'border-orange-200',
      badgeText: 'text-orange-700',
      dot: 'bg-orange-500',
      label: 'Alto',
    },
    MEDIUM: {
      badgeBg: 'bg-amber-50',
      badgeBorder: 'border-amber-200',
      badgeText: 'text-amber-700',
      dot: 'bg-amber-500',
      label: 'Medio',
    },
    LOW: {
      badgeBg: 'bg-slate-50',
      badgeBorder: 'border-slate-200',
      badgeText: 'text-slate-700',
      dot: 'bg-slate-400',
      label: 'Bajo',
    },
  };

  const getSeverity = (severity) => severityConfig[severity] || severityConfig.LOW;

  const getAlertMeta = (item) => {
    const alertType = item?.alert_type || 'ALERTA';
    return {
      label: item?.alert_label || ALERT_LABELS[alertType] || alertType,
      description: item?.alert_description || 'Revisar condición operativa del producto.',
      hint: item?.action_hint || ALERT_HINTS[alertType] || 'Revisar producto.',
      location: item?.location_label || item?.location_name || ALERT_LOCATIONS[item?.location_type] || 'Ubicación no asignada',
    };
  };

  const openProduct = (productId) => {
    if (productId) navigate(`/kardex/${productId}`);
  };

  const openLot = (productId) => {
    if (productId) navigate(`/mapa-lotes/${productId}`);
  };

  const openInventory = () => navigate('/inventario');

  return (
    <div className="min-h-full bg-[#f3f4f6] text-slate-800 antialiased">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#4C3073]">
                Dashboard gerencial
              </p>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Estado operativo
            </h1>
            <p className="text-sm text-slate-500">
              {activeWarehouse?.name || 'Seleccione una sucursal'} · métricas en tiempo real
            </p>
          </div>

          <button
            type="button"
            onClick={refreshDashboard}
            disabled={loadingKpis || loadingLists}
            className="group inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw
              size={14}
              className={`transition-transform ${loadingKpis || loadingLists ? 'animate-spin' : 'group-hover:rotate-180'}`}
            />
            Actualizar
          </button>
        </div>

        {!activeWarehouse?.id ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-sm text-slate-500 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            Selecciona una sucursal para ver el dashboard.
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-red-900">Error al cargar datos</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {cards.map(({ key, label, value, Icon: CardIcon, tone, detail, trend }) => {
                const t = toneConfig[tone] || toneConfig.slate;
                return (
                  <div
                    key={key}
                    className={`group relative overflow-hidden rounded-2xl border ${t.border} bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200 cursor-default`}
                  >
                    <div className="absolute top-0 right-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full opacity-[0.03] bg-current" />

                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            {label}
                          </p>
                          {trend && (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                              {trend}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                          {loadingKpis ? (
                            <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-100" />
                          ) : (
                            value
                          )}
                        </p>
                        <p className={`mt-1.5 text-xs font-medium ${t.lightText}`}>
                          {detail}
                        </p>
                      </div>
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText} transition-transform duration-200 group-hover:scale-110`}
                      >
                        {React.createElement(CardIcon, { size: 20, strokeWidth: 2 })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Left Column - Critical Stock */}
              <div className="xl:col-span-4 space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                          Stock crítico
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Productos por debajo del mínimo o agotados
                        </p>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <AlertTriangle size={16} />
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="space-y-3 max-h-[32rem] overflow-auto pr-1 custom-scrollbar">
                      {loadingLists ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                        ))
                      ) : stockCritical.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
                          <Package className="mb-2 h-6 w-6 text-slate-300" />
                          Sin productos críticos
                        </div>
                      ) : (
                        stockCritical.slice(0, 6).map((item, idx) => {
                          const meta = getAlertMeta(item);
                          const sev = getSeverity(item.severity);
                          return (
                            <div
                              key={`critical-${idx}`}
                              className="group relative rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${sev.dot} shrink-0`} />
                                    <p className="font-semibold text-slate-900 truncate text-sm" title={item.product_name}>
                                      {item.product_name}
                                    </p>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">{meta.label}</p>
                                  <p className="text-[11px] text-slate-400 mt-1">{meta.location}</p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-lg border ${sev.badgeBorder} ${sev.badgeBg} ${sev.badgeText} px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider`}
                                >
                                  {item.current_quantity}
                                </span>
                              </div>
                              <p className="mt-3 text-xs text-slate-500">{meta.description}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                                <button type="button" onClick={() => openProduct(item.product_id)} className="rounded-full border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50">Ver producto</button>
                                <button type="button" onClick={openInventory} className="rounded-full border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50">Ir a inventario</button>
                                <button type="button" onClick={() => openLot(item.product_id)} className="rounded-full border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50">Revisar lote</button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    {stockCritical.length > 6 && (
                      <button className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        Ver todos ({stockCritical.length})
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Middle Column - Operational Alerts */}
              <div className="xl:col-span-4 space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                          Alertas operativas
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Concentrado de eventos que requieren atención
                        </p>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
                        <Activity size={16} />
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="space-y-3 max-h-[32rem] overflow-auto pr-1 custom-scrollbar">
                      {loadingLists ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                        ))
                      ) : operationalAlerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
                          <Activity className="mb-2 h-6 w-6 text-slate-300" />
                          Sin alertas operativas
                        </div>
                      ) : (
                        operationalAlerts.slice(0, 6).map((item, idx) => {
                          const meta = getAlertMeta(item);
                          const sev = getSeverity(item.severity);
                          return (
                            <div
                              key={`alert-${idx}`}
                              className="group relative rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${sev.dot} shrink-0`} />
                                    <p className="font-semibold text-slate-900 truncate text-sm" title={item.product_name}>
                                      {item.product_name}
                                    </p>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">{meta.label}</p>
                                  <p className="text-[11px] text-slate-400 mt-1">{meta.location}</p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-lg border ${sev.badgeBorder} ${sev.badgeBg} ${sev.badgeText} px-2 py-1 text-[10px] font-bold uppercase tracking-wider`}
                                >
                                  {sev.label}
                                </span>
                              </div>
                              <p className="mt-3 text-xs text-slate-500">{meta.description}</p>
                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                {item.current_quantity !== undefined && (
                                  <span>
                                    Stock:{' '}
                                    <strong className="text-slate-700 tabular-nums">
                                      {item.current_quantity}
                                    </strong>
                                  </span>
                                )}
                                {item.days_to_expire !== undefined && item.days_to_expire !== null && (
                                  <span>
                                    Vence en:{' '}
                                    <strong className={`tabular-nums ${item.days_to_expire <= 7 ? 'text-red-600' : 'text-slate-700'}`}>
                                      {item.days_to_expire} días
                                    </strong>
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 text-[11px] text-slate-400">{meta.hint}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                                <button type="button" onClick={() => openProduct(item.product_id)} className="rounded-full border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50">Ver producto</button>
                                <button type="button" onClick={openInventory} className="rounded-full border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50">Ir a inventario</button>
                                <button type="button" onClick={() => openLot(item.product_id)} className="rounded-full border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50">Revisar lote</button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    {operationalAlerts.length > 6 && (
                      <button className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        Ver todas ({operationalAlerts.length})
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Expirations, Quick Access, Quarantine */}
              <div className="xl:col-span-4 space-y-6">
                {/* Expirations */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                          Vencimientos
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">Lotes vencidos y próximos a vencer</p>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <Clock3 size={16} />
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="space-y-3 max-h-[16rem] overflow-auto pr-1 custom-scrollbar">
                      {loadingLists ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                        ))
                      ) : expirations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                          <Clock3 className="mb-2 h-5 w-5 text-slate-300" />
                          Sin vencimientos próximos
                        </div>
                      ) : (
                        expirations.slice(0, 5).map((item, idx) => {
                          const meta = getAlertMeta(item);
                          return (
                          <div
                            key={`exp-${idx}`}
                            className="group flex items-center justify-between rounded-xl border border-slate-200 p-3.5 hover:border-slate-300 transition-all"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 truncate text-sm" title={item.product_name}>
                                {item.product_name}
                              </p>
                              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                  {item.batch_number || 'S/L'}
                                </span>
                                <span>·</span>
                                <span>{meta.location}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-400">{meta.description}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span
                                className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.days_to_expire <= 0
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : item.days_to_expire <= 7
                                      ? 'border-orange-200 bg-orange-50 text-orange-700'
                                      : 'border-amber-200 bg-amber-50 text-amber-700'
                                  }`}
                              >
                                {item.days_to_expire <= 0 ? 'Vencido' : `${item.days_to_expire} días`}
                              </span>
                              <div className="mt-2 flex flex-wrap justify-end gap-2 text-[11px]">
                                <button type="button" onClick={() => openProduct(item.product_id)} className="rounded-full border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">Ver producto</button>
                                <button type="button" onClick={() => openLot(item.product_id)} className="rounded-full border border-slate-200 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">Revisar lote</button>
                              </div>
                            </div>
                          </div>
                        )})
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Access */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                      Accesos rápidos
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Navegación directa a módulos clave</p>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-3">
                      {quickAccess.map((item) => {
                        const t = toneConfig[item.tone] || toneConfig.slate;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.to}
                            type="button"
                            onClick={() => navigate(item.to)}
                            className={`group relative overflow-hidden rounded-xl border ${t.border} ${t.bg} p-4 text-left transition-all hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]`}
                          >
                            <div className="flex items-start justify-between">
                              <div
                                className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.iconBg} ${t.iconText} transition-transform duration-200 group-hover:scale-110`}
                              >
                                <Icon size={18} strokeWidth={2} />
                              </div>
                              <ChevronRight
                                size={14}
                                className="text-slate-400 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0"
                              />
                            </div>
                            <p className="mt-3 text-sm font-bold text-slate-800">{item.label}</p>
                            <p className={`mt-0.5 text-[11px] font-medium ${t.lightText}`}>
                              {item.detail}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Quarantine */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                          Cuarentena
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">Productos retenidos fuera de venta</p>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Ban size={16} />
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="space-y-3 max-h-[12rem] overflow-auto pr-1 custom-scrollbar">
                      {loadingLists ? (
                        <div className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                      ) : quarantine.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                          <Ban className="mb-2 h-5 w-5 text-slate-300" />
                          Sin productos en cuarentena
                        </div>
                      ) : (
                        quarantine.slice(0, 4).map((item, idx) => {
                          const meta = getAlertMeta(item);
                          return (
                          <div
                            key={`q-${idx}`}
                            className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 hover:border-slate-300 transition-all"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 truncate text-sm" title={item.product_name}>
                                {item.product_name}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">{meta.label}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{meta.location}</p>
                              <p className="text-[11px] text-slate-400 mt-1">{meta.hint}</p>
                            </div>
                            <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                              {item.current_quantity} un
                            </span>
                          </div>
                        )})
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Resumen técnico
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Última actualización:{' '}
                      {kpis?.generated_at
                        ? new Date(kpis.generated_at).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">
                  Datos sincronizados desde Supabase · Farmacia SaaS v2.0
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
