import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, ChevronRight, MapPin, Search,
  ArrowUpCircle, ArrowDownCircle, RefreshCcw, Loader2,
  Calendar, Filter, TrendingUp, Pill, Info
} from 'lucide-react';
import { getPharmacySchema, getMyCompanyId } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';

// ── Determina color y dirección basándose en si hay entrada o salida ─────────
function MovBadge({ tipoHumano, entrada, salida }) {
  const isEntry = entrada > 0;
  const isExit  = salida > 0;

  if (isEntry) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase
        bg-green-50 border-green-200 text-green-700">
        <ArrowUpCircle size={11} />
        {tipoHumano || 'Entrada'}
      </span>
    );
  }
  if (isExit) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase
        bg-red-50 border-red-200 text-red-700">
        <ArrowDownCircle size={11} />
        {tipoHumano || 'Salida'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase
      bg-gray-100 border-gray-200 text-gray-600">
      <RefreshCcw size={11} />
      {tipoHumano || 'Ajuste'}
    </span>
  );
}

export default function KardexProducto() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { activeWarehouse } = useSucursal();

  const [product, setProduct]     = useState(null);
  const [rows, setRows]           = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Filtros
  const [dateFrom, setDateFrom]               = useState('');
  const [dateTo, setDateTo]                   = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');

  // ── Bodegas del local para el filtro ─────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!activeWarehouse?.id) return;
      const companyId = await getMyCompanyId();
      const schema = getPharmacySchema();
      const { data } = await schema
        .from('locations')
        .select('id, name, location_type')
        .eq('company_id', companyId)
        .eq('warehouse_id', activeWarehouse.id)
        .order('name');
      setLocations(data || []);
    };
    load();
  }, [activeWarehouse?.id]);

  // ── Carga el historial desde v_kardex_professional ───────────────────────
  // useEffect directo con todas las deps explícitas — garantiza re-ejecución
  // cuando activeWarehouse pasa de null → valor real (hidratación del contexto)
  useEffect(() => {
    // Guardia: no ejecutar hasta que ambos valores estén disponibles
    if (!productId || !activeWarehouse?.id) return;

    let cancelled = false;   // evita setState en componentes desmontados
    setLoading(true);

    (async () => {
      try {
        const companyId = await getMyCompanyId();
        const schema = getPharmacySchema();

        // Producto (para el encabezado)
        const { data: prod, error: prodErr } = await schema
          .from('products')
          .select('id, name, dci, active_principle, sale_condition')
          .eq('id', productId)
          .single();
        if (prodErr) console.error('[Kardex] Error cargando producto:', prodErr.message);
        if (!cancelled) setProduct(prod ?? null);

        // Historial desde v_kardex_professional — columnas en español
        // FILTRO DOBLE: product_id + warehouse_id  ← aislamiento por sucursal
        let query = schema
          .from('v_kardex_professional')
          .select('fecha, product_id, producto, dci, warehouse_id, sucursal, bodega_ubicacion, tipo_movimiento_humano, referencia, lote, entrada, salida, saldo_acumulado')
          .eq('product_id', productId)
          .eq('warehouse_id', activeWarehouse?.id)
          .order('fecha', { ascending: false });

        if (dateFrom)         query = query.gte('fecha', dateFrom);
        if (dateTo)           query = query.lte('fecha', dateTo + 'T23:59:59');
        if (selectedLocation) query = query.ilike('bodega_ubicacion', `%${selectedLocation}%`);

        const { data, error } = await query.limit(300);
        if (!cancelled) {
          if (error) {
            console.error('[Kardex] Error en v_kardex_professional:', error.message, error);
            setRows([]);
          } else {
            setRows(data ?? []);
          }
        }
      } catch (err) {
        console.error('[Kardex] Error inesperado:', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);   // spinner siempre se detiene
      }
    })();

    return () => { cancelled = true; };   // cleanup en desmontaje / re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, activeWarehouse?.id, dateFrom, dateTo, selectedLocation]);

  // ── Filtro de texto libre sobre columnas reales de la vista ────────────
  const filtered = useMemo(() =>
    rows.filter(r => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        r.tipo_movimiento_humano?.toLowerCase().includes(term) ||
        r.bodega_ubicacion?.toLowerCase().includes(term) ||
        r.lote?.toLowerCase().includes(term) ||
        r.referencia?.toLowerCase().includes(term)
      );
    }), [rows, searchTerm]);

  // ── Totales del periodo (excluye acomodos internos para no inflar stats comerciales) ──
  const totals = useMemo(() => {
    const commercial = filtered.filter(r => {
      const tipo = r.tipo_movimiento_humano ?? '';
      return !tipo.includes('Acomodo') && !tipo.includes('Interno');
    });
    return commercial.reduce((acc, r) => ({
      entradas: acc.entradas + (Number(r.entrada) || 0),
      salidas:  acc.salidas  + (Number(r.salida)  || 0),
    }), { entradas: 0, salidas: 0 });
  }, [filtered]);

  // ── Cálculo dinámico de Saldo Acumulado (Frontend) ────────────────────────
  const rowsWithBalance = useMemo(() => {
    // 1. Invertimos para calcular cronológicamente (desde el más antiguo al más nuevo)
    const chronological = [...filtered].reverse();
    let runningWarehouseStock = 0;

    const withBalance = chronological.map(row => {
      const tipo = row.tipo_movimiento_humano ?? '';
      // Si es un acomodo interno, no altera el stock total del local (suma cero)
      const isInternal = tipo.includes('Acomodo') || tipo.includes('Interno');

      if (!isInternal) {
        const entrada = Number(row.entrada) || 0;
        const salida  = Number(row.salida)  || 0;
        runningWarehouseStock += (entrada - salida);
      }

      return { ...row, calculated_balance: runningWarehouseStock };
    });

    // 2. Volvemos a invertir para mostrar al usuario (del más nuevo al más antiguo)
    return withBalance.reverse();
  }, [filtered]);

  // ── Early Return de Seguridad (Blindaje) ───────────────────────────────────
  // Si no hay local, ID de producto o el producto aún no carga, mostramos estado de carga
  // Se ubica DESPUÉS de todos los hooks (useEffect, useMemo) para cumplir con las reglas de React
  if (!activeWarehouse || !productId || !product) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-[#4C3073] animate-spin" />
          <p className="text-sm font-black text-gray-400 uppercase tracking-widest">
            Cargando información del producto...
          </p>
        </div>
      </div>
    );
  }

  const fmtDate = (val) => {
    if (!val) return '—';
    try { return new Date(val).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return String(val); }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans text-gray-800">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col gap-5 shrink-0 shadow-sm">

        {/* Fila 1: Navegación y local activo */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/inventario')}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center text-[10px] text-gray-400 uppercase tracking-[0.2em] font-black mb-1">
                <span>Stock e Inventario</span>
                <ChevronRight size={10} className="mx-1" />
                <span className="text-[#4C3073]">Kardex de Movimientos</span>
              </div>
              <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2 tracking-tight uppercase">
                <BookOpen className="text-[#4C3073]" />
                Historial de Movimientos
              </h1>
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-100 px-3 py-2 rounded-lg flex items-center gap-3">
            <MapPin size={16} className="text-[#4C3073]" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase leading-none">Local Activo</span>
              <span className="text-xs font-black text-[#4C3073] uppercase">{activeWarehouse?.name || '—'}</span>
            </div>
          </div>
        </div>

        {/* ── Ficha del Producto ─────────────────────────────────────────── */}
        {product ? (
          <div className="bg-purple-50 border border-purple-100 rounded-xl px-6 py-4 flex items-center gap-6">
            <div className="p-3 bg-[#4C3073] rounded-xl text-white shrink-0">
              <Pill size={22} />
            </div>
            <div className="flex-1 grid grid-cols-3 gap-4">
              <div>
                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Producto</p>
                <p className="text-sm font-black text-[#4C3073] uppercase mt-0.5 leading-tight">{product.name}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Principio Activo (DCI)</p>
                <p className="text-xs font-bold text-gray-600 italic mt-0.5">
                  {product.dci || product.active_principle || 'No especificado'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Local</p>
                <p className="text-xs font-black text-gray-700 uppercase mt-0.5">{activeWarehouse?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white border border-purple-100 rounded-lg px-3 py-1.5 shrink-0">
              <Info size={12} className="text-purple-400" />
              <span className="text-[9px] font-black text-purple-600 uppercase">
                {filtered.length} registro{filtered.length !== 1 ? 's' : ''} mostrados
              </span>
            </div>
          </div>
        ) : (
          <div className="h-16 bg-gray-50 rounded-xl border border-gray-200 animate-pulse" />
        )}

        {/* ── Filtros ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 outline-none" />
            <span className="text-gray-300 text-xs font-bold">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 outline-none" />
          </div>

          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
            <Filter size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Filtrar por bodega..."
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-700 outline-none min-w-[160px] placeholder-gray-400"
            />
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar en notas, lote, ubicación..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-xs font-bold w-60 bg-white
                focus:border-[#4C3073] focus:ring-4 focus:ring-purple-50 outline-none transition-all" />
          </div>
        </div>

        {/* ── Tarjetas de totales ──────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-100 rounded-xl px-5 py-3 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-green-600 uppercase tracking-widest">Total Entradas</p>
              <p className="text-2xl font-black text-green-700 mt-0.5">
                {totals.entradas} <span className="text-xs font-bold text-green-400">UN</span>
              </p>
            </div>
            <ArrowUpCircle size={32} className="text-green-200" />
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-3 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Total Salidas</p>
              <p className="text-2xl font-black text-red-600 mt-0.5">
                {totals.salidas} <span className="text-xs font-bold text-red-400">UN</span>
              </p>
            </div>
            <ArrowDownCircle size={32} className="text-red-200" />
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-xl px-5 py-3 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Balance del Periodo</p>
              <p className="text-2xl font-black text-[#4C3073] mt-0.5">
                {totals.entradas - totals.salidas} <span className="text-xs font-bold text-purple-400">UN</span>
              </p>
            </div>
            <TrendingUp size={32} className="text-purple-200" />
          </div>
        </div>
      </div>

      {/* ── Tabla Kardex ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha</th>
                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo de Movimiento</th>
                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Origen → Destino</th>
                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lote</th>
                <th className="px-5 py-4 text-[10px] font-black text-green-600 uppercase tracking-widest text-right">Entrada (+)</th>
                <th className="px-5 py-4 text-[10px] font-black text-red-500 uppercase tracking-widest text-right">Salida (−)</th>
                <th className="px-5 py-4 text-[10px] font-black text-[#4C3073] uppercase tracking-widest text-right bg-purple-50 border-l border-purple-100">✦ Saldo Acumulado</th>
                <th className="px-5 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-24 text-center">
                    <div className="flex items-center justify-center gap-3 text-gray-300">
                      <Loader2 size={28} className="animate-spin" />
                      <span className="text-sm font-black uppercase tracking-widest">Cargando historial...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center text-gray-300">
                      <BookOpen size={50} className="mb-4 opacity-10" />
                      <p className="text-sm font-black uppercase tracking-widest">Sin movimientos en este periodo</p>
                      <p className="text-[10px] font-bold uppercase mt-1 text-gray-400">
                        Prueba ampliar el rango de fechas o quitar filtros
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rowsWithBalance.map((row, idx) => {
                  const entrada = Number(row.entrada) || 0;
                  const salida  = Number(row.salida)  || 0;
                  const saldo   = row.calculated_balance;
                  return (
                    <tr key={idx} className="hover:bg-gray-50/40 transition-colors">

                      {/* fecha */}
                      <td className="px-5 py-3.5 text-[11px] font-bold text-gray-500 whitespace-nowrap">
                        {fmtDate(row.fecha)}
                      </td>

                      {/* tipo_movimiento_humano */}
                      <td className="px-5 py-3.5">
                        <MovBadge
                          tipoHumano={row.tipo_movimiento_humano}
                          entrada={entrada}
                          salida={salida}
                        />
                      </td>

                      {/* bodega_ubicacion */}
                      <td className="px-5 py-3.5">
                        <span className="text-[11px] font-bold text-gray-600">{row.bodega_ubicacion || '—'}</span>
                      </td>

                      {/* lote */}
                      <td className="px-5 py-3.5">
                        <span className="text-[10px] font-black text-[#4C3073] uppercase">
                          {row.lote || '—'}
                        </span>
                      </td>

                      {/* entrada */}
                      <td className="px-5 py-3.5 text-right">
                        {entrada > 0 ? (
                          <span className="text-sm font-black text-green-700">
                            +{entrada} <span className="text-[9px] font-bold text-green-400">UN</span>
                          </span>
                        ) : (
                          <span className="text-gray-200 text-sm">—</span>
                        )}
                      </td>

                      {/* salida */}
                      <td className="px-5 py-3.5 text-right">
                        {salida > 0 ? (
                          <span className="text-sm font-black text-red-600">
                            −{salida} <span className="text-[9px] font-bold text-red-400">UN</span>
                          </span>
                        ) : (
                          <span className="text-gray-200 text-sm">—</span>
                        )}
                      </td>

                      {/* saldo_acumulado */}
                      <td className="px-5 py-3.5 text-right bg-purple-50/60 border-l border-purple-100">
                        {saldo != null ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span className="text-base font-black text-[#4C3073]">{saldo}</span>
                            <span className="text-[9px] font-black text-purple-400 bg-purple-100 px-1.5 py-0.5 rounded uppercase">UN</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-300 italic">—</span>
                        )}
                      </td>

                      {/* referencia */}
                      <td className="px-5 py-3.5 text-[11px] font-medium text-gray-400 max-w-[160px] truncate"
                          title={row.referencia}>
                        {row.referencia || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <p className="text-[10px] font-bold text-gray-400 uppercase mt-3 text-center">
            {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''} · Máximo 300 registros por consulta
          </p>
        )}
      </div>
    </div>
  );
}
