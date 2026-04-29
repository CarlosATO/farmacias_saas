import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Banknote, Calculator, Loader2, ShieldAlert, Wallet } from 'lucide-react';
import { useSucursal } from '../context/SucursalContext';
import {
  closePosSession,
  createCashMovement,
  fetchClosedPosSessions,
  fetchPosOperators,
  fetchOpenPosSession,
  fetchPosSessionSummary,
  openPosSession,
  verifyPosOperatorPin,
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
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [closedSessions, setClosedSessions] = useState([]);
  const [operators, setOperators] = useState([]);
  const [openingBalance, setOpeningBalance] = useState('');
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [operatorPin, setOperatorPin] = useState('');
  const [movementModal, setMovementModal] = useState(initialMovementModal);
  const [closingModal, setClosingModal] = useState(initialClosingModal);

  const loadSession = async () => {
    if (!activeWarehouse?.id) {
      setSession(null);
      setSummary(null);
      setClosedSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: openSession, error: sessionError } = await fetchOpenPosSession(activeWarehouse.id);
      if (sessionError) throw sessionError;

      const { data: operatorData, error: operatorError } = await fetchPosOperators(activeWarehouse.id);
      if (operatorError) throw operatorError;

      const { data: closedData, error: closedError } = await fetchClosedPosSessions(activeWarehouse.id, 8);
      if (closedError) throw closedError;

      setOperators(operatorData || []);
      setClosedSessions(closedData || []);

      setSession(openSession || null);

      if (openSession) {
        const { data: sessionSummary, error: summaryError } = await fetchPosSessionSummary(openSession);
        if (summaryError) throw summaryError;
        setSummary(sessionSummary);
      } else {
        setSummary(null);
      }
    } catch (error) {
      console.error('Error cargando control de caja:', error);
      alert(`Error cargando Control de Caja: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [activeWarehouse?.id]);

  const expectedCash = useMemo(() => Number(summary?.expectedCash || 0), [summary]);

  const fmtCLP = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;

  const handleOpenSession = async () => {
    if (!activeWarehouse?.id) {
      alert('Debes seleccionar una sucursal antes de abrir turno.');
      return;
    }

    if (Number(openingBalance || 0) < 0) {
      alert('El monto inicial no puede ser negativo.');
      return;
    }

    if (!selectedOperatorId) {
      alert('Debes seleccionar un operador POS antes de abrir el turno.');
      return;
    }

    if (!/^\d{4}$/.test(operatorPin.trim())) {
      alert('Debes ingresar el PIN de 4 dígitos del operador.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: pinValid, error: pinError } = await verifyPosOperatorPin({
        operatorId: selectedOperatorId,
        warehouseId: activeWarehouse.id,
        pinCode: operatorPin.trim(),
      });
      if (pinError) throw pinError;
      if (!pinValid) {
        alert('PIN de operador inválido.');
        return;
      }

      const { error } = await openPosSession({
        warehouseId: activeWarehouse.id,
        openingBalance: Number(openingBalance || 0),
        operatorId: selectedOperatorId,
      });
      if (error) throw error;

      setOpeningBalance('');
      setSelectedOperatorId('');
      setOperatorPin('');
      await loadSession();
    } catch (error) {
      console.error('Error abriendo turno:', error);
      alert(`No se pudo abrir el turno: ${error.message || error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMovement = async () => {
    if (!session?.id) return;
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
        sessionId: session.id,
        movementType: movementModal.movementType,
        amount: Number(movementModal.amount || 0),
        reason: movementModal.reason.trim(),
      });
      if (error) throw error;

      setMovementModal(initialMovementModal);
      await loadSession();
    } catch (error) {
      console.error('Error registrando movimiento de caja:', error);
      alert(`No se pudo registrar el movimiento: ${error.message || error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseSession = async () => {
    if (!session?.id) return;

    const closingBalance = Number(closingModal.closingBalance || 0);
    if (closingBalance < 0) {
      alert('El efectivo fisico no puede ser negativo.');
      return;
    }
    if (!session.operator?.id) {
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
        operatorId: session.operator.id,
        warehouseId: activeWarehouse.id,
        pinCode: closingModal.pinCode.trim(),
      });
      if (pinError) throw pinError;
      if (!pinValid) {
        alert('PIN de operador inválido. No se puede cerrar el turno.');
        return;
      }

      const { error } = await closePosSession({
        sessionId: session.id,
        closingBalance,
        difference,
      });
      if (error) throw error;

      setClosingModal(initialClosingModal);
      await loadSession();

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
          </div>
        </div>

        {!session ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-2xl">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center mb-5">
              <Wallet size={26} className="text-[#4C3073]" />
            </div>
            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Sin sesion activa</p>
            <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Abrir Turno de Caja</h2>
            <p className="text-sm text-gray-500 mt-2 mb-6">Registra el efectivo inicial disponible en gaveta para comenzar a operar este turno.</p>

            {operators.length === 0 && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">No hay operadores POS creados para esta sucursal</p>
                <button
                  type="button"
                  onClick={() => navigate('/operadores-pos')}
                  className="mt-3 rounded-xl bg-[#4C3073] px-4 py-2.5 text-[11px] font-black uppercase text-white"
                >
                  Crear Operadores POS
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 max-w-3xl">
              <FieldBlock label="Operador POS">
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

              <FieldBlock label="PIN del Operador">
                <input
                  type="password"
                  inputMode="numeric"
                  value={operatorPin}
                  onChange={(e) => setOperatorPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold tracking-[0.3em] outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                  placeholder="0000"
                />
              </FieldBlock>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-sm">
              <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-200">
                <p className="text-[11px] font-black text-gray-500 uppercase">Monto Inicial en Efectivo</p>
              </div>
              <div className="p-4">
                <input
                  type="number"
                  min="0"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                  placeholder="0"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenSession}
              disabled={submitting}
              className="mt-6 inline-flex items-center gap-3 rounded-xl bg-[#4C3073] px-6 py-3 text-sm font-black uppercase text-white hover:bg-[#3f285f] transition-colors disabled:opacity-40"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Wallet size={18} />}
              Abrir Turno
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="Efectivo Inicial" value={fmtCLP(session.opening_balance)} icon={Wallet} accent="text-[#4C3073]" />
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
                    <p className="text-xs text-gray-500 mt-1">Operador activo: <span className="font-black text-gray-700 uppercase">{session.operator?.full_name || 'Sin operador asociado'}</span></p>
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
                      Cerrar Turno (Arqueo)
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-[#f8f9fa] p-5">
                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Efectivo Esperado en Gaveta</p>
                    <p className="text-3xl font-black text-[#4C3073]">{fmtCLP(expectedCash)}</p>
                    <p className="text-xs text-gray-500 mt-2">Inicial + Ventas Efectivo + Entradas - Salidas.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SummaryMiniCard label="Sesion" value={session.status} />
                    <SummaryMiniCard label="Ventas Cash" value={`${summary?.sales?.length || 0} comprobantes`} />
                    <SummaryMiniCard label="Movimientos" value={`${summary?.movements?.length || 0} registros`} />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-4">
                  <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Movimientos de Caja</p>
                </div>
                <div className="p-4 max-h-[420px] overflow-auto divide-y divide-gray-100">
                  {(summary?.movements?.length || 0) === 0 ? (
                    <div className="py-12 text-center text-gray-400">
                      <Wallet size={28} className="mx-auto mb-3" />
                      <p className="text-[11px] font-black uppercase tracking-widest">Sin movimientos registrados</p>
                    </div>
                  ) : (
                    summary.movements.map((movement) => (
                      <div key={movement.id} className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-gray-900 uppercase">{movement.movement_type === 'IN' ? 'Entrada de Efectivo' : 'Salida de Efectivo'}</p>
                            <p className="text-xs text-gray-500 mt-1">{movement.reason || 'Sin detalle'}</p>
                          </div>
                          <span className={`text-sm font-black ${movement.movement_type === 'IN' ? 'text-green-700' : 'text-red-600'}`}>
                            {movement.movement_type === 'IN' ? '+' : '-'}{fmtCLP(movement.amount)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-4">
                <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Ventas del Turno</p>
              </div>
              <div className="overflow-x-auto">
                {(summary?.sales?.length || 0) === 0 ? (
                  <div className="py-14 text-center text-gray-400">
                    <Banknote size={28} className="mx-auto mb-3" />
                    <p className="text-[11px] font-black uppercase tracking-widest">Sin ventas cash asociadas a esta sesion</p>
                  </div>
                ) : (
                  <table className="min-w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-white">
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Documento</th>
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Fecha</th>
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Pago</th>
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {summary.sales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 text-sm font-black text-gray-900">{sale.document_number || sale.id.slice(0, 8)}</td>
                          <td className="px-5 py-3 text-sm text-gray-600">{new Date(sale.created_at).toLocaleString('es-CL')}</td>
                          <td className="px-5 py-3 text-sm font-bold text-gray-500">{sale.payment_method}</td>
                          <td className="px-5 py-3 text-sm font-black text-right text-green-700">{fmtCLP(sale.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="bg-gray-50/50 border-b border-gray-200 px-6 py-4">
                <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Historial de Turnos Cerrados</p>
              </div>
              <div className="overflow-x-auto">
                {closedSessions.length === 0 ? (
                  <div className="py-14 text-center text-gray-400">
                    <ShieldAlert size={28} className="mx-auto mb-3" />
                    <p className="text-[11px] font-black uppercase tracking-widest">No hay cierres previos para este usuario en la sucursal activa</p>
                  </div>
                ) : (
                  <table className="min-w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-white">
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Operador</th>
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Apertura</th>
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest">Cierre</th>
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Esperado</th>
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Contado</th>
                        <th className="px-5 py-3 text-[11px] font-black text-gray-500 uppercase tracking-widest text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {closedSessions.map((closedSession) => {
                        const sessionExpectedCash = Number(closedSession.summary?.expectedCash || 0);
                        const sessionDifference = Number(closedSession.difference || 0);
                        return (
                          <tr key={closedSession.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-sm font-black text-gray-900 uppercase">{closedSession.operator?.full_name || 'Sin operador'}</td>
                            <td className="px-5 py-3 text-sm text-gray-600">{closedSession.start_time ? new Date(closedSession.start_time).toLocaleString('es-CL') : '—'}</td>
                            <td className="px-5 py-3 text-sm text-gray-600">{closedSession.end_time ? new Date(closedSession.end_time).toLocaleString('es-CL') : '—'}</td>
                            <td className="px-5 py-3 text-sm font-black text-right text-blue-700">{fmtCLP(sessionExpectedCash)}</td>
                            <td className="px-5 py-3 text-sm font-black text-right text-gray-800">{fmtCLP(closedSession.closing_balance)}</td>
                            <td className={`px-5 py-3 text-sm font-black text-right ${sessionDifference === 0 ? 'text-emerald-700' : sessionDifference > 0 ? 'text-amber-700' : 'text-red-600'}`}>
                              {sessionDifference === 0 ? fmtCLP(0) : `${sessionDifference > 0 ? '+' : '-'}${fmtCLP(Math.abs(sessionDifference))}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>

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
