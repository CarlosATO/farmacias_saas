import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, Search, ShieldAlert, ChevronRight, MapPin, Building2, BookOpen, Filter, Layers, CalendarClock, TriangleAlert, ArchiveX, ShieldCheck, ArrowRightLeft, ShoppingCart, Eye, MoreHorizontal } from 'lucide-react';
import { fetchInventoryAlerts, fetchPharmacyProducts, getPharmacySchema, getMyCompanyId } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';

const EXPIRY_WINDOWS = [30, 60, 90];

const getDaysUntilExpiry = (expiryDate) => {
  if (!expiryDate) return null;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const expiry = new Date(`${expiryDate}T00:00:00`);
  return Math.ceil((expiry - startOfToday) / 86400000);
};

const formatQuantity = (value) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number(value || 0));
const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const getSeverityClass = (severity) => {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-white text-gray-600 border-gray-200';
  }
};

const getPrimaryAction = (alert) => {
  if (EXPIRY_ALERT_TYPES.has(alert.alert_type)) {
    return { label: 'Gestionar lote', icon: Layers, action: 'manage-lot' };
  }

  if (LOW_STOCK_ALERT_TYPES.has(alert.alert_type)) {
    return { label: 'Crear OC', icon: ShoppingCart, action: 'quick-po' };
  }

  if (alert.alert_type === 'CUARENTENA') {
    return { label: 'Mover stock', icon: ArrowRightLeft, action: 'move-stock' };
  }

  return { label: 'Ver producto', icon: Eye, action: 'view-product' };
};

const EXPIRY_ALERT_TYPES = new Set(['VENCIDO', 'VENCE_30', 'VENCE_60']);
const LOW_STOCK_ALERT_TYPES = new Set(['SIN_STOCK', 'STOCK_CRITICO', 'CONTROLADO_BAJO_STOCK']);

