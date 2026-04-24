/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchWarehouses } from '../api/pharmacyClient';

const SucursalContext = createContext();

export const SucursalProvider = ({ children }) => {
    const [activeWarehouse, setActiveWarehouseState] = useState(null);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadInitialWarehouse = async () => {
        try {
            setLoading(true);
            const { data, error } = await fetchWarehouses();
            if (error) throw error;
            
            const availableWarehouses = data || [];
            setWarehouses(availableWarehouses);

            const savedId = localStorage.getItem('active_warehouse_id');
            const found = availableWarehouses.find(w => w.id === savedId);

            if (found) {
                setActiveWarehouseState(found);
            } else if (availableWarehouses.length > 0) {
                // Si no hay guardado o no existe, tomar el primero por defecto
                const first = availableWarehouses[0];
                setActiveWarehouseState(first);
                localStorage.setItem('active_warehouse_id', first.id);
            }
        } catch (err) {
            console.error("Error cargando contexto de sucursal:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadInitialWarehouse();
    }, []);

    const setActiveWarehouse = (warehouse) => {
        setActiveWarehouseState(warehouse);
        if (warehouse) {
            localStorage.setItem('active_warehouse_id', warehouse.id);
        } else {
            localStorage.removeItem('active_warehouse_id');
        }
    };

    return (
        <SucursalContext.Provider value={{ 
            activeWarehouse, 
            setActiveWarehouse, 
            warehouses, 
            loading,
            refreshWarehouses: loadInitialWarehouse 
        }}>
            {children}
        </SucursalContext.Provider>
    );
};

export const useSucursal = () => {
    const context = useContext(SucursalContext);
    if (!context) {
        throw new Error("useSucursal debe usarse dentro de un SucursalProvider");
    }
    return context;
};
