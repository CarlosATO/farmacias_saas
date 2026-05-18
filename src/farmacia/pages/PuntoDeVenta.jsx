import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Search, Plus, Trash2, ShieldAlert, FlaskConical,
  Stethoscope, CreditCard, X, Keyboard, MapPin, Loader2, Package, Barcode, ArrowUpCircle, Wallet, Calculator, ArrowLeft, Banknote, Receipt, CheckCircle2
} from 'lucide-react';
import {
  createCashMovement, createSaleWithItems, fetchPosProducts,
  fetchPosSessionSummary, closePosSession,
  fetchPosTerminals, fetchSessionByTerminal, activateSession,
  fetchPharmacyPatients, createPharmacyPatient, createPrescriptionWithItems,
  fetchPrescriptionByFolio, fetchPrescriptionItems,
  fetchPendingPrescriptionsByPatient,
  fetchDoctors, createDoctor,
  fetchDteById, fetchSaleItems, fetchBioequivalentSuggestions
} from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';
import CheckoutModal from '../components/CheckoutModal';
import SearchableSelect from '../components/SearchableSelect';

const billDenominations = [20000, 10000, 5000, 2000, 1000];
const coinDenominations = [500, 100, 50, 10];

export default function PuntoDeVenta() {
  const navigate = useNavigate();
  const { activeWarehouse } = useSucursal();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [validationModal, setValidationModal] = useState({ 
    isOpen: false, 
    type: null, 
    product: null,
    activeTab: 'EXPRESS', // 'LLAMAR' | 'EXPRESS'
    folioSearch: '',
    isLoading: false
  });
  const [expressFormData, setExpressFormData] = useState({ rut: '', nombre: '', folio: '', patientRut: '', patientNombre: '', institution: '' });
  const [expressSearch, setExpressSearch] = useState({ patientResults: [], doctorResults: [], selectedPatientId: null, selectedDoctorId: null, searchingPatient: false, searchingDoctor: false });
  // Debounce refs for express search
  const doctorDebounceRef = useRef(null);
  const patientDebounceRef = useRef(null);
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [quickCashModal, setQuickCashModal] = useState({ open: false, amount: '', reason: '' });
  const [activeSession, setActiveSession] = useState(null);
  const [closingModal, setClosingModal] = useState({ 
    open: false, 
    closingBalance: '', 
    pinCode: '',
    denominations: {
      '20000': 0, '10000': 0, '5000': 0, '2000': 0, '1000': 0,
      '500': 0, '100': 0, '50': 0, '10': 0
    }
  });

  const declaredTotal = useMemo(() => {
    return Object.entries(closingModal.denominations || {}).reduce((sum, [denom, qty]) => {
      return sum + (Number(denom) * Number(qty));
    }, 0);
  }, [closingModal.denominations]);
  const [terminalId, setTerminalId] = useState(localStorage.getItem('pharmacy_terminal_id'));
  const [terminals, setTerminals] = useState([]);
  const [isTerminalSelectionOpen, setIsTerminalSelectionOpen] = useState(false);
  const [activationModal, setActivationModal] = useState({ open: false, pinCode: '' });

  // Gestión de Pacientes
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState({ id: null, full_name: 'PÚBLICO GENERAL', rut: '1-9' });
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [newPatient, setNewPatient] = useState({ rut: '', full_name: '', phone: '' });
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  // Puente inteligente: recetas pendientes del paciente
  const [pendingRecipesModal, setPendingRecipesModal] = useState({ open: false, prescriptions: [], loading: false, selected: new Set(), detailPrescription: null });
  // IDs de recetas creadas en express durante esta sesión de carrito (para excluir del modal de pendientes)
  const [expressCreatedPrescriptionIds, setExpressCreatedPrescriptionIds] = useState(new Set());
  const [expressCreatedPrescriptionFolios, setExpressCreatedPrescriptionFolios] = useState(new Set());
  const [isCreatingExpressPrescription, setIsCreatingExpressPrescription] = useState(false);
  // Receipt confirmation after successful sale
  const [saleReceipt, setSaleReceipt] = useState(null); // { sale_id, dte_id, dte_doc, items, total_amount, payment_method, dte_warning }
  const [bioequivalentPanel, setBioequivalentPanel] = useState({ open: false, product: null, suggestions: [], loading: false });
  const searchInputRef = useRef(null);
  const qtyRefs = useRef({});   // refs para inputs de cantidad en el carro
  const cartRef = useRef(cart);
  const expressCreatedPrescriptionIdsRef = useRef(expressCreatedPrescriptionIds);
  const expressCreatedPrescriptionFoliosRef = useRef(expressCreatedPrescriptionFolios);
  const expressPrescriptionLookupRef = useRef(new Map());
  const expressPrescriptionByProductRef = useRef(new Map());
  const isCreatingExpressPrescriptionRef = useRef(false);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    expressCreatedPrescriptionIdsRef.current = expressCreatedPrescriptionIds;
  }, [expressCreatedPrescriptionIds]);

  useEffect(() => {
    expressCreatedPrescriptionFoliosRef.current = expressCreatedPrescriptionFolios;
  }, [expressCreatedPrescriptionFolios]);

  useEffect(() => {
    if (!validationModal.isOpen) {
      isCreatingExpressPrescriptionRef.current = false;
      setIsCreatingExpressPrescription(false);
    }
  }, [validationModal.isOpen]);

  const isExpressPrescriptionExcluded = (prescription) => {
    if (!prescription) return false;
    return (
      expressCreatedPrescriptionIdsRef.current.has(prescription.id) ||
      expressCreatedPrescriptionFoliosRef.current.has(prescription.folio_electronico)
    );
  };

  const normalizeCartItemPrescription = (item) => {
    const prescriptionFolio = item?.prescription_folio || item?.correlativo_asociado || item?.datos_medico?.folio || null;
    const resolvedPrescriptionId = item?.prescription_id
      || item?.prescriptionId
      || (prescriptionFolio ? expressPrescriptionLookupRef.current.get(prescriptionFolio) : null)
      || (item?.id ? expressPrescriptionByProductRef.current.get(item.id) : null)
      || null;

    const isControlled = (item?.sale_condition || item?.prescription_type || 'VD').toUpperCase() !== 'VD'
      && (item?.sale_condition || item?.prescription_type || 'VD').toUpperCase() !== 'VENTA_LIBRE';

    return {
      ...item,
      prescription_id: resolvedPrescriptionId,
      prescription_item_id: item?.prescription_item_id || null,
      prescription_folio: prescriptionFolio,
      prescription_status: item?.prescription_status || null,
      prescription_patient_id: item?.prescription_patient_id || item?.patient_id || null,
      has_valid_prescription: !isControlled || Boolean(resolvedPrescriptionId),
    };
  };

  // ── CARGA DE DATOS ──────────────────────────────────────────────────────
  const loadInitialData = useCallback(async () => {
    if (!activeWarehouse?.id) return;
    
    // Si no hay terminalID, cargamos la lista para seleccion
    if (!terminalId) {
      const { data } = await fetchPosTerminals(activeWarehouse.id);
      setTerminals(data || []);
      setIsTerminalSelectionOpen(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [posResult, sessionRes, patientsRes] = await Promise.all([
        fetchPosProducts(activeWarehouse.id, '', 100),
        fetchSessionByTerminal(terminalId),
        fetchPharmacyPatients() // carga inicial 50 pacientes para el selector
      ]);

      const enrichedProducts = posResult || [];
      const currentSession = sessionRes.data || null;
      setPatients(patientsRes.data || []);
      setProducts(enrichedProducts);
      setActiveSession(currentSession);

      if (currentSession) {
        if (currentSession.status === 'PENDING') {
          setActivationModal({ open: true, pinCode: '' });
        } else {
          await fetchPosSessionSummary(currentSession);
        }
      }
    } catch (err) {
      console.error("Error cargando POS:", err);
    } finally {
      setLoading(false);
    }
  }, [activeWarehouse?.id, terminalId]);

  const handleSelectTerminal = (id) => {
    localStorage.setItem('pharmacy_terminal_id', id);
    setTerminalId(id);
    setIsTerminalSelectionOpen(false);
  };

  const handleActivateSession = async () => {
    if (!activeSession || !activationModal.pinCode) return;
    setIsProcessingSale(true);
    try {
      const { error } = await activateSession({
        sessionId: activeSession.id,
        operatorId: activeSession.operator_id,
        warehouseId: activeWarehouse.id,
        pinCode: activationModal.pinCode
      });
      if (error) throw error;
      setActivationModal({ open: false, pinCode: '' });
      loadInitialData();
    } catch (error) {
      alert(`PIN incorrecto: ${error.message}`);
    } finally {
      setIsProcessingSale(false);
    }
  };

  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  const handlePrintReceipt = () => {
    window.print();
  };

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (showSearchModal && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showSearchModal]);

  // ── PUENTE INTELIGENTE: detector de recetas pendientes ─────────────────
  useEffect(() => {
    if (!selectedPatient?.id || selectedPatient.id === 'PÚBLICO GENERAL') return;
    const checkPending = async () => {
      try {
        const { data, error } = await fetchPendingPrescriptionsByPatient(selectedPatient.id);
        if (!error && data && data.length > 0) {
          // Pre-fetch items to display detail and process loads faster
          const enriched = await Promise.all(
            data.map(async p => {
              const { data: items } = await fetchPrescriptionItems(p.id);
              return { ...p, items: items || [] };
            })
          );
          const uniquePending = [];
          const seenPending = new Set();
          for (const prescription of enriched) {
            const key = `${prescription.id || ''}:${prescription.folio_electronico || ''}`;
            if (seenPending.has(key)) continue;
            seenPending.add(key);
            uniquePending.push(prescription);
          }
          // Excluir recetas ya asociadas al carrito actual (express creadas en esta sesión o cargadas previamente)
          const cartPrescriptionIds = new Set(cartRef.current.map(c => c.prescription_id).filter(Boolean));
          const filtered = uniquePending.filter(p => {
            if (cartPrescriptionIds.has(p.id)) return false;
            return !isExpressPrescriptionExcluded(p);
          });
          if (filtered.length === 0) return; // nada que mostrar
          const selected = new Set(); // Require user to explicitly select
          setPendingRecipesModal({ open: true, prescriptions: filtered, loading: false, selected, detailPrescription: null });
        }
      } catch (err) {
        console.error("Error verificando recetas pendientes:", err);
      }
    };
    checkPending();
  }, [selectedPatient?.id]);

  const handleLoadPendingRecipes = async () => {
    setPendingRecipesModal(prev => ({ ...prev, loading: true }));
    try {
      const selectedPrescriptions = pendingRecipesModal.prescriptions.filter(p => pendingRecipesModal.selected.has(p.id));
      
      let updatedCart = [...cart];
      for (const prescription of selectedPrescriptions) {
        // Check expiration with 1 day grace period
        if (prescription.valid_until) {
          const expiryDate = new Date(prescription.valid_until);
          const graceDate = new Date(expiryDate.getTime() + (24 * 60 * 60 * 1000));
          if (new Date() > graceDate) {
            alert(`La receta ${prescription.folio_electronico} se encuentra vencida y no puede cargarse.`);
            continue;
          }
        }

        const items = prescription.items || [];
        if (!items.length) continue;

        if (isExpressPrescriptionExcluded(prescription)) {
          continue;
        }
        
        for (const item of items) {
          const product = item.product;
          if (!product) continue;
          
          const enriched = products.find(p => p.id === product.id);
          const effectivePrice = Number(enriched?.effective_price_sale ?? enriched?.price_sale ?? 0);
          const effectiveStock = enriched?.stock_disponible || 0;
          
          const existingIdx = updatedCart.findIndex(
            c => c.id === product.id && c.correlativo_asociado === prescription.folio_electronico
          );
          const remaining = Math.max(0, (item.quantity_prescribed || 1) - (item.quantity_dispensed || 0));
          if (remaining <= 0) continue;

          if (existingIdx !== -1) {
            const newQty = updatedCart[existingIdx].quantity + remaining;
            if (newQty > effectiveStock) {
              alert(`Stock insuficiente para ${product.name}. Se agregó hasta el disponible (${effectiveStock}).`);
              updatedCart[existingIdx].quantity = effectiveStock;
            } else {
              updatedCart[existingIdx].quantity = newQty;
            }
          } else {
            if (remaining > effectiveStock && effectiveStock <= 0) {
              alert(`Sin stock disponible para ${product.name}. Se omite.`);
              continue;
            }
            updatedCart.push({
              ...product,
              price_sale: effectivePrice,
              stock_disponible: effectiveStock,
              quantity: Math.min(remaining, effectiveStock || 999),
              prescription_id: prescription.id,
              correlativo_asociado: prescription.folio_electronico,
              validation_rut: prescription.prescriber_rut,
              max_prescription_qty: remaining
            });
          }
        }
      }
      setCart(updatedCart);
      setPendingRecipesModal({ open: false, prescriptions: [], loading: false, selected: new Set(), detailPrescription: null });
    } catch (err) {
      console.error("Error cargando recetas pendientes:", err);
      setPendingRecipesModal(prev => ({ ...prev, loading: false }));
    }
  };

  const buildPrescriptionMeta = (prescriptionResult, fallbackFolio = null) => {
    const header = prescriptionResult?.header || prescriptionResult?.data?.header || prescriptionResult?.data || prescriptionResult || null;
    const prescriptionId = header?.id || header?.prescription_id || prescriptionResult?.id || prescriptionResult?.prescription_id || null;
    const folioElectronico = header?.folio_electronico || prescriptionResult?.folio_electronico || fallbackFolio || null;
    return {
      prescription_id: prescriptionId,
      prescription_folio: folioElectronico,
      prescription_status: header?.status || null,
      prescription_patient_id: header?.patient_id || null,
      prescription_item_id: header?.item_id || header?.prescription_item_id || null,
    };
  };

  // ── HOTKEYS GLOBALES ────────────────────────────────────────────────────
  const handleCheckout = useCallback(() => {
    if (cart.length === 0 || isProcessingSale) return;

    // Validación: Si hay productos con receta, debe haber un paciente real
    const needsPrescription = cart.some(item => {
      const condition = (item.sale_condition || item.prescription_type || 'VD').toUpperCase();
      return condition !== 'VD' && condition !== 'VENTA_LIBRE';
    });

    if (needsPrescription && !selectedPatient.id) {
      alert('Esta venta contiene productos que requieren receta médica. Debe seleccionar o registrar un Paciente real para continuar.');
      return;
    }

    setShowCheckoutModal(true);
  }, [cart, isProcessingSale, selectedPatient.id]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F1') { e.preventDefault(); setShowSearchModal(true); }
      if (e.key === 'F2') { e.preventDefault(); handleCheckout(); }
      if (e.key === 'Escape') { setShowSearchModal(false); setValidationModal({ isOpen: false, type: null, product: null }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCheckout]);

  // ── LÓGICA DEL CARRITO ──────────────────────────────────────────────────
  const tryAddToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    const requestedQuantity = Number(existing?.quantity || 0) + 1;

    if (!canSellQuantity(product, requestedQuantity)) return;

    const condition = (product.sale_condition || product.prescription_type || 'VD').toUpperCase();
    if (condition === 'VD' || condition === 'VENTA_LIBRE') { addToCart(product); return; }
    
    if (condition === 'R' || condition === 'RECETA_SIMPLE') { 
      setValidationModal(prev => ({ ...prev, isOpen: true, type: 'R', product, activeTab: 'EXPRESS' })); 
      setExpressFormData({ rut: '', nombre: '', folio: '', patientRut: '', patientNombre: '', institution: '' });
      setExpressSearch({ patientResults: [], doctorResults: [], selectedPatientId: null, selectedDoctorId: null, searchingPatient: false, searchingDoctor: false });
      return; 
    }
    if (condition === 'RR' || condition === 'RCH' || condition === 'RECETA_RETENIDA' || condition === 'RECETA_CHEQUE') {
      setValidationModal(prev => ({ ...prev, isOpen: true, type: 'RR', product, activeTab: 'LLAMAR' })); 
      return;
    }
    // Default: agregar sin validación
    addToCart(product);
  };

  const safePrice = (p) => Number(p?.effective_price_sale ?? p?.price_sale ?? 0);

  const showInsufficientStockAlert = () => {
    alert('Stock disponible insuficiente. No se puede vender stock en cuarentena.');
  };

  const canSellQuantity = (product, requestedQuantity) => {
    if (Number(requestedQuantity || 0) <= Number(product?.stock_disponible || 0)) return true;
    showInsufficientStockAlert();
    return false;
  };

  const addToCart = (product, metadata = {}) => {
    // Bloqueo de venta si no hay precio definido para este local
    if (Number(safePrice(product)) <= 0) {
      alert(`Bloqueo: El producto ${product.name} no tiene un precio de venta asignado para este local.`);
      return;
    }

    const existing = cart.find(item => item.id === product.id);
    const requestedQuantity = Number(existing?.quantity || 0) + 1;
    const availableStock = Number(product.stock_disponible || 0);

    if (requestedQuantity > availableStock) {
      showInsufficientStockAlert();
      return;
    }

    if (existing) {
      const newQty = Number(existing.quantity || 0) + 1;
      if (existing.max_prescription_qty && newQty > existing.max_prescription_qty) {
        alert(`No puede vender más de lo indicado en la receta médica (máx. ${existing.max_prescription_qty}).`);
        return;
      }
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: newQty } : item));
    } else {
      setCart(prev => [...prev, {
        ...product,
        price_sale: safePrice(product),
        quantity: 1,
        ...metadata
      }]);
    }
    setValidationModal({ isOpen: false, type: null, product: null });
    setShowSearchModal(false);
    setSearchTerm('');
    // Focus en el input de cantidad del producto recién agregado
    setTimeout(() => { qtyRefs.current[product.id]?.select(); }, 150);
  };

  const setQuantity = (id, val) => {
    const qty = Math.max(1, parseInt(val) || 1);
    const item = cart.find(i => i.id === id);
    if (!item) return;

    // Límite estricto de dispensación
    if (item.max_prescription_qty && qty > item.max_prescription_qty) {
      alert(`No puede vender más de lo indicado en la receta médica (máx. ${item.max_prescription_qty}).`);
      return;
    }

    // Validar stock real desde productos enriquecidos
    const enriched = products.find(p => p.id === id);
    const availableStock = Number(enriched?.stock_disponible ?? item.stock_disponible ?? 0);
    if (qty > availableStock) {
      showInsufficientStockAlert();
      return;
    }

    setCart(cart.map(c => c.id === id ? { ...c, quantity: qty } : c));
  };

  const removeFromCart = (id) => {
    // Si el ítem eliminado tenía una receta express, liberarla del set para que pueda aparecer en pendientes
    const removedItem = cart.find(item => item.id === id);
    if (removedItem?.prescription_id && removedItem?.es_receta_express) {
      setExpressCreatedPrescriptionIds(prev => {
        const next = new Set(prev);
        next.delete(removedItem.prescription_id);
        return next;
      });
    }
    setCart(cart.filter(item => item.id !== id));
  };

  const calculateTotal = () => cart.reduce((acc, item) => acc + (safePrice(item) * Number(item.quantity || 0)), 0);
  const totalItems = cart.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  const mergeRecipeItemsIntoCart = (currentCart, recipeItems) => {
    const nextCart = [...currentCart];

    recipeItems.forEach((newItem) => {
      const newProductId = newItem.id || newItem.product_id;
      const newPrescriptionId = newItem.prescription_id || null;
      const newPrescriptionItemId = newItem.prescription_item_id || null;
      const newCorrelativo = newItem.correlativo_asociado || null;

      const existingIdx = nextCart.findIndex((cartItem) => {
        const cartProductId = cartItem.id || cartItem.product_id;
        const sameProduct = cartProductId === newProductId;
        if (!sameProduct) return false;

        const samePrescriptionId = newPrescriptionId && cartItem.prescription_id === newPrescriptionId;
        const samePrescriptionItemId = newPrescriptionItemId && cartItem.prescription_item_id === newPrescriptionItemId;
        const sameCorrelativo = newCorrelativo && cartItem.correlativo_asociado === newCorrelativo;

        return samePrescriptionItemId || samePrescriptionId || sameCorrelativo;
      });

      if (existingIdx !== -1) {
        const existingItem = nextCart[existingIdx];
        nextCart[existingIdx] = {
          ...existingItem,
          quantity: Number(existingItem.quantity || 0) + Number(newItem.quantity || 0),
          prescription_id: existingItem.prescription_id || newPrescriptionId,
          prescription_item_id: existingItem.prescription_item_id || newPrescriptionItemId,
          correlativo_asociado: existingItem.correlativo_asociado || newCorrelativo,
          validation_rut: existingItem.validation_rut || newItem.validation_rut,
        };
      } else {
        nextCart.push(normalizeCartItemPrescription(newItem));
      }
    });

    return nextCart;
  };

  const handleLlamarReceta = async () => {
    if (!validationModal.folioSearch) return;
    setValidationModal(prev => ({ ...prev, isLoading: true }));
    try {
      const { data: prescription, error } = await fetchPrescriptionByFolio(validationModal.folioSearch);
      if (error || !prescription) {
        alert("No se encontró la receta solicitada.");
        return;
      }

      if (prescription.status === 'DISPENSED') {
        alert("Esta receta ya ha sido despachada completamente.");
        setValidationModal(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Check expiration with 1 day grace period
      if (prescription.valid_until) {
        const expiryDate = new Date(prescription.valid_until);
        const graceDate = new Date(expiryDate.getTime() + (24 * 60 * 60 * 1000));
        if (new Date() > graceDate) {
          alert("Esta receta se encuentra vencida.");
          setValidationModal(prev => ({ ...prev, isLoading: false }));
          return;
        }
      }

      const { data: items, error: itemsError } = await fetchPrescriptionItems(prescription.id);
      if (itemsError || !items) {
        alert("Error al recuperar los productos de la receta.");
        return;
      }

      // Merge items to cart
      const newCartItems = items
        .filter(item => (item.quantity_prescribed || 1) - (item.quantity_dispensed || 0) > 0)
        .map(item => {
          const remaining = (item.quantity_prescribed || 1) - (item.quantity_dispensed || 0);
          // Enriquecer con precio y stock del catálogo POS local (igual que el modal de pendientes)
          const enriched = products.find(p => p.id === item.product?.id);
          const effectivePrice = Number(enriched?.effective_price_sale ?? enriched?.price_sale ?? 0);
          const effectiveStock = enriched?.stock_disponible ?? 0;
          return {
            ...item.product,
            ...(enriched || {}),          // sobrescribe con datos enriquecidos del catálogo
            price_sale: effectivePrice,
            stock_disponible: effectiveStock,
            quantity: Math.min(remaining, effectiveStock || 9999),
            max_prescription_qty: remaining,
            prescription_id: prescription.id,
            correlativo_asociado: prescription.folio_electronico,
            validation_rut: prescription.prescriber_rut
          };
        });

      if (newCartItems.length === 0) {
        alert("La receta solicitada ya fue despachada completamente.");
        setValidationModal({ isOpen: false, type: null, product: null, activeTab: 'EXPRESS', folioSearch: '', isLoading: false });
        return;
      }

      setCart(prev => mergeRecipeItemsIntoCart(prev, newCartItems));

      // Auto-select patient if possible
      if (prescription.patient) {
        setSelectedPatient(prescription.patient);
      }

      setValidationModal({ isOpen: false, type: null, product: null, activeTab: 'EXPRESS', folioSearch: '', isLoading: false });
      setShowSearchModal(false);
      alert(`Receta ${prescription.folio_electronico} cargada con éxito (${items.length} productos).`);
    } catch (err) {
      console.error("Error llamando receta:", err);
      alert("Error inesperado al llamar receta.");
    } finally {
      setValidationModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Debounced doctor search: triggers automatically on rut change (min 2 chars)
  const handleDoctorQueryChange = (value) => {
    setExpressFormData(prev => ({ ...prev, rut: value, nombre: expressSearch.selectedDoctorId ? prev.nombre : '' }));
    if (expressSearch.selectedDoctorId) return; // Already selected
    clearTimeout(doctorDebounceRef.current);
    if (value.trim().length < 2) {
      setExpressSearch(prev => ({ ...prev, doctorResults: [] }));
      return;
    }
    setExpressSearch(prev => ({ ...prev, searchingDoctor: true }));
    doctorDebounceRef.current = setTimeout(async () => {
      const { data } = await fetchDoctors(value.trim(), 10);
      setExpressSearch(prev => ({ ...prev, searchingDoctor: false, doctorResults: data || [] }));
    }, 300);
  };

  // Debounced patient search: triggers automatically on patientRut/name change (min 2 chars)
  const handlePatientQueryChange = (value) => {
    setExpressFormData(prev => ({ ...prev, patientRut: value, patientNombre: expressSearch.selectedPatientId ? prev.patientNombre : '' }));
    if (expressSearch.selectedPatientId) return; // Already selected
    clearTimeout(patientDebounceRef.current);
    if (value.trim().length < 2) {
      setExpressSearch(prev => ({ ...prev, patientResults: [] }));
      return;
    }
    setExpressSearch(prev => ({ ...prev, searchingPatient: true }));
    patientDebounceRef.current = setTimeout(async () => {
      const { data } = await fetchPharmacyPatients(value.trim(), 10);
      setExpressSearch(prev => ({ ...prev, searchingPatient: false, patientResults: data || [] }));
    }, 300);
  };

  // Keep manual search handlers for Enter key
  const handleExpressPatientSearch = async () => {
    const q = expressFormData.patientRut.trim();
    if (!q) return;
    setExpressSearch(prev => ({ ...prev, searchingPatient: true }));
    const { data } = await fetchPharmacyPatients(q, 10);
    setExpressSearch(prev => ({ ...prev, searchingPatient: false, patientResults: data || [], selectedPatientId: null }));
  };

  const handleExpressDoctorSearch = async () => {
    const q = expressFormData.rut.trim();
    if (!q) return;
    setExpressSearch(prev => ({ ...prev, searchingDoctor: true }));
    const { data } = await fetchDoctors(q, 10);
    setExpressSearch(prev => ({ ...prev, searchingDoctor: false, doctorResults: data || [], selectedDoctorId: null }));
  };

  const handleExpressValidate = async () => {
    const { rut, nombre, folio, patientRut, patientNombre, institution } = expressFormData;
    if (!validationModal.product) return;
    if (isCreatingExpressPrescriptionRef.current || validationModal.isLoading) return;

    if (!folio.trim()) { alert('El N° de Folio / Receta es obligatorio.'); return; }

    isCreatingExpressPrescriptionRef.current = true;
    setIsCreatingExpressPrescription(true);
    setValidationModal(prev => ({ ...prev, isLoading: true }));
    try {
      // 1. Resolver paciente: usar seleccionado, o buscar por RUT, o crear
      let patient = null;
      if (expressSearch.selectedPatientId) {
        patient = expressSearch.patientResults.find(p => p.id === expressSearch.selectedPatientId);
      }
      if (!patient) {
        if (!patientRut.trim() || !patientNombre.trim()) {
          alert('Debes ingresar o seleccionar un paciente (RUT y Nombre).');
          setValidationModal(prev => ({ ...prev, isLoading: false }));
          return;
        }
        const { data: existing } = await fetchPharmacyPatients(patientRut.trim());
        patient = existing?.find(p => p.rut === patientRut.trim());
        if (!patient) {
          const { data: newP, error: pErr } = await createPharmacyPatient({ rut: patientRut.trim(), full_name: patientNombre.trim() });
          if (pErr) throw pErr;
          patient = newP;
          setPatients(prev => [patient, ...prev]);
        }
      }

      // 2. Resolver médico: usar seleccionado, o buscar por RUT, o crear
      let doctor = null;
      if (expressSearch.selectedDoctorId) {
        doctor = expressSearch.doctorResults.find(d => d.id === expressSearch.selectedDoctorId);
      }
      let prescriber_rut = rut.trim();
      let prescriber_name = nombre.trim();
      if (!prescriber_rut || !prescriber_name) {
        alert('Debes ingresar o seleccionar un médico (RUT y Nombre).');
        setValidationModal(prev => ({ ...prev, isLoading: false }));
        return;
      }
      if (!doctor) {
        const { data: existingDr } = await fetchDoctors(prescriber_rut);
        doctor = existingDr?.find(d => d.rut === prescriber_rut);
        if (!doctor) {
          const { data: newDr, error: drErr } = await createDoctor({ rut: prescriber_rut, full_name: prescriber_name });
          if (drErr) console.warn('No se pudo registrar médico:', drErr);
          else doctor = newDr;
        }
      } else {
        prescriber_rut = doctor.rut;
        prescriber_name = doctor.full_name;
      }

      // 3. Crear receta real con el producto
      const product = validationModal.product;
      const { data: prescResult, error: prescErr } = await createPrescriptionWithItems(
        {
          patient_id: patient.id,
          doctor_id: doctor?.id || null,
          prescriber_rut,
          prescriber_name,
          folio_electronico: folio.trim(),
          institution_name: institution.trim() || null,
          issue_date: new Date().toISOString().split('T')[0]
        },
        [{ product_id: product.id, quantity_prescribed: 1, dosage_instructions: '' }]
      );
      if (prescErr) throw prescErr;

      const prescriptionFolio = folio.trim();
    const prescriptionMeta = buildPrescriptionMeta(prescResult, prescriptionFolio);
    const prescriptionId = prescriptionMeta.prescription_id;

      // Registrar esta receta como creada en express (para excluir del modal de pendientes)
      if (prescriptionId) {
        expressCreatedPrescriptionIdsRef.current = new Set([...expressCreatedPrescriptionIdsRef.current, prescriptionId]);
        setExpressCreatedPrescriptionIds(prev => new Set([...prev, prescriptionId]));
      }
      if (prescriptionFolio) {
        expressCreatedPrescriptionFoliosRef.current = new Set([...expressCreatedPrescriptionFoliosRef.current, prescriptionFolio]);
        setExpressCreatedPrescriptionFolios(prev => new Set([...prev, prescriptionFolio]));
      }
      if (prescriptionId && prescriptionFolio) {
        expressPrescriptionLookupRef.current.set(prescriptionFolio, prescriptionId);
      }
      if (prescriptionId && product?.id) {
        expressPrescriptionByProductRef.current.set(product.id, prescriptionId);
      }

      // 4. Seleccionar el paciente en el POS y agregar al carrito con prescription_id
      setSelectedPatient(patient);

      // Si el producto ya está en carrito, solo actualizar su prescription_id
      const existing = cart.find(c => c.id === product.id && !c.prescription_id);
      if (existing) {
        setCart(prev => prev.map(c => {
          if (c.id !== product.id || c.prescription_id) return c;
          const normalized = normalizeCartItemPrescription({
            ...c,
            ...prescriptionMeta,
            prescription_id: prescriptionId,
            prescription_item_id: c.prescription_item_id || prescriptionMeta.prescription_item_id || null,
            correlativo_asociado: prescriptionFolio,
            validation_rut: prescriber_rut,
            es_receta_express: true,
            prescription_patient_id: patient.id,
          });
          return normalized;
        }));
      } else {
        const itemAgregado = normalizeCartItemPrescription({
          ...product,
          price_sale: safePrice(product),
          quantity: 1,
          es_receta_express: true,
          ...prescriptionMeta,
          prescription_id: prescriptionId,
          prescription_item_id: prescriptionMeta.prescription_item_id || prescResult?.items?.[0]?.id || null,
          correlativo_asociado: prescriptionFolio,
          validation_rut: prescriber_rut,
          prescriber_name,
          prescription_patient_id: patient.id,
          patient_id: patient.id,
          datos_medico: { rut: prescriber_rut, nombre: prescriber_name, folio: prescriptionFolio }
        });
        setCart(prev => [...prev, itemAgregado]);
      }

      setValidationModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
      setExpressFormData({ rut: '', nombre: '', folio: '', patientRut: '', patientNombre: '', institution: '' });
      setExpressSearch({ patientResults: [], doctorResults: [], selectedPatientId: null, selectedDoctorId: null, searchingPatient: false, searchingDoctor: false });
    } catch (err) {
      console.error('Error en validación express:', err);
      alert('Error al registrar receta: ' + (err.message || err));
      setValidationModal(prev => ({ ...prev, isLoading: false }));
    } finally {
      isCreatingExpressPrescriptionRef.current = false;
      setIsCreatingExpressPrescription(false);
    }
  };

  const handleSavePatient = async () => {
    if (!newPatient.rut || !newPatient.full_name) {
      alert('RUT y Nombre son obligatorios.');
      return;
    }
    setIsSavingPatient(true);
    try {
      const { data, error } = await createPharmacyPatient(newPatient);
      if (error) throw error;
      setPatients(prev => [data, ...prev]);
      setSelectedPatient(data);
      setShowAddPatientModal(false);
      setNewPatient({ rut: '', full_name: '', phone: '' });
    } catch (err) {
      alert('Error al guardar paciente: ' + err.message);
    } finally {
      setIsSavingPatient(false);
    }
  };

  const handleQuickCashOut = async () => {
    if (!activeWarehouse?.id) {
      alert('Debes seleccionar una sucursal antes de registrar retiros de caja.');
      return;
    }
    if (Number(quickCashModal.amount || 0) <= 0) {
      alert('Debes ingresar un monto mayor a cero.');
      return;
    }
    if (!quickCashModal.reason.trim()) {
      alert('Debes indicar la justificación del retiro.');
      return;
    }

    setIsProcessingSale(true);
    try {
      const { error: movementError } = await createCashMovement({
        sessionId: activeSession.id,
        movementType: 'OUT',
        amount: Number(quickCashModal.amount || 0),
        reason: quickCashModal.reason.trim(),
      });
      if (movementError) throw movementError;

      setQuickCashModal({ open: false, amount: '', reason: '' });
      alert('Retiro de dinero registrado en la caja activa.');
      loadInitialData(); // Recargar para actualizar esperado
    } catch (error) {
      console.error('Error registrando retiro rápido:', error);
      alert(`No se pudo registrar el retiro: ${error.message || error}`);
    } finally {
      setIsProcessingSale(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeSession?.id) return;

    const closingBalance = declaredTotal;

    if (closingBalance < 0) {
      alert('El efectivo fisico no puede ser negativo.');
      return;
    }
    if (!activeSession.operator?.id) {
      alert('La sesión no tiene operador POS asociado y no puede cerrarse de forma segura.');
      return;
    }
    if (!/^\d{4}$/.test(closingModal.pinCode.trim())) {
      alert('Debes ingresar el PIN de 4 dígitos del operador para cerrar el turno.');
      return;
    }
    setIsProcessingSale(true);
    try {
      const { data: closeResult, error } = await closePosSession({
        sessionId: activeSession.id,
        operatorId: activeSession.operator.id,
        pinCode: closingModal.pinCode.trim(),
        countedCash: closingBalance,
      });
      if (error) throw error;

      setClosingModal({ 
        open: false, 
        closingBalance: '', 
        pinCode: '',
        denominations: {
          '20000': 0, '10000': 0, '5000': 0, '2000': 0, '1000': 0,
          '500': 0, '100': 0, '50': 0, '10': 0
        }
      });
      const backendDifference = Number(closeResult?.summary?.difference || 0);
      if (backendDifference !== 0) {
        const direction = backendDifference > 0 ? 'sobrante' : 'faltante';
        alert(`Turno cerrado con ${direction} de $${Math.abs(backendDifference).toLocaleString('es-CL')}.`);
      } else {
        alert('Turno cerrado correctamente.');
      }
      loadInitialData();
    } catch (error) {
      console.error('Error cerrando turno:', error);
      alert(`No se pudo cerrar el turno: ${error.message || error}`);
    } finally {
      setIsProcessingSale(false);
    }
  };

  const confirmSale = async (modalSaleHeader) => {
    setIsProcessingSale(true);
    try {
      // 1. Procesar Recetas si es necesario
      const normalizedCart = cart.map(item => normalizeCartItemPrescription(item));

      for (const item of normalizedCart) {
        const condition = (item.sale_condition || item.prescription_type || 'VD').toUpperCase();
        if (condition !== 'VD' && condition !== 'VENTA_LIBRE' && !item.has_valid_prescription) {
          throw new Error('Este producto requiere una receta válida asociada antes de vender.');
        }
      }

      for (let i = 0; i < normalizedCart.length; i++) {
        const item = normalizedCart[i];
        const condition = (item.sale_condition || item.prescription_type || 'VD').toUpperCase();
        
        // Si el item requiere receta y NO tiene una vinculada (o es Receta Simple)
        if (condition !== 'VD' && condition !== 'VENTA_LIBRE' && !item.has_valid_prescription) {
          const prescRes = await createPrescriptionWithItems({
            patient_id: selectedPatient.id,
            prescriber_rut: item.validation_rut || item.datos_medico?.rut || 'POR_DEFINIR',
            prescriber_name: item.prescriber_name || item.datos_medico?.nombre || 'MÉDICO GENERAL',
            folio_electronico: item.datos_medico?.folio || `POS-${Date.now()}-${i}`
          }, [{
            product_id: item.id || item.product_id,
            quantity_prescribed: item.quantity,
            dosage_instructions: 'Generada automáticamente en POS'
          }]);

          if (prescRes.error) throw new Error(prescRes.error.message || 'No se pudo crear la receta de la venta.');
          
          if (prescRes.data) {
            const normalizedSalePrescription = buildPrescriptionMeta(prescRes.data, item.prescription_folio || item.correlativo_asociado || item.datos_medico?.folio || null);
            normalizedCart[i] = {
              ...item,
              ...normalizedSalePrescription,
              prescription_id: normalizedSalePrescription.prescription_id,
              prescription_folio: normalizedSalePrescription.prescription_folio || item.prescription_folio || item.datos_medico?.folio || null,
              prescription_status: normalizedSalePrescription.prescription_status || item.prescription_status || null,
              prescription_patient_id: normalizedSalePrescription.prescription_patient_id || item.prescription_patient_id || selectedPatient.id || null,
              has_valid_prescription: Boolean(normalizedSalePrescription.prescription_id),
            };
          }
        }
      }

      const missingPrescriptionItem = normalizedCart.find(item => {
        const condition = (item.sale_condition || item.prescription_type || 'VD').toUpperCase();
        return condition !== 'VD' && condition !== 'VENTA_LIBRE' && !item.has_valid_prescription;
      });

      if (missingPrescriptionItem) {
        throw new Error('Este producto requiere una receta válida asociada antes de vender.');
      }

      const usedPrescriptionIds = new Set(normalizedCart.map(item => item.prescription_id).filter(Boolean));
      const saleHeader = {
        ...modalSaleHeader,
        patient_id: selectedPatient.id,
        prescription_id: modalSaleHeader.prescription_id || [...usedPrescriptionIds][0] || null,
        session_id: activeSession?.id || null,
        operator_id: activeSession?.operator_id || activeSession?.operator?.id || null
      };

      const sale = await createSaleWithItems(saleHeader, normalizedCart, activeWarehouse.id);
      
      // Build receipt data for the confirmation overlay
      let dteDoc = sale?.dte_doc || null;
      let saleItems = [];
      if (!dteDoc && sale?.dte_id) {
        try {
          const [{ data: dte }, { data: items }] = await Promise.all([
            fetchDteById(sale.dte_id),
            fetchSaleItems(sale.sale_id)
          ]);
          dteDoc = dte;
          saleItems = items || [];
        } catch (e) {
          console.warn('No se pudo cargar detalle DTE:', e);
        }
      } else if (sale?.sale_id) {
        const { data: items } = await fetchSaleItems(sale.sale_id);
        saleItems = items || [];
      }

      setSaleReceipt({
        sale_id: sale?.sale_id,
        dte_id: sale?.dte_id,
        dte_doc: dteDoc,
        dte_warning: sale?.dte_warning || null,
        items: saleItems,
        total_amount: sale?.total_amount || saleHeader.total_amount,
        payment_method: sale?.payment_method || saleHeader.payment_method,
        warehouse_name: activeWarehouse?.name || 'Sucursal',
        operator_name: activeSession?.operator?.full_name || activeSession?.operator?.name || 'Operador POS'
      });
      
      setCart([]);
      setExpressCreatedPrescriptionIds(new Set()); // Limpiar IDs de recetas express al finalizar venta
      setShowCheckoutModal(false);
      setSelectedPatient({ id: null, full_name: 'PÚBLICO GENERAL', rut: '1-9' });
      setPendingRecipesModal(prev => ({
        open: false,
        prescriptions: (prev.prescriptions || []).filter(p => !usedPrescriptionIds.has(p.id)),
        loading: false
      }));
      loadInitialData();
    } catch (err) {
      console.error("ERROR CRÍTICO VENTA:", err);
      alert("Error en la venta: " + (err.message || "Consulte logs"));
    } finally { 
      setIsProcessingSale(false); 
    }
  };

  const getBadgeColor = (condition) => {
    const c = (condition || '').toUpperCase();
    if (c === 'VD' || c === 'VENTA_LIBRE') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (c === 'R' || c === 'RECETA_SIMPLE') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (c === 'RR' || c === 'RCH' || c === 'RECETA_RETENIDA' || c === 'RECETA_CHEQUE') return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const openBioequivalentPanel = async (product) => {
    if (!activeWarehouse?.id) return;
    setBioequivalentPanel({ open: true, product, suggestions: [], loading: true });
    try {
      const suggestions = await fetchBioequivalentSuggestions(product.id, activeWarehouse.id);
      setBioequivalentPanel(prev => ({ ...prev, suggestions, loading: false }));
    } catch (err) {
      console.error(err);
      setBioequivalentPanel(prev => ({ ...prev, loading: false }));
    }
  };

  const addAlternativeToCart = (alt) => {
    const product = products.find(p => p.id === alt.product_id);
    if (product) {
      tryAddToCart(product);
    }
    setBioequivalentPanel({ open: false, product: null, suggestions: [], loading: false });
  };

  const getConditionLabel = (p) => {
    const c = (p.sale_condition || p.prescription_type || 'VD').toUpperCase();
    if (c === 'VENTA_LIBRE') return 'VD';
    if (c === 'RECETA_SIMPLE') return 'R';
    if (c === 'RECETA_RETENIDA') return 'RR';
    if (c === 'RECETA_CHEQUE') return 'RCH';
    return c;
  };

  const getSuggestionType = (alt) => alt?.suggestion_type || (alt?.is_bioequivalent ? 'BIOEQUIVALENTE_OFICIAL' : 'ALTERNATIVA_FARMACEUTICA');

  const getSuggestionTypeLabel = (alt) => (getSuggestionType(alt) === 'BIOEQUIVALENTE_OFICIAL' ? 'Bioequivalente oficial' : 'Alternativa farmacéutica');

  const hasOfficialBioequivalent = bioequivalentPanel.suggestions.some((alt) => getSuggestionType(alt) === 'BIOEQUIVALENTE_OFICIAL');

  const bioequivalentPanelTitle = bioequivalentPanel.loading
    ? 'Buscando alternativas...'
    : (bioequivalentPanel.suggestions.length > 0
      ? (hasOfficialBioequivalent ? 'Bioequivalentes disponibles' : 'Alternativas farmacéuticas disponibles')
      : 'Sin alternativas disponibles')
  ;

  const bioequivalentPanelSubtitle = bioequivalentPanel.loading
    ? 'Analizando coincidencias por DCI, concentración y forma farmacéutica.'
    : (bioequivalentPanel.suggestions.length > 0
      ? 'Coincidencia por DCI, concentración y forma farmacéutica.'
      : 'No hay productos disponibles con stock en esta sucursal.');

  const filteredProducts = products;

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      if (filteredProducts.length > 0) {
        const selected = filteredProducts[selectedIndex];
        if (selected) {
          if (selected.stock_disponible > 0) {
            tryAddToCart(selected);
          } else {
            // No hacer nada o alertar si se intenta agregar sin stock
          }
        }
      }
    } else if (e.key === 'Escape') {
      setShowSearchModal(false);
      setSearchTerm('');
    }
  };

  // Búsqueda server-side con debounce
  const searchTimer = useRef(null);
  useEffect(() => {
    if (!activeWarehouse?.id || !showSearchModal) return;
    
    const term = searchTerm.trim();
    
    // Si el término es vacío, volvemos a cargar los productos iniciales
    if (term.length === 0) {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(async () => {
        setSearchLoading(true);
        try {
          const result = await fetchPosProducts(activeWarehouse.id, '', 30);
          if (result) {
            setProducts(result);
            setSelectedIndex(0);
          }
        } catch (err) {
          console.error("Error en reset búsqueda POS:", err);
        } finally {
          setSearchLoading(false);
        }
      }, 150);
      return;
    }
    
    if (term.length < 2) return;

    if (searchTimer.current) clearTimeout(searchTimer.current);
    
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        // Limitamos a 30 resultados para el modal
        const result = await fetchPosProducts(activeWarehouse.id, term, 30);
        if (result) {
          setProducts(result);
          setSelectedIndex(0); // Resetear selección al encontrar nuevos resultados
        }
      } catch (err) {
        console.error("Error en búsqueda POS:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchTerm, activeWarehouse?.id, showSearchModal]);

  const fmtCLP = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-[calc(100vh-140px)] bg-slate-100 font-sans text-slate-800 overflow-hidden">
        {/* LEFT PANEL (~68%) */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200 bg-slate-50/50 relative">
           {/* HEADER IZQUIERDA (Busqueda) */}
           <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0 shadow-sm relative z-10 flex items-center justify-between gap-4">
               <button onClick={() => setShowSearchModal(true)}
                 className="flex-1 flex items-center gap-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl px-4 py-3 text-left hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group">
                 <Search size={18} className="text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
                 <span className="text-sm font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">
                   Buscar producto o escanear código... <span className="text-slate-300 text-xs">(F1)</span>
                 </span>
               </button>
               <button 
                 onClick={() => setQuickCashModal({ open: true, amount: '', reason: '' })}
                 className="shrink-0 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
               >
                 <ArrowUpCircle size={16} className="text-slate-400" />
                 Retiro
               </button>
               {activeSession && (
                 <button
                   onClick={() => setClosingModal(prev => ({ ...prev, open: true }))}
                   className="shrink-0 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] font-black uppercase text-red-600 hover:bg-red-100 transition-colors shadow-sm"
                 >
                   <ShieldAlert size={16} />
                   Cierre
                 </button>
               )}
           </div>

           {/* LISTA DE PRODUCTOS CARRITO RICH FORMAT */}
           <div className="flex-1 overflow-y-auto p-6 space-y-3 relative z-0">
               {cart.length === 0 ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                    <ShoppingCart size={64} className="mb-4 opacity-20" />
                    <p className="text-lg font-black uppercase tracking-widest text-slate-300">Terminal Vacía</p>
                    <p className="text-xs font-bold text-slate-400 mt-1">Presiona F1 para buscar</p>
                 </div>
               ) : (
                  cart.map(item => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-4 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
                       <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                             <div className="min-w-0">
                                <h3 className="text-sm font-black text-slate-800 leading-tight truncate">{item.name}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 truncate">{item.laboratory || 'GENERICO'} • {item.dci || 'Sin DCI'}</p>
                             </div>
                             <div className="text-right shrink-0">
                                <span className="block text-lg font-black text-emerald-700">{fmtCLP(safePrice(item) * Number(item.quantity))}</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">{fmtCLP(safePrice(item))} c/u</span>
                             </div>
                          </div>
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                             <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${getBadgeColor(item.sale_condition || item.prescription_type)}`}>
                                {getConditionLabel(item)}
                             </span>
                             {item.is_bioequivalent && <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-200">BIOEQUIVALENTE</span>}
                             {(item.stock_disponible <= 5) && <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-orange-50 text-orange-700 border border-orange-200">STOCK BAJO ({item.stock_disponible})</span>}
                          </div>
                          {(item.validation_rut || item.prescription_id || item.correlativo_asociado) && (
                             <div className="mt-3 p-2 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                   <Stethoscope size={14} className="text-slate-400" />
                                   <div>
                                      {item.validation_rut && <p className="text-[10px] font-black text-slate-600 uppercase tracking-tighter">DR: {item.validation_rut}</p>}
                                      {(item.prescription_id || item.correlativo_asociado) && <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">RECETA: {item.correlativo_asociado || item.prescription_id?.slice(0,8)}</p>}
                                   </div>
                                </div>
                             </div>
                          )}
                       </div>
                       {/* Controles Cantidad */}
                       <div className="flex flex-col items-end justify-between border-l border-slate-100 pl-4 shrink-0">
                          <button onClick={() => removeFromCart(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                             <Trash2 size={16} />
                          </button>
                          <div className="bg-slate-50 rounded-xl p-1 border border-slate-200">
                             <input
                               ref={el => { qtyRefs.current[item.id] = el; }}
                               type="number" min="1"
                               className="w-12 text-center text-xs font-black text-slate-800 bg-transparent outline-none focus:bg-white focus:border-emerald-500"
                               value={item.quantity}
                               onChange={e => setQuantity(item.id, e.target.value)}
                               onFocus={e => e.target.select()}
                             />
                          </div>
                       </div>
                    </div>
                  ))
               )}
           </div>
        </div>

        {/* RIGHT PANEL (~32%) CHECKOUT TIPO TERMINAL */}
        <div className="w-[360px] xl:w-[400px] flex flex-col bg-white shrink-0 shadow-[-10px_0_30px_rgba(0,0,0,0.03)] z-20">
            {/* HEADER TERMINAL */}
            <div className="p-5 bg-slate-900 text-white shrink-0 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2 text-slate-300">
                        <Wallet size={14} className="text-emerald-400" />
                        Terminal POS
                    </h2>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${activeSession?.status === 'OPEN' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                        {activeSession?.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                        <span className="block text-[8px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Operador</span>
                        <span className="block text-[10px] text-white font-bold truncate">{activeSession?.operator?.full_name || '—'}</span>
                    </div>
                    <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                        <span className="block text-[8px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Sucursal</span>
                        <span className="block text-[10px] text-emerald-400 font-bold truncate">{activeWarehouse?.name || '—'}</span>
                    </div>
                </div>
            </div>

            {/* BODY CHECKOUT */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-slate-50">
                {/* SELECTOR DE PACIENTE */}
                <div className="space-y-2">
                   <div className="flex justify-between items-center">
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</label>
                     <button 
                       onClick={() => setShowAddPatientModal(true)}
                       className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest flex items-center gap-1"
                     >
                       <Plus size={10} /> Nuevo
                     </button>
                   </div>
                   <SearchableSelect 
                     className="w-full bg-white text-sm font-bold"
                     placeholder="PÚBLICO GENERAL"
                     options={[
                       { value: null, label: 'PÚBLICO GENERAL', subLabel: '1-9' },
                       ...patients.map(p => ({ value: p.id, label: p.full_name, subLabel: p.rut }))
                     ]}
                     value={selectedPatient?.id}
                     onChange={(val) => {
                       if (val === null) setSelectedPatient({ id: null, full_name: 'PÚBLICO GENERAL', rut: '1-9' });
                       else {
                         const p = patients.find(pat => pat.id === val);
                         if (p) setSelectedPatient(p);
                       }
                     }}
                   />
                </div>

                {/* RESUMEN DE COMPRA */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 mt-auto">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Resumen</h3>
                    <div className="space-y-2 text-sm font-bold text-slate-600">
                        <div className="flex justify-between">
                            <span>Subtotal ({totalItems} items)</span>
                            <span>{fmtCLP(calculateTotal())}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                            <span>Descuentos</span>
                            <span>$0</span>
                        </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100 mt-2">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total a Pagar</span>
                            <span className="text-4xl font-black text-emerald-600 tracking-tighter leading-none">{fmtCLP(calculateTotal())}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* FOOTER BOTONES COBRAR */}
            <div className="p-6 bg-white border-t border-slate-200 shrink-0">
                <button disabled={cart.length === 0 || isProcessingSale} onClick={handleCheckout}
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg shadow-[0_8px_16px_rgba(5,150,105,0.2)] hover:bg-emerald-700 hover:shadow-[0_4px_8px_rgba(5,150,105,0.2)] transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-3">
                    {isProcessingSale ? <Loader2 size={24} className="animate-spin" /> : <><CreditCard size={24} /> COBRAR (F2)</>}
                </button>
            </div>
        </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: BÚSQUEDA DE PRODUCTOS (F1)                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showSearchModal && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm pt-[100px]"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSearchModal(false); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[75vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 bg-slate-50">
              <Search size={22} className="text-emerald-500 shrink-0" />
              <input ref={searchInputRef} type="text"
                placeholder="Busque por Nombre, DCI, Código o Laboratorio..."
                className="flex-1 bg-transparent text-xl font-bold outline-none placeholder-slate-300 text-slate-700"
                value={searchTerm} 
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedIndex(0);
                }} 
                onKeyDown={handleSearchKeyDown} 
              />
              {searchLoading && <Loader2 size={20} className="animate-spin text-emerald-500" />}
              <button onClick={() => { setShowSearchModal(false); setSearchTerm(''); }}
                className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredProducts.length === 0 && !searchLoading ? (
                <div className="py-24 text-center text-slate-300">
                  <Package size={64} className="mx-auto mb-4 opacity-10" />
                  <p className="text-lg font-black uppercase tracking-widest text-slate-200">No se encontraron productos</p>
                  <p className="text-sm font-medium mt-2">Intente con otros términos de búsqueda</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-md border-b border-slate-100 z-10">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Producto / DCI</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Cond.</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Disponible</th>
                      <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Precio</th>
                      <th className="px-4 py-4 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredProducts.map((p, idx) => {
                      const isSelected = idx === selectedIndex;
                      const hasStock = (p.stock_disponible || 0) > 0;
                      return (
                        <tr key={p.id} 
                          className={`transition-colors cursor-pointer ${isSelected ? 'bg-emerald-600/10' : 'hover:bg-slate-50'}`}
                          onClick={() => hasStock && tryAddToCart(p)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-3">
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                              <div>
                                <span className={`font-black block text-sm ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>{p.name}</span>
                                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-tight">{p.dci || 'Sin DCI'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-5 text-center">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${getBadgeColor(p.sale_condition || p.prescription_type)}`}>
                              {getConditionLabel(p)}
                            </span>
                          </td>
                          <td className="px-4 py-5 text-center">
                            <div className="flex flex-col items-center">
                              <span className={`font-mono font-bold text-sm ${!hasStock ? 'text-red-400' : p.stock_disponible <= 5 ? 'text-orange-500' : 'text-slate-600'}`}>
                                {p.stock_disponible}
                              </span>
                              {!hasStock && <span className="text-[9px] font-black text-red-400 uppercase">Sin Stock</span>}
                            </div>
                          </td>
                          <td className="px-4 py-5 text-right font-black">
                            <span className={Number(safePrice(p)) <= 0 ? 'text-red-400 italic text-[10px]' : 'text-slate-700 text-base'}>
                              {Number(safePrice(p)) <= 0 ? 'Sin Precio' : fmtCLP(safePrice(p))}
                            </span>
                          </td>
                          <td className="px-4 py-5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                disabled={!hasStock}
                                onClick={(e) => { e.stopPropagation(); hasStock && tryAddToCart(p); }}
                                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all active:scale-90 ${
                                  !hasStock 
                                  ? 'bg-slate-50 text-slate-200 cursor-not-allowed' 
                                  : isSelected 
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
                                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                }`}
                              >
                                <Plus size={18} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openBioequivalentPanel(p); }}
                                className="w-10 h-10 flex items-center justify-center rounded-xl text-[10px] font-black uppercase bg-purple-50 text-[#4C3073] hover:bg-purple-100 border border-purple-200 transition-all active:scale-90"
                                title="Ver bioequivalentes"
                              >
                                B
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div>{filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''} encontrados</div>
              <div className="flex gap-4">
                <span className="flex items-center gap-1"><Keyboard size={12} /> flechas para navegar</span>
                <span className="flex items-center gap-1"><ArrowLeft size={12} /> enter para agregar</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PANEL: BIOEQUIVALENTES                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {bioequivalentPanel.open && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setBioequivalentPanel({ open: false, product: null, suggestions: [], loading: false }); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black text-purple-500 uppercase tracking-widest">{bioequivalentPanelTitle}</div>
                <h2 className="text-lg font-black text-slate-800 mt-0.5">{bioequivalentPanel.product?.name || 'Producto'}</h2>
                <p className="text-xs text-slate-400 font-medium">DCI: {bioequivalentPanel.product?.dci || '-'}</p>
              </div>
              <button onClick={() => setBioequivalentPanel({ open: false, product: null, suggestions: [], loading: false })}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {bioequivalentPanel.loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={32} className="animate-spin text-purple-500" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Buscando alternativas...</p>
                </div>
              ) : bioequivalentPanel.suggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                  <FlaskConical size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-black uppercase tracking-widest">{bioequivalentPanelTitle}</p>
                  <p className="text-xs font-medium mt-2">{bioequivalentPanelSubtitle}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bioequivalentPanel.suggestions.map((alt) => (
                    <div key={alt.product_id} className="rounded-2xl border border-slate-200 p-4 hover:border-purple-200 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-slate-800">{alt.product_name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border ${getSuggestionType(alt) === 'BIOEQUIVALENTE_OFICIAL' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-sky-100 text-sky-800 border-sky-200'}`}>
                              {getSuggestionTypeLabel(alt)}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium uppercase">{alt.laboratory || 'Sin laboratorio'}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border ${getBadgeColor(alt.sale_condition)}`}>
                              {getConditionLabel(alt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-3 text-xs">
                            <span className="flex items-center gap-1 text-slate-600">
                              <Package size={14} className="text-emerald-500" />
                              Stock: <strong className="text-slate-800">{Number(alt.available_stock_sales ?? alt.stock_available ?? 0)}</strong>
                            </span>
                            <span className="flex items-center gap-1 text-slate-600">
                              <span className="text-amber-500 font-bold">Vto:</span>
                              {alt.nearest_expiration_date || alt.next_expiry ? new Date(alt.nearest_expiration_date || alt.next_expiry).toLocaleDateString('es-CL') : 'S/V'}
                            </span>
                            <span className="font-black text-slate-700">{fmtCLP(alt.sale_price)}</span>
                          </div>
                          <p className="mt-3 text-xs text-slate-500">{alt.suggestion_reason || 'Coincide por DCI, concentración y forma farmacéutica.'}</p>
                        </div>
                        <button
                          onClick={() => addAlternativeToCart(alt)}
                          className="shrink-0 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-black uppercase tracking-widest hover:bg-purple-700 transition-all active:scale-95 shadow-md shadow-purple-200 flex items-center gap-2"
                        >
                          <Plus size={14} /> Agregar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                Los bioequivalentes oficiales están marcados por ISP; el resto son alternativas farmacéuticas.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: VALIDACIÓN ISP (R / RR)                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {validationModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-t-8 ${validationModal.type === 'RR' ? 'border-red-500' : 'border-yellow-500'}`}>
            <div className="p-0">
              {/* TABS HEADER */}
              <div className="flex bg-slate-50 border-b border-slate-100">
                  <button type="button" 
                    onClick={() => setValidationModal(prev => ({ ...prev, activeTab: 'LLAMAR' }))}
                  className={`flex-1 py-4 text-[11px] font-black uppercase tracking-widest transition-all ${validationModal.activeTab === 'LLAMAR' ? 'bg-white text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Llamar Receta
                </button>
                  <button type="button" 
                    onClick={() => setValidationModal(prev => ({ ...prev, activeTab: 'EXPRESS' }))}
                  className={`flex-1 py-4 text-[11px] font-black uppercase tracking-widest transition-all ${validationModal.activeTab === 'EXPRESS' ? 'bg-white text-[#4C3073] border-b-2 border-[#4C3073]' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Ingreso Express
                </button>
              </div>

              <div className="p-8">
                {validationModal.activeTab === 'LLAMAR' ? (
                  <div className="space-y-6">
                    <div className="flex justify-center mb-2">
                      <div className="p-4 rounded-full bg-emerald-50 text-emerald-500">
                        <Receipt size={48} />
                      </div>
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Buscar Receta</h3>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Ingresa el Correlativo</p>
                    </div>
                    <div className="space-y-4">
                      <input 
                        type="text" 
                        placeholder="REC-10045" 
                        autoFocus
                        className="w-full text-center py-4 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-emerald-500 transition-all font-mono font-bold text-xl"
                        value={validationModal.folioSearch}
                        onChange={(e) => setValidationModal(prev => ({ ...prev, folioSearch: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleLlamarReceta(); } }}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          type="button"
                          onClick={() => setValidationModal({ ...validationModal, isOpen: false })}
                          className="py-3 font-bold text-slate-400 hover:text-slate-600 uppercase text-xs"
                        >
                          Cancelar
                        </button>
                        <button type="button" 
                          onClick={handleLlamarReceta}
                          disabled={!validationModal.folioSearch || validationModal.isLoading}
                          className="py-3 bg-emerald-600 text-white rounded-xl font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                        >
                          {validationModal.isLoading ? <Loader2 size={16} className="animate-spin"/> : 'BUSCAR Y AGREGAR'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center justify-center mb-2">
                      <div className="p-3 rounded-full bg-red-50 text-red-500 mb-2 border border-red-100">
                        <Stethoscope size={32} />
                      </div>
                      <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Prescripción</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[9px] font-black text-white bg-red-500 uppercase py-1 px-2 rounded flex items-center gap-1 shadow-sm">
                          <ShieldAlert size={10} /> Controlado
                        </span>
                        <span className="text-[10px] font-bold text-slate-700 bg-slate-100 py-1 px-2 rounded border border-slate-200">
                          {validationModal.product?.name}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* MÉDICO */}
                      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm hover:border-slate-300 transition-colors">
                        <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex justify-between items-center">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Médico Prescriptor</p>
                        </div>
                        <div className="p-3">
                          {expressSearch.selectedDoctorId ? (
                            <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-md px-3 py-2">
                              <div className="min-w-0">
                                <p className="font-black text-sm text-slate-800 truncate">{expressSearch.doctorResults.find(d => d.id === expressSearch.selectedDoctorId)?.full_name}</p>
                                <p className="text-[10px] text-slate-500 font-mono">{expressSearch.doctorResults.find(d => d.id === expressSearch.selectedDoctorId)?.rut}</p>
                              </div>
                              <button onClick={() => setExpressSearch(prev => ({ ...prev, selectedDoctorId: null, doctorResults: [] }))} className="text-[9px] text-red-500 font-black uppercase hover:underline ml-2">Cambiar</button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <input type="text" placeholder="RUT o Nombre..." autoFocus
                                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-md outline-none focus:border-[#4C3073] focus:bg-white text-sm font-bold transition-all"
                                  value={expressFormData.rut}
                                  onChange={(e) => handleDoctorQueryChange(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleExpressDoctorSearch(); } }}
                                />
                                {expressSearch.searchingDoctor && <Loader2 size={16} className="animate-spin text-[#4C3073] shrink-0"/>}
                              </div>
                              {expressSearch.doctorResults.length > 0 && (
                                <div className="border border-slate-100 rounded-md overflow-hidden max-h-24 overflow-y-auto bg-white shadow-inner">
                                  {expressSearch.doctorResults.map(d => (
                                    <button key={d.id} type="button" onClick={() => { setExpressSearch(prev => ({ ...prev, selectedDoctorId: d.id })); setExpressFormData(prev => ({ ...prev, rut: d.rut, nombre: d.full_name })); }} className="w-full text-left px-3 py-1.5 hover:bg-purple-50 border-b last:border-0 flex justify-between items-center group">
                                      <span className="font-bold text-xs text-slate-700 group-hover:text-[#4C3073] truncate mr-2">{d.full_name}</span>
                                      <span className="text-[9px] text-slate-400 font-mono shrink-0">{d.rut}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input type="text" placeholder="Nombre completo (si es nuevo)..."
                                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-md outline-none focus:border-[#4C3073] focus:bg-white text-xs font-medium transition-all"
                                value={expressFormData.nombre}
                                onChange={(e) => setExpressFormData(prev => ({ ...prev, nombre: e.target.value }))}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* FOLIO Y PACIENTE ROW */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm hover:border-slate-300 transition-colors flex flex-col">
                           <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100">
                             <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest">N° Receta / Folio *</label>
                           </div>
                           <div className="p-3 flex-1 flex items-center justify-center">
                             <input type="text" placeholder="Ej: REC-10045"
                               className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-md outline-none focus:border-[#4C3073] focus:bg-white transition-all font-mono font-bold text-sm text-center"
                               value={expressFormData.folio}
                               onChange={(e) => setExpressFormData(prev => ({ ...prev, folio: e.target.value }))}
                               onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); document.getElementById('expressPatientInput')?.focus(); } }}
                             />
                           </div>
                        </div>

                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm hover:border-slate-300 transition-colors flex flex-col">
                          <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Paciente</p>
                          </div>
                          <div className="p-3 flex-1 flex flex-col">
                            {expressSearch.selectedPatientId ? (
                              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 flex-1">
                                <div className="min-w-0">
                                  <p className="font-black text-xs text-slate-800 truncate">{expressSearch.patientResults.find(p => p.id === expressSearch.selectedPatientId)?.full_name}</p>
                                  <p className="text-[9px] text-slate-500 font-mono">{expressSearch.patientResults.find(p => p.id === expressSearch.selectedPatientId)?.rut}</p>
                                </div>
                                <button onClick={() => setExpressSearch(prev => ({ ...prev, selectedPatientId: null, patientResults: [] }))} className="text-[9px] text-red-500 font-black uppercase hover:underline ml-2">Cambiar</button>
                              </div>
                            ) : (
                              <div className="space-y-2 flex-1 flex flex-col justify-center">
                                <div className="flex items-center gap-2">
                                  <input id="expressPatientInput" type="text" placeholder="RUT o Nombre..."
                                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-md outline-none focus:border-emerald-500 focus:bg-white font-mono font-bold text-xs transition-all"
                                    value={expressFormData.patientRut}
                                    onChange={(e) => handlePatientQueryChange(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleExpressPatientSearch(); } }}
                                  />
                                  {expressSearch.searchingPatient && <Loader2 size={16} className="animate-spin text-emerald-600 shrink-0"/>}
                                </div>
                                {expressSearch.patientResults.length > 0 && (
                                  <div className="border border-slate-100 rounded-md overflow-hidden max-h-24 overflow-y-auto bg-white shadow-inner absolute z-20 w-64 mt-10">
                                    {expressSearch.patientResults.map(p => (
                                      <button key={p.id} type="button" onClick={() => { setExpressSearch(prev => ({ ...prev, selectedPatientId: p.id })); setExpressFormData(prev => ({ ...prev, patientRut: p.rut, patientNombre: p.full_name })); document.getElementById('expressValidateBtn')?.focus(); }} className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 border-b last:border-0 flex justify-between items-center group">
                                        <span className="font-bold text-xs text-slate-700 group-hover:text-emerald-700 truncate mr-2">{p.full_name}</span>
                                        <span className="text-[9px] text-slate-400 font-mono shrink-0">{p.rut}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <input type="text" placeholder="Nombre completo..."
                                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-md outline-none focus:border-emerald-500 focus:bg-white text-xs font-medium transition-all"
                                  value={expressFormData.patientNombre}
                                  onChange={(e) => setExpressFormData(prev => ({ ...prev, patientNombre: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleExpressValidate(); } }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button 
                          type="button"
                          onClick={() => setValidationModal({ ...validationModal, isOpen: false })}
                          className="flex-1 py-3 font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl uppercase text-[10px] tracking-widest transition-colors"
                        >
                          Cancelar
                        </button>
                        <button id="expressValidateBtn" type="button" 
                           onClick={handleExpressValidate}
                          disabled={
                            validationModal.isLoading || isCreatingExpressPrescription ||
                            !expressFormData.folio.trim() ||
                            !(expressSearch.selectedDoctorId || (expressFormData.rut.trim() && expressFormData.nombre.trim())) ||
                            !(expressSearch.selectedPatientId || (expressFormData.patientRut.trim() && expressFormData.patientNombre.trim()))
                          }
                          className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-black shadow-md shadow-emerald-200 hover:bg-emerald-700 hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {validationModal.isLoading ? <Loader2 size={16} className="animate-spin"/> : 'AUTORIZAR Y AGREGAR'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 py-3 text-center border-t border-slate-100">
                <span className="text-[10px] font-black text-slate-400 flex items-center justify-center gap-2">
                  <FlaskConical size={12}/> VIGILANCIA SANITARIA ACTIVA
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      {showCheckoutModal && (
        <CheckoutModal 
          total={calculateTotal()}
          onClose={() => setShowCheckoutModal(false)}
          onConfirm={confirmSale}
          isProcessing={isProcessingSale}
        />
      )}

      {quickCashModal.open && (
        <div className="fixed inset-0 z-[140] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Retiro Rápido de Dinero</p>
              <button type="button" onClick={() => setQuickCashModal({ open: false, amount: '', reason: '' })} className="rounded-lg border border-gray-300 px-3 py-2 text-[11px] font-black uppercase text-gray-600">Cerrar</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-200">
                  <p className="text-[11px] font-black text-gray-500 uppercase">Monto a Retirar</p>
                </div>
                <div className="p-4">
                  <input
                    type="number"
                    min="0"
                    value={quickCashModal.amount}
                    onChange={(e) => setQuickCashModal((current) => ({ ...current, amount: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-200">
                  <p className="text-[11px] font-black text-gray-500 uppercase">Justificación</p>
                </div>
                <div className="p-4">
                  <textarea
                    value={quickCashModal.reason}
                    onChange={(e) => setQuickCashModal((current) => ({ ...current, reason: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073] min-h-[110px]"
                    placeholder="Ej: retiro a bóveda, pago menor, seguridad"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setQuickCashModal({ open: false, amount: '', reason: '' })} className="rounded-xl border border-gray-300 px-4 py-2.5 text-[11px] font-black uppercase text-gray-700">Cancelar</button>
                <button type="button" onClick={handleQuickCashOut} disabled={isProcessingSale} className="rounded-xl bg-[#4C3073] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-40">
                  {isProcessingSale ? 'Guardando...' : 'Registrar Retiro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRO RÁPIDO PACIENTE */}
      {showAddPatientModal && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-t-8 border-emerald-500">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Plus size={24}/></div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Registro de Paciente</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase">Acceso rápido desde POS</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">RUT del Paciente</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-emerald-500 transition-all font-bold"
                    placeholder="Ej: 12.345.678-9"
                    value={newPatient.rut}
                    onChange={e => setNewPatient({...newPatient, rut: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Nombre Completo</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-emerald-500 transition-all font-bold"
                    placeholder="Ej: Juan Pérez"
                    value={newPatient.full_name}
                    onChange={e => setNewPatient({...newPatient, full_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-widest">Teléfono (Opcional)</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-emerald-500 transition-all font-bold"
                    placeholder="Ej: +56912345678"
                    value={newPatient.phone}
                    onChange={e => setNewPatient({...newPatient, phone: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8">
                <button 
                  onClick={() => setShowAddPatientModal(false)}
                  className="py-3 font-bold text-slate-400 hover:text-slate-600 uppercase text-xs"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSavePatient}
                  disabled={isSavingPatient}
                  className="py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  {isSavingPatient ? <Loader2 size={18} className="animate-spin"/> : 'GUARDAR'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RECETAS PENDIENTES DEL PACIENTE (Puente Inteligente) */}
      {pendingRecipesModal.open && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-8 border-[#4C3073] flex flex-col max-h-[90vh]">
            {pendingRecipesModal.detailPrescription ? (
              <div className="p-8 flex flex-col h-full overflow-hidden">
                <div className="flex items-center gap-3 mb-6 shrink-0">
                  <button onClick={() => setPendingRecipesModal(prev => ({ ...prev, detailPrescription: null }))} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ArrowLeft size={20} /></button>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Detalle de Receta</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">
                      {pendingRecipesModal.detailPrescription.folio_electronico} · Dr. {pendingRecipesModal.detailPrescription.prescriber_name}
                    </p>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto mb-6">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 p-4 rounded-xl">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Tipo</p>
                      <p className="font-black text-slate-800">{pendingRecipesModal.detailPrescription.prescription_type || 'SIMPLE'}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Fecha Emisión</p>
                      <p className="font-black text-slate-800">{new Date(pendingRecipesModal.detailPrescription.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <h4 className="text-sm font-black text-slate-800 uppercase mb-3 border-b pb-2">Productos ({pendingRecipesModal.detailPrescription.items?.length || 0})</h4>
                  <div className="space-y-3">
                    {pendingRecipesModal.detailPrescription.items?.map((item, idx) => {
                      const maxQty = item.quantity_prescribed || 1;
                      const dispQty = item.quantity_dispensed || 0;
                      const pending = Math.max(0, maxQty - dispQty);
                      return (
                        <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center">
                          <div>
                            <p className="font-bold text-sm text-slate-800 uppercase">{item.product?.name}</p>
                            <p className="text-xs text-slate-500">{item.dosage_instructions}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Cantidades</p>
                            <p className="text-xs font-black text-slate-700">Prescrito: {maxQty} | Despachado: {dispQty}</p>
                            <p className={`text-sm font-black mt-1 ${pending > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>Pendiente: {pending}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-50 text-[#4C3073] rounded-2xl"><ShieldAlert size={24}/></div>
                    <div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Recetas Pendientes</h3>
                      <p className="text-xs text-slate-400 font-bold uppercase mt-1">
                        {selectedPatient?.full_name}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 mb-6">
                  {pendingRecipesModal.prescriptions.map(p => {
                    const isSelected = pendingRecipesModal.selected.has(p.id);
                    return (
                      <div key={p.id} className={`flex items-center justify-between p-4 border rounded-xl transition-all cursor-pointer ${isSelected ? 'bg-purple-50 border-purple-300' : 'bg-white border-slate-200 hover:border-purple-200'}`} onClick={() => {
                        const newSet = new Set(pendingRecipesModal.selected);
                        if (newSet.has(p.id)) newSet.delete(p.id);
                        else newSet.add(p.id);
                        setPendingRecipesModal(prev => ({ ...prev, selected: newSet }));
                      }}>
                        <div className="flex items-center gap-4">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-[#4C3073] border-[#4C3073]' : 'border-slate-300'}`}>
                            {isSelected && <CheckCircle2 size={14} className="text-white" />}
                          </div>
                          <div>
                            <p className="font-black text-slate-800 text-sm">{p.folio_electronico}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                              Dr. {p.prescriber_name} · {new Date(p.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black bg-yellow-200 text-yellow-800 px-2 py-1 rounded-md uppercase">
                            {p.status}
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); setPendingRecipesModal(prev => ({ ...prev, detailPrescription: p })); }} className="text-[10px] font-black uppercase text-[#4C3073] hover:underline px-2 py-1">
                            Ver detalle
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="shrink-0">
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => setPendingRecipesModal(prev => ({ ...prev, selected: new Set(prev.prescriptions.map(p => p.id)) }))} className="text-[10px] font-bold text-slate-500 hover:text-slate-800 uppercase px-2 py-1 bg-slate-100 rounded">Seleccionar todas</button>
                    <button onClick={() => setPendingRecipesModal(prev => ({ ...prev, selected: new Set() }))} className="text-[10px] font-bold text-slate-500 hover:text-slate-800 uppercase px-2 py-1 bg-slate-100 rounded">Deseleccionar todas</button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setPendingRecipesModal({ open: false, prescriptions: [], loading: false, selected: new Set(), detailPrescription: null })}
                      className="py-3 font-bold text-slate-400 hover:text-slate-600 uppercase text-xs"
                    >
                      Ignorar
                    </button>
                    <button
                      onClick={handleLoadPendingRecipes}
                      disabled={pendingRecipesModal.loading || pendingRecipesModal.selected.size === 0}
                      className="py-3 bg-[#4C3073] text-white rounded-xl font-black shadow-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {pendingRecipesModal.loading ? <Loader2 size={16} className="animate-spin"/> : `CARGAR SELECCIONADAS (${pendingRecipesModal.selected.size})`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {closingModal.open && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Arqueo de Caja Ciego</h2>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Declare el efectivo físico en gaveta</p>
              </div>
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
                <Calculator size={24} className="text-red-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Billetes */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2 flex items-center gap-2">
                  <Banknote size={14} /> Billetes
                </p>
                <div className="space-y-2">
                  {billDenominations.map(denom => (
                    <div key={denom} className="flex items-center gap-3">
                      <div className="w-20 text-[11px] font-black text-gray-700 bg-gray-50 rounded-lg py-2 px-3 border border-gray-100">
                        {fmtCLP(denom)}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={closingModal.denominations[denom] || ''}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          setClosingModal(prev => ({
                            ...prev,
                            denominations: { ...prev.denominations, [denom]: val }
                          }));
                        }}
                        className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-black outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073] transition-all text-right"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Monedas */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2 flex items-center gap-2">
                  <Wallet size={14} /> Monedas
                </p>
                <div className="space-y-2">
                  {coinDenominations.map(denom => (
                    <div key={denom} className="flex items-center gap-3">
                      <div className="w-20 text-[11px] font-black text-gray-700 bg-gray-50 rounded-lg py-2 px-3 border border-gray-100">
                        {fmtCLP(denom)}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={closingModal.denominations[denom] || ''}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          setClosingModal(prev => ({
                            ...prev,
                            denominations: { ...prev.denominations, [denom]: val }
                          }));
                        }}
                        className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-black outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073] transition-all text-right"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Declarado</p>
                  <p className="text-3xl font-black text-gray-900 mt-1">{fmtCLP(declaredTotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Operador</p>
                  <p className="text-sm font-black text-[#4C3073] uppercase mt-1">{activeSession?.operator?.full_name}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">PIN de Seguridad para Cierre</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={closingModal.pinCode}
                  onChange={(e) => setClosingModal((current) => ({ ...current, pinCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className="w-full rounded-2xl border border-gray-200 px-6 py-4 text-2xl font-black tracking-[0.8em] outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073] transition-all text-center"
                  placeholder="••••"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setClosingModal({ 
                  open: false, 
                  closingBalance: '', 
                  pinCode: '',
                  denominations: {
                    '20000': 0, '10000': 0, '5000': 0, '2000': 0, '1000': 0,
                    '500': 0, '100': 0, '50': 0, '10': 0
                  }
                })}
                className="flex-1 py-4 text-[11px] font-black uppercase text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCloseSession}
                disabled={isProcessingSale}
                className="flex-[2] rounded-2xl bg-red-600 py-4 text-sm font-black uppercase text-white shadow-xl shadow-red-100 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                {isProcessingSale ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'Finalizar Turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OVERLAY: SELECCIÓN DE TERMINAL ──────────────────────────────── */}
      {isTerminalSelectionOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full text-center">
            <Calculator size={60} className="mx-auto text-[#4C3073] mb-6" />
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Identidad del Terminal</h2>
            <p className="text-gray-500 mb-8">Este equipo no está configurado. Selecciona a qué caja física corresponde para comenzar.</p>
            
            <div className="space-y-3">
              {terminals.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTerminal(t.id)}
                  className="w-full py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black uppercase text-gray-700 hover:border-[#4C3073] hover:bg-purple-50 transition-all"
                >
                  {t.name}
                </button>
              ))}
              {terminals.length === 0 && (
                <p className="text-red-500 font-bold">No hay terminales configurados en esta sucursal.</p>
              )}
            </div>

            <button
              onClick={() => navigate('/farmacia/escritorio')}
              className="mt-10 inline-flex items-center gap-2 text-[11px] font-black uppercase text-gray-400 hover:text-[#4C3073] transition-colors"
            >
              <ArrowLeft size={16} />
              Volver al Menú Principal
            </button>
          </div>
        </div>
      )}

      {/* ── OVERLAY: CAJA CERRADA ────────────────────────────────────────── */}
      {!activeSession && !loading && !isTerminalSelectionOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-10 max-w-lg w-full text-center shadow-2xl">
            <div className="w-20 h-20 bg-red-50 border-2 border-red-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert size={40} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-3">Caja Cerrada</h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              No hay turnos activos para este terminal: <span className="font-black text-gray-800 uppercase">{terminalId?.slice(0,8)}</span>.<br/>
              Solicite al encargado la <span className="font-black text-[#4C3073]">Pre-Apertura</span> desde el módulo de Control de Caja.
            </p>
            <button 
              onClick={() => { localStorage.removeItem('pharmacy_terminal_id'); window.location.reload(); }}
              className="text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 underline"
            >
              Cambiar Identidad del Terminal
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: ACTIVACIÓN CON PIN (SESSION PENDING) ──────────────────── */}
      {activationModal.open && (
        <div className="fixed inset-0 z-[180] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white rounded-[40px] p-10 max-w-md w-full text-center shadow-2xl border-t-8 border-[#4C3073]">
            <div className="mb-8">
              <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet size={32} className="text-[#4C3073]" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Turno Pre-Abierto</h2>
              <p className="text-gray-500 mt-2">
                Asignado a: <span className="font-black text-gray-800 uppercase">{activeSession?.operator?.full_name}</span>
              </p>
            </div>

            <div className="bg-gray-50 rounded-3xl p-6 mb-8 border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Efectivo Inicial a recibir</p>
              <p className="text-3xl font-black text-emerald-600">{fmtCLP(activeSession?.opening_balance)}</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Ingresa tu PIN de Operador</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={4}
                  value={activationModal.pinCode}
                  onChange={(e) => setActivationModal(prev => ({ ...prev, pinCode: e.target.value.replace(/\D/g, '') }))}
                  className="w-full text-center text-4xl font-black tracking-[0.8em] py-5 bg-gray-50 border-2 border-gray-100 rounded-3xl focus:border-[#4C3073] focus:bg-white outline-none transition-all"
                  placeholder="••••"
                />
              </div>

              <button
                disabled={activationModal.pinCode.length < 4 || isProcessingSale}
                onClick={handleActivateSession}
                className="w-full py-5 bg-[#4C3073] text-white rounded-3xl font-black uppercase text-lg shadow-xl shadow-purple-200 hover:bg-[#3f285f] disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
              >
                {isProcessingSale ? <Loader2 className="animate-spin" /> : 'Activar Turno y Abrir Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RECEIPT CONFIRMATION OVERLAY ── */}
      {saleReceipt && (
        <>
          <style>{`@media print { body * { visibility: hidden !important; } #pos-receipt-modal, #pos-receipt-modal * { visibility: visible !important; } #pos-receipt-modal { position: absolute !important; inset: 0 !important; background: #fff !important; margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 80mm !important; } .hide-on-print { display: none !important; } }`}</style>
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-4">
            <div className="relative flex flex-col w-full max-w-[340px] max-h-[92vh] bg-white shadow-2xl rounded-sm overflow-hidden animate-in zoom-in-95 duration-200" id="pos-receipt-modal">
              {/* Zig-zag top border for thermal effect */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-[radial-gradient(circle,transparent_4px,#fff_5px)] bg-[length:10px_10px] -mt-2"></div>
              
              <div className="flex-1 overflow-auto p-6 font-mono text-slate-800 bg-white">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                     <Package size={24} className="text-white" />
                  </div>
                  <h2 className="text-lg font-black uppercase tracking-widest leading-none">Farmadatix</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">{saleReceipt.warehouse_name || 'Sucursal Principal'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">COMPROBANTE INTERNO DE VENTA</p>
                  <div className="mt-4 px-2 py-1 bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest border border-red-200 border-dashed">
                    NO VÁLIDO TRIBUTARIAMENTE
                  </div>
                </div>

                <div className="space-y-2 border-y border-dashed border-slate-300 py-4 mb-4 text-[10px] uppercase font-bold">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Folio:</span>
                    <span className="text-slate-900">{saleReceipt.dte_doc?.folio ? `#${saleReceipt.dte_doc.folio}` : 'PENDIENTE'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fecha:</span>
                    <span className="text-slate-900">{saleReceipt.dte_doc ? new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'short'}).format(new Date(saleReceipt.dte_doc.issued_at)) : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Atiende:</span>
                    <span className="text-slate-900 truncate max-w-[120px] text-right">{saleReceipt.operator_name || 'Operador'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pago:</span>
                    <span className="text-slate-900">{saleReceipt.payment_method === 'CASH' ? 'EFECTIVO' : saleReceipt.payment_method === 'CARD' ? 'TARJETA' : 'TRANSFERENCIA'}</span>
                  </div>
                </div>

                {saleReceipt.items.length > 0 && (
                  <div className="mb-4">
                    <table className="w-full text-[10px] font-bold">
                      <thead>
                        <tr className="border-b border-dashed border-slate-300 text-slate-500">
                          <th className="py-2 text-left font-bold uppercase w-1/2">Cant x Artículo</th>
                          <th className="py-2 text-right font-bold uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dashed divide-slate-100">
                        {saleReceipt.items.map((item, i) => (
                          <tr key={i}>
                            <td className="py-2 text-left uppercase">
                              <span className="block text-slate-900">{item.product?.name || 'Producto'}</span>
                              <span className="text-slate-500">{item.quantity} x {new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(item.unit_price || item.price_sale || 0)}</span>
                            </td>
                            <td className="py-2 text-right text-slate-900 items-start align-top pt-2">
                              {new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(item.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="border-t-2 border-slate-900 pt-3 mb-6">
                  <div className="flex justify-between items-end">
                    <span className="text-[14px] font-black uppercase">Total:</span>
                    <span className="text-2xl font-black">{new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(saleReceipt.total_amount)}</span>
                  </div>
                </div>

                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <Barcode size={48} className="text-slate-900" strokeWidth={1} />
                  </div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    Gracias por su preferencia<br/>
                    CONSERVE ESTE TICKET
                  </p>
                </div>
              </div>
              
              {/* Zig-zag bottom border for thermal effect */}
              <div className="h-2 bg-[radial-gradient(circle,transparent_4px,#fff_5px)] bg-[length:10px_10px] transform rotate-180"></div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-2 shrink-0 hide-on-print">
                <button
                  onClick={handlePrintReceipt}
                  className="w-full py-3 bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Receipt size={16} /> Imprimir Comprobante
                </button>
                <button
                  onClick={() => setSaleReceipt(null)}
                  className="w-full py-3 text-[11px] font-black text-slate-500 hover:text-slate-800 uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                >
                  <X size={16} /> Cerrar y Continuar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