export default function InventarioMedico() {
  const { activeWarehouse } = useSucursal();
  const navigate = useNavigate();

  const [products, setProducts]       = useState([]);
  const [stockMap, setStockMap]       = useState({});
  const [locations, setLocations]     = useState([]);   // bodegas del local activo
  const [expiringLots, setExpiringLots] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [searchTerm, setSearchTerm]   = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState(''); // '' = todo el local
  const [expiryWindow, setExpiryWindow] = useState(30);
  const [alertTypeFilter, setAlertTypeFilter] = useState('ALL');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState('ALL');
  const [openAlertMenu, setOpenAlertMenu] = useState(null);

  // ── Carga bodegas cuando cambia el local activo ─────────────────────────
  useEffect(() => {
    const loadLocations = async () => {
      if (!activeWarehouse?.id) return;
      const companyId = await getMyCompanyId();
      const schema = getPharmacySchema();
      // Solo bodegas de nivel superior del local activo (las zonas principales)
      const { data } = await schema
        .from('locations')
        .select('id, name, location_type')
        .eq('company_id', companyId)
        .eq('warehouse_id', activeWarehouse.id)
        .is('parent_location_id', null)   // solo zonas raíz
        .order('name');
      setLocations(data || []);
      setSelectedLocationId('');
    };
    loadLocations();
  }, [activeWarehouse?.id]);

  // ── Carga inventario (global del local o filtrado por zona) ─────────────
  const loadInventory = useCallback(async () => {
    if (!activeWarehouse?.id) return;
    setLoading(true);
    try {
      const schema = getPharmacySchema();
      const companyId = await getMyCompanyId();

      // Productos maestros + lotes del local
      let batchQuery = schema
        .from('inventory_batches')
        .select(`
          id,
          product_id,
          batch_number,
          expiry_date,
          current_quantity,
          product:product_id(id, name, dci, active_principle, sale_condition, is_bioequivalent),
          location:location_id!inner(id, name, warehouse_id, location_type)
        `)
        .eq('company_id', companyId)
        .eq('location.warehouse_id', activeWarehouse.id);

      // Si hay zona seleccionada, afinar más
      if (selectedLocationId) {
        // Incluir la zona raíz y todas sus sub-ubicaciones
        const { data: subLocs } = await schema
          .from('locations')
          .select('id')
          .eq('parent_location_id', selectedLocationId);
        const ids = [selectedLocationId, ...(subLocs || []).map(l => l.id)];
        batchQuery = batchQuery.in('location_id', ids);
      }

      const [prodRes, batchRes, alertRes] = await Promise.all([
        fetchPharmacyProducts(),
        batchQuery,
        fetchInventoryAlerts(activeWarehouse.id)
      ]);

      if (prodRes.error) throw prodRes.error;
      if (batchRes.error) throw batchRes.error;
      if (alertRes.error) throw alertRes.error;

      // Construir mapa de stock por tipo de ubicación
      const newStockMap = {};
      (batchRes.data || []).forEach(batch => {
        const pId = batch.product_id;
        const qty = Number(batch.current_quantity || 0);
        const locationType = batch.location?.location_type || 'STORAGE';
        if (!newStockMap[pId]) {
          newStockMap[pId] = { sales: 0, storage: 0, quarantine: 0, total: 0 };
        }

        if (locationType === 'SALES') newStockMap[pId].sales += qty;
        else if (locationType === 'QUARANTINE') newStockMap[pId].quarantine += qty;
        else newStockMap[pId].storage += qty;

        newStockMap[pId].total += qty;
      });

      const newExpiringLots = (batchRes.data || [])
        .filter(batch => batch.expiry_date)
        .map(batch => ({
          id: batch.id,
          product_id: batch.product_id,
          product_name: batch.product?.name || 'Producto',
          product_dci: batch.product?.dci || batch.product?.active_principle || '-',
          batch_number: batch.batch_number,
          expiry_date: batch.expiry_date,
          location_name: batch.location?.name || 'Sin ubicación',
          location_type: batch.location?.location_type || '-',
          quantity: Number(batch.current_quantity || 0),
          days_remaining: getDaysUntilExpiry(batch.expiry_date),
        }))
        .filter(batch => batch.days_remaining !== null && batch.days_remaining >= 0)
        .sort((a, b) => {
          if (a.days_remaining !== b.days_remaining) return a.days_remaining - b.days_remaining;
          return a.product_name.localeCompare(b.product_name);
        });

      setProducts(prodRes.data || []);
      setStockMap(newStockMap);
      setExpiringLots(newExpiringLots);
      setAlerts(alertRes.data || []);
    } catch (err) {
      console.error('Error loading inventory:', err);
    } finally {
      setLoading(false);
    }
  }, [activeWarehouse?.id, selectedLocationId]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  useEffect(() => {
    const closeMenu = () => setOpenAlertMenu(null);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const term = searchTerm.toLowerCase();
      const inStock = (stockMap[p.id]?.total || 0) > 0 || !selectedLocationId;
      const nameMatch = p.name?.toLowerCase().includes(term);
      const dciMatch = (p.dci || p.active_principle)?.toLowerCase().includes(term);
      return (nameMatch || dciMatch) && inStock;
    });
  }, [products, searchTerm, stockMap, selectedLocationId]);

  const filteredExpiringLots = useMemo(() => {
    return expiringLots
      .filter(lot => lot.days_remaining <= expiryWindow)
      .filter(lot => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        return lot.product_name.toLowerCase().includes(term)
          || lot.product_dci.toLowerCase().includes(term)
          || lot.batch_number?.toLowerCase().includes(term)
          || lot.location_name.toLowerCase().includes(term);
      });
  }, [expiringLots, expiryWindow, searchTerm]);

  const alertSummary = useMemo(() => {
    const uniqueCountByType = (type) => new Set(alerts.filter(alert => alert.alert_type === type).map(alert => `${alert.warehouse_id}:${alert.product_id}:${alert.batch_number || 'NA'}:${alert.location_name || 'NA'}`)).size;
    return {
      sinStock: uniqueCountByType('SIN_STOCK'),
      stockCritico: uniqueCountByType('STOCK_CRITICO'),
      vencen30: uniqueCountByType('VENCE_30'),
      vencidos: uniqueCountByType('VENCIDO'),
      cuarentena: uniqueCountByType('CUARENTENA'),
      controladosCriticos: uniqueCountByType('CONTROLADO_BAJO_STOCK'),
    };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return [...alerts]
      .filter(alert => alertTypeFilter === 'ALL' || alert.alert_type === alertTypeFilter)
      .filter(alert => alertSeverityFilter === 'ALL' || alert.severity === alertSeverityFilter)
      .filter(alert => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        return (alert.product_name || '').toLowerCase().includes(term)
          || (alert.batch_number || '').toLowerCase().includes(term)
          || (alert.location_name || '').toLowerCase().includes(term)
          || (alert.location_type || '').toLowerCase().includes(term)
          || (alert.alert_type || '').toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
        if (severityDiff !== 0) return severityDiff;
        if (a.expiry_date && b.expiry_date) return new Date(a.expiry_date) - new Date(b.expiry_date);
        if (a.expiry_date) return -1;
        if (b.expiry_date) return 1;
        return (a.product_name || '').localeCompare(b.product_name || '');
      });
  }, [alerts, alertSeverityFilter, alertTypeFilter, searchTerm]);

  const getSaleConditionBadge = (condition) => {
    switch (condition) {
      case 'VD': return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-green-100 text-green-700 border border-green-200 uppercase">Venta Directa</span>;
      case 'R':  return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-yellow-100 text-yellow-700 border border-yellow-200 uppercase">Receta</span>;
      case 'RR': return <span className="px-2 py-0.5 rounded text-[9px] font-black bg-red-100 text-red-700 border border-red-200 uppercase">Receta Retenida</span>;
      default:   return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600 border border-gray-200 uppercase">{condition || 'N/A'}</span>;
    }
  };

  const selectedLocName = locations.find(l => l.id === selectedLocationId)?.name;

  const scrollToSection = (id) => {
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleViewProduct = (alert) => {
    setSearchTerm(alert.product_name || '');
    scrollToSection('inventory-stock-table');
  };

  const handleViewLots = (alert) => {
    navigate(`/mapa-lotes/${alert.product_id}`, {
      state: {
        batchNumber: alert.batch_number || null,
        fromAlert: true,
        warehouseId: activeWarehouse?.id || null,
      }
    });
  };

  const handleViewKardex = (alert) => {
    navigate(`/kardex/${alert.product_id}`, {
      state: {
        fromAlert: true,
        warehouseId: activeWarehouse?.id || null,
      }
    });
  };

  const handleTransferStock = (alert, mode = 'TRANSFER') => {
    navigate('/traspasos', {
      state: {
        quickTransfer: {
          mode,
          product_id: alert.product_id,
          product_name: alert.product_name,
          batch_number: alert.batch_number || null,
          warehouse_id: activeWarehouse?.id || null,
          notes: mode === 'MOVE_TO_QUARANTINE'
            ? `Acción rápida desde alertas: mover ${alert.product_name}${alert.batch_number ? ` | lote ${alert.batch_number}` : ''} a cuarentena.`
            : `Acción rápida desde alertas: revisar transferencia para ${alert.product_name}${alert.batch_number ? ` | lote ${alert.batch_number}` : ''}.`,
        }
      }
    });
  };

  const handleQuickPO = (alert) => {
    setOpenAlertMenu(null);
    navigate('/logistica', {
      state: {
        quickPO: {
          product_id: alert.product_id,
          product_name: alert.product_name,
          quantity: 1,
          unit_cost: 0,
          conversion_factor: 1,
          observation_notes: `OC rápida generada desde alertas para ${alert.product_name}. Tipo de alerta: ${alert.alert_type}.`,
        }
      }
    });
  };

  const openMoreActionsMenu = (event, alert, index) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedMenuHeight = 170;
    const openUpward = window.innerHeight - rect.bottom < estimatedMenuHeight;

    setOpenAlertMenu({
      alert,
      index,
      top: openUpward ? rect.top - 8 : rect.bottom + 8,
      left: rect.right,
      openUpward,
    });
  };

  const runMenuAction = (callback, alert, ...args) => {
    setOpenAlertMenu(null);
    callback(alert, ...args);
  };

  const handlePrimaryAction = (alert) => {
    const primaryAction = getPrimaryAction(alert);

    if (primaryAction.action === 'manage-lot') {
      handleViewLots(alert);
      return;
    }

    if (primaryAction.action === 'quick-po') {
      handleQuickPO(alert);
      return;
    }

    if (primaryAction.action === 'move-stock') {
      handleTransferStock(alert);
      return;
    }

    handleViewProduct(alert);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans text-gray-800">

      {/* ── Header Odoo-style ────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col gap-4 shrink-0 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center text-[10px] text-gray-400 uppercase tracking-[0.2em] font-black mb-1">
              <span>Logística</span>
              <ChevronRight size={10} className="mx-1" />
              <span className="text-[#4C3073]">Stock e Inventario</span>
            </div>
            <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2 tracking-tight uppercase">
              <Pill className="text-[#4C3073]" />
              Inventario de Farmacia
            </h1>
          </div>
          <div className="bg-purple-50 border border-purple-100 px-3 py-2 rounded-lg flex items-center gap-3">
            <MapPin size={16} className="text-[#4C3073]" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase leading-none">Local Activo</span>
              <span className="text-xs font-black text-[#4C3073] uppercase">{activeWarehouse?.name || 'Cargando...'}</span>
            </div>
          </div>
        </div>

        {/* ── Barra de filtros ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* Selector de bodega/zona */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <Filter size={13} className="text-gray-400 shrink-0" />
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer min-w-[180px]"
            >
              <option value="">Todo el local ({activeWarehouse?.name})</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.location_type})</option>
              ))}
            </select>
          </div>

          {selectedLocationId && (
            <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-lg">
              <Layers size={12} className="text-[#4C3073]" />
              <span className="text-[10px] font-black text-[#4C3073] uppercase">Bodega: {selectedLocName}</span>
              <button
                onClick={() => setSelectedLocationId('')}
                className="ml-1 text-purple-400 hover:text-purple-700 font-black text-xs leading-none"
              >×</button>
            </div>
          )}

          <div className="relative w-80 ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por Nombre o DCI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2 text-xs font-bold
                focus:border-[#4C3073] focus:ring-4 focus:ring-purple-50 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          {[
            { key: 'sinStock', label: 'Sin stock', value: alertSummary.sinStock, icon: ArchiveX, classes: 'border-red-200 bg-red-50 text-red-700' },
            { key: 'stockCritico', label: 'Stock crítico', value: alertSummary.stockCritico, icon: TriangleAlert, classes: 'border-orange-200 bg-orange-50 text-orange-700' },
            { key: 'vencen30', label: 'Vencen 30 días', value: alertSummary.vencen30, icon: CalendarClock, classes: 'border-amber-200 bg-amber-50 text-amber-700' },
            { key: 'vencidos', label: 'Vencidos', value: alertSummary.vencidos, icon: CalendarClock, classes: 'border-red-200 bg-red-50 text-red-700' },
            { key: 'cuarentena', label: 'Cuarentena', value: alertSummary.cuarentena, icon: ShieldAlert, classes: 'border-slate-200 bg-slate-50 text-slate-700' },
            { key: 'controladosCriticos', label: 'Controlados críticos', value: alertSummary.controladosCriticos, icon: ShieldCheck, classes: 'border-purple-200 bg-purple-50 text-[#4C3073]' },
          ].map(card => {
            const Icon = card.icon;
            return (
              <div key={card.key} className={`rounded-xl border px-4 py-4 shadow-sm ${card.classes}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Alertas</p>
                    <p className="text-xs font-black uppercase mt-1">{card.label}</p>
                  </div>
                  <Icon size={18} />
                </div>
                <p className="mt-4 text-3xl font-black tracking-tight">{card.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                <TriangleAlert size={12} className="text-orange-500" /> Alertas
              </div>
              <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">Motor preventivo de inventario</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={alertTypeFilter} onChange={(e) => setAlertTypeFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 bg-white outline-none">
                <option value="ALL">Todos los tipos</option>
                <option value="SIN_STOCK">Sin stock</option>
                <option value="STOCK_CRITICO">Stock crítico</option>
                <option value="VENCE_30">Vence 30</option>
                <option value="VENCE_60">Vence 60</option>
                <option value="VENCIDO">Vencido</option>
                <option value="CUARENTENA">Cuarentena</option>
                <option value="CONTROLADO_BAJO_STOCK">Controlado crítico</option>
              </select>
              <select value={alertSeverityFilter} onChange={(e) => setAlertSeverityFilter(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 bg-white outline-none">
                <option value="ALL">Todas las severidades</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Severidad</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lote</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ubicación</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Cantidad</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vence</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Días</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-gray-400">
                    <p className="text-sm font-black uppercase tracking-widest">No hay alertas para los filtros seleccionados</p>
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert, index) => (
                  <tr key={`${alert.alert_type}-${alert.product_id}-${alert.batch_number || 'na'}-${index}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${getSeverityClass(alert.severity)}`}>{alert.severity}</span>
                    </td>
                    <td className="px-6 py-3 text-[11px] font-black text-gray-700 uppercase">{alert.alert_type}</td>
                    <td className="px-6 py-3">
                      <p className="font-black text-[#4C3073] uppercase tracking-tight">{alert.product_name}</p>
                    </td>
                    <td className="px-6 py-3 font-mono text-[11px] font-black text-gray-700 uppercase">
                      {alert.batch_number || '-'}
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-[11px] font-black text-gray-800 uppercase">{alert.location_name || '-'}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">{alert.location_type || '-'}</p>
                    </td>
                    <td className="px-6 py-3 text-right font-black text-gray-900">{formatQuantity(alert.current_quantity)}</td>
                    <td className="px-6 py-3 text-sm font-black text-gray-800">{alert.expiry_date ? new Date(`${alert.expiry_date}T00:00:00`).toLocaleDateString('es-CL') : '-'}</td>
                    <td className="px-6 py-3 text-right font-black text-gray-900">{alert.days_to_expire ?? '-'}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handlePrimaryAction(alert)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-colors ${alert.severity === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300'}`}
                        >
                          {React.createElement(getPrimaryAction(alert).icon, { size: 12 })}
                          {getPrimaryAction(alert).label}
                        </button>

                        <button
                          onClick={(event) => openMoreActionsMenu(event, alert, index)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                        >
                          <MoreHorizontal size={12} /> Más acciones
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        {openAlertMenu && (
          <>
            <button
              type="button"
              aria-label="Cerrar menú"
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setOpenAlertMenu(null)}
            />
            <div
              className="fixed z-40 w-48 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden"
              style={{
                top: openAlertMenu.openUpward ? undefined : openAlertMenu.top,
                bottom: openAlertMenu.openUpward ? window.innerHeight - openAlertMenu.top : undefined,
                left: Math.max(12, openAlertMenu.left - 192),
              }}
            >
              <button onClick={() => runMenuAction(handleViewProduct, openAlertMenu.alert)} className="w-full text-left px-3 py-2 text-[10px] font-black uppercase text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                              <Eye size={12} /> Ver producto
              </button>
              <button onClick={() => runMenuAction(handleViewLots, openAlertMenu.alert)} className="w-full text-left px-3 py-2 text-[10px] font-black uppercase text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                              <Layers size={12} /> Ver lotes
              </button>
              <button onClick={() => runMenuAction(handleViewKardex, openAlertMenu.alert)} className="w-full text-left px-3 py-2 text-[10px] font-black uppercase text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                              <BookOpen size={12} /> Ver kardex
              </button>
              <button onClick={() => runMenuAction(handleTransferStock, openAlertMenu.alert)} className="w-full text-left px-3 py-2 text-[10px] font-black uppercase text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                              <ArrowRightLeft size={12} /> Transferir stock
              </button>
            </div>
          </>
        )}

        <div id="inventory-stock-table" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto / DCI</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Bioequivalente</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Condición</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Sala Ventas</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Bodega</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Cuarentena</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Total</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Trazabilidad</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Kardex</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4C3073] mb-4"></div>
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Sincronizando Stock...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-300">
                      <ShieldAlert size={60} className="mb-4 opacity-10" />
                      <p className="text-sm font-black uppercase tracking-widest">No se encontraron resultados</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stock = stockMap[product.id] || { sales: 0, storage: 0, quarantine: 0, total: 0 };
                  return (
                    <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-black text-[#4C3073] uppercase tracking-tight">{product.name}</span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase mt-0.5 tracking-tighter">
                            {product.dci || product.active_principle || 'Sin DCI especificado'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {product.is_bioequivalent ? (
                          <span className="bg-yellow-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded border border-yellow-500 shadow-sm">BIO</span>
                        ) : (
                          <span className="text-gray-200">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">{getSaleConditionBadge(product.sale_condition)}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-black ${stock.sales <= 0 ? 'text-red-400' : 'text-gray-900'}`}>
                          {formatQuantity(stock.sales)} <span className="text-[9px] font-bold text-gray-400 ml-1">UN</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-black text-gray-900">{formatQuantity(stock.storage)} <span className="text-[9px] font-bold text-gray-400 ml-1">UN</span></td>
                      <td className="px-6 py-4 text-right text-sm font-black text-amber-700">{formatQuantity(stock.quarantine)} <span className="text-[9px] font-bold text-gray-400 ml-1">UN</span></td>
                      <td className="px-6 py-4 text-right text-sm font-black text-[#4C3073]">{formatQuantity(stock.total)} <span className="text-[9px] font-bold text-gray-400 ml-1">UN</span></td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => navigate(`/mapa-lotes/${product.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase
                            bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-600 hover:text-white
                            transition-all active:scale-95"
                        >
                          <Layers size={12} />
                          Ver Lotes
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => navigate(`/kardex/${product.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase
                            bg-purple-50 text-[#4C3073] border border-purple-100 hover:bg-[#4C3073] hover:text-white
                            transition-all active:scale-95"
                          title="Ver historial Kardex"
                        >
                          <BookOpen size={12} />
                          Kardex
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                <CalendarClock size={12} className="text-amber-500" /> Próximos Vencimientos
              </div>
              <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">Lotes próximos a vencer</h2>
            </div>
            <div className="flex items-center gap-2">
              {EXPIRY_WINDOWS.map(window => (
                <button
                  key={window}
                  onClick={() => setExpiryWindow(window)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${expiryWindow === window ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-200'}`}
                >
                  {window} días
                </button>
              ))}
            </div>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lote</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ubicación</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Cantidad</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vencimiento</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Días Restantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredExpiringLots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                    <p className="text-sm font-black uppercase tracking-widest">No hay lotes por vencer dentro de {expiryWindow} días</p>
                  </td>
                </tr>
              ) : (
                filteredExpiringLots.map(lot => (
                  <tr key={lot.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-black text-[#4C3073] uppercase tracking-tight">{lot.product_name}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">{lot.product_dci}</p>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm font-black text-gray-800 uppercase">{lot.batch_number}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-gray-800 uppercase">{lot.location_name}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">{lot.location_type}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-gray-900">{formatQuantity(lot.quantity)} <span className="text-[9px] font-bold text-gray-400 ml-1">UN</span></td>
                    <td className="px-6 py-4 text-sm font-black text-gray-800">{new Date(`${lot.expiry_date}T00:00:00`).toLocaleDateString('es-CL')}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-sm font-black ${lot.days_remaining <= 30 ? 'text-red-600' : lot.days_remaining <= 60 ? 'text-amber-600' : 'text-gray-800'}`}>
                        {lot.days_remaining}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
