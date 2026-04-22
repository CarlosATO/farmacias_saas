import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';
import { LayoutDashboard, Pill, FileText, Users, LogOut, ShoppingCart, Truck } from 'lucide-react';

export default function FarmaciaLayout() {
  const location = useLocation();
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('Farmacéutico');
  
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserName(user.email.split('@')[0]);
        if (user.app_metadata?.role) {
            setUserRole(user.app_metadata.role);
        }
      }
    };
    fetchUser();
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, exact: true },
    { name: 'Terminal POS', path: '/pos', icon: ShoppingCart },
    { name: 'Pedidos (Logística)', path: '/logistica', icon: Truck },
    { name: 'Inventario (ISP)', path: '/inventario', icon: Pill },
    { name: 'Recetas Electrónicas', path: '/recetas', icon: FileText },
    { name: 'Pacientes', path: '/pacientes', icon: Users },
  ];

  const isActive = (itemPath, exact) => {
    if (exact) return location.pathname === itemPath;
    return location.pathname.startsWith(itemPath);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-emerald-700">
            <Pill size={24} className="stroke-[2.5px]" />
            <span className="text-lg font-black tracking-tight">DATIX Farmacia</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 mt-4">Navegación</p>
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.path, item.exact) 
                  ? 'bg-emerald-50 text-emerald-700' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon size={18} />
              {item.name}
            </Link>
          ))}
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 mt-6">Administración</p>
          <Link to="/administracion/proveedores" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/administracion/proveedores') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
            <Users size={18} /> Proveedores Médicos
          </Link>
          <Link to="/administracion/medicamentos" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive('/administracion/medicamentos') ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
            <Pill size={18} /> Catálogo Medicamentos
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
              {userName ? userName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold text-slate-700 truncate">{userName || 'Usuario'}</p>
              <p className="text-xs text-slate-500 truncate capitalize">{userRole.toLowerCase()}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 md:justify-end shadow-[0_1px_2px_rgba(0,0,0,0.02)] z-10 transition-all">
          <div className="flex items-center gap-2 text-emerald-700 md:hidden">
            <Pill size={24} className="stroke-[2.5px]" />
            <span className="text-lg font-black tracking-tight">Farmacia</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="http://localhost:3000/portal" className="text-sm font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-red-50">
              <LogOut size={16} /> Salir al Portal
            </a>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
