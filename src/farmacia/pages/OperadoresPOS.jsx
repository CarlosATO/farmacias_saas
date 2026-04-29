import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Pencil, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { useSucursal } from '../context/SucursalContext';
import { createPosOperator, fetchPosOperators, resetPosOperatorPin, updatePosOperator } from '../api/pharmacyClient';

const initialForm = {
  fullName: '',
  pinCode: '',
};

const initialEditModal = {
  open: false,
  operator: null,
  fullName: '',
  pinCode: '',
  isActive: true,
};

export default function OperadoresPOS() {
  const { activeWarehouse } = useSucursal();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operators, setOperators] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editModal, setEditModal] = useState(initialEditModal);

  const loadOperators = async () => {
    if (!activeWarehouse?.id) {
      setOperators([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await fetchPosOperators(activeWarehouse.id);
      if (error) throw error;
      setOperators(data || []);
    } catch (error) {
      console.error('Error cargando operadores POS:', error);
      alert(`No se pudieron cargar los operadores POS: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperators();
  }, [activeWarehouse?.id]);

  const handleCreate = async () => {
    if (!activeWarehouse?.id) {
      alert('Debes seleccionar una sucursal antes de crear operadores POS.');
      return;
    }

    if (!form.fullName.trim()) {
      alert('Debes ingresar el nombre del operador.');
      return;
    }

    if (!/^\d{4}$/.test(form.pinCode.trim())) {
      alert('El PIN debe tener exactamente 4 dígitos.');
      return;
    }

    setSaving(true);
    try {
      const { data: createdOperator, error } = await createPosOperator({
        warehouseId: activeWarehouse.id,
        fullName: form.fullName.trim().toUpperCase(),
        pinCode: form.pinCode.trim(),
      });
      if (error) {
        if (error.code === '23505') {
          await loadOperators();
          alert('Ya existe un operador POS con ese nombre en esta sucursal. Si no lo ves, revisa la lista actualizada a la derecha.');
          return;
        }
        throw error;
      }

      setForm(initialForm);

      if (createdOperator) {
        setOperators((current) => {
          const alreadyExists = current.some((operator) => operator.id === createdOperator.id);
          if (alreadyExists) return current;
          return [createdOperator, ...current];
        });
      }

      const { data: reloadedOperators, error: reloadError } = await fetchPosOperators(activeWarehouse.id);
      if (!reloadError && Array.isArray(reloadedOperators) && reloadedOperators.length > 0) {
        setOperators(reloadedOperators);
      } else if (!createdOperator) {
        alert('El operador se procesó, pero no fue posible confirmarlo en la lista. Revisa permisos/RLS de la tabla pharmacy.pos_operators.');
      }
    } catch (error) {
      console.error('Error creando operador POS:', error);
      alert(`No se pudo crear el operador POS: ${error.message || error}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleOperator = async (operator) => {
    setSaving(true);
    try {
      const { error } = await updatePosOperator({
        operatorId: operator.id,
        fullName: operator.full_name,
        isActive: !operator.is_active,
      });
      if (error) throw error;
      await loadOperators();
    } catch (error) {
      console.error('Error actualizando operador POS:', error);
      alert(`No se pudo actualizar el operador POS: ${error.message || error}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOperator = async () => {
    if (!editModal.operator?.id || !activeWarehouse?.id) return;
    if (!editModal.fullName.trim()) {
      alert('Debes ingresar el nombre del operador.');
      return;
    }
    if (editModal.pinCode && !/^\d{4}$/.test(editModal.pinCode.trim())) {
      alert('El nuevo PIN debe tener exactamente 4 dígitos.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await updatePosOperator({
        operatorId: editModal.operator.id,
        fullName: editModal.fullName.trim().toUpperCase(),
        isActive: editModal.isActive,
      });
      if (updateError) throw updateError;

      if (editModal.pinCode.trim()) {
        const { error: pinError } = await resetPosOperatorPin({
          operatorId: editModal.operator.id,
          warehouseId: activeWarehouse.id,
          pinCode: editModal.pinCode.trim(),
        });
        if (pinError) throw pinError;
      }

      setEditModal(initialEditModal);
      await loadOperators();
    } catch (error) {
      console.error('Error guardando operador POS:', error);
      alert(`No se pudo guardar el operador POS: ${error.message || error}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 bg-[#f8f9fa] min-h-full">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Configuracion / Operadores POS</p>
              <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Operadores de Caja</h1>
              <p className="text-sm text-gray-500 mt-2">Cajeros operativos por sucursal. Se usan para abrir turnos y controlar sesiones de caja.</p>
            </div>
            <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 text-right">
              <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Sucursal</p>
              <p className="text-sm font-black text-[#4C3073] uppercase">{activeWarehouse?.name || 'Sin sucursal'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-200 px-5 py-4">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Nuevo Operador</p>
            </div>
            <div className="p-5 space-y-4">
              <FieldBlock label="Nombre del Cajero">
                <input
                  value={form.fullName}
                  onChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                  placeholder="Ej: MARIA PEREZ"
                />
              </FieldBlock>

              <FieldBlock label="PIN de 4 Digitos">
                <input
                  value={form.pinCode}
                  onChange={(e) => setForm((current) => ({ ...current, pinCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold tracking-[0.3em] outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                  placeholder="0000"
                  inputMode="numeric"
                />
              </FieldBlock>

              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#4C3073] px-5 py-3 text-[11px] font-black uppercase text-white hover:bg-[#3f285f] disabled:opacity-40"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Crear Operador POS
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-200 px-5 py-4">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Operadores Registrados</p>
            </div>

            {loading ? (
              <div className="py-16 text-center text-gray-400">
                <Loader2 size={28} className="animate-spin mx-auto mb-3 text-[#4C3073]" />
                <p className="text-[11px] font-black uppercase tracking-widest">Cargando operadores...</p>
              </div>
            ) : operators.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <UserRound size={28} className="mx-auto mb-3" />
                <p className="text-[11px] font-black uppercase tracking-widest">No hay operadores POS para esta sucursal</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {operators.map((operator) => (
                  <div key={operator.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900 uppercase truncate">{operator.full_name}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${operator.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                          <ShieldCheck size={12} />
                          {operator.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase bg-purple-50 text-[#4C3073] border border-purple-100">
                          <KeyRound size={12} />
                          PIN Protegido
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditModal({
                        open: true,
                        operator,
                        fullName: operator.full_name,
                        pinCode: '',
                        isActive: operator.is_active,
                      })}
                      disabled={saving}
                      className="rounded-xl px-4 py-2.5 text-[11px] font-black uppercase border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <span className="inline-flex items-center gap-2"><Pencil size={13} /> Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleOperator(operator)}
                      disabled={saving}
                      className={`rounded-xl px-4 py-2.5 text-[11px] font-black uppercase border ${operator.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'} disabled:opacity-40`}
                    >
                      {operator.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editModal.open && (
        <div className="fixed inset-0 z-[140] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Editar Operador POS</p>
              <button type="button" onClick={() => setEditModal(initialEditModal)} className="rounded-lg border border-gray-300 px-3 py-2 text-[11px] font-black uppercase text-gray-600">Cerrar</button>
            </div>
            <div className="p-5 space-y-4">
              <FieldBlock label="Nombre del Cajero">
                <input
                  value={editModal.fullName}
                  onChange={(e) => setEditModal((current) => ({ ...current, fullName: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                />
              </FieldBlock>

              <FieldBlock label="Nuevo PIN de 4 Digitos (Opcional)">
                <input
                  value={editModal.pinCode}
                  onChange={(e) => setEditModal((current) => ({ ...current, pinCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold tracking-[0.3em] outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                  placeholder="Dejar vacio para no cambiar"
                  inputMode="numeric"
                />
              </FieldBlock>

              <label className="inline-flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700">
                <input
                  type="checkbox"
                  checked={editModal.isActive}
                  onChange={(e) => setEditModal((current) => ({ ...current, isActive: e.target.checked }))}
                />
                Operador Activo
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditModal(initialEditModal)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-[11px] font-black uppercase text-gray-700">Cancelar</button>
                <button type="button" onClick={handleSaveOperator} disabled={saving} className="rounded-xl bg-[#4C3073] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-40">
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
