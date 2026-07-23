import React, { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import {
  collection, addDoc, getDocs, query, deleteDoc, doc, setDoc, where, collectionGroup, orderBy, limit
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  ChevronLeft, MapPin, Plus, Trash2, LogOut, User, Phone, Mail, Shield, Store,
  Edit2, Check, X, Compass, Map, AlertTriangle, ChevronRight, Receipt, Heart,
  Wallet, Gift, Star, Bell, Headphones, FileText, Lock, Home, ShoppingCart
} from 'lucide-react';
import { authApi } from '../../services/authApi';


export default function Profile() {
  const { user, profile, isAdmin, isRestaurant, updateProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState('menu');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');
  const [addresses, setAddresses] = useState<any[]>([]);
  const [isAddressFormChanged, setIsAddressFormChanged] = useState(false);
  const [gpsTriggered, setGpsTriggered] = useState(false);
   
   // Real data state for wallet, loyalty, and reviews
   const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
   const [walletLoading, setWalletLoading] = useState(false);
   const [reviews, setReviews] = useState<any[]>([]);
   const [reviewsLoading, setReviewsLoading] = useState(false);
   const [userCoupons, setUserCoupons] = useState<any[]>([]);
   const [couponsLoading, setCouponsLoading] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);
  const [addressError, setAddressError] = useState('');

  const [selectedEstadoId, setSelectedEstadoId] = useState('');
  const [selectedCidadeId, setSelectedCidadeId] = useState('');

  const [isManualEstado, setIsManualEstado] = useState(false);
  const [isManualCidade, setIsManualCidade] = useState(false);
  const [isManualBairro, setIsManualBairro] = useState(false);

  const [showCoords, setShowCoords] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [locFeedback, setLocFeedback] = useState<{ type: 'success' | 'warn' | 'error' | null; message: string }>({ type: null, message: '' });

  const [newAddress, setNewAddress] = useState({
    rua: '',
    numero: '',
    numeroSugerido: false,
    complemento: '',
    bairro: '',
    bairroSugerido: false,
    cidade: '',
    estado: '',
    estadoSigla: '',
    referencia: '',
    latitude: null as number | null,
    longitude: null as number | null,
    accuracy: null as number | null,
    cep: '',
    pais: '',
    provider: '',
    placeId: '',
    estado_id: '',
    cidade_id: '',
    bairro_id: '',
    addressConfidenceScore: null as number | null,
    addressConfidenceLevel: null as string | null,
    formattedAddress: ''
  });

  // Reusable utility functions for reverse-geocoding comparison and normalisation
  const normalizeText = (value: string): string => {
    if (!value) return '';
    return value
      .normalize('NFD') // decomposes combined graphemes to base characters + diacritics
      .replace(/[\u0300-\u036f]/g, '') // removes diacritical marks
      .toUpperCase()
      .trim()
      .replace(/\s+/g, ' '); // normalizes multiple spaces
  };

  const findMatchingOption = (value: string, options: any[]): any | undefined => {
    if (!value || !options) return undefined;
    const normalizedValue = normalizeText(value);
    return options.find(option => normalizeText(option.nome) === normalizedValue);
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported by this browser.'));
         return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  // Cache reverse geocode requests to coordinate precision of rounded 4 decimals (~11m spacing)
  const [geocodeCache] = useState<Record<string, any>>({});

  const fetchWithTimeout = async (url: string, timeoutMs: number, options: RequestInit = {}): Promise<any> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);

      if (!response.ok) {
        let bodyText = '';
        try {
          bodyText = await response.text();
        } catch (_) {}
        
        const err: any = new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        err.name = 'HTTPError';
        err.status = response.status;
        err.statusText = response.statusText;
        err.body = bodyText;
        throw err;
      }

      const responseText = await response.text();
      try {
        return JSON.parse(responseText);
      } catch (jsonErr: any) {
        const err: any = new Error('Malformed JSON response received');
        err.name = 'JSONParseError';
        err.body = responseText;
        throw err;
      }
    } catch (err: any) {
      clearTimeout(id);
      if (err.name === 'AbortError') {
        const timeoutError: any = new Error('Request timed out after ' + timeoutMs + 'ms');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw err;
    }
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<any> => {
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (geocodeCache[cacheKey]) {
      return geocodeCache[cacheKey];
    }

    const backendUrl = `/api/reverse-geocode?lat=${lat}&lon=${lng}`;
    const directUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=pt-BR&email=lojadiscretaboutique@gmail.com`;

    // Try backend proxy first!
    try {
      console.log(`[Geocode Try 1] Attempting backend proxy request...`);
      const data = await fetchWithTimeout(backendUrl, 15000);
      geocodeCache[cacheKey] = data;
      return data;
    } catch (backendError: any) {
      console.warn('[Geocode Try 1 Failure] Backend proxy failed. Falling back to direct Nominatim request.', {
        name: backendError.name,
        message: backendError.message,
        stack: backendError.stack,
        status: backendError.status,
        statusText: backendError.statusText,
        body: backendError.body,
        url: backendUrl
      });

      // Try direct Nominatim request as fallback!
      try {
        console.log(`[Geocode Try 2] Attempting direct Nominatim request...`);
        const data = await fetchWithTimeout(directUrl, 15000, {
          headers: {
            'Accept': 'application/json'
          }
        });
        geocodeCache[cacheKey] = data;
        return data;
      } catch (directError: any) {
        console.error('[Geocode Try 2 Failure] Direct Nominatim request also failed.', {
          name: directError.name,
          message: directError.message,
          stack: directError.stack,
          status: directError.status,
          statusText: directError.statusText,
          body: directError.body,
          url: directUrl
        });
        throw directError; // rethrow to be caught by the outer handler
      }
    }
  };

  const extractNeighborhood = (address: any): string => {
    if (!address) return '';
    return address.suburb ||
           address.neighbourhood ||
           address.quarter ||
           address.city_district ||
           address.residential ||
           address.village ||
           address.town ||
           '';
  };

  const extractStreet = (address: any): string => {
    if (!address) return '';
    return address.road ||
           address.pedestrian ||
           address.footway ||
           address.street ||
           '';
  };

  const parseAddressFromNominatim = (data: any) => {
    const addr = data.address || {};
    
    // Use the optimized extract functions
    const bairro = extractNeighborhood(addr);
    const rua = extractStreet(addr);

    const numero = addr.house_number || '';
    const cidade = addr.city || addr.town || addr.municipality || addr.village || '';
    const estado = addr.state || '';
    const cep = addr.postcode || '';

    return {
      bairro,
      rua,
      numero,
      cidade,
      estado,
      cep
    };
  };

  const handleLoadCurrentLocation = async () => {
    if (locLoading) return;
    setLocLoading(true);
    setLocFeedback({ type: null, message: '' });
    
    let capturedLat: number | null = null;
    let capturedLng: number | null = null;
    let capturedAccuracy: number | null = null;

    try {
      const location = await getCurrentLocation();
      const { lat, lng, accuracy } = location;
      capturedLat = lat;
      capturedLng = lng;
      capturedAccuracy = accuracy;

      // Prefill coordinates immediately so they are saved even if geocoding fails
      setNewAddress(prev => ({
        ...prev,
        latitude: lat,
        longitude: lng,
        accuracy: accuracy
      }));

      console.log(`[GPS Profile] Querying unify address backend for lat=${lat}, lng=${lng}`);
      const response = await fetch('/api/address-from-gps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          accuracy: accuracy
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao obter endereço completo pelas APIs do Google Maps.');
      }

      const parsed = await response.json();
      console.log('[GPS Profile] Unified address returned:', parsed);

      // Sucesso parcial: precisa ter no mínimo lat, lng, rua, cidade, estado
      if (!parsed.latitude || !parsed.longitude || !parsed.rua || !parsed.cidade || !parsed.estado) {
         throw new Error("Localização inconclusiva. Complete manualmente.");
      }
      
      const street = parsed.rua || '';
      const neighborhood = parsed.bairro || '';
      const houseNumber = parsed.numero || '';

      // Match Estado from Firestore list
      const matchedEstado = findMatchingOption(parsed.estado, estados);
      let fetchedCidades: any[] = [];
      let matchedCidade: any = null;
      let fetchedBairros: any[] = [];
      let matchedBairro: any = null;

      if (matchedEstado) {
        setIsManualEstado(false);
        setSelectedEstadoId(matchedEstado.id);
        
        // Query cities synchronously
        const cityQuery = query(
          collection(db, 'cidades'),
          where('estado_id', '==', matchedEstado.id),
          where('ativo', '==', true)
        );
        let citySnap;
        try {
          citySnap = await getDocs(cityQuery);
          fetchedCidades = citySnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        } catch (error) {
          console.error("Error fetching cities matching location:", error);
        }

        matchedCidade = findMatchingOption(parsed.cidade, fetchedCidades);
        if (matchedCidade) {
          setIsManualCidade(false);
          setCidades(fetchedCidades);
          setSelectedCidadeId(matchedCidade.id);

          // Query bairros synchronously
          const bairroQuery = query(
            collection(db, 'bairros'),
            where('cidade_id', '==', matchedCidade.id),
            where('ativo', '==', true)
          );
          let bairroSnap;
          try {
            bairroSnap = await getDocs(bairroQuery);
            fetchedBairros = bairroSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          } catch (error) {
            console.error("Error fetching bairros matching location:", error);
          }

          matchedBairro = findMatchingOption(neighborhood, fetchedBairros);
          if (matchedBairro) {
            setIsManualBairro(false);
            setBairros(fetchedBairros);
          } else {
            setIsManualBairro(true);
          }
        } else {
          setIsManualCidade(true);
          setIsManualBairro(true);
        }
      } else {
        setIsManualEstado(true);
        setIsManualCidade(true);
        setIsManualBairro(true);
      }

      // Populate form state fields without overwriting user manual typing if exists
      setNewAddress(prev => {
        const finalRua = prev.rua && prev.rua.trim() !== '' ? prev.rua : (street || '');
        const finalNumero = prev.numero && prev.numero.trim() !== '' ? prev.numero : (houseNumber || '');
        const finalBairro = prev.bairro && prev.bairro.trim() !== '' ? prev.bairro : (matchedBairro ? matchedBairro.nome : (neighborhood || ''));
        const finalCidade = prev.cidade && prev.cidade.trim() !== '' ? prev.cidade : (matchedCidade ? matchedCidade.nome : (parsed.cidade || ''));
        const finalEstado = prev.estado && prev.estado.trim() !== '' ? prev.estado : (matchedEstado ? matchedEstado.nome : (parsed.estado || ''));

        return {
          ...prev,
          rua: finalRua,
          numero: finalNumero,
          numeroSugerido: prev.numero && prev.numero.trim() !== '' ? false : (parsed.numeroSugerido || false),
          bairro: finalBairro,
          bairroSugerido: prev.bairro && prev.bairro.trim() !== '' ? false : (parsed.bairroSugerido || false),
          cidade: finalCidade,
          estado: finalEstado,
          estadoSigla: parsed.estadoSigla || prev.estadoSigla || '',
          cep: parsed.cep || prev.cep || '',
          pais: parsed.pais || prev.pais || 'Brasil',
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
          provider: 'google',
          source: 'gps-google-full',
          placeId: parsed.placeId || '',
          estado_id: matchedEstado ? matchedEstado.id : '',
          cidade_id: matchedCidade ? matchedCidade.id : '',
          bairro_id: matchedBairro ? matchedBairro.id : '',
          addressConfidenceScore: parsed.addressConfidenceScore || null,
          addressConfidenceLevel: parsed.addressConfidenceLevel || null,
          formattedAddress: parsed.formattedAddress || prev.formattedAddress || ''
        };
      });

      // Feedback rules matching exactly the requirements
      let feedbackMsg = 'Localização encontrada. Confira número, bairro e referência antes de salvar.';
      let feedbackType: 'success' | 'warn' | 'error' = 'success';

      if (parsed.needsManualNumberConfirmation || parsed.needsManualNeighborhoodConfirmation) {
        feedbackMsg = 'Localização encontrada. Confira número, bairro e referência antes de salvar.';
        feedbackType = 'warn';
      } else if (parsed.numeroSugerido) {
        feedbackMsg = 'Encontramos um número provável próximo da sua localização. Confira antes de salvar.';
        feedbackType = 'warn';
      } else if (parsed.bairroSugerido) {
        feedbackMsg = 'Encontramos um bairro provável. Confira antes de salvar.';
        feedbackType = 'warn';
      } 

      setLocFeedback({
        type: feedbackType,
        message: feedbackMsg
      });

    } catch (error: any) {
      console.error('Error with Google GPS full address finder:', error);
      
      setIsManualEstado(true);
      setIsManualCidade(true);
      setIsManualBairro(true);

      if (capturedLat !== null && capturedLng !== null) {
        setNewAddress(prev => ({
          ...prev,
          latitude: capturedLat,
          longitude: capturedLng,
          accuracy: capturedAccuracy,
          provider: 'manual'
        }));
      }

      setLocFeedback({
        type: 'warn',
        message: 'Encontramos sua localização, mas não conseguimos preencher todo o endereço automaticamente. Complete manualmente.'
      });
    } finally {
      setLocLoading(false);
      setIsAddressFormChanged(false);
    }
  };

  const resendEmail = async () => {
    if (user && user.email) {
      try {
        const result = await authApi.sendActivationEmail(user.email);
        if (result.success) {
          alert('E-mail de ativação reenviado com sucesso! Verifique sua caixa de entrada.');
        } else {
          throw new Error(result.error);
        }
      } catch (error: any) {
        console.error(error);
        alert('Erro ao reenviar e-mail: ' + (error.message || 'Tente novamente.'));
      }
    }
  };

  useEffect(() => {
    const fetchEstados = async () => {
      try {
        const q = query(collection(db, 'estados'), where('ativo', '==', true));
        const snap = await getDocs(q);
        setEstados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching estados:", error);
        handleFirestoreError(error, OperationType.GET, 'estados');
      }
    };
    fetchEstados();
  }, []);

  useEffect(() => {
    if (estados.length === 0) return;

    const params = new URLSearchParams(location.search);
    const hasAddAddressQuery = params.get('addAddress') === 'true';
    const hasGpsQuery = params.get('gps') === 'true';

    const stateAddAddress = location.state?.addAddress;
    const stateTriggerGps = location.state?.triggerGps;

    if ((hasAddAddressQuery || stateAddAddress) && !gpsTriggered) {
      setGpsTriggered(true);
      setActiveSection('addresses');
      setShowAddAddress(true);
      if (hasGpsQuery || stateTriggerGps) {
        // Clear query/state parameter to avoid looping
        window.history.replaceState({}, document.title);
        handleLoadCurrentLocation();
      }
    }
  }, [location, estados, gpsTriggered]);

  useEffect(() => {
    if (!selectedEstadoId) {
      setCidades([]);
      return;
    }
    const fetchCidades = async () => {
      try {
        const q = query(collection(db, 'cidades'), where('estado_id', '==', selectedEstadoId), where('ativo', '==', true));
        const snap = await getDocs(q);
        setCidades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching cidades:", error);
        handleFirestoreError(error, OperationType.GET, 'cidades');
      }
    };
    fetchCidades();
  }, [selectedEstadoId]);

  useEffect(() => {
    if (!selectedCidadeId) {
      setBairros([]);
      return;
    }
    const fetchBairros = async () => {
      try {
        const q = query(collection(db, 'bairros'), where('cidade_id', '==', selectedCidadeId), where('ativo', '==', true));
        const snap = await getDocs(q);
        setBairros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching bairros:", error);
        handleFirestoreError(error, OperationType.GET, 'bairros');
      }
    };
    fetchBairros();
  }, [selectedCidadeId]);

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ nome: '', telefone: '' });
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchAddresses();
    if (profile) {
      setEditData({
        nome: profile.nome || '',
        telefone: profile.telefone || ''
      });
    }
  }, [user, profile]);

  const fetchAddresses = async () => {
    try {
      const q = query(collection(db, 'users', user!.uid, 'enderecos'));
      const snap = await getDocs(q);
      setAddresses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching addresses:", error);
      handleFirestoreError(error, OperationType.GET, `users/${user!.uid}/enderecos`);
    }
  };

  const fetchWalletTransactions = async () => {
    if (!user) return;
    setWalletLoading(true);
    try {
      const colRef = collection(db, 'users', user.uid, 'transacoes_carteira');
      const snap = await getDocs(colRef);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a: any, b: any) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime());
      setWalletTransactions(list);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setWalletLoading(false);
    }
  };

  const fetchMyReviews = async () => {
    if (!user) return;
    setReviewsLoading(true);
    try {
      const q = query(
        collectionGroup(db, 'avaliacoes'),
        where('cliente_id', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);
      const fetchedReviews = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      fetchedReviews.sort((a: any, b: any) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime());
      setReviews(fetchedReviews);
    } catch (err) {
      console.error("Error fetching user reviews:", err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const fetchUserCoupons = async () => {
    if (!user) return;
    setCouponsLoading(true);
    try {
      const colRef = collection(db, 'users', user.uid, 'cupons');
      const snap = await getDocs(colRef);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserCoupons(list);
    } catch (err) {
      console.error("Error fetching coupons:", err);
    } finally {
      setCouponsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchWalletTransactions();
    fetchMyReviews();
    fetchUserCoupons();
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!editData.nome.trim() || !editData.telefone.trim()) {
      alert('Nome e telefone não podem ser vazios.');
      return;
    }
    setSaveLoading(true);
    const docPath = `users/${user!.uid}`;
    try {
      await setDoc(doc(db, 'users', user!.uid), editData, { merge: true });
      updateProfile(editData);
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      alert('Erro ao salvar perfil.');
      handleFirestoreError(error, OperationType.WRITE, docPath);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const collPath = `users/${user.uid}/enderecos`;

    const stateName = newAddress.estado.trim();
    const cityName = newAddress.cidade.trim();
    const neighborhoodName = newAddress.bairro.trim();

    if (!stateName || !cityName || !neighborhoodName) {
      setAddressError("O Estado, Cidade e Bairro são campos de preenchimento obrigatório e não podem ser vazios.");
      return;
    }

    setAddressError('');
    setLocFeedback({ type: null, message: '' });

    // Validate State (optional match)
    const matchedState = findMatchingOption(stateName, estados);
    const finalStateName = matchedState ? matchedState.nome : stateName;
    const finalStateId = matchedState ? matchedState.id : '';

    // Validate City (optional match)
    let matchedCity = null;
    if (matchedState) {
      try {
        const cityQuery = query(
          collection(db, 'cidades'),
          where('estado_id', '==', matchedState.id),
          where('ativo', '==', true)
        );
        const citySnap = await getDocs(cityQuery);
        const fetchedCities = citySnap.docs.map(d => ({ id: d.id, ...d.data() }));
        matchedCity = findMatchingOption(cityName, fetchedCities);
      } catch (err) {
        console.error("Error validating city:", err);
      }
    }
    const finalCityName = matchedCity ? matchedCity.nome : cityName;
    const finalCityId = matchedCity ? matchedCity.id : '';

    // Validate Neighborhood (optional match)
    let matchedNeighborhood = null;
    if (matchedCity) {
      try {
        const neighborhoodQuery = query(
          collection(db, 'bairros'),
          where('cidade_id', '==', matchedCity.id),
          where('ativo', '==', true)
        );
        const neighborhoodSnap = await getDocs(neighborhoodQuery);
        const fetchedNeighborhoods = neighborhoodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        matchedNeighborhood = findMatchingOption(neighborhoodName, fetchedNeighborhoods);
      } catch (err) {
        console.error("Error validating neighborhood:", err);
      }
    }
    const finalNeighborhoodName = matchedNeighborhood ? matchedNeighborhood.nome : neighborhoodName;
    const finalNeighborhoodId = matchedNeighborhood ? matchedNeighborhood.id : '';

    let finalLat = newAddress.latitude;
    let finalLng = newAddress.longitude;
    let finalProvider = newAddress.provider || 'manual';

    if (!finalLat || !finalLng || isAddressFormChanged) {
      try {
        const geoRes = await fetch('/api/geocode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            rua: newAddress.rua,
            numero: newAddress.numero,
            bairro: finalNeighborhoodName,
            cidade: finalCityName,
            estado: finalStateName
          })
        });

        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.latitude !== undefined && geoData.longitude !== undefined) {
            finalLat = geoData.latitude;
            finalLng = geoData.longitude;
            finalProvider = geoData.provider || 'geocoded';
          }
        }
      } catch (err) {
        console.error("Error geocoding address on submit:", err);
      }
    }

    const addressToSave = {
      ...newAddress,
      latitude: finalLat,
      longitude: finalLng,
      estado: finalStateName,
      estado_id: finalStateId,
      cidade: finalCityName,
      cidade_id: finalCityId,
      bairro: finalNeighborhoodName,
      bairro_id: finalNeighborhoodId,
      pais: newAddress.pais || 'Brasil',
      provider: finalProvider,
      placeId: newAddress.placeId || '',
      estadoSigla: newAddress.estadoSigla || '',
      addressConfidenceScore: newAddress.addressConfidenceScore || null,
      addressConfidenceLevel: newAddress.addressConfidenceLevel || null,
      formattedAddress: newAddress.formattedAddress || ''
    };

    try {
      await addDoc(collection(db, 'users', user.uid, 'enderecos'), addressToSave);
      setNewAddress({
        rua: '',
        numero: '',
        numeroSugerido: false,
        complemento: '',
        bairro: '',
        bairroSugerido: false,
        cidade: '',
        estado: '',
        estadoSigla: '',
        referencia: '',
        latitude: null,
        longitude: null,
        accuracy: null,
        cep: '',
        pais: '',
        provider: '',
        placeId: '',
        estado_id: '',
        cidade_id: '',
        bairro_id: '',
        addressConfidenceScore: null,
        addressConfidenceLevel: null,
        formattedAddress: ''
      });
      setSelectedEstadoId('');
      setSelectedCidadeId('');
      setIsManualEstado(false);
      setIsManualCidade(false);
      setIsManualBairro(false);
      setLocFeedback({ type: null, message: '' });
      setAddressError('');
      setShowAddAddress(false);
      fetchAddresses();
    } catch (error) {
      console.error("Error adding address:", error);
      handleFirestoreError(error, OperationType.CREATE, collPath);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!user) return;
    const docPath = `users/${user.uid}/enderecos/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'enderecos', id));
      fetchAddresses();
    } catch (error) {
      console.error("Error deleting address:", error);
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  };

  const handlePasswordReset = async () => {
    const email = user?.email || profile?.email || '';
    if (!email) {
      setResetError('E-mail do usuário não associado ou não localizado.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    setResetSent(false);
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      console.error("Error sending password reset email:", err);
      setResetError(err?.message || 'Incapaz de despachar e-mail de redefinição no momento.');
    } finally {
      setResetLoading(false);
    }
  };

  const userInitial = profile?.nome ? profile.nome.trim()[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : 'U');

  const menuItemsGroup1 = [
    { id: 'orders', label: 'Meus Pedidos', icon: Receipt, iconBg: 'bg-stone-100 text-stone-600', path: '/orders' },
    { id: 'addresses', label: 'Meus Endereços', icon: MapPin, iconBg: 'bg-stone-100 text-stone-600' },
    { id: 'favorites', label: 'Favoritos', icon: Heart, iconBg: 'bg-stone-100 text-stone-600', path: '/favorites' },
    { id: 'wallet', label: 'Minha Carteira', icon: Wallet, iconBg: 'bg-stone-100 text-stone-600' },
    { id: 'loyalty', label: 'Fidelidade', icon: Gift, iconBg: 'bg-stone-100 text-stone-600' },
    { id: 'reviews', label: 'Minhas Avaliações', icon: Star, iconBg: 'bg-stone-100 text-stone-600' },
  ];

  const menuItemsGroup2 = [
    { id: 'notifications', label: 'Notificações', icon: Bell, iconBg: 'bg-stone-100 text-stone-600' },
    { id: 'support', label: 'Suporte', icon: Headphones, iconBg: 'bg-stone-100 text-stone-600', path: '/suporte' },
    { id: 'privacy', label: 'Política de Privacidade', icon: Shield, iconBg: 'bg-stone-100 text-stone-600', path: '/privacidade' },
    { id: 'terms', label: 'Termos de Uso', icon: FileText, iconBg: 'bg-stone-100 text-stone-600', path: '/termos' },
  ];

  const menuItemsGroup3 = [
    { id: 'password', label: 'Alterar Senha', icon: Lock, iconBg: 'bg-stone-100 text-stone-600' },
  ];

  const renderMenuItem = (item: any) => {
    const IconComp = item.icon;
    const isSelected = activeSection === item.id;
    return (
      <div
        key={item.id}
        onClick={() => {
          if (item.path) {
            navigate(item.path);
          } else {
            setActiveSection(item.id);
          }
        }}
        className={`flex items-center justify-between py-4 px-1 cursor-pointer border-b last:border-0 border-stone-100 hover:bg-stone-50/50 active:bg-stone-100/70 transition-all ${
          isSelected ? 'text-stone-900 font-extrabold' : 'text-stone-600'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-stone-900 text-white shadow-xs' : 'bg-stone-100 text-stone-500'}`}>
            <IconComp className="w-4.5 h-4.5" />
          </div>
          <span className={`text-[15px] font-medium leading-none ${isSelected ? 'text-stone-900' : 'text-stone-600'}`}>{item.label}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-300" />
      </div>
    );
  };

  const currentTab = activeSection === 'menu' ? 'profile' : activeSection;

  return (
    <div className="min-h-screen bg-stone-50 pb-20 font-sans">
      {/* Upper header (hidden on mobile settings main view to resemble the screenshot perfectly) */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50 px-4 py-4 hidden md:block">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
              <ChevronLeft className="w-5 h-5 text-stone-700" />
            </button>
            <h1 className="text-xl font-bold text-stone-800">Minha Conta</h1>
          </div>
          <div className="flex items-center gap-2">
            {isRestaurant && <span className="bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-full border border-emerald-100">Parceiro</span>}
            {isAdmin && <span className="bg-purple-50 text-purple-700 text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-full border border-purple-100">Admin</span>}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 md:py-8">
        {/* Verification banner */}
        {isRestaurant && !user?.emailVerified && (
          <div className="bg-amber-50 text-amber-800 p-4 rounded-2xl border border-amber-200 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div>
              <p className="font-bold text-sm">E-mail não verificado</p>
              <p className="text-xs text-amber-700">Por favor, confirme seu e-mail para ter acesso total ao Painel do Restaurante.</p>
            </div>
            <button onClick={resendEmail} className="text-xs font-bold text-amber-900 underline shrink-0 whitespace-nowrap hover:text-amber-950">Reenviar e-mail</button>
          </div>
        )}

        <div className="grid grid-cols-12 gap-6 items-start">
          {/* Menu Sidebar (Visible always on Desktop, visible on Mobile ONLY if activeSection === 'menu') */}
          <section className={`col-span-12 md:col-span-5 lg:col-span-4 space-y-4 ${activeSection !== 'menu' ? 'hidden md:block' : 'block'}`}>
            <div className="bg-white rounded-3xl overflow-hidden border border-stone-200/80 shadow-xs">
              
              {/* Account data shortcut - Matches image structure */}
              <div 
                onClick={() => setActiveSection('profile')}
                className="px-5 py-5 border-b border-stone-200 flex items-center justify-between cursor-pointer hover:bg-stone-50/50 active:bg-stone-100/70 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-stone-100 rounded-full flex items-center justify-center text-stone-800 font-bold text-2xl uppercase shrink-0 border border-stone-200 shadow-sm">
                    {userInitial}
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-850 text-[18px] leading-tight">{profile?.nome || 'Felipe Denis Ribeiro'}</h3>
                    <p className="text-stone-400 text-xs mt-1">Ver dados da conta</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-stone-300" />
              </div>

              {/* Group 1 Menu Options */}
              <div className="px-4 py-1">
                {menuItemsGroup1.map(renderMenuItem)}
              </div>

              {/* Separator Gap */}
              <div className="h-2.5 bg-stone-100 border-y border-stone-200/40"></div>

              {/* Group 2 Menu Options */}
              <div className="px-4 py-1">
                {menuItemsGroup2.map(renderMenuItem)}
              </div>

              {/* Separator Gap */}
              <div className="h-2.5 bg-stone-100 border-y border-stone-200/40"></div>

              {/* Group 3 Menu Options */}
              <div className="px-4 py-1">
                {menuItemsGroup3.map(renderMenuItem)}
              </div>
            </div>

            {/* Quick access admin dashboard */}
            {(isAdmin || isRestaurant) && (
              <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-3">
                <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest">Painéis Administrativos</p>
                <div className="grid grid-cols-1 gap-2.5">
                  {isAdmin && (
                    <Link to="/admin-dashboard" className="flex items-center gap-3 p-3.5 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-all rounded-2xl font-bold text-xs border border-purple-100 shadow-2xs">
                      <Shield className="w-4 h-4" />
                      Painel do Administrador
                    </Link>
                  )}
                  {isRestaurant && (
                    <Link to="/restaurant" className="flex items-center gap-3 p-3.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all rounded-2xl font-bold text-xs border border-emerald-100 shadow-2xs">
                      <Store className="w-4 h-4" />
                      Painel do Restaurante
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Partner registration link */}
            {!isRestaurant && !isAdmin && (
              <div className="bg-white rounded-3xl p-5 border border-stone-200/80 text-center shadow-xs">
                <Link to="/register-restaurant" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline tracking-wider uppercase">
                  ⭐ Seja nosso parceiro qFome
                </Link>
              </div>
            )}

            {/* Account signOut button */}
            <div className="pt-2">
              <button 
                onClick={() => auth.signOut()}
                className="w-full py-4 bg-white border border-red-200 text-red-650 font-bold text-sm rounded-3xl hover:bg-red-50 transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-xs"
              >
                <LogOut className="w-4 h-4" />
                Sair da Conta
              </button>
            </div>
          </section>

          {/* Details Content Panel (Hidden on Mobile unless activeSection !== 'menu') */}
          <section className={`col-span-12 md:col-span-7 lg:col-span-8 ${activeSection === 'menu' ? 'hidden md:block' : 'block'}`}>
            {/* Mobile Detailing Page Header Bar */}
            <div className="flex items-center gap-3 mb-5 md:hidden">
              <button 
                onClick={() => setActiveSection('menu')}
                className="p-2.5 bg-white border border-stone-200 rounded-2xl hover:bg-stone-50 active:scale-95 transition-all shadow-xs"
              >
                <ChevronLeft className="w-5 h-5 text-stone-700" />
              </button>
              <h2 className="text-[18px] font-bold text-stone-850 truncate">
                {activeSection === 'profile' ? 'Dados da Conta' :
                 activeSection === 'addresses' ? 'Meus Endereços' :
                 activeSection === 'wallet' ? 'Minha Carteira' :
                 activeSection === 'loyalty' ? 'Fidelidade' :
                 activeSection === 'notifications' ? 'Notificações' :
                 activeSection === 'reviews' ? 'Minhas Avaliações' :
                 activeSection === 'password' ? 'Alterar Senha' : 'Painel'}
              </h2>
            </div>

            {/* TAB CONTAINER CONTENT */}
            <div className="space-y-6">
              
              {/* Profile Details Block */}
              {currentTab === 'profile' && (
                <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
                  <div className="flex justify-between items-center border-b border-stone-100 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-stone-850">Dados da Conta</h2>
                      <p className="text-xs text-stone-400">Verifique ou edite suas credenciais cadastrais</p>
                    </div>
                    {!isEditing ? (
                      <button onClick={() => setIsEditing(true)} className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold">
                        <Edit2 className="w-4 h-4" />
                        Editar
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={handleUpdateProfile} disabled={saveLoading} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"><Check className="w-5 h-5" /></button>
                        <button onClick={() => { setIsEditing(false); setEditData({ nome: profile?.nome || '', telefone: profile?.telefone || '' }); }} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"><X className="w-5 h-5" /></button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-6 pb-2">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full flex items-center justify-center font-bold text-xl uppercase shrink-0 shadow-inner">
                      {userInitial}
                    </div>
                    <div className="flex-grow w-full space-y-4">
                      {isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Nome Completo</label>
                            <input value={editData.nome} onChange={e => setEditData({...editData, nome: e.target.value})} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 text-stone-800 font-semibold" required />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Telefone / Celular</label>
                            <input value={editData.telefone} onChange={e => setEditData({...editData, telefone: e.target.value})} className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 text-stone-850 font-semibold" required />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-stone-50 p-4 border border-stone-100 rounded-2xl">
                            <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest mb-1">Nome Completo</p>
                            <p className="text-stone-800 font-bold text-sm">{profile?.nome || 'Não cadastrado'}</p>
                          </div>
                          <div className="bg-stone-50 p-4 border border-stone-100 rounded-2xl">
                            <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest mb-1">Celular / Telefone</p>
                            <p className="text-stone-800 font-bold text-sm">{profile?.telefone || 'Não cadastrado'}</p>
                          </div>
                          <div className="bg-stone-50 p-4 border border-stone-100 rounded-2xl col-span-1 sm:col-span-2">
                            <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest mb-1">Endereço de E-mail</p>
                            <p className="text-stone-800 font-semibold text-sm flex items-center justify-between gap-2 break-all">
                              <span>{profile?.email || user?.email}</span>
                              {user?.emailVerified ? (
                                <span className="bg-emerald-50 text-emerald-600 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border border-emerald-100">Verificado</span>
                              ) : (
                                <span className="bg-amber-50 text-amber-600 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase border border-amber-100">Pendente</span>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Addresses Details Block */}
              {currentTab === 'addresses' && (
                <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
                  <div className="flex justify-between items-center border-b border-stone-100 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-stone-850">Endereços salvos</h2>
                      <p className="text-xs text-stone-400">Suas localizações registradas para envios</p>
                    </div>
                    <button 
                      onClick={() => setShowAddAddress(!showAddAddress)}
                      className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      {showAddAddress ? <><X className="w-3.5 h-3.5" /> Cancelar</> : <><Plus className="w-3.5 h-3.5" /> Adicionar</>}
                    </button>
                  </div>

                  {showAddAddress && (
                    <form onSubmit={handleAddAddress} className="p-5 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
                      {/* GPS coordinates trigger */}
                      <div className="space-y-3 pb-3 border-b border-stone-200/50">
                        <p className="text-xs text-stone-500 font-medium">💡 Localize seu endereço de entrega automaticamente via GPS.</p>
                        <button
                          type="button"
                          onClick={handleLoadCurrentLocation}
                          disabled={locLoading}
                          className="w-full py-3 px-4 bg-white border-2 border-stone-800 rounded-xl flex items-center justify-center gap-2.5 font-bold text-stone-800 hover:bg-stone-50 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 text-sm"
                        >
                          {locLoading ? <span className="w-4 h-4 border-2 border-stone-800 border-t-transparent rounded-full animate-spin"></span> : <Compass className="w-4 h-4 text-stone-700" />}
                          <span>{locLoading ? 'Capturando Coordenadas…' : 'Autodetectar minha localização'}</span>
                        </button>
                        {locFeedback.message && (
                          <div className={`p-4 rounded-xl text-xs border flex items-start gap-2 ${locFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : locFeedback.type === 'warn' ? 'bg-amber-50 text-amber-800 border-amber-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                            <span className="shrink-0 font-bold">{locFeedback.type === 'success' ? '✓' : '⚠️'}</span>
                            <p className="leading-tight">{locFeedback.message}</p>
                          </div>
                        )}
                      </div>

                      {/* Manual Fields and Selection drop downs */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Rua / Logradouro</label>
                          <input placeholder="Rua" value={newAddress.rua} onChange={e => { setNewAddress({...newAddress, rua: e.target.value}); setIsAddressFormChanged(true); }} className="w-full p-3 bg-white border border-stone-200 rounded-xl text-stone-800 font-semibold" required />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Número</label>
                            {newAddress.numeroSugerido && (
                              <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">💡 Sugestão</span>
                            )}
                          </div>
                          <input 
                            placeholder="Ex: 120, S/N" 
                            value={newAddress.numero} 
                            onChange={e => { setNewAddress({...newAddress, numero: e.target.value, numeroSugerido: false}); setIsAddressFormChanged(true); }} 
                            className={`w-full p-3 bg-white border rounded-xl font-semibold transition-all ${
                              newAddress.numeroSugerido 
                                ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/10 text-stone-900 focus:ring-amber-500' 
                                : !newAddress.numero 
                                  ? 'border-amber-400 bg-amber-50/10 text-amber-800 focus:ring-amber-500' 
                                  : 'border-stone-200 text-stone-800 focus:ring-emerald-500/20'
                            }`} 
                            required 
                          />
                        </div>

                        {/* Estado Selector */}
                        {isManualEstado ? (
                          <div className="relative space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Estado</label>
                            <input placeholder="Estado" value={newAddress.estado} onChange={e => { setNewAddress({...newAddress, estado: e.target.value, estado_id: ''}); setIsAddressFormChanged(true); }} className="w-full p-3 bg-white border border-stone-200 rounded-xl pr-24 font-semibold text-stone-800" required />
                            <button type="button" onClick={() => { setIsManualEstado(false); setNewAddress(prev => ({...prev, estado: '', estado_id: ''})); setSelectedEstadoId(''); }} className="absolute right-3 top-9 text-xs text-emerald-600 font-bold hover:underline font-sans">Lista</button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Estado</label>
                            <select value={selectedEstadoId} onChange={e => {
                              const val = e.target.value;
                              setIsAddressFormChanged(true);
                              if (val === 'manual') {
                                setIsManualEstado(true); setIsManualCidade(true); setIsManualBairro(true);
                                setNewAddress(prev => ({...prev, estado:'', estado_id:'', cidade:'', cidade_id:'', bairro:'', bairro_id:''}));
                                setSelectedEstadoId(''); setSelectedCidadeId('');
                              } else {
                                setSelectedEstadoId(val);
                                const match = estados.find(est => est.id === val);
                                setNewAddress(prev => ({...prev, estado: match?.nome || '', estado_id: val, cidade:'', cidade_id:'', bairro:'', bairro_id:''}));
                                setSelectedCidadeId('');
                              }
                            }} className="w-full p-3 bg-white border border-stone-200 rounded-xl font-semibold text-stone-800" required>
                              <option value="">Selecione</option>
                              {estados.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                              <option value="manual">Manual...</option>
                            </select>
                          </div>
                        )}

                        {/* Cidade Selector */}
                        {isManualCidade ? (
                          <div className="relative space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Cidade</label>
                            <input placeholder="Cidade" value={newAddress.cidade} onChange={e => { setNewAddress({...newAddress, cidade: e.target.value, cidade_id: ''}); setIsAddressFormChanged(true); }} className="w-full p-3 bg-white border border-stone-200 rounded-xl pr-24 font-semibold text-stone-800" required />
                            {!isManualEstado && <button type="button" onClick={() => { setIsManualCidade(false); setNewAddress(prev => ({...prev, cidade: '', cidade_id: ''})); setSelectedCidadeId(''); }} className="absolute right-3 top-9 text-xs text-emerald-600 font-bold hover:underline font-sans">Lista</button>}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Cidade</label>
                            <select value={selectedCidadeId} onChange={e => {
                              const val = e.target.value;
                              setIsAddressFormChanged(true);
                              if (val === 'manual') {
                                setIsManualCidade(true); setIsManualBairro(true);
                                setNewAddress(prev => ({...prev, cidade: '', cidade_id: '', bairro: '', bairro_id: ''}));
                                setSelectedCidadeId('');
                              } else {
                                setSelectedCidadeId(val);
                                const match = cidades.find(c => c.id === val);
                                setNewAddress(prev => ({...prev, cidade: match?.nome || '', cidade_id: val, bairro:'', bairro_id:''}));
                              }
                            }} className="w-full p-3 bg-white border border-stone-200 rounded-xl font-semibold text-stone-800" required disabled={!selectedEstadoId}>
                              <option value="">Selecione</option>
                              {cidades.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                              {selectedEstadoId && <option value="manual">Manual...</option>}
                            </select>
                          </div>
                        )}

                        {/* Bairro Selector */}
                        {isManualBairro ? (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center ml-1">
                              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Bairro</label>
                              {newAddress.bairroSugerido && (
                                <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">💡 Sugestão</span>
                              )}
                            </div>
                            <div className="relative">
                              <input 
                                placeholder="Bairro" 
                                value={newAddress.bairro} 
                                onChange={e => { setNewAddress({...newAddress, bairro: e.target.value, bairro_id: '', bairroSugerido: false}); setIsAddressFormChanged(true); }} 
                                className={`w-full p-3 bg-white border rounded-xl font-semibold transition-all ${
                                  newAddress.bairroSugerido 
                                    ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/10 text-stone-900 focus:ring-amber-500' 
                                    : 'border-stone-200 text-stone-800'
                                }`} 
                                required 
                              />
                              {!isManualCidade && !isManualEstado && <button type="button" onClick={() => { setIsManualBairro(false); setNewAddress(prev => ({...prev, bairro: '', bairro_id: '', bairroSugerido: false})); }} className="absolute right-3 top-3 text-xs text-emerald-600 font-bold hover:underline font-sans">Lista</button>}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center ml-1">
                              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Bairro</label>
                              {newAddress.bairroSugerido && (
                                <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">💡 Sugestão</span>
                              )}
                            </div>
                            <select 
                              value={newAddress.bairro} 
                              onChange={e => {
                                const val = e.target.value;
                                setIsAddressFormChanged(true);
                                if (val === 'manual') {
                                  setIsManualBairro(true); setNewAddress(prev => ({...prev, bairro: '', bairro_id: '', bairroSugerido: false}));
                                } else {
                                  const match = bairros.find(b => b.nome === val);
                                  setNewAddress(prev => ({...prev, bairro: val, bairro_id: match?.id || '', bairroSugerido: false}));
                                }
                              }} 
                              className={`w-full p-3 bg-white border rounded-xl font-semibold transition-all ${
                                newAddress.bairroSugerido 
                                  ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/10 text-stone-900' 
                                  : 'border-stone-200 text-stone-800'
                              }`} 
                              required 
                              disabled={!selectedCidadeId}
                            >
                              <option value="">Selecione</option>
                              {bairros.map(b => <option key={b.id} value={b.nome}>{b.nome}</option>)}
                              {selectedCidadeId && <option value="manual">Manual...</option>}
                            </select>
                          </div>
                        )}

                        {/* Optional Inputs */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">CEP</label>
                          <input placeholder="Ex: 89000-000" value={newAddress.cep || ''} onChange={e => { setNewAddress({...newAddress, cep: e.target.value}); setIsAddressFormChanged(true); }} className="w-full p-3 bg-white border border-stone-200 rounded-xl text-stone-800 font-semibold" />
                        </div>
                        <div className="space-y-1 col-span-1 sm:col-span-2">
                          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Complemento (Opcional)</label>
                          <input placeholder="Apartamento, Bloco, Casa de Fundos" value={newAddress.complemento || ''} onChange={e => { setNewAddress({...newAddress, complemento: e.target.value}); setIsAddressFormChanged(true); }} className="w-full p-3 bg-white border border-stone-200 rounded-xl text-stone-800 font-semibold" />
                        </div>
                        <div className="space-y-1.5 col-span-1 sm:col-span-2">
                          <div className="flex justify-between items-center ml-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Ponto de Referência (Obrigatório)</label>
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-wider">📍 Essencial</span>
                          </div>
                          <input 
                            placeholder="Ex: Ao lado do mercado central, portão verde" 
                            value={newAddress.referencia} 
                            onChange={e => setNewAddress({...newAddress, referencia: e.target.value})} 
                            className="w-full p-3 bg-white border-2 border-emerald-500 rounded-xl text-stone-850 font-bold placeholder:text-stone-300 ring-2 ring-emerald-500/10 focus:ring-emerald-500" 
                            required 
                          />
                          <p className="text-[10px] text-stone-400 font-medium ml-1">Para garantir o sucesso da entrega, adicione detalhes sobre a cor do portão, fachadas, etc.</p>
                        </div>
                      </div>

                      {/* Coordinates accordion */}
                      <div className="border border-stone-200 rounded-xl bg-white p-3.5 shadow-2xs">
                        <button type="button" onClick={() => setShowCoords(!showCoords)} className="w-full flex items-center justify-between text-stone-750 font-bold text-xs uppercase tracking-wider">
                          <span>📌 Coordenadas Geográficas (Automático)</span>
                          <span>{showCoords ? '▲' : '▼'}</span>
                        </button>
                        {showCoords && (
                          <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-stone-100">
                            <div>
                              <label className="text-[9px] font-bold text-stone-400">LATITUDE</label>
                              <input type="text" readOnly value={newAddress.latitude !== null && newAddress.latitude !== undefined ? newAddress.latitude : 'Não obtida'} className="w-full p-2.5 bg-stone-100 border rounded-lg text-xs font-mono font-bold text-stone-550 cursor-not-allowed" />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-stone-400">LONGITUDE</label>
                              <input type="text" readOnly value={newAddress.longitude !== null && newAddress.longitude !== undefined ? newAddress.longitude : 'Não obtida'} className="w-full p-2.5 bg-stone-100 border rounded-lg text-xs font-mono font-bold text-stone-550 cursor-not-allowed" />
                            </div>
                          </div>
                        )}
                      </div>

                      {addressError && (
                        <div className="p-4 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                          <span>{addressError}</span>
                        </div>
                      )}

                      <div className="flex gap-2.5 pt-2">
                        <button type="submit" className="flex-grow bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-3.5 rounded-2xl transition-all shadow-xs shrink-0 font-sans">Definir Endereço</button>
                        <button type="button" onClick={() => setShowAddAddress(false)} className="px-5 py-3.5 bg-stone-200 hover:bg-stone-300 text-stone-600 font-bold text-sm rounded-2xl transition-all shrink-0 font-sans">Cancelar</button>
                      </div>
                    </form>
                  )}

                  {/* Address List */}
                  <div className="space-y-3">
                    {addresses.length === 0 ? (
                      <p className="text-stone-400 text-center py-8 italic bg-stone-50 border border-dashed rounded-3xl text-sm">Nenhum endereço cadastrado dantes.</p>
                    ) : (
                      addresses.map(addr => (
                        <div key={addr.id} className="p-4 bg-white border border-stone-200 rounded-2xl flex items-center justify-between hover:border-stone-400 transition-all shadow-2xs">
                          <div className="flex items-center gap-3.5 overflow-hidden">
                            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-100"><MapPin className="w-5 h-5" /></div>
                            <div className="overflow-hidden">
                              <p className="font-bold text-indigo-950 text-sm truncate">{addr.rua}, {addr.numero}</p>
                              <p className="text-stone-400 text-xs truncate">{addr.bairro} · {addr.cidade} / {addr.estado}</p>
                              {addr.referencia && <p className="text-[11px] text-emerald-600 font-bold italic truncate mt-0.5 font-sans">Ref: {addr.referencia}</p>}
                            </div>
                          </div>
                          <button onClick={() => { if(confirm('Excluir este endereço?')) handleDeleteAddress(addr.id); }} className="p-2.5 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Wallet Page */}
              {currentTab === 'wallet' && (
                <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-stone-850">Minha Carteira</h2>
                    <p className="text-xs text-stone-400">Administre seus saldos qFome e transações em tempo real</p>
                  </div>

                  <div className="bg-gradient-to-tr from-stone-900 to-stone-800 rounded-3xl p-6 text-white shadow-md relative overflow-hidden aspect-[1.6/1] max-w-sm mx-auto w-full border border-stone-700">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl"></div>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[9px] tracking-widest text-stone-400 uppercase font-black">Digital Card</p>
                        <h4 className="font-black text-lg mt-1 italic text-emerald-400">qFome<span className="text-white font-normal not-italic text-xs"> Pay</span></h4>
                      </div>
                      <div className="w-8 h-6 bg-amber-400/20 rounded border border-amber-400/40"></div>
                    </div>
                    <div>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-6">Saldo em Carteira</p>
                      <h3 className="text-3xl font-mono font-bold mt-1 text-emerald-400">
                        R$ {profile?.saldo_carteira !== undefined ? profile.saldo_carteira.toFixed(2) : '0,00'}
                      </h3>
                    </div>
                    <div className="flex justify-between items-end mt-4 text-[11px] text-stone-300">
                      <span className="truncate max-w-[200px] uppercase font-semibold">{profile?.nome || 'Cliente qFome'}</span>
                      <span className="font-mono text-[10px] tracking-wider text-stone-400">•••• 9832</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                    <button 
                      onClick={async () => {
                        const amountStr = prompt("Digite o valor que deseja adicionar à sua carteira (R$):", "50.00");
                        if (!amountStr) return;
                        const amount = parseFloat(amountStr.replace(',', '.'));
                        if (isNaN(amount) || amount <= 0) {
                          alert("Valor inválido.");
                          return;
                        }
                        try {
                          const currentBalance = profile?.saldo_carteira || 0;
                          const newBalance = currentBalance + amount;
                          
                          await setDoc(doc(db, 'users', user!.uid), {
                            saldo_carteira: newBalance
                          }, { merge: true });
                          
                          await addDoc(collection(db, 'users', user!.uid, 'transacoes_carteira'), {
                            descricao: 'Saldo Adicionado',
                            valor: amount,
                            tipo: 'credito',
                            data: new Date().toISOString()
                          });

                          if (updateProfile) {
                            await updateProfile({ ...profile, saldo_carteira: newBalance });
                          }
                          
                          fetchWalletTransactions();
                          alert(`R$ ${amount.toFixed(2)} adicionados com sucesso!`);
                        } catch (err) {
                          console.error("Error updating wallet balance:", err);
                        }
                      }}
                      className="py-3 px-4 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all font-sans"
                    >
                      + Adicionar Saldo
                    </button>
                    <button 
                      onClick={fetchWalletTransactions}
                      className="py-3 px-4 bg-stone-100 text-stone-700 font-bold rounded-xl text-xs hover:bg-stone-200 transition-all font-sans"
                    >
                      Atualizar
                    </button>
                  </div>

                  <div className="pt-2">
                    <h3 className="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-3">Movimentações Recentes</h3>
                    {walletLoading ? (
                      <p className="text-xs text-stone-400">Carregando movimentações...</p>
                    ) : walletTransactions.length === 0 ? (
                      <p className="text-xs text-stone-400 italic py-4 text-center">Nenhuma movimentação realizada ainda.</p>
                    ) : (
                      <div className="space-y-3.5 divide-y divide-stone-100">
                        {walletTransactions.map(t => (
                          <div key={t.id} className="flex justify-between items-center py-2">
                            <div>
                              <p className="text-xs font-bold text-stone-800 font-sans">{t.descricao}</p>
                              <p className="text-[10px] text-stone-400 font-sans">
                                {t.data ? new Date(t.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                              </p>
                            </div>
                            <span className={`text-xs font-bold font-mono ${t.tipo === 'credito' ? 'text-emerald-600' : 'text-red-500'}`}>
                              {t.tipo === 'credito' ? '+' : '-'} R$ {t.valor?.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Loyalty Page */}
              {currentTab === 'loyalty' && (
                <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-stone-850">Fidelidade qFome</h2>
                    <p className="text-xs text-stone-400 font-sans">Junte pontos em seus pedidos e resgate cupons reais</p>
                  </div>

                  <div className="bg-gradient-to-tr from-amber-500 to-yellow-600 rounded-3xl p-6 text-white text-center shadow-md space-y-4 max-w-sm mx-auto relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                    <div>
                      <p className="text-[10px] tracking-widest uppercase font-extrabold text-amber-100">STATUS DA CONTA</p>
                      <h3 className="text-xl font-extrabold italic mt-1 text-white">
                        {(profile?.pontos_fidelidade || 0) >= 500 ? 'Categoria Ouro 👑' : 'Categoria Prata ⭐'}
                      </h3>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-amber-100 font-bold">
                        <span>{profile?.pontos_fidelidade || 0} pts</span>
                        <span>
                          {(profile?.pontos_fidelidade || 0) >= 500 
                            ? 'Categoria Máxima Atingida!' 
                            : `${500 - (profile?.pontos_fidelidade || 0)} pts para Categoria Ouro 👑`}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-stone-900/10 rounded-full overflow-hidden border border-white/10">
                        <div 
                          className="h-full bg-white rounded-full transition-all duration-300" 
                          style={{ width: `${Math.min(100, (((profile?.pontos_fidelidade || 0) / 500) * 100))}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <h3 className="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-3">Disponível para Resgate</h3>
                    <div className="border border-stone-200 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="bg-emerald-50 text-emerald-600 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-100 uppercase">
                          {(profile?.pontos_fidelidade || 0) >= 250 ? 'Resgatável' : 'Pontos insuficientes'}
                        </span>
                        <h4 className="text-sm font-bold text-stone-850 mt-1">Cupom R$5,50 qFome</h4>
                        <p className="text-[10px] text-stone-400 mt-0.5 font-sans">Disponibilizado com 250 pontos</p>
                      </div>
                      <button 
                        onClick={async () => {
                          const currentPoints = profile?.pontos_fidelidade || 0;
                          if (currentPoints < 250) {
                            alert("Você não possui pontos suficientes (mínimo de 250 pontos).");
                            return;
                          }
                          try {
                            const newPoints = currentPoints - 250;
                            await setDoc(doc(db, 'users', user!.uid), {
                              pontos_fidelidade: newPoints
                            }, { merge: true });

                            const couponCode = `QF55-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                            await addDoc(collection(db, 'users', user!.uid, 'cupons'), {
                              codigo: couponCode,
                              tipo: 'valor',
                              valor: 5.50,
                              descricao: 'Cupom de R$ 5,50 resgatado via Fidelidade',
                              data_resgate: new Date().toISOString(),
                              status: 'ativo'
                            });

                            if (updateProfile) {
                              await updateProfile({ ...profile, pontos_fidelidade: newPoints });
                            }

                            fetchUserCoupons();
                            alert(`Sucesso! Você resgatou um cupom de R$ 5,50!\nCódigo: ${couponCode}`);
                          } catch (err) {
                            console.error("Error redeeming points:", err);
                          }
                        }}
                        className="bg-stone-850 hover:bg-[#112923] text-white font-bold text-xs px-3 py-1.5 rounded-lg font-sans disabled:opacity-40"
                        disabled={(profile?.pontos_fidelidade || 0) < 250}
                      >
                        Resgatar
                      </button>
                    </div>
                  </div>

                  {userCoupons.length > 0 && (
                    <div className="pt-2">
                      <h3 className="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-3">Seus Cupons Ativos</h3>
                      <div className="space-y-3">
                        {userCoupons.map(coupon => (
                          <div key={coupon.id} className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between">
                            <div>
                              <p className="text-xs font-mono font-bold text-emerald-600 bg-white border px-2 py-0.5 inline-block rounded">{coupon.codigo}</p>
                              <p className="text-[10px] text-stone-500 mt-1 font-semibold">{coupon.descricao}</p>
                            </div>
                            <span className="text-xs font-bold text-stone-700">R$ {coupon.valor?.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reviews Page */}
              {currentTab === 'reviews' && (
                <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-stone-850">Minhas Avaliações</h2>
                    <p className="text-xs text-stone-400 font-sans">Verifique os feedbacks feitos por você aos estabelecimentos</p>
                  </div>

                  <div className="space-y-4">
                    {reviewsLoading ? (
                      <p className="text-xs text-stone-400">Buscando avaliações...</p>
                    ) : reviews.length === 0 ? (
                      <p className="text-xs text-stone-400 italic py-4 text-center">Nenhuma avaliação realizada ainda por você.</p>
                    ) : (
                      reviews.map(rev => (
                        <div key={rev.id} className="p-4 rounded-2xl border border-stone-200 bg-stone-50 space-y-1.5">
                          <div className="flex justify-between items-start">
                            <h5 className="text-xs font-extrabold text-stone-850">Avaliação de Pedido</h5>
                            <div className="text-amber-500 font-bold text-xs flex">
                              {Array.from({ length: rev.nota || 0 }).map((_, i) => '★').join('')}
                              {Array.from({ length: 5 - (rev.nota || 0) }).map((_, i) => '☆').join('')}
                            </div>
                          </div>
                          {rev.comentario && <p className="text-xs text-stone-600 leading-normal font-medium">"{rev.comentario}"</p>}
                          <p className="text-[10px] text-stone-400 font-sans">
                            {rev.data ? new Date(rev.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Notifications Settings Page Mock */}
              {currentTab === 'notifications' && (
                <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-stone-850">Preferências de Contato</h2>
                    <p className="text-xs text-stone-400">Defina os canais de recebimento de ofertas e cupons</p>
                  </div>

                  <div className="divide-y divide-stone-100 bg-stone-50 rounded-2xl p-4 border border-stone-100">
                    <div className="flex justify-between items-center py-3">
                      <div><p className="text-xs font-bold text-stone-800">Alertas em tempo real por Push</p><p className="text-[10px] text-stone-400 font-sans">Para saber tudo sobre o avanço do prato no fogão</p></div>
                      <div className="w-9 h-5.5 bg-emerald-500 rounded-full flex items-center p-0.5 justify-end shadow-inner"><div className="w-4.5 h-4.5 bg-white rounded-full"></div></div>
                    </div>
                    <div className="flex justify-between items-center py-3 pt-4">
                      <div><p className="text-xs font-bold text-stone-800">Comunicar novidades no E-mail</p><p className="text-[10px] text-stone-400 font-sans">Compilado semanalmente com promoções</p></div>
                      <div className="w-9 h-5.5 bg-emerald-500 rounded-full flex items-center p-0.5 justify-end shadow-inner"><div className="w-4.5 h-4.5 bg-white rounded-full"></div></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Password Secure Reset Block */}
              {currentTab === 'password' && (
                <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-stone-850">Segurança da Senha</h2>
                    <p className="text-xs text-stone-400 font-sans">Solicite a alteração criptografada da sua chave</p>
                  </div>

                  <div className="max-w-md mx-auto text-center p-6 bg-stone-50 border border-stone-100 rounded-2xl space-y-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto font-mono">🔒</div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-stone-850">Alteração Descomplicada</h4>
                      <p className="text-xs text-stone-500 leading-normal font-sans">
                        Para total segurança da carteira qFome Pay, enviamos um link para o seu endereço de e-mail de correspondência:
                      </p>
                      <p className="text-stone-750 font-mono font-bold text-xs bg-white border border-stone-150 py-2 px-3 inline-block rounded-lg mt-2 break-all">{user?.email || profile?.email || 'Nenhum e-mail disponível'}</p>
                    </div>

                    {resetSent ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-800">✓ E-mail enviado com sucesso! Verifique a caixa nos instantes sequenciais.</div>
                    ) : (
                      <button
                        onClick={handlePasswordReset}
                        disabled={resetLoading}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50 font-sans"
                      >
                        {resetLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin font-bold"></span> : <Lock className="w-3.5 h-3.5" />}
                        <span>{resetLoading ? 'Aguardando envio…' : 'Enviar instruções de redefinição'}</span>
                      </button>
                    )}

                    {resetError && <p className="text-xs text-red-500 font-semibold">{resetError}</p>}
                  </div>
                </div>
              )}

            </div>
          </section>
        </div>
      </main>

      <Navbar />
    </div>
  );
}
