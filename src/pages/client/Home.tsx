import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, getDocs, collectionGroup, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { restaurantService } from '../../services/restaurantService';
import { scheduleService } from '../../services/scheduleService';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MapPin, ShoppingBag, User, Star, Clock, AlertCircle, ChevronRight, Store, Home as HomeIcon, Receipt, ShoppingCart, SlidersHorizontal, ChevronDown, Bell, Locate } from 'lucide-react';
import PlaceholderImage from '../../components/PlaceholderImage';
import RatingsModal from '../../components/RatingsModal';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { isRestaurantOpen } from '../../utils/restaurantStatus';

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

export default function Home() {
  const { user, isRestaurant } = useAuth();
  const { items, total } = useCart();
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRestaurantForRatings, setSelectedRestaurantForRatings] = useState<string | null>(null);
  const [userAddress, setUserAddress] = useState<any>(() => {
    const saved = localStorage.getItem('user_selected_address');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [userAddresses, setUserAddresses] = useState<any[]>([]);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [deliveryFees, setDeliveryFees] = useState<Record<string, number>>({});
  const [selectedEstado, setSelectedEstado] = useState<string>(() => localStorage.getItem('user_estado_id') || '');
  const [selectedCidade, setSelectedCidade] = useState<string>(() => localStorage.getItem('user_cidade_id') || '');
  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [isSplashVisible, setIsSplashVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(9);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<'rating' | 'fee' | 'time' | 'default'>('default');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [hasCheckedUserAddresses, setHasCheckedUserAddresses] = useState(false);
  const [autoLocating, setAutoLocating] = useState(false);

  const matchLocationToDb = async (estadoNome: string, cidadeNome: string) => {
    if (!estadoNome || !cidadeNome) return null;
    
    // Decompose combined graphemes and base characters
    const normalize = (val: string) => 
      val ? val.normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '')
         .toLowerCase()
         .trim()
         .replace(/\s+/g, ' ') : '';

    const normEstado = normalize(estadoNome);
    const normCidade = normalize(cidadeNome);

    try {
      // 1. Fetch search on states (ignore active tags, match sigla or name)
      const estSnap = await getDocs(collection(db, 'estados'));
      let matchedEst = estSnap.docs.find(d => {
        const data = d.data();
        return normalize(data.nome) === normEstado || normalize(data.sigla || '') === normEstado;
      });

      // Flexible fallback for state matching
      if (!matchedEst) {
        matchedEst = estSnap.docs.find(d => {
          const data = d.data();
          const stateNorm = normalize(data.nome);
          return stateNorm.includes(normEstado) || normEstado.includes(stateNorm);
        });
      }

      if (matchedEst) {
        const estId = matchedEst.id;
        const estName = matchedEst.data().nome;

        // 2. Query/filter matching cities in that state (try first WITH active true prefix, but fallback to ALL cities if none found)
        const cidQ = query(collection(db, 'cidades'), where('estado_id', '==', estId));
        const cidSnap = await getDocs(cidQ);
        
        // Search first for active cities with exact name match
        let matchedCid = cidSnap.docs.find(d => {
          const data = d.data();
          return data.ativo === true && normalize(data.nome) === normCidade;
        });

        // Fallback 1: Any city in that state with exact matched name (even if not explicitly active)
        if (!matchedCid) {
          matchedCid = cidSnap.docs.find(d => {
            return normalize(d.data().nome) === normCidade;
          });
        }

        // Fallback 2: Robust matching using contains/substring containment in that state
        if (!matchedCid) {
          matchedCid = cidSnap.docs.find(d => {
            const cityNorm = normalize(d.data().nome);
            return cityNorm.includes(normCidade) || normCidade.includes(cityNorm);
          });
        }

        if (matchedCid) {
          return {
            estadoId: estId,
            estadoNome: estName,
            cidadeId: matchedCid.id,
            cidadeNome: matchedCid.data().nome
          };
        } else {
          // If state is matched but city is not, fallback to the first active city in that state
          const activeCity = cidSnap.docs.find(d => d.data().ativo === true) || cidSnap.docs[0];
          if (activeCity) {
            console.log(`[Auto GPS Match Fallback] City ${cidadeNome} not found in state ${estName}. Falling back to default registered city: ${activeCity.data().nome}`);
            return {
              estadoId: estId,
              estadoNome: estName,
              cidadeId: activeCity.id,
              cidadeNome: activeCity.data().nome
            };
          }
        }
      } else {
        // Fallback 3: If no state matches, perform a global city search across all cities in the database
        console.log(`[Auto GPS Match Fallback] State ${estadoNome} not matched. Performing global city search...`);
        const allCidSnap = await getDocs(collection(db, 'cidades'));
        const matchedCidGlobally = allCidSnap.docs.find(d => {
          return normalize(d.data().nome) === normCidade;
        }) || allCidSnap.docs.find(d => {
          const cityNorm = normalize(d.data().nome);
          return cityNorm.includes(normCidade) || normCidade.includes(cityNorm);
        });

        if (matchedCidGlobally) {
          const cidData = matchedCidGlobally.data();
          const estId = cidData.estado_id;
          
          const estDocRef = doc(db, 'estados', estId);
          const estDocSnap = await getDoc(estDocRef);
          const estName = estDocSnap.exists() ? estDocSnap.data().nome : 'Ceará'; // default fallback
          
          return {
            estadoId: estId,
            estadoNome: estName,
            cidadeId: matchedCidGlobally.id,
            cidadeNome: cidData.nome
          };
        }
      }
    } catch (error) {
      console.error("[Auto GPS] Error matching reverse-geocode target with state/city database collections:", error);
    }
    return null;
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS não suportado por este dispositivo.'));
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

  const handleUseCurrentLocation = async () => {
    if (gpsLoading) return;
    setGpsLoading(true);
    setGpsError(null);
    try {
      const coords = await getCurrentLocation();
      console.log(`[Home GPS] Captured coordinates:`, coords);

      const response = await fetch('/api/address-from-gps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: coords.accuracy
        })
      });

      if (!response.ok) {
        throw new Error('Falha ao obter localização do Google Maps.');
      }

      const data = await response.json();
      if (data && (data.rua || data.bairro || data.cidade)) {
        const newAddressObj = {
          id: 'current_gps',
          rua: data.rua || 'Localização Atual',
          numero: data.numero || '',
          numeroSugerido: data.numeroSugerido || false,
          bairro: data.bairro || '',
          bairroSugerido: data.bairroSugerido || false,
          cidade: data.cidade || 'Sem Cidade',
          estado: data.estado || '',
          cep: data.cep || '',
          provider: 'google',
          source: 'gps-google-full',
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy: coords.accuracy,
          placeId: data.placeId || '',
          addressConfidenceScore: data.addressConfidenceScore || null,
          addressConfidenceLevel: data.addressConfidenceLevel || null,
          formattedAddress: data.formattedAddress || ''
        };
        
        const match = await matchLocationToDb(newAddressObj.estado, newAddressObj.cidade);
        if (match) {
          console.log("[Manual GPS] Found matching database entry:", match);
          localStorage.setItem('user_estado_id', match.estadoId);
          localStorage.setItem('user_estado_nome', match.estadoNome);
          localStorage.setItem('user_cidade_id', match.cidadeId);
          localStorage.setItem('user_cidade_nome', match.cidadeNome);

          setSelectedEstado(match.estadoId);
          setSelectedCidade(match.cidadeId);
          newAddressObj.estado = match.estadoNome;
          newAddressObj.cidade = match.cidadeNome;
        } else {
          console.warn("[Manual GPS] Geocode succeeded but location was not matched in states/cities database collections.");
          try {
            const estSnap = await getDocs(collection(db, 'estados'));
            const firstEst = estSnap.docs[0];
            if (firstEst) {
              const estId = firstEst.id;
              const estName = firstEst.data().nome;
              
              const cidQ = query(collection(db, 'cidades'), where('estado_id', '==', estId), where('ativo', '==', true));
              const cidSnap = await getDocs(cidQ);
              const firstCid = cidSnap.docs[0] || (await getDocs(query(collection(db, 'cidades'), where('estado_id', '==', estId)))).docs[0];
              
              if (firstCid) {
                const cidId = firstCid.id;
                const cidName = firstCid.data().nome;

                console.log(`[Manual GPS Match Fallback] Falling back to default registered location in database: ${cidName}/${estName}`);

                localStorage.setItem('user_estado_id', estId);
                localStorage.setItem('user_estado_nome', estName);
                localStorage.setItem('user_cidade_id', cidId);
                localStorage.setItem('user_cidade_nome', cidName);

                setSelectedEstado(estId);
                setSelectedCidade(cidId);
                
                newAddressObj.estado = estName;
                newAddressObj.cidade = cidName;
              }
            }
          } catch (fallbackErr) {
            console.error("Error setting default manual location fallback:", fallbackErr);
          }
        }
        
        setUserAddress(newAddressObj);
        setIsAddressModalOpen(false);
      } else {
        throw new Error('Nenhum detalhe de endereço encontrado.');
      }
    } catch (err: any) {
      console.error('[GPS Geocoding Error]', err);
      setGpsError(err.message || 'Erro ao obter localização. Certifique-se de que o GPS está ativo e as permissões de localização foram concedidas.');
    } finally {
      setGpsLoading(false);
    }
  };

  useEffect(() => {
    // Push a state to history to prevent back button from exiting the app
    window.history.pushState(null, '', window.location.pathname);

    const handlePopState = () => {
      // When back is pressed, push the state again to stay on Home
      window.history.pushState(null, '', window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const fetchEstados = async () => {
      try {
        const q = query(collection(db, 'estados'), where('ativo', '==', true));
        const snap = await getDocs(q);
        setEstados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching estados:", error);
      }
    };
    fetchEstados();
  }, []);

  useEffect(() => {
    if (!selectedEstado) {
      setCidades([]);
      return;
    }
    const fetchCidades = async () => {
      try {
        const q = query(collection(db, 'cidades'), where('estado_id', '==', selectedEstado), where('ativo', '==', true));
        const snap = await getDocs(q);
        setCidades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching cidades:", error);
      }
    };
    fetchCidades();
  }, [selectedEstado]);

  const fetchData = async (estado: string, cidade: string) => {
    setIsSplashVisible(true);
    try {
      console.log("fetchData called with:", { estado, cidade });

      // Fetch All Approved Restaurants, Categories, Banners
      const [allRestDocs, catDocs, bannerDocs] = await Promise.all([
        restaurantService.getApprovedRestaurants(),
        restaurantService.getCategories(),
        restaurantService.getBanners()
      ]);
      
      console.log(`[Home] Loaded ${allRestDocs.length} total approved restaurants for evaluation`);
      
      // Fetch schedules for all restaurants
      const restaurantsWithSchedules = await Promise.all(allRestDocs.map(async (rest: any) => {
        const schedules = await scheduleService.getSchedulesByRestaurant(rest.id);
        return { ...rest, schedules };
      }));
      
      const sorted = restaurantsWithSchedules.sort((a: any, b: any) => {
        const aOpen = isRestaurantOpen(a, a.schedules);
        const bOpen = isRestaurantOpen(b, b.schedules);
        
        // Prioritize open restaurants
        if (aOpen !== bOpen) {
          return aOpen ? -1 : 1;
        }
        
        // Then sort by rating (media_avaliacao)
        const aRating = a.media_avaliacao || 0;
        const bRating = b.media_avaliacao || 0;
        return bRating - aRating;
      });

      setRestaurants(sorted);
      setCategories(catDocs);
      setBanners(bannerDocs);

    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'home-data');
    } finally {
      setIsSplashVisible(false);
    }
  };

  // Fetch User Address
  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        if (user) {
          const q = query(collection(db, 'users', user.uid, 'enderecos'));
          const snapshot = await getDocs(q);
          const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setUserAddresses(docs);

          // Verify if there is already a persisted selected address in localStorage
          const savedStr = localStorage.getItem('user_selected_address');
          let alreadySelected = null;
          if (savedStr) {
            try {
              const parsed = JSON.parse(savedStr);
              if (!parsed.userId || parsed.userId === user.uid) {
                alreadySelected = parsed;
              }
            } catch (e) {}
          }

          if (alreadySelected) {
            setUserAddress(alreadySelected);
          } else if (docs.length > 0) {
            const firstAddr = { ...docs[0], userId: user.uid };
            setUserAddress(firstAddr);
            localStorage.setItem('user_selected_address', JSON.stringify(firstAddr));
            
            // Update cache with logged-in user's address
            localStorage.setItem('user_estado_nome', docs[0].estado);
            localStorage.setItem('user_cidade_nome', docs[0].cidade);
            
            try {
              const estadoQ = query(collection(db, 'estados'), where('nome', '==', docs[0].estado));
              const estadoSnap = await getDocs(estadoQ);
              if (!estadoSnap.empty) {
                const estId = estadoSnap.docs[0].id;
                localStorage.setItem('user_estado_id', estId);
                setSelectedEstado(estId);
                
                const cidadeQ = query(collection(db, 'cidades'), where('nome', '==', docs[0].cidade), where('estado_id', '==', estId));
                const cidadeSnap = await getDocs(cidadeQ);
                if (!cidadeSnap.empty) {
                  const cidId = cidadeSnap.docs[0].id;
                  localStorage.setItem('user_cidade_id', cidId);
                  setSelectedCidade(cidId);
                }
              }
            } catch (err) {
              console.error("Error updating location cache from address:", err);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching addresses:", err);
      } finally {
        setHasCheckedUserAddresses(true);
      }
    };
    fetchAddresses();
  }, [user]);

  // Automatic Location Hook
  useEffect(() => {
    const cachedCidade = localStorage.getItem('user_cidade_id');
    if (hasCheckedUserAddresses && !userAddress && !cachedCidade && !autoLocating) {
      const triggerAutoGPS = async () => {
        setAutoLocating(true);
        console.log("[Auto GPS] Initiating automatic detection on mount...");
        try {
          const coords = await getCurrentLocation();
          console.log("[Auto GPS] Captured coordinates:", coords);

          const response = await fetch('/api/address-from-gps', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              latitude: coords.lat,
              longitude: coords.lng,
              accuracy: coords.accuracy
            })
          });

          if (!response.ok) {
            throw new Error('Falha ao obter localização do Google Maps.');
          }

          const data = await response.json();
          if (data && (data.rua || data.bairro || data.cidade)) {
            const tempAddress = {
              id: 'current_gps_auto',
              rua: data.rua || 'Localização Atual',
              numero: data.numero || '',
              numeroSugerido: data.numeroSugerido || false,
              bairro: data.bairro || '',
              bairroSugerido: data.bairroSugerido || false,
              cidade: data.cidade || 'Sem Cidade',
              estado: data.estado || '',
              cep: data.cep || '',
              provider: 'google',
              source: 'gps-google-full',
              latitude: coords.lat,
              longitude: coords.lng,
              accuracy: coords.accuracy,
              placeId: data.placeId || '',
              addressConfidenceScore: data.addressConfidenceScore || null,
              addressConfidenceLevel: data.addressConfidenceLevel || null,
              formattedAddress: data.formattedAddress || ''
            };

             const match = await matchLocationToDb(tempAddress.estado, tempAddress.cidade);
             if (match) {
               console.log("[Auto GPS] Found matching database entry:", match);
               localStorage.setItem('user_estado_id', match.estadoId);
               localStorage.setItem('user_estado_nome', match.estadoNome);
               localStorage.setItem('user_cidade_id', match.cidadeId);
               localStorage.setItem('user_cidade_nome', match.cidadeNome);
 
               setSelectedEstado(match.estadoId);
               setSelectedCidade(match.cidadeId);
               tempAddress.estado = match.estadoNome;
               tempAddress.cidade = match.cidadeNome;
               setUserAddress(tempAddress);
             } else {
               console.warn("[Auto GPS] Geocode succeeded but location was not matched in states/cities database collections.");
               try {
                 const estSnap = await getDocs(collection(db, 'estados'));
                 const firstEst = estSnap.docs[0];
                 if (firstEst) {
                   const estId = firstEst.id;
                   const estName = firstEst.data().nome;
                   
                   const cidQ = query(collection(db, 'cidades'), where('estado_id', '==', estId), where('ativo', '==', true));
                   const cidSnap = await getDocs(cidQ);
                   const firstCid = cidSnap.docs[0] || (await getDocs(query(collection(db, 'cidades'), where('estado_id', '==', estId)))).docs[0];
                   
                   if (firstCid) {
                     const cidId = firstCid.id;
                     const cidName = firstCid.data().nome;
 
                     console.log(`[Auto GPS Match Fallback] Falling back to default registered location in database: ${cidName}/${estName}`);
 
                     localStorage.setItem('user_estado_id', estId);
                     localStorage.setItem('user_estado_nome', estName);
                     localStorage.setItem('user_cidade_id', cidId);
                     localStorage.setItem('user_cidade_nome', cidName);
 
                     setSelectedEstado(estId);
                     setSelectedCidade(cidId);
                     
                     tempAddress.estado = estName;
                     tempAddress.cidade = cidName;
                   }
                 }
               } catch (fallbackErr) {
                 console.error("Error setting default auto location fallback:", fallbackErr);
               }
               setUserAddress(tempAddress);
             }
          }
        } catch (err: any) {
          console.error("[Auto GPS failure]", err);
        } finally {
          setAutoLocating(false);
        }
      };
      triggerAutoGPS();
    }
  }, [hasCheckedUserAddresses, userAddress]);

  useEffect(() => {
      if (userAddress) {
        fetchData(userAddress.estado?.trim() || '', userAddress.cidade?.trim() || '');
        
        // Update cache with selected address
        localStorage.setItem('user_selected_address', JSON.stringify(userAddress));
        localStorage.setItem('user_estado_nome', userAddress.estado?.trim() || '');
        localStorage.setItem('user_cidade_nome', userAddress.cidade?.trim() || '');
        
        const updateLocationIds = async () => {
          try {
            const estadoNome = userAddress.estado?.trim() || '';
            const cidadeNome = userAddress.cidade?.trim() || '';
            if (!estadoNome || !cidadeNome) return;

            const normalize = (val: string) => 
              val ? val.normalize('NFD')
                 .replace(/[\u0300-\u036f]/g, '')
                 .toLowerCase()
                 .trim()
                 .replace(/\s+/g, ' ') : '';

            const normEstado = normalize(estadoNome);
            const normCidade = normalize(cidadeNome);

            const estSnap = await getDocs(collection(db, 'estados'));
            const matchedEst = estSnap.docs.find(d => {
              const data = d.data();
              return normalize(data.nome) === normEstado || normalize(data.sigla || '') === normEstado;
            }) || estSnap.docs.find(d => {
              const nameNorm = normalize(d.data().nome);
              return nameNorm.includes(normEstado) || normEstado.includes(nameNorm);
            });

            if (matchedEst) {
              const estId = matchedEst.id;
              localStorage.setItem('user_estado_id', estId);
              localStorage.setItem('user_estado_nome', matchedEst.data().nome);
              setSelectedEstado(estId);

              const cidSnap = await getDocs(query(collection(db, 'cidades'), where('estado_id', '==', estId)));
              const matchedCid = cidSnap.docs.find(d => {
                return normalize(d.data().nome) === normCidade;
              }) || cidSnap.docs.find(d => {
                const cityNorm = normalize(d.data().nome);
                return cityNorm.includes(normCidade) || normCidade.includes(cityNorm);
              });

              if (matchedCid) {
                const cidId = matchedCid.id;
                localStorage.setItem('user_cidade_id', cidId);
                localStorage.setItem('user_cidade_nome', matchedCid.data().nome);
                setSelectedCidade(cidId);
              }
            }
          } catch (err) {
            console.error("Error updating location IDs in cache:", err);
          }
        };
        updateLocationIds();
    } else {
        const estadoNome = localStorage.getItem('user_estado_nome');
        const cidadeNome = localStorage.getItem('user_cidade_nome');
        if (cidadeNome) {
            fetchData(estadoNome?.trim() || '', cidadeNome.trim());
        }
    }
  }, [userAddress]);

  // Fetch Delivery Fees for user's neighborhood
  useEffect(() => {
    const fetchFees = async () => {
      if (!userAddress?.bairro) return;

      const q = query(
        collectionGroup(db, 'delivery_areas'),
        where('bairro_nome', '==', userAddress.bairro)
      );

      try {
        const snapshot = await getDocs(q);
        const fees: Record<string, number> = {};
        snapshot.docs.forEach(doc => {
          const restaurantId = doc.ref.parent.parent?.id;
          if (restaurantId) {
            fees[restaurantId] = doc.data().taxa_entrega;
          }
        });
        setDeliveryFees(fees);
      } catch (error) {
        console.error("Error fetching delivery fees:", error);
      }
    };
    fetchFees();
  }, [userAddress]);


  const [currentBanner, setCurrentBanner] = useState(0);

  useEffect(() => {
    if (banners.length === 0) return;
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners]);

  const activeCityName = useMemo(() => {
    if (userAddress?.cidade) return userAddress.cidade;
    return cidades.find(c => c.id === selectedCidade)?.nome || localStorage.getItem('user_cidade_nome') || '';
  }, [userAddress, selectedCidade, cidades]);

  const activeStateName = useMemo(() => {
    if (userAddress?.estado) return userAddress.estado;
    return estados.find(e => e.id === selectedEstado)?.nome || localStorage.getItem('user_estado_nome') || '';
  }, [userAddress, selectedEstado, estados]);

  const filteredRestaurants = useMemo(() => {
    const norm = (str: string) => str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';
    const normActiveCity = norm(activeCityName);
    const normActiveState = norm(activeStateName);

    const userLat = userAddress?.latitude;
    const userLng = userAddress?.longitude;

    return restaurants
      .filter(r => {
        // Condition A: Same City and State
        let isSameCityState = false;
        if (normActiveCity && normActiveState) {
          const rCity = norm(r.endereco?.cidade);
          const rState = norm(r.endereco?.estado);
          isSameCityState = rCity === normActiveCity && rState === normActiveState;
        }

        // Condition B: Within 15 Km using coordinates
        let isWithin15Km = false;
        let distance: number | null = null;

        const restLat = r.latitude ?? r.endereco?.latitude ?? r.coordenadas?.latitude;
        const restLng = r.longitude ?? r.endereco?.longitude ?? r.coordenadas?.longitude;

        if (userLat !== undefined && userLat !== null && userLng !== undefined && userLng !== null &&
            restLat !== undefined && restLat !== null && restLng !== undefined && restLng !== null) {
          const d = calculateDistanceKm(Number(userLat), Number(userLng), Number(restLat), Number(restLng));
          distance = d;
          if (d <= 15) {
            isWithin15Km = true;
          }
        }

        // Save calculated distance dynamically for rendering/sorting purposes
        r.calculatedDistance = distance;

        // Must fit at least one qualification: same city/state of "Entregar em" OR within 15km range
        const matchesLocation = isSameCityState || isWithin15Km;
        if (!matchesLocation) return false;

        const matchesSearch = r.nome.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Robust category matching
        let matchesCategory = !selectedCategory;
        if (selectedCategory) {
          const cats = Array.isArray(r.categorias) ? r.categorias : 
                       (Array.isArray(r.categoria_id) ? r.categoria_id : 
                       (r.categoria_id ? [r.categoria_id] : []));
          
          matchesCategory = cats.some((c: string) => {
            if (c === selectedCategory) return true;
            const catObj = categories.find(cat => cat.id === c);
            return catObj?.nome === selectedCategory;
          });
        }
        
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        const aOpen = isRestaurantOpen(a, a.schedules);
        const bOpen = isRestaurantOpen(b, b.schedules);
        
        if (aOpen !== bOpen) {
          return aOpen ? -1 : 1;
        }
        
        if (sortBy === 'rating') {
          const aRating = a.media_avaliacao || 0;
          const bRating = b.media_avaliacao || 0;
          return bRating - aRating;
        } else if (sortBy === 'fee') {
          const aFee = deliveryFees[a.id] ?? 999;
          const bFee = deliveryFees[b.id] ?? 999;
          return aFee - bFee;
        } else if (sortBy === 'time') {
          const aTime = parseInt(a.tempo_min_entrega || '30', 10);
          const bTime = parseInt(b.tempo_min_entrega || '30', 10);
          return aTime - bTime;
        }
        
        const aRating = a.media_avaliacao || 0;
        const bRating = b.media_avaliacao || 0;
        
        return bRating - aRating;
      });
  }, [restaurants, searchTerm, selectedCategory, sortBy, deliveryFees, categories, activeCityName, activeStateName, userAddress]);

  const activeCategories = useMemo(() => {
    const activeCategoryIdentifiers = new Set();
    filteredRestaurants.forEach((restaurant: any) => {
      const cats = Array.isArray(restaurant.categorias) ? restaurant.categorias : 
                   (Array.isArray(restaurant.categoria_id) ? restaurant.categoria_id : 
                   (restaurant.categoria_id ? [restaurant.categoria_id] : []));
      cats.forEach((c: string) => activeCategoryIdentifiers.add(c));
    });

    return categories.filter((cat: any) => 
      activeCategoryIdentifiers.has(cat.id) || activeCategoryIdentifiers.has(cat.nome)
    );
  }, [filteredRestaurants, categories]);

  useEffect(() => {
    setVisibleCount(9);
  }, [searchTerm, selectedCategory, restaurants]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => prev + 9);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [filteredRestaurants.length]);

  const visibleRestaurants = useMemo(() => {
    return filteredRestaurants.slice(0, visibleCount);
  }, [filteredRestaurants, visibleCount]);

  return (
    <div className="pb-24 bg-stone-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50 px-4 py-4">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          
          {/* Top Address & Notification Row */}
          <div className="flex items-center justify-between gap-4">
            
            {/* Delivery address details matching the "Entregar em" structure in the photo */}
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[11px] font-extrabold text-stone-400 uppercase tracking-widest leading-none mb-1">
                Entregar em
              </span>
              <button 
                onClick={() => {
                  setIsAddressModalOpen(true);
                }}
                className="flex items-center gap-1.5 text-stone-900 hover:text-emerald-600 transition-colors text-left group"
                id="header-location-selector"
              >
                <MapPin className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                <span className="truncate max-w-[220px] sm:max-w-2xl text-xs sm:text-sm font-extrabold font-sans leading-tight text-stone-900">
                  {userAddress ? (
                    `${userAddress.rua}, ${userAddress.numero}${userAddress.bairro ? `, ${userAddress.bairro}` : ''}${userAddress.cidade ? `, ${userAddress.cidade}` : ''}${userAddress.estado ? `, ${userAddress.estado}` : ''}${userAddress.cep ? `, CEP: ${userAddress.cep}` : ''}`
                  ) : (
                    cidades.find(c => c.id === selectedCidade)?.nome || localStorage.getItem('user_cidade_nome') || 'Selecione uma localização...'
                  )}
                </span>
                <ChevronDown className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition-colors shrink-0" />
              </button>
            </div>

            {/* Panel & Notifications Group */}
            <div className="flex items-center gap-2.5 shrink-0">
              {isRestaurant && (
                <Link to="/restaurant" className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-600 font-bold rounded-2xl hover:bg-emerald-100 transition-all text-xs">
                  <Store className="w-4 h-4" />
                  <span>Painel</span>
                </Link>
              )}
              
              {/* Notification icon matching the photo bell container */}
              <button 
                onClick={() => navigate('/orders')}
                className="w-10 h-10 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-full flex items-center justify-center transition-all relative active:scale-95 border border-stone-200/50"
                title="Notificações"
              >
                <Bell className="w-5 h-5 text-stone-700" />
                <span className="absolute top-2 w-2 h-2 right-2 bg-emerald-600 rounded-full border border-white"></span>
              </button>
            </div>
          </div>

          {/* Search Row & Sorting Filter Badge Container */}
          <div className="flex items-center gap-3 relative">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar lojas ou pratos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-100 border-none rounded-2xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans text-sm text-stone-800 placeholder-stone-450 shadow-inner"
              />
            </div>
            
            {/* Filter button matching the black square slider in the photo */}
            <div className="relative">
              <button 
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95 shadow-md ${isFilterDropdownOpen ? 'bg-emerald-600 text-white' : 'bg-stone-900 hover:bg-stone-800 text-white'}`}
                title="Filtrar e Ordenar"
                id="filter-options-button"
              >
                <SlidersHorizontal className="w-5 h-5" />
              </button>

              {/* Advanced sorting popup */}
              {isFilterDropdownOpen && (
                <div className="absolute right-0 top-14 w-56 bg-white border border-stone-200 rounded-2xl shadow-xl p-2 z-50 animate-scale-up">
                  <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest px-3 py-1.5 font-sans">
                    Ordenar por:
                  </p>
                  <button
                    onClick={() => {
                      setSortBy('default');
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${sortBy === 'default' ? 'bg-emerald-50 text-emerald-600' : 'text-stone-700 hover:bg-stone-50'}`}
                  >
                    <span>Recomendados</span>
                    {sortBy === 'default' && <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></span>}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('rating');
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${sortBy === 'rating' ? 'bg-emerald-50 text-emerald-600' : 'text-stone-700 hover:bg-stone-50'}`}
                  >
                    <span>Melhor Avaliados</span>
                    {sortBy === 'rating' && <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></span>}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('fee');
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${sortBy === 'fee' ? 'bg-emerald-50 text-emerald-600' : 'text-stone-700 hover:bg-stone-50'}`}
                  >
                    <span>Menor Taxa de Entrega</span>
                    {sortBy === 'fee' && <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></span>}
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('time');
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${sortBy === 'time' ? 'bg-emerald-50 text-emerald-600' : 'text-stone-700 hover:bg-stone-50'}`}
                  >
                    <span>Entrega Mais Rápida</span>
                    {sortBy === 'time' && <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></span>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-6">
        {/* Location Modal */}
        {!userAddress && !selectedCidade && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
            <div className="bg-white p-6 rounded-3xl shadow-xl max-w-md w-full animate-scale-up">
              <div className="flex justify-center mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${autoLocating ? 'bg-emerald-100 animate-pulse text-emerald-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  <MapPin className="w-6 h-6 shrink-0" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-stone-800 mb-2 text-center">
                {autoLocating ? 'Buscando sua localização...' : 'Onde você está?'}
              </h2>
              <p className="text-stone-500 text-center mb-6 text-sm">
                {autoLocating
                  ? 'Obtendo coordenadas do GPS para preencher sua localização automaticamente.'
                  : 'Selecione sua localização para ver os restaurantes disponíveis na sua região.'}
              </p>

              {autoLocating ? (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="flex items-center gap-2 text-emerald-600 font-extrabold text-sm font-sans animate-pulse">
                    <Locate className="w-5 h-5 animate-spin" />
                    <span>Detectando no GPS...</span>
                  </div>
                  <p className="text-xs text-stone-400 text-center">Isso pode levar alguns segundos. Por favor, conceda permissão de acesso à sua localização se solicitado.</p>
                </div>
              ) : (
                <div className="space-y-4 animate-scale-up">
                  <select 
                    value={selectedEstado}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedEstado(val);
                      setSelectedCidade('');
                      localStorage.setItem('user_estado_id', val);
                      localStorage.removeItem('user_cidade_id');
                      localStorage.removeItem('user_estado_nome');
                      localStorage.removeItem('user_cidade_nome');
                    }}
                    className="w-full p-3.5 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 text-sm font-bold text-stone-800"
                  >
                    <option value="">Selecione o Estado</option>
                    {estados.map(est => (
                      <option key={est.id} value={est.id}>{est.nome}</option>
                    ))}
                  </select>
                  <select 
                    value={selectedCidade}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedCidade(val);
                      const cidadeNome = cidades.find(c => c.id === val)?.nome;
                      const estadoNome = estados.find(e => e.id === selectedEstado)?.nome;
                      if (cidadeNome) {
                        localStorage.setItem('user_cidade_id', val);
                        if (estadoNome) localStorage.setItem('user_estado_nome', estadoNome);
                        localStorage.setItem('user_cidade_nome', cidadeNome);
                        fetchData(estadoNome || '', cidadeNome);
                      }
                    }}
                    disabled={!selectedEstado}
                    className="w-full p-3.5 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 text-sm font-bold text-stone-800"
                  >
                    <option value="">Selecione a Cidade</option>
                    {cidades.map(cid => (
                      <option key={cid.id} value={cid.id}>{cid.nome}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Categories Section - Exquisite layout as pictured */}
        <section className="mb-6 overflow-x-auto no-scrollbar flex gap-5.5 py-2">
          {selectedCategory && (
            <button 
              onClick={() => setSelectedCategory(null)}
              className="flex flex-col items-center gap-2 group min-w-[70px] shrink-0"
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center transition-all bg-stone-100 hover:bg-stone-200 active:scale-95 shadow-sm border border-stone-200">
                <ShoppingBag className="w-6 h-6 text-stone-600" />
              </div>
              <span className="text-[11px] font-extrabold text-stone-500 uppercase tracking-tight">Todos</span>
            </button>
          )}
          
          {activeCategories.map(cat => {
            const isSelected = selectedCategory === cat.nome;
            
            return (
              <button 
                key={cat.id} 
                onClick={() => setSelectedCategory(cat.nome)}
                className="flex flex-col items-center gap-2 group min-w-[80px] shrink-0 font-sans"
              >
                <div className={`w-18 h-18 rounded-full flex items-center justify-center transition-all overflow-hidden relative shadow-sm border ${isSelected ? 'bg-emerald-100 ring-2 ring-emerald-500 border-emerald-500 scale-105 shadow-md shadow-emerald-50' : 'bg-white hover:bg-stone-50 border-stone-200 group-hover:scale-105'}`}>
                  <PlaceholderImage 
                    src={cat.icon_url} 
                    type="logo" 
                    className="w-12 h-12 object-contain relative z-10 transition-transform duration-300 group-hover:scale-110" 
                    alt={cat.nome}
                  />
                  {/* Subtle color highlight */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-stone-100/30"></div>
                </div>
                <span className={`text-[11.5px] font-extrabold tracking-tight transition-colors line-clamp-1 ${isSelected ? 'text-emerald-700' : 'text-stone-600 group-hover:text-emerald-700'}`}>
                  {cat.nome}
                </span>
              </button>
            );
          })}
        </section>

        {/* Banners */}
        {banners.length > 0 && (
          <section className="mb-0 h-44 sm:h-52 rounded-3xl overflow-hidden relative shadow-md">
            {banners.map((banner, index) => (
              <a 
                key={banner.id} 
                href={banner.link || '#'} 
                target={banner.link ? "_blank" : "_self"}
                rel="noreferrer"
                className={`absolute inset-0 transition-opacity duration-1000 ${index === currentBanner ? 'opacity-100' : 'opacity-0'}`}
              >
                <PlaceholderImage 
                  src={banner.bannerUrl || banner.image_url} 
                  type="capa" 
                  className="w-full h-full object-cover rounded-3xl" 
                />
              </a>
            ))}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-10">
              {banners.map((_, index) => (
                <button 
                  key={index}
                  onClick={() => setCurrentBanner(index)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${index === currentBanner ? 'bg-white w-4.5' : 'bg-white/50'}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* Dynamic Service Promotional Row with three text lines */}
        <section 
          onClick={() => {
            navigate('/servicos');
          }}
          className="bg-[#0b1b17] hover:bg-[#112923] text-white p-4.5 sm:p-5 rounded-3xl flex items-center justify-between gap-4 mt-6 mb-7 cursor-pointer shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group border border-emerald-950"
        >
          {/* Subtle decoration to match high polish */}
          <div className="absolute -right-10 -bottom-10 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/15 transition-all duration-500"></div>
          
          <div className="flex-1 min-w-0 flex items-center gap-3 sm:gap-4 z-10">
            {/* Avatar block with delivery / service professional indication background */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-emerald-400 p-[1px] shadow-sm shrink-0 flex items-center justify-center overflow-hidden">
              <div className="w-full h-full bg-[#0b1b17] rounded-2xl flex items-center justify-center">
                <Store className="w-5 h-5 text-emerald-400" />
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col text-left">
              <h3 className="font-extrabold text-sm sm:text-base md:text-lg text-white tracking-tight leading-tight font-sans">
                Serviços disponíveis agora
              </h3>
              <p className="font-bold text-stone-300 text-[11px] sm:text-xs tracking-tight leading-tight mt-1">
                Profissionais disponíveis perto de
              </p>
              <p className="font-medium text-xs sm:text-sm text-emerald-400 mt-1.5 truncate max-w-full">
                {userAddress 
                  ? `${userAddress.rua}${userAddress.bairro ? `, ${userAddress.bairro}` : ''}` 
                  : (cidades.find(c => c.id === selectedCidade)?.nome || localStorage.getItem('user_cidade_nome') || 'Sua localização')}
              </p>
            </div>
          </div>

          <div className="w-9 h-9 bg-white/10 group-hover:bg-white/25 rounded-full flex items-center justify-center text-white shrink-0 transition-all z-10 group-hover:translate-x-1 duration-300">
            <ChevronRight className="w-4 h-4 text-white" />
          </div>
        </section>

        {/* Restaurants List */}
        <section className="space-y-4 font-sans">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-sans text-base sm:text-lg font-extrabold text-stone-900 tracking-tight">
              {selectedCategory ? `Exibindo ${selectedCategory}` : 'Próximos de Você'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {visibleRestaurants.map(rest => {
              const isOpen = isRestaurantOpen(rest, rest.schedules);
              const fee = deliveryFees[rest.id];
              
              return (
                <div key={rest.id} className="flex items-center gap-4 p-3.5 bg-white rounded-3xl border border-stone-100 hover:border-emerald-205 hover:shadow-xl transition-all duration-300 group relative">
                  <Link 
                    to={`/${rest.slug}`} 
                    className={`flex items-center gap-4 flex-1 ${!isOpen ? 'grayscale opacity-70' : ''}`}
                  >
                    {/* Logo structure with zoom */}
                    <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl border border-stone-100 overflow-hidden shrink-0 relative shadow-xs">
                      <PlaceholderImage 
                        src={rest.logoUrl} 
                        type="logo" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                      />
                      {!isOpen && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-[9px] font-extrabold text-white uppercase tracking-wider">Fechado</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-extrabold text-stone-900 truncate group-hover:text-emerald-600 transition-colors leading-tight">
                        {rest.nome}
                      </h3>
                      
                      <div className="flex items-center gap-2 text-xs text-stone-500 font-medium mt-1 mb-2 leading-tight">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                          <span className="font-extrabold text-stone-800">{rest.media_avaliacao?.toFixed(1) || '0.0'}</span>
                        </div>
                        <span className="text-stone-300">•</span>
                        <span className="truncate max-w-[150px]">
                          {(Array.isArray(rest.categorias) ? rest.categorias : (Array.isArray(rest.categoria_id) ? rest.categoria_id : (rest.categoria_id ? [rest.categoria_id] : [])))
                            .map((id: any) => categories.find((c: any) => c.id === id || c.nome === id)?.nome || id)
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-stone-400 font-semibold leading-tight">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-stone-400" />
                          <span>{rest.tempo_min_entrega || '30'}-{rest.tempo_max_entrega || '45'} min</span>
                        </div>
                        {rest.valor_minimo_pedido > 0 && (
                          <div className="flex items-center gap-1">
                            <ShoppingBag className="w-3 h-3 text-stone-400" />
                            <span>Mín. R$ {rest.valor_minimo_pedido.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-stone-400" />
                          <span className={fee !== undefined ? 'text-emerald-600 font-bold' : ''}>
                            {fee !== undefined ? (fee === 0 ? 'Grátis' : `R$ ${fee.toFixed(2)}`) : 'Consulte a taxa'}
                          </span>
                        </div>
                        {rest.calculatedDistance !== undefined && rest.calculatedDistance !== null && (
                          <div className="flex items-center gap-1 font-bold text-emerald-600 shrink-0">
                            <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{rest.calculatedDistance.toFixed(1)} km</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}

            {/* Infinite Scroll Sentinel */}
            {visibleCount < filteredRestaurants.length && (
              <div ref={loadMoreRef} className="col-span-full h-20 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {filteredRestaurants.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-20 bg-stone-50 rounded-3xl">
                <div className="w-20 h-20 bg-white shadow-xs rounded-2xl flex items-center justify-center text-stone-400 mb-5 border border-stone-100">
                  <Store className="w-10 h-10 text-stone-300 animate-pulse" />
                </div>
                <h3 className="text-stone-800 font-extrabold text-base mb-1 font-sans">Nenhuma loja encontrada</h3>
                <p className="text-stone-400 text-xs text-center max-w-xs leading-relaxed font-sans px-4">
                  Tente adicionar um endereço ou ativar sua localização
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Sticky Bottom Navigation Bar for Mobile Devices - matches native UX in the reference photo */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 py-2 px-4 flex justify-around items-center md:hidden z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
        <Link to="/" className="flex flex-col items-center gap-1 text-emerald-600 transition-colors">
          <HomeIcon className="w-5 h-5 text-emerald-600" />
          <span className="text-[10px] font-bold font-sans">Início</span>
        </Link>
        <Link to="/orders" className="flex flex-col items-center gap-1 text-stone-400 hover:text-stone-700 transition-colors">
          <Receipt className="w-5 h-5 text-stone-400" />
          <span className="text-[10px] font-bold font-sans">Pedidos</span>
        </Link>
        <Link to="/cart" className="flex flex-col items-center gap-1 text-stone-400 hover:text-stone-700 transition-colors">
          <ShoppingCart className="w-5 h-5 text-stone-400" />
          <span className="text-[10px] font-bold font-sans">Carrinho</span>
        </Link>
        <Link to="/profile" className="flex flex-col items-center gap-1 text-stone-400 hover:text-stone-700 transition-colors">
          <User className="w-5 h-5 text-stone-400" />
          <span className="text-[10px] font-bold font-sans">Perfil</span>
        </Link>
      </nav>

      {/* Floating Cart Button */}
      {items.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40">
          <button 
            onClick={() => navigate('/cart')}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 px-6 rounded-2xl shadow-2xl flex items-center justify-between group transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold">
                {items.reduce((acc, i) => acc + i.quantidade, 0)}
              </div>
              <span className="font-bold">Ver Carrinho</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">R$ {total.toFixed(2)}</span>
              <ShoppingBag className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      )}

      {selectedRestaurantForRatings && (
        <RatingsModal 
          restaurantId={selectedRestaurantForRatings} 
          onClose={() => setSelectedRestaurantForRatings(null)} 
        />
      )}

      {isAddressModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
          {/* Backdrop */}
          <div className="absolute inset-0" onClick={() => setIsAddressModalOpen(false)} />
          
          <div className="relative bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 animate-slide-up sm:animate-scale-up z-10 pb-8 sm:pb-8">
            {/* Drag Handle for Mobile Drawer feel */}
            <div className="w-12 h-1.5 bg-stone-200 rounded-full mx-auto mb-6 sm:hidden" />
            
            <h2 className="text-xl font-extrabold text-stone-900 text-center mb-6 font-sans">
              Selecione sua localização
            </h2>
            
            <div className="space-y-4">
              {/* Option 1: Current location with GPS */}
              <button 
                onClick={handleUseCurrentLocation}
                disabled={gpsLoading}
                className="w-full flex items-center gap-4 p-4 bg-white hover:bg-stone-50 active:bg-stone-100 rounded-2xl border border-stone-100 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center text-stone-700 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all shrink-0">
                  {gpsLoading ? (
                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Locate className="w-5.5 h-5.5 text-stone-600 group-hover:text-emerald-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-stone-800 text-sm leading-tight font-sans">
                    {gpsLoading ? 'Buscando localização...' : 'Usar localização atual'}
                  </p>
                  <p className="text-xs font-bold text-stone-400 mt-0.5 leading-snug">
                    {gpsLoading ? 'Obtendo coordenadas do GPS...' : 'Ativar GPS'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-stone-500 transition-colors" />
              </button>

              {/* Option 2: Add manually */}
              <Link 
                to="/profile" 
                onClick={() => setIsAddressModalOpen(false)}
                className="w-full flex items-center gap-4 p-4 bg-white hover:bg-stone-50 active:bg-stone-100 rounded-2xl border border-stone-100 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center text-stone-700 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all shrink-0">
                  <MapPin className="w-5.5 h-5.5 text-stone-600 group-hover:text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-stone-800 text-sm leading-tight font-sans">
                    Adicionar novo endereço
                  </p>
                  <p className="text-xs font-bold text-stone-400 mt-0.5 leading-snug">
                    Digite manualmente
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-stone-500 transition-colors" />
              </Link>
            </div>

            {/* Error Message for GPS Geocoding */}
            {gpsError && (
              <div className="mt-4 p-3.5 bg-red-50 rounded-xl border border-red-100 flex items-start gap-2.5 text-xs text-red-600 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{gpsError}</span>
              </div>
            )}

            {/* Saved Addresses list (if user is logged in) */}
            {user && userAddresses.length > 0 && (
              <div className="mt-6 pt-5 border-t border-stone-100">
                <h3 className="text-[11px] font-black text-stone-400 uppercase tracking-wider mb-3 leading-none font-sans">
                  Endereços salvos
                </h3>
                <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                  {userAddresses.map(addr => (
                    <button 
                      key={addr.id}
                      onClick={() => {
                        const addrWithUser = { ...addr, userId: user?.uid };
                        setUserAddress(addrWithUser);
                        localStorage.setItem('user_selected_address', JSON.stringify(addrWithUser));
                        setIsAddressModalOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${userAddress?.id === addr.id ? 'border-emerald-500 bg-emerald-50/50' : 'border-stone-100 hover:border-stone-200'}`}
                    >
                      <MapPin className={`w-4 h-4 shrink-0 ${userAddress?.id === addr.id ? 'text-emerald-600' : 'text-stone-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-stone-800 text-xs truncate leading-normal">
                          {addr.rua}, {addr.numero}
                        </p>
                        <p className="text-[10px] font-medium text-stone-400 truncate mt-0.5 leading-none">
                          {addr.bairro} • {addr.cidade}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Guest Manual selector option if they want to clear selection and reset */}
            {!user && (
              <div className="mt-6 pt-5 border-t border-stone-100">
                <button 
                  onClick={() => {
                    localStorage.removeItem('user_estado_id');
                    localStorage.removeItem('user_cidade_id');
                    localStorage.removeItem('user_estado_nome');
                    localStorage.removeItem('user_cidade_nome');
                    setUserAddress(null);
                    setSelectedEstado('');
                    setSelectedCidade('');
                    setIsAddressModalOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 border border-stone-200 rounded-xl font-bold text-stone-600 hover:bg-stone-50 transition-all text-xs cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400" />
                  <span>Alterar Cidade / Estado manualmente</span>
                </button>
              </div>
            )}

            {/* Close Button */}
            <button 
              onClick={() => setIsAddressModalOpen(false)}
              className="mt-5 w-full py-3.5 text-center text-sm font-bold text-stone-500 hover:text-stone-700 transition-colors bg-stone-50 hover:bg-stone-100 rounded-xl cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
