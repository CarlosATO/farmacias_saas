import React from 'react';
import { Users, ChevronRight, Search } from 'lucide-react';

export default function Pacientes() {
  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm">
      <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shrink-0">
        <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-widest font-bold">
          <span>Farmacia</span>
          <ChevronRight size={12} className="mx-1" />
          <span className="text-gray-900">Directorio de Pacientes</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button 
              className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95"
            >
              Nuevo Paciente
            </button>
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por RUT o Nombre..." 
              className="block w-full rounded-sm border-gray-300 border pl-8 pr-3 py-1.5 text-xs focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all" 
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/30 flex items-center justify-center p-8">
        <div className="bg-white rounded-sm shadow-sm border border-gray-200 p-12 text-center max-w-md w-full">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-black text-gray-800 mb-2">Buscando historiales clínicos...</h3>
            <p className="text-sm text-gray-500">Mantenimiento de perfiles de farmacia en construcción.</p>
        </div>
      </div>
    </div>
  );
}
