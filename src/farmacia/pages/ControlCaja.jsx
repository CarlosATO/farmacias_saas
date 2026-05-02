import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownCircle, ArrowLeft, ArrowUpCircle, Banknote, Calculator, Loader2, ShieldAlert, Wallet } from 'lucide-react';
import { useSucursal } from '../context/SucursalContext';
import {
  closePosSession,
  createCashMovement,
  fetchClosedPosSessions,
  fetchPosOperators,
  fetchPosSessionSummary,
  verifyPosOperatorPin,
  fetchPosTerminals,
  fetchSessionsByWarehouse,
  preOpenSession,
  createPosTerminal,
  togglePosTerminalStatus,
  fetchSessionSalesSummary
} from '../api/pharmacyClient';

const initialMovementModal = {
  open: false,
  movementType: 'IN',
  amount: '',
  reason: '',
};

const initialClosingModal = {
  open: false,
  closingBalance: '',
  pinCode: '',
};

export default function ControlCaja() {
  const navigate = useNavigate();
  const { activeWarehouse } = useSucursal();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [operators, setOperators] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [movementModal, setMovementModal] = useState(initialMovementModal);
  const [closingModal, setClosingModal] = useState(initialClosingModal);
  const [openingModal, setOpeningModal] = useState({ open: false, terminalId: null });
  const [closedSessions, setClosedSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [sessionSales, setSessionSales] = useState([]);
  const [activeTab, setActiveTab] = useState('movements'); // 'movements' | 'sales'
  const [terminalManagementModal, setTerminalManagementModal] = useState(false);
  const [newTerminalName, setNewTerminalName] = useState('');

  const loadData = async () => {
    if (!activeWarehouse?.id) {
      setTerminals([]);
      setSessions([]);
      setClosedSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [termRes, sessRes, operRes, closedRes] = await Promise.all([
        fetchPosTerminals(activeWarehouse.id),
        fetchSessionsByWarehouse(activeWarehouse.id),
        fetchPosOperators(activeWarehouse.id),
        fetchClosedPosSessions(activeWarehouse.id, 8)
      ]);

      if (termRes.error) throw termRes.error;
      if (sessRes.error) throw sessRes.error;
      if (operRes.error) throw operRes.error;
      if (closedRes.error) throw closedRes.error;

      setTerminals(termRes.data || []);
      setSessions(sessRes.data || []);
      setOperators(operRes.data || []);
      setClosedSessions(closedRes.data || []);

      // Si hay una sesión seleccionada, recargar su resumen y ventas
      if (selectedSessionId) {
        const currentSession = sessRes.data?.find(s => s.id === selectedSessionId);
        if (currentSession && currentSession.status === 'OPEN') {
          const [{ data: sessionSummary }, { data: salesRes }] = await Promise.all([
            fetchPosSessionSummary(currentSession),
            fetchSessionSalesSummary(currentSession.id)
          ]);
          setSummary(sessionSummary);
          setSessionSales(salesRes || []);
        } else {
          setSummary(null);
          setSessionSales([]);
        }
      }
    } catch (error) {
      console.error('Error cargando monitoreo de cajas:', error);
      alert(`Error cargando Control de Caja: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeWarehouse?.id, selectedSessionId]);

  const activeSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return sessions.find(s => s.id === selectedSessionId);
  }, [sessions, selectedSessionId]);

  const expectedCash = useMemo(() => Number(summary?.expectedCash || 0), [summary]);

  const fmtCLP = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;

  const handlePreOpenSession = async () => {
    if (!activeWarehouse?.id || !openingModal.terminalId) {
      alert('Debes seleccionar una sucursal y terminal.');
      return;
    }

    if (Number(openingBalance || 0) < 0) {
      alert('El monto inicial no puede ser negativo.');
      return;
    }

    if (!selectedOperatorId) {
      alert('Debes seleccionar un operador POS asignado.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await preOpenSession({
        warehouseId: activeWarehouse.id,
        terminalId: openingModal.terminalId,
        operatorId: selectedOperatorId,
        openingBalance: Number(openingBalance || 0),
      });
      if (error) throw error;

      setOpeningBalance('');
      setSelectedOperatorId('');
      setOpeningModal({ open: false, terminalId: null });
      await loadData();
    } catch (error) {
      console.error('Error pre-abriendo turno:', error);
      alert(`No se pudo pre-abrir el turno: ${error.message || error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMovement = async () => {
    if (!activeSession?.id) return;
    if (Number(movementModal.amount || 0) <= 0) {
      alert('Debes ingresar un monto mayor a cero.');
      return;
    }
    if (!movementModal.reason.trim()) {
      alert('Debes indicar una justificacion para el movimiento.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await createCashMovement({
        sessionId: activeSession.id,
        movementType: movementModal.movementType,
        amount: Number(movementModal.amount || 0),
        reason: movementModal.reason.trim(),
      });
      if (error) throw error;

      setMovementModal(initialMovementModal);
      await loadData();
    } catch (error) {
      console.error('Error registrando movimiento de caja:', error);
      alert(`No se pudo registrar el movimiento: ${error.message || error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeSession?.id) return;

    const closingBalance = Number(closingModal.closingBalance || 0);
    if (closingBalance < 0) {
      alert('El efectivo fisico no puede ser negativo.');
      return;
    }
    if (!activeSession.operator?.id) {
      alert('La sesión no tiene operador POS asociado y no puede cerrarse de forma segura.');
      return;
    }
    if (!/^\d{4}$/.test(closingModal.pinCode.trim())) {
      alert('Debes ingresar el PIN de 4 dígitos del operador para cerrar el turno.');
      return;
    }
    const difference = closingBalance - expectedCash;

    setSubmitting(true);
    try {
      const { data: pinValid, error: pinError } = await verifyPosOperatorPin({
        operatorId: activeSession.operator.id,
        warehouseId: activeWarehouse.id,
        pinCode: closingModal.pinCode.trim(),
      });
      if (pinError) throw pinError;
      if (!pinValid) {
        alert('PIN de operador inválido. No se puede cerrar el turno.');
        return;
      }

      const { error } = await closePosSession({
        sessionId: activeSession.id,
        closingBalance,
        difference,
      });
      if (error) throw error;

      setClosingModal(initialClosingModal);
      await loadData();

      if (difference !== 0) {
        const direction = difference > 0 ? 'sobrante' : 'faltante';
        alert(`Turno cerrado con ${direction} de ${fmtCLP(Math.abs(difference))}.`);
      } else {
        alert('Turno cerrado sin diferencias.');
      }
    } catch (error) {
      console.error('Error cerrando turno:', error);
      alert(`No se pudo cerrar el turno: ${error.message || error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTerminal = async () => {
    if (!newTerminalName.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await createPosTerminal({
        warehouseId: activeWarehouse.id,
        name: newTerminalName.trim()
      });
      if (error) throw error;
      setNewTerminalName('');
      await loadData();
    } catch (error) {
      alert(`Error creando terminal: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleTerminal = async (terminalId, currentStatus) => {
    setSubmitting(true);
    try {
      const { error } = await togglePosTerminalStatus(terminalId, !currentStatus);
      if (error) throw error;
      await loadData();
    } catch (error) {
      alert(`Error actualizando terminal: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 bg-[#f8f9fa] min-h-full flex items-center justify-center">
        <div className="text-center text-gray-400">
          <Loader2 size={30} className="animate-spin mx-auto mb-3 text-[#4C3073]" />
          <p className="text-sm font-black uppercase tracking-widest">Cargando control de caja...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 bg-[#f8f9fa] min-h-full">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Ventas / Control de Caja</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Apertura y Cierre de Turnos</h1>
              <p className="text-sm text-gray-500 mt-2">Modulo financiero para control de sesiones de caja por sucursal y cajero.</p>
            </div>
            <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 text-right">
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Sucursal</p>
              <p className="text-sm font-black text-[#4C3073] uppercase">{activeWarehouse?.name || 'Sin sucursal'}</p>
            </div>
            <button
              onClick={() => setTerminalManagementModal(true)}
              className="rounded-xl border border-gray-300 px-4 py-3 text-[11px] font-black uppercase text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Gestionar Cajas Físicas
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {terminals.map((terminal) => {
            const terminalSession = sessions.find(s => s.terminal_id === terminal.id && (s.status === 'OPEN' || s.status === 'PENDING'));
            const status = terminalSession ? terminalSession.status : 'CLOSED';
            
            return (
              <div 
                key={terminal.id} 
                className={`bg-white border rounded-2xl p-6 transition-all shadow-sm hover:shadow-md ${
                  selectedSessionId === terminalSession?.id ? 'ring-2 ring-[#4C3073] border-[#4C3073]' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                    status === 'OPEN' ? 'bg-green-50 border-green-100 text-green-600' :
                    status === 'PENDING' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                    'bg-gray-50 border-gray-100 text-gray-400'
                  }`}>
                    <Calculator size={24} />
                  </div>
                  <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${
                    status === 'OPEN' ? 'bg-green-100 border-green-200 text-green-700' :
                    status === 'PENDING' ? 'bg-amber-100 border-amber-200 text-amber-700' :
                    'bg-gray-100 border-gray-200 text-gray-500'
                  }`}>
                    {status === 'OPEN' ? 'Abierta' : status === 'PENDING' ? 'Pendiente' : 'Cerrada'}
                  </span>
                </div>

                <h3 className="text-lg font-black text-gray-900 uppercase truncate">{terminal.name}</h3>
                
                {terminalSession ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-center text-[11px] font-bold">
                      <span className="text-gray-400 uppercase tracking-widest">Operador</span>
                      <span className="text-gray-700 uppercase">{terminalSession.operator?.full_name}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] font-bold">
                      <span className="text-gray-400 uppercase tracking-widest">Efectivo Inicial</span>
                      <span className="text-gray-900">{fmtCLP(terminalSession.opening_balance)}</span>
                    </div>
                    
                    {status === 'OPEN' ? (
                      <button
                        type="button"
                        onClick={() => setSelectedSessionId(terminalSession.id)}
                        className="w-full mt-2 py-2.5 bg-[#4C3073] text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#3f285f] transition-colors"
                      >
                        Monitorear Detalles
                      </button>
                    ) : (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                        <p className="text-[10px] font-bold text-amber-700 leading-tight">Esperando activación por cajero con PIN físico.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setOpeningModal({ open: true, terminalId: terminal.id })}
                      className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase hover:bg-gray-50 transition-colors"
                    >
                      Pre-Abrir Turno
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {activeSession && activeSession.status === 'OPEN' && (
          <div className="space-y-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-[11px] font-black uppercase text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Volver al Monitor de Cajas
                </button>
                <h2 className="text-xl font-black text-gray-900 uppercase">Detalle: {activeSession.terminal?.name}</h2>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-black uppercase border border-green-200">
                Sesión Activa
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="Efectivo Inicial" value={fmtCLP(activeSession.opening_balance)} icon={Wallet} accent="text-[#4C3073]" />
              <MetricCard label="Ventas en Efectivo" value={fmtCLP(summary?.cashSales)} icon={Banknote} accent="text-green-700" />
              <MetricCard label="Entradas / Salidas" value={`${fmtCLP(summary?.cashEntries)} / ${fmtCLP(summary?.cashOutflows)}`} icon={Calculator} accent="text-gray-800" />
              <MetricCard label="Efectivo Esperado" value={fmtCLP(expectedCash)} icon={ShieldAlert} accent="text-blue-700" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Turno Abierto</p>
                    <p className="text-sm text-gray-500 mt-1">Control en tiempo real de efectivo y movimientos del cajero.</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setMovementModal({ ...initialMovementModal, open: true, movementType: 'IN' })}
                      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-[11px] font-black uppercase text-gray-700 hover:bg-gray-50"
                    >
                      <ArrowDownCircle size={16} className="text-green-600" />
                      Ingresar Dinero
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovementModal({ ...initialMovementModal, open: true, movementType: 'OUT' })}
                      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-[11px] font-black uppercase text-gray-700 hover:bg-gray-50"
                    >
                      <ArrowUpCircle size={16} className="text-amber-600" />
                      Retirar Dinero
                    </button>
                    <button
                      type="button"
                      onClick={() => setClosingModal({ open: true, closingBalance: '', pinCode: '' })}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-[11px] font-black uppercase text-white hover:bg-red-700"
                    >
                      <AlertTriangle size={16} />
                      Forzar Cierre
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-[#f8f9fa] p-5">
                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Efectivo Esperado en Gaveta</p>
                    <p className="text-3xl font-black text-[#4C3073]">{fmtCLP(expectedCash)}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SummaryMiniCard label="Estado" value={activeSession.status} />
                    <SummaryMiniCard label="Ventas Cash" value={`${summary?.sales?.length || 0} comprobantes`} />
                    <SummaryMiniCard label="Movimientos" value={`${summary?.movements?.length || 0} registros`} />
                  </div>
                </div>
              </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden min-h-[400px] flex flex-col">
              <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-2 flex items-center gap-6">
                <button
                  onClick={() => setActiveTab('movements')}
                  className={`py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                    activeTab === 'movements' ? 'border-[#4C3073] text-[#4C3073]' : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Movimientos de Caja
                </button>
                <button
                  onClick={() => setActiveTab('sales')}
                  className={`py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                    activeTab === 'sales' ? 'border-[#4C3073] text-[#4C3073]' : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Ventas Realizadas
                </button>
              </div>

              <div className="flex-1 p-4 overflow-auto">
                {activeTab === 'movements' ? (
                  <div className="divide-y divide-gray-100">
                    {(summary?.movements?.length || 0) === 0 ? (
                      <div className="py-20 text-center text-gray-400">
                        <Wallet size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="text-[11px] font-black uppercase tracking-widest">Sin movimientos de cash</p>
                      </div>
                    ) : (
                      summary.movements.map((movement) => (
                        <div key={movement.id} className="py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-gray-900 uppercase">{movement.movement_type === 'IN' ? 'Entrada' : 'Salida'}</p>
                              <p className="text-xs text-gray-500 mt-1">{movement.reason}</p>
                            </div>
                            <span className={`text-sm font-black ${movement.movement_type === 'IN' ? 'text-green-700' : 'text-red-600'}`}>
                              {movement.movement_type === 'IN' ? '+' : '-'}{fmtCLP(movement.amount)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div>
                    {sessionSales.length === 0 ? (
                      <div className="py-20 text-center text-gray-400">
                        <Calculator size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="text-[11px] font-black uppercase tracking-widest">No se han registrado ventas</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {sessionSales.map((sale) => (
                          <div key={sale.id} className="rounded-xl border border-gray-100 bg-gray-50/30 p-4">
                            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                              <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Venta {sale.document_number}</p>
                                <p className="text-[10px] text-gray-500 font-bold">{new Date(sale.created_at).toLocaleTimeString('es-CL')}</p>
                              </div>
                              <span className="text-sm font-black text-gray-900">{fmtCLP(sale.total_amount)}</span>
                            </div>
                            <div className="space-y-2">
                              {sale.sale_items?.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-[11px]">
                                  <span className="text-gray-600 font-bold uppercase">{item.product?.name} x {item.quantity}</span>
                                  <span className="text-gray-400">{fmtCLP(item.subtotal)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mt-8">
          <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-4">
            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Historial de Turnos Cerrados</p>
          </div>
          <div className="overflow-x-auto">
            {closedSessions.length === 0 ? (
              <div className="py-14 text-center text-gray-400">
                <ShieldAlert size={28} className="mx-auto mb-3" />
                <p className="text-[11px] font-black uppercase tracking-widest">No hay cierres previos</p>
              </div>
            ) : (
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-white">
                    <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Terminal</th>
                    <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Operador</th>
                    <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Cierre</th>
                    <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Esperado</th>
                    <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {closedSessions.map((closedSession) => {
                    const sessionExpectedCash = Number(closedSession.summary?.expectedCash || 0);
                    const sessionDifference = Number(closedSession.difference || 0);
                    return (
                      <tr key={closedSession.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-sm font-black text-gray-900 uppercase">{closedSession.terminal?.name || '—'}</td>
                        <td className="px-5 py-3 text-sm font-bold text-gray-600 uppercase">{closedSession.operator?.full_name}</td>
                        <td className="px-5 py-3 text-sm text-gray-500">{new Date(closedSession.end_time).toLocaleString('es-CL')}</td>
                        <td className="px-5 py-3 text-sm font-black text-right text-blue-700">{fmtCLP(sessionExpectedCash)}</td>
                        <td className={`px-5 py-3 text-sm font-black text-right ${sessionDifference === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {fmtCLP(sessionDifference)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {openingModal.open && (
        <ModalFrame title="Pre-Abrir Turno de Caja" onClose={() => setOpeningModal({ open: false, terminalId: null })}>
          <div className="space-y-4">
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Terminal Seleccionado</p>
              <p className="text-sm font-black text-[#4C3073] uppercase">{terminals.find(t => t.id === openingModal.terminalId)?.name}</p>
            </div>

            <FieldBlock label="Operador Responsable">
              <select
                value={selectedOperatorId}
                onChange={(e) => setSelectedOperatorId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
              >
                <option value="">Selecciona operador</option>
                {operators.filter((operator) => operator.is_active).map((operator) => (
                  <option key={operator.id} value={operator.id}>{operator.full_name}</option>
                ))}
              </select>
            </FieldBlock>

            <FieldBlock label="Efectivo Inicial de Entrega">
              <input
                type="number"
                min="0"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                placeholder="0"
              />
            </FieldBlock>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-[10px] font-bold text-amber-700 leading-tight">Nota: El turno no se activará hasta que el cajero ingrese su PIN en el terminal físico correspondiente.</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpeningModal({ open: false, terminalId: null })} className="rounded-xl border border-gray-300 px-4 py-2.5 text-[11px] font-black uppercase text-gray-700">Cancelar</button>
              <button type="button" onClick={handlePreOpenSession} disabled={submitting} className="rounded-xl bg-[#4C3073] px-6 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-40">
                {submitting ? 'Abriendo...' : 'Pre-Abrir Turno'}
              </button>
            </div>
          </div>
        </ModalFrame>
      )}

      {movementModal.open && (
        <ModalFrame title={movementModal.movementType === 'IN' ? 'Ingresar Dinero a Caja' : 'Retirar Dinero de Caja'} onClose={() => setMovementModal(initialMovementModal)}>
          <div className="space-y-4">
            <FieldBlock label="Monto">
              <input
                type="number"
                min="0"
                value={movementModal.amount}
                onChange={(e) => setMovementModal((current) => ({ ...current, amount: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                placeholder="0"
              />
            </FieldBlock>

            <FieldBlock label="Justificacion">
              <textarea
                value={movementModal.reason}
                onChange={(e) => setMovementModal((current) => ({ ...current, reason: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073] min-h-[110px]"
                placeholder="Describe por que entra o sale dinero de la caja"
              />
            </FieldBlock>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setMovementModal(initialMovementModal)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-[11px] font-black uppercase text-gray-700">Cancelar</button>
              <button type="button" onClick={handleCreateMovement} disabled={submitting} className="rounded-xl bg-[#4C3073] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-40">
                {submitting ? 'Guardando...' : 'Registrar Movimiento'}
              </button>
            </div>
          </div>
        </ModalFrame>
      )}

      {closingModal.open && (
        <ModalFrame title="Cerrar Turno (Arqueo)" onClose={() => setClosingModal(initialClosingModal)}>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-[#f8f9fa] p-4">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Efectivo Esperado</p>
              <p className="text-2xl font-black text-[#4C3073]">{fmtCLP(expectedCash)}</p>
            </div>

            <FieldBlock label="Efectivo fisico en caja">
              <input
                type="number"
                min="0"
                value={closingModal.closingBalance}
                onChange={(e) => setClosingModal((current) => ({ ...current, closingBalance: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                placeholder="0"
              />
            </FieldBlock>

            <FieldBlock label="PIN del Operador para Cierre">
              <input
                type="password"
                inputMode="numeric"
                value={closingModal.pinCode}
                onChange={(e) => setClosingModal((current) => ({ ...current, pinCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold tracking-[0.3em] outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                placeholder="0000"
              />
            </FieldBlock>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setClosingModal(initialClosingModal)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-[11px] font-black uppercase text-gray-700">Cancelar</button>
              <button type="button" onClick={handleCloseSession} disabled={submitting} className="rounded-xl bg-red-600 px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-40">
                {submitting ? 'Cerrando...' : 'Cerrar Turno'}
              </button>
            </div>
          </div>
        </ModalFrame>
      )}

      {terminalManagementModal && (
        <ModalFrame title="Gestionar Cajas Físicas (Terminales)" onClose={() => setTerminalManagementModal(false)}>
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <p className="text-[10px] font-black text-gray-400 uppercase mb-3">Agregar Nueva Caja</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTerminalName}
                  onChange={(e) => setNewTerminalName(e.target.value)}
                  placeholder="Ej: Caja Principal, Caja 2..."
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-100"
                />
                <button
                  onClick={handleCreateTerminal}
                  disabled={submitting || !newTerminalName.trim()}
                  className="bg-[#4C3073] text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase disabled:opacity-50"
                >
                  Agregar
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black text-gray-400 uppercase">Terminales Registradas</p>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {terminals.map(t => (
                  <div key={t.id} className="bg-white p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black text-gray-900 uppercase">{t.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">ID: {t.id.slice(0,8)}</p>
                    </div>
                    <button
                      onClick={() => handleToggleTerminal(t.id, t.is_active)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border ${
                        t.is_active 
                          ? 'border-green-200 text-green-700 bg-green-50' 
                          : 'border-gray-200 text-gray-400 bg-gray-50'
                      }`}
                    >
                      {t.is_active ? 'Activa' : 'Inactiva'}
                    </button>
                  </div>
                ))}
                {terminals.length === 0 && (
                  <div className="p-8 text-center text-gray-400">
                    <p className="text-[10px] font-black uppercase">No hay terminales creadas</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">{label}</p>
          <p className={`text-2xl font-black ${accent}`}>{value}</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
          <Icon size={20} className="text-gray-400" />
        </div>
      </div>
    </div>
  );
}

function SummaryMiniCard({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-sm font-black text-gray-900 uppercase">{value}</p>
    </div>
  );
}

function FieldBlock({ label, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-200">
        <p className="text-[11px] font-black text-gray-500 uppercase">{label}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ModalFrame({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[140] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gray-50/50 px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{title}</p>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-2 text-[11px] font-black uppercase text-gray-600">Cerrar</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
