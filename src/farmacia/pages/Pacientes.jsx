import React from 'react';
import { Users } from 'lucide-react';

export default function Pacientes() {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex items-center gap-3 text-emerald-700 mb-6">
        <Users size={32} />
        <h1 className="text-3xl font-black tracking-tight">Directorio de Pacientes</h1>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
        <p className="text-lg font-medium">Buscando historiales clínicos...</p>
        <p className="text-sm mt-2">Mantenimiento de perfiles de farmacia en construcción.</p>
      </div>
    </div>
  );
}
