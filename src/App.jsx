import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './api/supabaseClient';

const FarmaciaLayout = lazy(() => import('./farmacia/layouts/FarmaciaLayout'));
const FarmaciaDashboard = lazy(() => import('./farmacia/pages/FarmaciaDashboard'));
const InventarioMedico = lazy(() => import('./farmacia/pages/InventarioMedico'));
const Recetas = lazy(() => import('./farmacia/pages/Recetas'));
const Pacientes = lazy(() => import('./farmacia/pages/Pacientes'));
const PuntoDeVenta = lazy(() => import('./farmacia/pages/PuntoDeVenta'));
const OrdenesCompra = lazy(() => import('./farmacia/pages/OrdenesCompra'));
const ProveedoresMedicos = lazy(() => import('./modules/farmacia/pages/ProveedoresMedicos'));
const CatalogoMedicamentos = lazy(() => import('./modules/farmacia/pages/CatalogoMedicamentos'));
const MapaLogistico = lazy(() => import('./farmacia/pages/MapaLogistico'));
const GestorUbicaciones = lazy(() => import('./farmacia/pages/GestorUbicaciones'));
const TraspasosInternos = lazy(() => import('./farmacia/pages/TraspasosInternos'));
const AdminSucursales = lazy(() => import('./farmacia/pages/AdminSucursales'));
import { SucursalProvider } from './farmacia/context/SucursalContext';
import GestionPrecios from './farmacia/pages/GestionPrecios';

const PageLoader = () => (
  <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mb-3"></div>
    <p className="text-gray-400 text-sm font-medium">Cargando FarmaDATIX...</p>
  </div>
);

const PrivateRoute = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  const isProcessingToken = window.location.hash.includes('access_token');

  useEffect(() => {
    const processToken = async () => {
      if (isProcessingToken) {
        try {
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        } catch (err) {
          console.error("Error procesando hash SSO:", err);
        } finally {
          checkAuth();
        }
      } else {
        checkAuth();
      }
    };
    processToken();
  }, [isProcessingToken]);

  const checkAuth = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setLoading(false);
  };

  if (loading || isProcessingToken) {
    return <PageLoader />;
  }

  // Si no hay sesión, patada fuerte al Portal Central (Next.js)
  if (!session) {
    window.location.href = 'http://localhost:3000/login';
    return null;
  }

  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <SucursalProvider>
        <Routes>
          <Route path="/" element={<PrivateRoute><Suspense fallback={<PageLoader />}><FarmaciaLayout /></Suspense></PrivateRoute>}>
            <Route index element={<Suspense fallback={<PageLoader />}><FarmaciaDashboard /></Suspense>} />
            <Route path="inventario" element={<Suspense fallback={<PageLoader />}><InventarioMedico /></Suspense>} />
            <Route path="recetas" element={<Suspense fallback={<PageLoader />}><Recetas /></Suspense>} />
            <Route path="pacientes" element={<Suspense fallback={<PageLoader />}><Pacientes /></Suspense>} />
            <Route path="pos" element={<Suspense fallback={<PageLoader />}><PuntoDeVenta /></Suspense>} />
            <Route path="logistica" element={<Suspense fallback={<PageLoader />}><OrdenesCompra /></Suspense>} />
            <Route path="administracion/proveedores" element={<Suspense fallback={<PageLoader />}><ProveedoresMedicos /></Suspense>} />
            <Route path="administracion/medicamentos" element={<Suspense fallback={<PageLoader />}><CatalogoMedicamentos /></Suspense>} />
            <Route path="mapa-logistico" element={<Suspense fallback={<PageLoader />}><MapaLogistico /></Suspense>} />
            <Route path="mapa-logistico/gestor/:locationId" element={<Suspense fallback={<PageLoader />}><GestorUbicaciones /></Suspense>} />
            <Route path="traspasos" element={<Suspense fallback={<PageLoader />}><TraspasosInternos /></Suspense>} />
            <Route path="sucursales" element={<Suspense fallback={<PageLoader />}><AdminSucursales /></Suspense>} />
            <Route path="pricing" element={<GestionPrecios />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SucursalProvider>
    </BrowserRouter>
  );
}
