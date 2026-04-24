import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';
import { useSucursal } from '../context/SucursalContext';

// Icons
import {
    LayoutDashboard,
    Pill,
    FileText,
    Users,
    LogOut,
    ShoppingCart,
    Truck,
    DollarSign,
    MapPin,
    ArrowRightLeft,
    Building2
} from 'lucide-react';

const buildRibbonTabs = () => {
    return [
        {
            id: 'inicio',
            label: 'Archivo',
            icon: LayoutDashboard,
            items: [
                { to: '/', label: 'Dashboard Principal', icon: LayoutDashboard },
            ],
        },
        {
            id: 'operaciones',
            label: 'Operaciones',
            icon: ShoppingCart,
            items: [
                { to: '/pos', label: 'Terminal POS', icon: ShoppingCart },
                { to: '/recetas', label: 'Recetas Electrónicas', icon: FileText },
                { to: '/pacientes', label: 'Gestión de Pacientes', icon: Users },
            ],
        },
        {
            id: 'logistica',
            label: 'Logística & WMS',
            icon: Truck,
            items: [
                { to: '/logistica', label: 'Órdenes de Compra', icon: Truck },
                { to: '/traspasos', label: 'Consola Traspasos', icon: ArrowRightLeft },
                { to: '/mapa-logistico', label: 'Bodegas y ubicaciones', icon: MapPin },
            ],
        },
        {
            id: 'catalogo',
            label: 'Catálogo & Precios',
            icon: Pill,
            items: [
                { to: '/administracion/medicamentos', label: 'Maestro Productos', icon: Pill },
                { to: '/inventario', label: 'Stock e Inventario', icon: Pill },
                { to: '/administracion/proveedores', label: 'Proveedores', icon: Users },
                { to: '/sucursales', label: 'Locales y Sedes', icon: Building2 },
                { to: '/pricing', label: 'Estrategia Precios', icon: DollarSign },
            ],
        },
    ];
};

