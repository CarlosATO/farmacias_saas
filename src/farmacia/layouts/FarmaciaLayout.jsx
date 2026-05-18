import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';
import { useSucursal } from '../context/SucursalContext';
import {
  ArrowRightLeft,
  Building2,
  DollarSign,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Pill,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  Stethoscope,
  Truck,
  User,
  Wallet,
  Warehouse,
} from 'lucide-react';

const RIBBON_TABS = [
  {
    id: 'principal',
    label: 'Principal',
    type: 'link',
    to: '/',
    icon: LayoutDashboard,
    match: ['/'],
    exact: true,
    items: [
      { to: '/', label: 'Gerencial', icon: LayoutDashboard, match: ['/'], exact: true },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    type: 'group',
    match: ['/inventario', '/reposicion-inteligente', '/administracion/medicamentos', '/mapa-lotes', '/kardex', '/traspasos', '/recepcion-traspasos'],
    items: [
      { to: '/inventario', label: 'Inventario', icon: Package, match: ['/inventario'] },
      { to: '/reposicion-inteligente', label: 'Reposición', icon: ShoppingCart, match: ['/reposicion-inteligente'] },
      { to: '/administracion/medicamentos', label: 'Catalogo', icon: Pill, match: ['/administracion/medicamentos'] },
      { to: '/mapa-lotes', label: 'Mapa de Lotes', icon: Warehouse, match: ['/mapa-lotes'] },
      { to: '/kardex', label: 'Kardex', icon: Receipt, match: ['/kardex'] },
      { to: '/traspasos', label: 'Emitir Traspasos', icon: ArrowRightLeft, match: ['/traspasos'] },
      { to: '/recepcion-traspasos', label: 'Recepcion Traspasos', icon: ArrowRightLeft, match: ['/recepcion-traspasos'] },
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    type: 'group',
    match: ['/pos', '/control-caja', '/pricing', '/recetas', '/documentos-tributarios'],
    items: [
      { to: '/pos', label: 'POS', icon: ShoppingCart, match: ['/pos'] },
      { to: '/control-caja', label: 'Control de Caja', icon: Wallet, match: ['/control-caja'] },
      { to: '/pricing', label: 'Precios', icon: DollarSign, match: ['/pricing'] },
      { to: '/recetas', label: 'Recetas', icon: FileText, match: ['/recetas'] },
      { to: '/documentos-tributarios', label: 'DTE Interno', icon: Receipt, match: ['/documentos-tributarios'] },
      { to: '/devoluciones', label: 'Devoluciones', icon: RotateCcw, match: ['/devoluciones'] },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    type: 'link',
    to: '/logistica',
    icon: Truck,
    match: ['/logistica'],
    items: [
      { to: '/logistica', label: 'Ordenes de Compra', icon: Truck, match: ['/logistica'] },
    ],
  },
  {
    id: 'entidades',
    label: 'Entidades',
    type: 'group',
    match: ['/pacientes', '/medicos', '/administracion/proveedores'],
    items: [
      { to: '/pacientes', label: 'Pacientes', icon: User, match: ['/pacientes'] },
      { to: '/medicos', label: 'Directorio Médico', icon: Stethoscope, match: ['/medicos'] },
      { to: '/administracion/proveedores', label: 'Proveedores', icon: Building2, match: ['/administracion/proveedores'] },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuracion',
    type: 'group',
    match: ['/sucursales', '/mapa-logistico', '/operadores-pos', '/auditoria'],
    items: [
      { to: '/sucursales', label: 'Sucursales', icon: Building2, match: ['/sucursales'] },
      { to: '/operadores-pos', label: 'Operadores POS', icon: User, match: ['/operadores-pos'] },
      { to: '/auditoria', label: 'Auditoria', icon: FileText, match: ['/auditoria'] },
      { to: '/mapa-logistico', label: 'Ubicaciones', icon: MapPin, match: ['/mapa-logistico'] },
      { to: '/documentos-tributarios', label: 'SII (DTE)', icon: Settings, match: ['/documentos-tributarios'] },
    ],
  },
];

const matchesPath = (pathname, item) => {
  if (!item.match || item.match.length === 0) return false;
  return item.match.some((basePath) => {
    if (item.exact) return pathname === basePath;
    return pathname === basePath || pathname.startsWith(`${basePath}/`);
  });
};

export default function FarmaciaLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeWarehouse, setActiveWarehouse, warehouses } = useSucursal();
  const [userRole, setUserRole] = useState('Farmaceutico');
  const [userName, setUserName] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState('principal');

  const fetchUserData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const emailName = user.email?.split('@')[0] || 'usuario';
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || emailName;
      setUserName(fullName);
      setUserRole(user.app_metadata?.role || 'MEMBER');
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  useEffect(() => {
    const matchedTab = RIBBON_TABS.find((tab) => matchesPath(location.pathname, tab) || tab.items.some((item) => matchesPath(location.pathname, item)));
    setActiveTab(matchedTab?.id || 'principal');
  }, [location.pathname]);

  const displayName = useMemo(() => userName.toUpperCase(), [userName]);
  const initials = useMemo(() => displayName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || 'US', [displayName]);
  const currentTab = useMemo(() => RIBBON_TABS.find((tab) => tab.id === activeTab) || RIBBON_TABS[0], [activeTab]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error cerrando sesion:', error);
    } finally {
      window.location.href = import.meta.env.VITE_PORTAL_URL || 'http://localhost:3000/login';
    }
  };

  if (loadingData) {
    return (
      <div className="h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4C3073]"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] text-gray-900 overflow-hidden">
      <header className="shrink-0 border-b border-gray-200 bg-white shadow-sm z-[120]">
        <div className="bg-[#4C3073] border-b border-white/10">
          <div className="h-14 px-4 lg:px-6 flex items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3 min-w-0 overflow-hidden">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center gap-2 shrink-0"
              >
                <span className="bg-white text-[#4C3073] px-2 py-1 rounded text-[10px] font-black">DX</span>
                <span className="hidden xl:block text-[11px] font-black uppercase tracking-widest text-white whitespace-nowrap">FarmaDATIX SaaS</span>
              </button>

              <div className="flex items-end self-end min-w-0 overflow-x-auto no-scrollbar">
                {RIBBON_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        if (tab.type === 'link' && tab.to) navigate(tab.to);
                      }}
                      className={`px-3 py-3 text-[10px] md:text-[11px] font-black uppercase tracking-wider whitespace-nowrap border-t border-l border-r transition-colors ${isActive
                        ? 'bg-white text-[#4C3073] border-white rounded-t-lg'
                        : 'bg-transparent text-white/75 border-transparent hover:text-white'
                        }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 w-[150px] md:w-[200px] xl:w-[250px]">
                <MapPin size={16} className="text-white/70 shrink-0" />
                <label htmlFor="warehouse-selector-top" className="hidden md:block text-[10px] font-black text-white/60 uppercase tracking-widest shrink-0">Sucursal</label>
                <select
                  id="warehouse-selector-top"
                  value={activeWarehouse?.id || ''}
                  onChange={(e) => {
                    const selected = warehouses.find((warehouse) => warehouse.id === e.target.value);
                    if (selected) setActiveWarehouse(selected);
                  }}
                  className="bg-transparent text-xs xl:text-sm font-black text-white outline-none min-w-0 flex-1"
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id} className="text-gray-800">
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                  {initials}
                </div>
                <div className="hidden 2xl:block text-right leading-tight min-w-0">
                  <p className="text-[10px] font-black text-white uppercase">{displayName}</p>
                  <p className="text-[9px] font-bold text-white/55 uppercase tracking-wide">{userRole}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 text-[11px] font-black uppercase text-white hover:bg-white/15 transition-colors"
              >
                <LogOut size={16} />
                <span className="hidden 2xl:inline">Cerrar Sesion</span>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border-t border-gray-100 shadow-sm">
          <div className="px-4 lg:px-6 py-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 min-w-max">
              {currentTab.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.to ? matchesPath(location.pathname, item) : false;

                if (item.disabled) {
                  return (
                    <div
                      key={`${currentTab.id}-${item.label}`}
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold uppercase text-gray-300 cursor-not-allowed"
                    >
                      <Icon size={16} className="text-gray-300" />
                      <span>{item.label}</span>
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors ${isActive
                      ? 'bg-[#4C3073] text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <Icon size={16} className={isActive ? 'text-white' : 'text-gray-400'} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>

      </header>

      <main className="flex-1 overflow-auto bg-[#f8f9fa]">
        <Outlet />
      </main>
    </div>
  );
}
