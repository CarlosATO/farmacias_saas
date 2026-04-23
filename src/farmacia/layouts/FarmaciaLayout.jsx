import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';

// Icons
import {
    LayoutDashboard,
    Pill,
    FileText,
    Users,
    LogOut,
    ShoppingCart,
    Truck,
    Bell,
    HelpCircle,
    Settings
} from 'lucide-react';

const buildRibbonTabs = () => {
    const tabs = [];
    
    // Module 1: Inicio
    tabs.push({
        id: 'inicio',
        label: 'Inicio',
        icon: LayoutDashboard,
        items: [
            { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        ],
    });

    // Module 2: Farmacia
    const items = [
        { to: '/pos', label: 'Terminal POS', icon: ShoppingCart },
        { to: '/logistica', label: 'Pedidos (Logística)', icon: Truck },
        { to: '/inventario', label: 'Inventario (ISP)', icon: Pill },
        { to: '/recetas', label: 'Recetas Electrónicas', icon: FileText },
        { to: '/pacientes', label: 'Pacientes', icon: Users },
        { to: '/administracion/proveedores', label: 'Proveedores', icon: Users },
        { to: '/administracion/medicamentos', label: 'Catálogo', icon: Pill },
    ];
    tabs.push({ id: 'farmacia', label: 'Farmacia', icon: Pill, items });

    return tabs;
};

export default function FarmaciaLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [userRole, setUserRole]           = useState('Farmacéutico');
    const [userName, setUserName]           = useState('');
    const [companyName, setCompanyName]     = useState('Datix ERP');
    const [loading, setLoading]             = useState(true);

    useEffect(() => { fetchUserData(); }, []);

    const fetchUserData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserName(user.email.split('@')[0].toUpperCase());

            const role = user.app_metadata?.role || 'MEMBER';
            const companyId = user.app_metadata?.company_id;
            
            setUserRole(role);

            if (companyId) {
                const { data: comp } = await supabase.from('companies').select('name').eq('id', companyId).single();
                if (comp) setCompanyName(comp.name);
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    if (loading) return <div className="h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4C3073]"></div></div>;

    const tabs = buildRibbonTabs();

    return (
        <div className="flex flex-col h-screen font-sans text-white/90 text-[13px] overflow-hidden" style={{ backgroundColor: '#45316D' }}>
            
            <header 
              style={{ backgroundColor: '#5B4385' }}
              className="flex h-12 shrink-0 items-center justify-between px-4 text-white z-[100] shadow-xl border-b border-white/5"
            >
                <div className="flex items-center gap-6 h-full overflow-x-auto no-scrollbar">
                    {/* Brand / Logo Area */}
                    <div 
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap"
                    >
                        <span className="font-black tracking-tight text-white flex items-center gap-1.5 uppercase text-sm">
                            <span className="bg-white text-[#5B4385] px-1.5 py-0.5 rounded text-[10px] font-black">DX</span>
                            Farmacia
                        </span>
                    </div>

                    <div className="h-6 w-px bg-white/10 mx-1 hidden md:block"></div>

                    {/* Navigation Links */}
                    <nav className="flex items-center gap-0.5 h-full">
                        {tabs.flatMap(t => t.items).filter(item => item.to !== '/').map(item => {
                            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to);
                            return (
                                <button
                                    key={item.to}
                                    onClick={() => navigate(item.to)}
                                    className={`px-3 flex items-center h-full transition-all border-b-2 whitespace-nowrap text-[12px] font-medium
                                        ${isActive 
                                            ? 'bg-white/10 border-white text-white' 
                                            : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden lg:flex items-center gap-3 text-white/60 mr-2">
                        <button className="hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10"><Bell size={16} /></button>
                        <button className="hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10"><HelpCircle size={16} /></button>
                    </div>
                    
                    <div className="flex items-center gap-3 ml-2 cursor-pointer hover:bg-white/10 px-3 py-1.5 rounded-md transition-all group relative">
                        <div className="flex flex-col items-end hidden sm:flex">
                            <span className="text-[11px] font-bold leading-none">{userName}</span>
                            <span className="text-[9px] text-white/50 uppercase tracking-tighter">{userRole?.toLowerCase()}</span>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold border border-white/20 shadow-inner group-hover:scale-105 transition-transform">
                            {userName.substring(0, 2)}
                        </div>
                        
                        {/* Dropdown Menu */}
                        <div className="absolute right-0 top-full w-56 pt-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all transform group-hover:translate-y-0 translate-y-2 z-[110]">
                            <div className="bg-[#5B4385] text-white shadow-2xl border border-white/10 rounded-lg py-2 overflow-hidden backdrop-blur-xl">
                                <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                                    <p className="font-bold text-xs truncate">{companyName}</p>
                                    <p className="text-[10px] text-white/50">{userRole}</p>
                                </div>
                                <div className="py-1">
                                    <button 
                                        onClick={async () => {
                                            const { data: { session } } = await supabase.auth.getSession();
                                            if (session) {
                                                window.location.href = `http://localhost:3000/portal#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
                                            } else {
                                                window.location.href = 'http://localhost:3000/login';
                                            }
                                        }} 
                                        className="w-full text-left px-4 py-2.5 hover:bg-white/10 flex items-center gap-3 text-xs transition-colors"
                                    >
                                        <LogOut size={14} className="opacity-70" /> 
                                        <span>Volver al Portal Datix</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto relative bg-gray-50 text-gray-800">
                {children || <Outlet />}
            </main>
        </div>
    );
}
