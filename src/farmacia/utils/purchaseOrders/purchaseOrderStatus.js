const STATUS_META = {
  DRAFT: { label: 'Borrador', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  WAITING_APPROVAL: { label: 'Pend. aprobación', className: 'bg-violet-50 text-violet-700 border-violet-100' },
  APPROVED: { label: 'Aprobada', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  PENDING: { label: 'Emitida', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  RECEIVED: { label: 'Recibida', className: 'bg-green-50 text-green-700 border-green-100' },
  CANCELLED: { label: 'Anulada', className: 'bg-red-50 text-red-700 border-red-100' },
  PARTIAL: { label: 'Parcial', className: 'bg-orange-50 text-orange-700 border-orange-100' },
};

export const getPurchaseOrderStatusMeta = (status) => STATUS_META[status] || { label: status || 'Sin estado', className: 'bg-gray-50 text-gray-700 border-gray-200' };
