import React from 'react';

export default function PurchaseOrderCancelModal({
  open,
  cancelReason,
  onCancelReasonChange,
  onClose,
  onConfirm,
  cancelling,
}) {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '560px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', color: '#111827' }}>
        <h3 className="text-lg font-black text-[#4C3073]">Anular orden</h3>
        <p className="mt-2 text-sm text-slate-600">Esta accion no elimina la orden, solo la marca como anulada.</p>
        <textarea
          value={cancelReason}
          onChange={(e) => onCancelReasonChange(e.target.value)}
          rows="4"
          placeholder="Indique el motivo de la anulacion"
          className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
        />
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={cancelling || !cancelReason.trim()}
            className="rounded-xl border border-red-600 bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelling ? 'Anulando...' : 'Confirmar anulacion'}
          </button>
        </div>
      </div>
    </div>
  );
}
