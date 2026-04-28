import React, { useState, useEffect } from 'react';
import { X, Receipt, Building2, Banknote, CreditCard, Send, CheckCircle2, Loader2 } from 'lucide-react';

const CheckoutModal = ({ total, onClose, onConfirm, isProcessing }) => {
  const [docType, setDocType] = useState('BOLETA'); // BOLETA | FACTURA
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // CASH | CARD | TRANSFER
  const [receivedAmount, setReceivedAmount] = useState('');
  const [facturaData, setFacturaData] = useState({
    rut: '',
    razonSocial: '',
    giro: '',
    direccion: ''
  });

  const change = Number(receivedAmount) - total;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !isProcessing) {
        if (paymentMethod === 'CASH' && change < 0) return;
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [docType, paymentMethod, receivedAmount, isProcessing, change]);

  const handleConfirm = () => {
    const saleHeader = {
      total_amount: total,
      payment_method: paymentMethod,
      document_type: docType,
      document_number: `${docType === 'BOLETA' ? 'BOL' : 'FAC'}-${Date.now().toString().slice(-6)}`,
      // patient_id se mantiene nulo por ahora o se hereda del carro si existe
    };
    onConfirm(saleHeader);
  };

  const fmtCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-[#4C3073] p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Receipt size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Finalizar Venta</h2>
              <p className="text-xs text-white/60 font-bold uppercase">Seleccione documento y medio de pago</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 flex flex-col gap-8">
          {/* Total Display */}
          <div className="bg-gray-50 rounded-2xl p-8 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Total a Pagar</span>
            <span className="text-6xl font-black text-slate-900 tracking-tighter">
              {fmtCLP(total)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-8">
            {/* Left Column: Config */}
            <div className="space-y-6">
              {/* Document Type */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Tipo de Documento</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                  <button
                    onClick={() => setDocType('BOLETA')}
                    className={`flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-black transition-all ${docType === 'BOLETA' ? 'bg-white text-[#4C3073] shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <Receipt size={16} /> BOLETA
                  </button>
                  <button
                    onClick={() => setDocType('FACTURA')}
                    className={`flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-black transition-all ${docType === 'FACTURA' ? 'bg-white text-[#4C3073] shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <Building2 size={16} /> FACTURA
                  </button>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Método de Pago</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPaymentMethod('CASH')}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${paymentMethod === 'CASH' ? 'border-[#4C3073] bg-purple-50 text-[#4C3073]' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                  >
                    <Banknote size={20} />
                    <span className="text-[10px] font-black uppercase">Efectivo</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('CARD')}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${paymentMethod === 'CARD' ? 'border-[#4C3073] bg-purple-50 text-[#4C3073]' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                  >
                    <CreditCard size={20} />
                    <span className="text-[10px] font-black uppercase">Tarjeta</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('TRANSFER')}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${paymentMethod === 'TRANSFER' ? 'border-[#4C3073] bg-purple-50 text-[#4C3073]' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                  >
                    <Send size={20} />
                    <span className="text-[10px] font-black uppercase">Transf.</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Contextual Forms */}
            <div className="bg-gray-50 rounded-2xl p-6 min-h-[250px]">
              {paymentMethod === 'CASH' && (
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Monto Recibido</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-gray-300">$</span>
                      <input
                        autoFocus
                        type="number"
                        value={receivedAmount}
                        onChange={(e) => setReceivedAmount(e.target.value)}
                        placeholder="0"
                        className="w-full pl-10 pr-4 py-4 text-3xl font-black text-[#4C3073] border-2 border-gray-200 rounded-xl outline-none focus:border-[#4C3073] transition-all bg-white"
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Vuelto</span>
                      <span className={`text-4xl font-black ${change < 0 ? 'text-red-500 text-lg' : 'text-emerald-600'}`}>
                        {change < 0 ? 'Falta dinero' : fmtCLP(change)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {(paymentMethod !== 'CASH' && docType === 'BOLETA') && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <h4 className="font-black text-gray-700 uppercase tracking-tight">Listo para procesar</h4>
                    <p className="text-xs text-gray-400">Presione confirmar para finalizar la transacción vía {paymentMethod === 'CARD' ? 'tarjeta' : 'transferencia'}.</p>
                  </div>
                </div>
              )}

              {docType === 'FACTURA' && (
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Datos de Facturación</label>
                    <input 
                      placeholder="RUT Empresa" 
                      className="w-full border border-gray-200 p-2 text-xs rounded outline-none focus:border-[#4C3073] bg-white"
                      value={facturaData.rut}
                      onChange={e => setFacturaData({...facturaData, rut: e.target.value})}
                    />
                    <input 
                      placeholder="Razón Social" 
                      className="w-full border border-gray-200 p-2 text-xs rounded outline-none focus:border-[#4C3073] bg-white"
                      value={facturaData.razonSocial}
                      onChange={e => setFacturaData({...facturaData, razonSocial: e.target.value})}
                    />
                    <input 
                      placeholder="Giro" 
                      className="w-full border border-gray-200 p-2 text-xs rounded outline-none focus:border-[#4C3073] bg-white"
                      value={facturaData.giro}
                      onChange={e => setFacturaData({...facturaData, giro: e.target.value})}
                    />
                    <input 
                      placeholder="Dirección" 
                      className="w-full border border-gray-200 p-2 text-xs rounded outline-none focus:border-[#4C3073] bg-white"
                      value={facturaData.direccion}
                      onChange={e => setFacturaData({...facturaData, direccion: e.target.value})}
                    />
                 </div>
              )}
            </div>
          </div>

          {/* Confirm Button */}
          <button
            disabled={isProcessing || (paymentMethod === 'CASH' && change < 0)}
            onClick={handleConfirm}
            className={`w-full py-6 rounded-2xl flex items-center justify-center gap-3 text-xl font-black uppercase tracking-widest transition-all active:scale-95 ${
              isProcessing || (paymentMethod === 'CASH' && change < 0) 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xl shadow-emerald-600/20'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={24} className="animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                Confirmar Venta
                <span className="text-[10px] bg-white/20 px-2 py-1 rounded ml-4 font-normal">Enter</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutModal;
