import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import {
  parseGoogleAddressComponents,
  normalizeText,
  calculateDistanceMeters,
  cleanInvalidAddressValue,
  getConfidenceLevel,
  buildAddressConfidenceScore,
  selectBestAddressCandidate
} from '../utils/geo';

export function createGeoRouter(db: Firestore): Router {
  const router = Router();

  // Diagnostic endpoint for Google Maps integration
  router.get('/google-maps-diagnostic', (req: any, res: any) => {
    const hasKey = !!(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY);
    res.json({
      googleApiKeyFound: hasKey,
      geocodingStatus: 'OK (Diagnostic Helper active)',
      placesStatus: 'OK (Diagnostic Helper active)',
      placesNewStatus: 'Not implemented',
      errors: []
    });
  });

  // Proxy endpoint for secure Nominatim Reverse Geocoding with fallback options
  router.get('/reverse-geocode', async (req: any, res: any) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude (lat) and Longitude (lon) are required' });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=pt-BR&email=lojadiscretaboutique@gmail.com`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      console.log(`[Reverse Geocode] Proxy request to Nominatim for lat=${lat}, lon=${lon}`);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'lojadiscretaboutique-applet/1.0 (lojadiscretaboutique@gmail.com)'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const bodyText = await response.text();
        console.error(`[Reverse Geocode] Nominatim response error. Status: ${response.status} ${response.statusText}`, bodyText);
        return res.status(response.status).json({
          error: 'Nominatim response error',
          status: response.status,
          statusText: response.statusText,
          body: bodyText,
          url
        });
      }

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonErr: any) {
        console.error('[Reverse Geocode] Malformed JSON from Nominatim:', responseText);
        return res.status(502).json({
          error: 'Malformed JSON response from Nominatim',
          rawResponse: responseText,
          url
        });
      }

      return res.json(data);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('[Reverse Geocode] Error in reverse geocoding proxy:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });
      return res.status(500).json({
        error: 'Global error in proxy reverse geocoding'
      });
    }
  });

  // Google Reverse Geocoding Cache
  const googleGeocodingCache = new Map<string, any>();

  router.get('/reverse-geocode-google', async (req: any, res: any) => {
    const { lat, lng, accuracy } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude (lat) e Longitude (lng) são obrigatórias.' });
    }

    const latNum = parseFloat(lat as string);
    const lngNum = parseFloat(lng as string);
    const accuracyNum = accuracy ? parseFloat(accuracy as string) : null;

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'Valores numéricos de latitude e longitude inválidos.' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'A chave GOOGLE_MAPS_API_KEY não está configurada no backend.' });
    }

    const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)}`;
    if (googleGeocodingCache.has(cacheKey)) {
      console.log(`[Google Geocode] Serving cached result for ${cacheKey}`);
      const cachedData = googleGeocodingCache.get(cacheKey);
      return res.json({
        ...cachedData,
        accuracy: accuracyNum
      });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&language=pt-BR&region=br&key=${apiKey}`;

    try {
      console.log(`[Google Geocode - Request URL]: ${url.replace(apiKey, 'AIzaSy_MASKED_API_KEY')}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Google Geocoding request failed with status: ${response.status}`);
      }

      const data = await response.json();
      console.log('[Google Geocode - Google Maps Response]:', JSON.stringify(data, null, 2));
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const topResult = data.results[0];
        const parsed = parseGoogleAddressComponents(topResult);

        const payload = {
          provider: 'google',
          formattedAddress: topResult.formatted_address || '',
          rua: parsed.rua,
          numero: parsed.numero,
          bairro: parsed.bairro,
          cidade: parsed.cidade,
          estado: parsed.estado,
          estadoSigla: parsed.estadoSigla,
          cep: parsed.cep,
          pais: parsed.pais,
          latitude: latNum,
          longitude: lngNum,
          placeId: topResult.place_id || '',
          accuracy: accuracyNum
        };

        googleGeocodingCache.set(cacheKey, payload);
        return res.json(payload);
      } else {
        console.warn(`[Google Geocode] Google Geocoding returned non-OK status: ${data.status}`);
        throw new Error(`Google Geocoding returned status: ${data.status}`);
      }
    } catch (err: any) {
      console.error('[Google Geocode] Error, falling back to Nominatim:', err.message);

      try {
        const fallbackUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&addressdetails=1&accept-language=pt-BR&email=lojadiscretaboutique@gmail.com`;
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'lojadiscretaboutique-applet/1.0 (lojadiscretaboutique@gmail.com)'
          }
        });

        if (fallbackResponse.ok) {
          const nominatimData = await fallbackResponse.json();
          const address = nominatimData.address || {};

          const payload = {
            provider: 'nominatim_fallback',
            formattedAddress: nominatimData.display_name || '',
            rua: address.road || address.street || '',
            numero: address.house_number || '',
            bairro: address.suburb || address.neighbourhood || address.quarter || '',
            cidade: address.city || address.town || address.village || '',
            estado: address.state || '',
            estadoSigla: '',
            cep: address.postcode || '',
            pais: address.country || '',
            latitude: latNum,
            longitude: lngNum,
            placeId: nominatimData.place_id ? String(nominatimData.place_id) : '',
            accuracy: accuracyNum
          };

          return res.json(payload);
        }
      } catch (nominatimErr: any) {
        console.error('[Google Geocode Fallback] Nominatim fallback failed:', nominatimErr.message);
      }

      return res.json({
        provider: 'error_fallback',
        formattedAddress: '',
        rua: '',
        numero: '',
        bairro: '',
        cidade: '',
        estado: '',
        estadoSigla: '',
        cep: '',
        pais: '',
        latitude: latNum,
        longitude: lngNum,
        placeId: '',
        accuracy: accuracyNum,
        error: err.message || 'Geocall failed'
      });
    }
  });

  router.post('/geocode', async (req: any, res: any) => {
    const { rua, numero, bairro, cidade, estado } = req.body;
    
    if (!rua || !cidade || !estado) {
      return res.status(400).json({ error: 'Rua, Cidade e Estado são obrigatórios para geocodificação.' });
    }

    const addressQuery = `${rua}, ${numero ? numero : ''}, ${bairro ? bairro : ''}, ${cidade}, ${estado}, Brasil`;
    
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (apiKey) {
      try {
        const encodedAddress = encodeURIComponent(addressQuery);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&language=pt-BR&region=br&key=${apiKey}`;
        console.log(`[Google Forward Geocode] Address query to Google: ${addressQuery}`);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'OK' && data.results && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            console.log(`[Google Forward Geocode] Found coords:`, loc);
            return res.json({
              latitude: loc.lat,
              longitude: loc.lng,
              provider: 'google'
            });
          } else {
            console.warn(`[Google Forward Geocode] Status not OK: ${data.status}`);
          }
        }
      } catch (err) {
        console.error(`[Google Forward Geocode] Failed error:`, err);
      }
    }

    try {
      const encodedAddress = encodeURIComponent(addressQuery);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&accept-language=pt-BR`;
      console.log(`[OSM Forward Geocode] Address query to Nominatim: ${addressQuery}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'qFomeaiApp/1.0 (lojadiscretaboutique@gmail.com)'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const first = data[0];
          console.log(`[OSM Forward Geocode] Found coords:`, first);
          return res.json({
            latitude: parseFloat(first.lat),
            longitude: parseFloat(first.lon),
            provider: 'nominatim'
          });
        }
      }
    } catch (err) {
      console.error(`[OSM Forward Geocode] Failed too:`, err);
    }

    try {
      const simpleQuery = `${bairro ? bairro + ', ' : ''}${cidade}, ${estado}, Brasil`;
      const encodedSimple = encodeURIComponent(simpleQuery);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedSimple}&limit=1&accept-language=pt-BR`;
      console.log(`[Simple Forward Geocode] Attempting broader search: ${simpleQuery}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'qFomeaiApp/1.0 (lojadiscretaboutique@gmail.com)'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const first = data[0];
          console.log(`[Simple Forward Geocode] Found coords:`, first);
          return res.json({
            latitude: parseFloat(first.lat),
            longitude: parseFloat(first.lon),
            provider: 'nominatim-simple'
          });
        }
      }
    } catch (err) {
      console.error(`[Simple Forward Geocode] Broad geocoding query failed:`, err);
    }

    return res.status(404).json({ error: 'Não foi possível obter coordenadas para este endereço.' });
  });

  const addressFromGpsCache = new Map<string, any>();

  router.post('/address-from-gps', async (req: any, res: any) => {
    const { latitude, longitude, accuracy } = req.body;
    console.log('[Address GPS API] Received request:', { latitude, longitude, accuracy });

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude e Longitude são obrigatórias.' });
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const accuracyNum = accuracy ? parseFloat(accuracy) : null;

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'Latitude e Longitude devem ser valores numéricos válidos.' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
        console.error('[Address GPS API] GOOGLE_MAPS_API_KEY encontrada: NÃO');
        return res.status(500).json({ error: 'Chave Google Maps não configurada no servidor.' });
    }
    console.log('[Address GPS API] GOOGLE_MAPS_API_KEY encontrada: SIM');
    
    const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)}`;

    if (addressFromGpsCache.has(cacheKey)) {
      console.log(`[Address GPS API] Serving cached result for coordinate round key: ${cacheKey}`);
      return res.json(addressFromGpsCache.get(cacheKey));
    }

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&language=pt-BR&region=br&key=${apiKey}`;
      console.log(`[Address GPS API] Querying Reverse Geocoding`);
      
      const geocodeRes = await fetch(geocodeUrl);
      const geocodeData = await geocodeRes.json();
      
      if (!geocodeRes.ok || geocodeData.status !== 'OK') {
        console.error(`[Address GPS API] Geocoding falhou. Status: ${geocodeData.status}, Message: ${geocodeData.error_message}, Body:`, JSON.stringify(geocodeData));
        throw new Error(`Google Geocoding failed with status: ${geocodeData.status}`);
      }

      const priorityTypes = ['street_address', 'premise', 'subpremise', 'route', 'plus_code', 'geocode'];
      let selectedResult = null;
      for (const type of priorityTypes) {
        selectedResult = geocodeData.results.find((r: any) => r.types.includes(type));
        if (selectedResult) break;
      }
      if (!selectedResult) {
        selectedResult = geocodeData.results[0];
      }

      const baseAddress = parseGoogleAddressComponents(selectedResult);
      const basePayload = {
        ...baseAddress,
        formattedAddress: selectedResult.formatted_address || '',
        placeId: selectedResult.place_id || '',
        latitude: latNum,
        longitude: lngNum
      };

      const isNumeroMissing = !cleanInvalidAddressValue(basePayload.numero);
      const isBairroMissing = !cleanInvalidAddressValue(basePayload.bairro);

      let nearbyResults: any[] = [];
      let textSearchResults: any[] = [];

      if (isNumeroMissing || isBairroMissing) {
        const radii = [80, 150, 300];
        for (const radius of radii) {
          const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latNum},${lngNum}&radius=${radius}&language=pt-BR&key=${apiKey}`;
          try {
            const nearbyRes = await fetch(nearbyUrl);
            if (nearbyRes.ok) {
              const ndata = await nearbyRes.json();
              if (ndata.status === 'OK' && ndata.results && ndata.results.length > 0) {
                nearbyResults = ndata.results;
                break;
              }
            }
          } catch (err) {
            console.error(`[Address GPS API] Nearby search error at radius ${radius}:`, err);
          }
        }
      }

      if (basePayload.rua || basePayload.cidade || basePayload.estado) {
        const queryText = `${basePayload.rua || ''}, ${basePayload.cidade || ''}, ${basePayload.estado || ''}, Brasil`.trim().replace(/^,\s*/, '').replace(/,\s*$/, '');
        const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(queryText)}&location=${latNum},${lngNum}&radius=300&language=pt-BR&key=${apiKey}`;
        try {
          const textRes = await fetch(textSearchUrl);
          if (textRes.ok) {
            const tdata = await textRes.json();
            if (tdata.status === 'OK' && tdata.results) {
              textSearchResults = tdata.results;
            }
          }
        } catch (err) {
          console.error('[Address GPS API] Text Search error:', err);
        }

        const fAddress = basePayload.formattedAddress;
        if (fAddress && fAddress !== queryText) {
          const textSearchUrl2 = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(fAddress)}&location=${latNum},${lngNum}&radius=300&language=pt-BR&key=${apiKey}`;
          try {
            const textRes2 = await fetch(textSearchUrl2);
            if (textRes2.ok) {
              const tdata2 = await textRes2.json();
              if (tdata2.status === 'OK' && tdata2.results) {
                textSearchResults = [...textSearchResults, ...tdata2.results];
              }
            }
          } catch (err) {
            console.error('[Address GPS API] Text Search formattedAddress error:', err);
          }
        }
      }

      const rawCandidates: any[] = [];
      const placeIdsSeen = new Set<string>();

      const addRawCandidate = (p: any) => {
        if (p && p.place_id && !placeIdsSeen.has(p.place_id)) {
          placeIdsSeen.add(p.place_id);
          let dist = Infinity;
          if (p.geometry && p.geometry.location) {
            dist = calculateDistanceMeters(latNum, lngNum, p.geometry.location.lat, p.geometry.location.lng);
          }
          rawCandidates.push({
            place_id: p.place_id,
            distance: dist,
            location: p.geometry?.location
          });
        }
      };

      nearbyResults.forEach(addRawCandidate);
      textSearchResults.forEach(addRawCandidate);

      rawCandidates.sort((a, b) => a.distance - b.distance);
      const topCandidatesToFetch = rawCandidates.slice(0, 3);

      const detailedCandidates: any[] = [];
      for (const cand of topCandidatesToFetch) {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${cand.place_id}&fields=address_component,formatted_address,geometry&language=pt-BR&key=${apiKey}`;
        try {
          const detailsRes = await fetch(detailsUrl);
          if (detailsRes.ok) {
            const dtData = await detailsRes.json();
            if (dtData.status === 'OK' && dtData.result) {
              const parsedComp = parseGoogleAddressComponents(dtData.result);
              detailedCandidates.push({
                placeId: cand.place_id,
                rua: parsedComp.rua,
                numero: parsedComp.numero,
                bairro: parsedComp.bairro,
                cidade: parsedComp.cidade,
                estado: parsedComp.estado,
                estadoSigla: parsedComp.estadoSigla,
                cep: parsedComp.cep,
                pais: parsedComp.pais,
                formattedAddress: dtData.result.formatted_address || '',
                latitude: dtData.result.geometry?.location?.lat || cand.location?.lat,
                longitude: dtData.result.geometry?.location?.lng || cand.location?.lng,
                distance: cand.distance
              });
            }
          }
        } catch (err) {
          console.error(`[Address GPS API] Details details fetch error for ${cand.place_id}:`, err);
        }
      }

      detailedCandidates.sort((a, b) => a.distance - b.distance);

      const bestCandidate = selectBestAddressCandidate(detailedCandidates, { lat: latNum, lng: lngNum, baseAddress: basePayload });

      const finalRua = cleanInvalidAddressValue(basePayload.rua) || cleanInvalidAddressValue(bestCandidate?.rua) || '';
      const finalCidade = cleanInvalidAddressValue(basePayload.cidade) || cleanInvalidAddressValue(bestCandidate?.cidade) || '';
      const finalEstado = cleanInvalidAddressValue(basePayload.estado) || cleanInvalidAddressValue(bestCandidate?.estado) || '';
      const finalEstadoSigla = cleanInvalidAddressValue(basePayload.estadoSigla) || cleanInvalidAddressValue(bestCandidate?.estadoSigla) || '';
      const finalCep = cleanInvalidAddressValue(basePayload.cep) || cleanInvalidAddressValue(bestCandidate?.cep) || '';
      const finalPais = cleanInvalidAddressValue(basePayload.pais) || cleanInvalidAddressValue(bestCandidate?.pais) || 'Brasil';
      const finalPlaceId = basePayload.placeId || bestCandidate?.placeId || '';
      const finalFormatted = basePayload.formattedAddress || bestCandidate?.formattedAddress || '';

      let finalNumero = '';
      let numeroSugerido = false;
      if (cleanInvalidAddressValue(basePayload.numero)) {
        finalNumero = cleanInvalidAddressValue(basePayload.numero);
        numeroSugerido = false;
      } else if (bestCandidate && cleanInvalidAddressValue(bestCandidate.numero)) {
        finalNumero = cleanInvalidAddressValue(bestCandidate.numero);
        numeroSugerido = true;
      } else {
        const closestWithNum = detailedCandidates.find(c => cleanInvalidAddressValue(c.numero));
        if (closestWithNum) {
          finalNumero = cleanInvalidAddressValue(closestWithNum.numero);
          numeroSugerido = true;
        }
      }

      let finalBairro = '';
      let bairroSugerido = false;
      if (cleanInvalidAddressValue(basePayload.bairro)) {
        finalBairro = cleanInvalidAddressValue(basePayload.bairro);
        bairroSugerido = false;
      } else if (bestCandidate && cleanInvalidAddressValue(bestCandidate.bairro)) {
        finalBairro = cleanInvalidAddressValue(bestCandidate.bairro);
        bairroSugerido = true;
      } else {
        const closestWithBairro = detailedCandidates.find(c => cleanInvalidAddressValue(c.bairro));
        if (closestWithBairro) {
          finalBairro = cleanInvalidAddressValue(closestWithBairro.bairro);
          bairroSugerido = true;
        }
      }

      const needsManualNumberConfirmation = !cleanInvalidAddressValue(finalNumero);
      const needsManualNeighborhoodConfirmation = !cleanInvalidAddressValue(finalBairro);

      const assembledAddress = {
        rua: finalRua,
        numero: finalNumero,
        numeroSugerido,
        needsManualNumberConfirmation,
        bairro: finalBairro,
        bairroSugerido,
        needsManualNeighborhoodConfirmation,
        cidade: finalCidade,
        estado: finalEstado,
        estadoSigla: finalEstadoSigla,
        cep: finalCep,
        pais: finalPais,
        latitude: latNum,
        longitude: lngNum,
        accuracy: accuracyNum,
        provider: 'google',
        source: 'gps-google-full',
        placeId: finalPlaceId,
        formattedAddress: finalFormatted
      };

      const finalScore = buildAddressConfidenceScore(assembledAddress, basePayload, { lat: latNum, lng: lngNum });
      const finalLevel = getConfidenceLevel(finalScore);

      const responsePayload = {
        ...assembledAddress,
        addressConfidenceScore: finalScore,
        addressConfidenceLevel: finalLevel
      };

      addressFromGpsCache.set(cacheKey, responsePayload);
      return res.json(responsePayload);

    } catch (err: any) {
      console.error('[Address GPS API] Core failure processing coordinates. Falling back to Nominatim (OpenStreetMap)...', err);
      try {
        const fallbackUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&addressdetails=1&accept-language=pt-BR&email=lojadiscretaboutique@gmail.com`;
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'lojadiscretaboutique-applet/1.0 (lojadiscretaboutique@gmail.com)'
          }
        });

        if (fallbackResponse.ok) {
          const nominatimData = await fallbackResponse.json();
          const address = nominatimData.address || {};

          const payload = {
            rua: address.road || address.street || address.pedestrian || '',
            numero: address.house_number || '',
            numeroSugerido: address.house_number ? false : true,
            bairro: address.suburb || address.neighbourhood || address.quarter || address.city_district || address.residential || address.village || address.town || '',
            bairroSugerido: false,
            cidade: address.city || address.town || address.village || address.municipality || '',
            estado: address.state || '',
            estadoSigla: '',
            cep: address.postcode || '',
            pais: address.country || 'Brasil',
            latitude: latNum,
            longitude: lngNum,
            accuracy: accuracyNum,
            provider: 'nominatim_fallback',
            source: 'gps-nominatim',
            placeId: nominatimData.place_id ? String(nominatimData.place_id) : '',
            formattedAddress: nominatimData.display_name || '',
            addressConfidenceScore: 70,
            addressConfidenceLevel: 'AVERAGE'
          };

          addressFromGpsCache.set(cacheKey, payload);
          return res.json(payload);
        }
      } catch (nominatimErr: any) {
        console.error('[Address GPS API Fallback] Nominatim callback failed during core catch:', nominatimErr.message);
      }

      return res.json({
        rua: '',
        numero: '',
        numeroSugerido: false,
        bairro: '',
        bairroSugerido: false,
        cidade: '',
        estado: '',
        estadoSigla: '',
        cep: '',
        pais: '',
        latitude: latNum,
        longitude: lngNum,
        accuracy: accuracyNum,
        provider: 'ultimate_fallback',
        source: 'gps-none',
        placeId: '',
        formattedAddress: '',
        addressConfidenceScore: 0,
        addressConfidenceLevel: 'LOW'
      });
    }
  });

  const addressIntelligenceCache = new Map<string, any>();

  router.post('/address-intelligence', async (req: any, res: any) => {
    const { latitude, longitude, rua, cidade, estado, pais, accuracy } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude e Longitude são obrigatórias.' });
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const accuracyNum = accuracy ? parseFloat(accuracy) : null;

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'Latitude e Longitude devem ser valores numéricos válidos.' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'A chave GOOGLE_MAPS_API_KEY não está configurada no backend.' });
    }

    const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)},${normalizeText(rua || '')}`;
    if (addressIntelligenceCache.has(cacheKey)) {
      console.log(`[Address Intelligence] Serving cached result for keys: ${cacheKey}`);
      return res.json(addressIntelligenceCache.get(cacheKey));
    }

    const cleanField = (val: any): string => {
      if (!val) return '';
      const str = String(val).trim();
      const lower = str.toLowerCase();
      
      const invalidValues = [
        's/n', 'sem numero', 'sem número', 'sem bairro', 'não informado', 'nao informado',
        'undefined', 'null', 'n/a', 'na'
      ];
      
      if (invalidValues.includes(lower)) {
        return '';
      }
      return str;
    };

    const queryParts = [rua, cidade, estado, pais || 'Brasil'].filter(Boolean);
    const query = queryParts.join(', ');

    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${latNum},${lngNum}&radius=500&language=pt-BR&key=${apiKey}`;

    console.log(`[Address Intelligence] Querying text search: "${query}"`);

    try {
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        throw new Error(`Google Places Text Search failed with status: ${searchRes.status}`);
      }

      const searchData = await searchRes.json();

      if (searchData.status !== 'OK' || !searchData.results || searchData.results.length === 0) {
        console.warn(`[Address Intelligence] No places found for query: "${query}"`);
        const resultPayload = {
          provider: 'google_intelligence_no_results',
          rua: cleanField(rua),
          cidade: cleanField(cidade),
          estado: cleanField(estado),
          pais: cleanField(pais || 'Brasil'),
          latitude: latNum,
          longitude: lngNum,
          accuracy: accuracyNum,
          score: 0,
          confidenceLevel: 'low'
        };
        addressIntelligenceCache.set(cacheKey, resultPayload);
        return res.json(resultPayload);
      }

      let selectedPlace = searchData.results[0];
      let minDistance = Infinity;

      for (const place of searchData.results) {
        if (place.geometry && place.geometry.location) {
          const dist = calculateDistanceMeters(latNum, lngNum, place.geometry.location.lat, place.geometry.location.lng);
          if (dist < minDistance) {
            minDistance = dist;
            selectedPlace = place;
          }
        }
      }

      let detailsResult = null;
      if (selectedPlace && selectedPlace.place_id) {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${selectedPlace.place_id}&fields=address_component,formatted_address,geometry&language=pt-BR&key=${apiKey}`;
        const detailsResponse = await fetch(detailsUrl);
        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          if (detailsData.status === 'OK') {
            detailsResult = detailsData.result;
          }
        }
      }

      const parsedComponents = parseGoogleAddressComponents(detailsResult || selectedPlace);
      
      const resRua = cleanField(parsedComponents.rua || selectedPlace.name || '');
      let resNumero = cleanField(parsedComponents.numero);
      let resBairro = cleanField(parsedComponents.bairro);
      const resCidade = cleanField(parsedComponents.cidade || cidade || '');
      const resEstado = cleanField(parsedComponents.estado || estado || '');
      const resEstadoSigla = cleanField(parsedComponents.estadoSigla);
      const resCep = cleanField(parsedComponents.cep);
      const resPais = cleanField(parsedComponents.pais || pais || 'Brasil');
      const formattedAddress = detailsResult?.formatted_address || selectedPlace.formatted_address || '';

      const destLat = detailsResult?.geometry?.location?.lat ?? selectedPlace.geometry?.location?.lat ?? latNum;
      const destLng = detailsResult?.geometry?.location?.lng ?? selectedPlace.geometry?.location?.lng ?? lngNum;

      const finalDistance = calculateDistanceMeters(latNum, lngNum, destLat, destLng);

      if (finalDistance > 150) {
        resNumero = '';
        resBairro = '';
      }

      let addressConfidenceScore = 0;
      const normInputRua = normalizeText(rua || '');
      const normParsedRua = normalizeText(resRua);
      const normInputCidade = normalizeText(cidade || '');
      const normParsedCidade = normalizeText(resCidade);
      const normInputEstado = normalizeText(estado || '');
      const normParsedEstado = normalizeText(resEstado);

      if (normInputRua && normParsedRua && (normInputRua === normParsedRua || normInputRua.includes(normParsedRua) || normParsedRua.includes(normInputRua))) {
        addressConfidenceScore += 30;
      }
      if (normInputCidade && normParsedCidade && normInputCidade === normParsedCidade) {
        addressConfidenceScore += 25;
      }
      if (normInputEstado && normParsedEstado && normInputEstado === normParsedEstado) {
        addressConfidenceScore += 20;
      }
      if (finalDistance <= 80) {
        addressConfidenceScore += 15;
      }
      if (resNumero) {
        addressConfidenceScore += 10;
      }
      if (resBairro) {
        addressConfidenceScore += 10;
      }

      let addressConfidenceLevel: 'high' | 'medium' | 'low' = 'low';
      if (addressConfidenceScore >= 70) {
        addressConfidenceLevel = 'high';
      } else if (addressConfidenceScore >= 50) {
        addressConfidenceLevel = 'medium';
      }

      if (addressConfidenceScore < 50) {
        resNumero = '';
        resBairro = '';
      }

      const finalAddress = {
        provider: 'google_places_intelligence',
        rua: resRua,
        numero: resNumero,
        bairro: resBairro,
        cidade: resCidade,
        estado: resEstado,
        estadoSigla: resEstadoSigla,
        cep: resCep,
        pais: resPais,
        latitude: destLat,
        longitude: destLng,
        accuracy: accuracyNum,
        placeId: detailsResult?.place_id || selectedPlace.place_id || '',
        formattedAddress,
        addressConfidenceScore,
        addressConfidenceLevel,
        distanceMeters: finalDistance
      };

      addressIntelligenceCache.set(cacheKey, finalAddress);
      return res.json(finalAddress);

    } catch (error: any) {
      console.error('[Address Intelligence] Error in POST route:', error);
      return res.status(500).json({ error: 'Erro interno ao processar inteligência de endereço.' });
    }
  });

  return router;
}
