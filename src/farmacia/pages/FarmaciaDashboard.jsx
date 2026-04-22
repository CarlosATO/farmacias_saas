import React from 'react';
import { FileText, AlertTriangle, Users, Activity } from 'lucide-react';

export default function FarmaciaDashboard() {
  return (
    <div className="animate-in fade-in zoom-in duration-300">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard General</h1>
          <p className="text-slate-500 text-sm mt-1">Resumen de operaciones del dispensario.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-6 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-[0.03] text-blue-600">
            <FileText size={100} />
          </div>
          <div className="flex items-center gap-4 relative">
            <div className="p-3.5 rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recetas Pendientes</p>
              <h3 className="text-3xl font-black text-slate-800">12</h3>
            </div>
          </div>
          <div className="mt-5 text-sm text-blue-600 font-medium flex items-center gap-1.5 cursor-pointer hover:underline">
            <span>Ver listado</span>
            <span>&rarr;</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-6 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-[0.03] text-orange-600">
            <AlertTriangle size={100} />
          </div>
          <div className="flex items-center gap-4 relative">
            <div className="p-3.5 rounded-lg bg-orange-50 text-orange-600 ring-1 ring-orange-100">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Stock Crítico (FEFO)</p>
              <h3 className="text-3xl font-black text-slate-800">8 <span className="text-sm font-medium text-slate-400 ml-1">Items</span></h3>
            </div>
          </div>
          <div className="mt-5 text-sm text-orange-600 font-medium flex items-center gap-1.5 cursor-pointer hover:underline">
            <span>Reabastecer bodega</span>
            <span>&rarr;</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-6 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-[0.03] text-emerald-600">
            <Users size={100} />
          </div>
          <div className="flex items-center gap-4 relative">
            <div className="p-3.5 rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Users size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pacientes Registrados</p>
              <h3 className="text-3xl font-black text-slate-800">1,204</h3>
            </div>
          </div>
          <div className="mt-5 text-sm text-emerald-600 font-medium flex items-center gap-1.5 cursor-pointer hover:underline">
            <span>Ir al directorio</span>
            <span>&rarr;</span>
          </div>
        </div>
      </div>
      
      {/* Gráfico Placeholder */}
      <div className="mt-8 bg-white border border-slate-200/60 rounded-xl p-8 flex flex-col items-center justify-center min-h-[300px] text-slate-400 shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-50 to-white"></div>
        <Activity size={48} className="mb-4 opacity-50 relative" />
        <h4 className="text-lg font-bold text-slate-500 relative">Métricas Semanales</h4>
        <p className="text-slate-400 text-sm max-w-md text-center mt-2 relative">
          Estamos recopilando datos de dispensación para generar esta sección analítica.
        </p>
      </div>
    </div>
  );
}