export default function FarmaciaLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [userRole, setUserRole]           = useState('Farmacéutico');
    const [userName, setUserName]           = useState('');
    const [loadingData, setLoadingData]     = useState(true);
    
    // Global Branch Context
    const { activeWarehouse, setActiveWarehouse, warehouses } = useSucursal();

    // Excel-style Ribbon State
    const tabs = useMemo(() => buildRibbonTabs(), []);
    const [activeTabId, setActiveTabId] = useState(() => {
        const currentPath = window.location.pathname;
        const foundTab = tabs.find(t => t.items.some(i => i.to === currentPath || (i.to !== '/' && currentPath.startsWith(i.to))));
        return foundTab ? foundTab.id : 'inicio';
    });

    const fetchUserData = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserName(user.email.split('@')[0].toUpperCase());

            const role = user.app_metadata?.role || 'MEMBER';
            setUserRole(role);
        } catch (err) { console.error(err); } finally { setLoadingData(false); }
    }, []);

    useEffect(() => { 
        fetchUserData();
    }, [fetchUserData]);

    // Sync active tab with location (only when path changes)
    useEffect(() => {
        const currentPath = location.pathname;
        const foundTab = tabs.find(t => t.items.some(i => i.to === currentPath || (i.to !== '/' && currentPath.startsWith(i.to))));
        if (foundTab) {
            setActiveTabId(foundTab.id);
        }
    }, [location.pathname, tabs]);

    // Sync active tab with location (only when path changes)
    useEffect(() => {
        const currentPath = location.pathname;
        const foundTab = tabs.find(t => t.items.some(i => i.to === currentPath || (i.to !== '/' && currentPath.startsWith(i.to))));
        if (foundTab) {
            setActiveTabId(foundTab.id);
        }
    }, [location.pathname, tabs]);

    if (loadingData) return <div className="h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4C3073]"></div></div>;

    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

    return (
        <div className="flex flex-col h-screen font-sans text-white/90 text-[13px] overflow-hidden" style={{ backgroundColor: '#F3F4F6' }}>
            
            {/* TOP BAR: Brand & User (Excel Style Title Bar) */}
            <header 
              style={{ backgroundColor: '#4C3073' }}
              className="flex h-10 shrink-0 items-center justify-between px-4 text-white z-[110] border-b border-white/10"
            >
                <div className="flex items-center gap-4">
                    <div 
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        <span className="font-black tracking-tight text-white flex items-center gap-1.5 uppercase text-[11px]">
                            <span className="bg-white text-[#4C3073] px-1.5 py-0.5 rounded text-[9px] font-black">DX</span>
                            FarmaDATIX SaaS
                        </span>
                    </div>
                    <div className="h-4 w-px bg-white/20 mx-1"></div>
                    
                    {/* BRANCH SELECTOR */}
                    <div className="flex items-center gap-2 bg-white/10 border border-white/10 px-2 py-1 rounded-md">
                        <MapPin size={12} className="text-white/60" />
                        <select 
                            value={activeWarehouse?.id || ''}
                            onChange={(e) => {
                                const selected = warehouses.find(w => w.id === e.target.value);
                                if (selected) setActiveWarehouse(selected);
                            }}
                            className="bg-transparent text-[10px] font-black uppercase text-white outline-none cursor-pointer pr-4 appearance-none"
                        >
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id} className="text-gray-800 font-bold">{w.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10">
                        <div className="flex flex-col items-end hidden sm:flex leading-tight">
                            <span className="text-[9px] font-bold text-white uppercase">{userName}</span>
                            <span className="text-[7px] text-white/40 uppercase tracking-tighter">{userRole}</span>
                        </div>
                        <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold border border-white/20">
                            {userName.substring(0, 2)}
                        </div>
                    </div>
                    <button 
                        onClick={async () => {
                            const { data: { session } } = await supabase.auth.getSession();
                            if (session) {
                                window.location.href = `http://localhost:3000/portal#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
                            } else {
                                window.location.href = 'http://localhost:3000/login';
                            }
                        }}
                        className="hover:bg-red-500/20 p-1.5 rounded transition-colors group"
                    >
                        <LogOut size={14} className="text-white/60 group-hover:text-red-400" />
                    </button>
                </div>
            </header>

            {/* RIBBON BAR (Excel Style) */}
            <div className="flex flex-col shrink-0 z-[100] shadow-md border-b border-gray-200" style={{ backgroundColor: '#FFFFFF' }}>
                
                {/* Ribbon Tabs */}
                <div className="flex px-4 bg-gray-50 border-b border-gray-200">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTabId(tab.id)}
                            className={`px-6 py-2 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2
                                ${activeTabId === tab.id 
                                    ? 'bg-white border-[#4C3073] text-[#4C3073] shadow-[0_-2px_0_inset_#4C3073]' 
                                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Ribbon Content (Actions) */}
                <div className="flex items-center gap-1 p-2 bg-white overflow-x-auto no-scrollbar">
                    {activeTab.items.map(item => {
                        const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.to}
                                onClick={() => navigate(item.to)}
                                className={`flex flex-col items-center justify-center min-w-[80px] h-16 rounded-md transition-all group px-2
                                    ${isActive 
                                        ? 'bg-purple-50 text-[#4C3073] ring-1 ring-purple-200' 
                                        : 'text-gray-500 hover:bg-gray-100'
                                    }`}
                            >
                                <Icon size={20} className={`${isActive ? 'text-[#4C3073]' : 'text-gray-400 group-hover:text-gray-600'} transition-colors mb-1`} />
                                <span className={`text-[9px] font-bold uppercase tracking-tighter text-center leading-[10px] ${isActive ? 'text-[#4C3073]' : 'text-gray-500'}`}>
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                    
                    <div className="flex-1"></div>
                    
                    <div className="flex items-center gap-4 px-4 border-l border-gray-100 h-12 ml-2">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Sistema</span>
                            <span className="text-[10px] font-black text-[#4C3073]">ACTIVE_ERP_V1</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto relative bg-gray-50 text-gray-800">
                <Outlet />
            </main>
        </div>
    );
}
