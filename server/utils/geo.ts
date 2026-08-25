export function parseGoogleAddressComponents(result: any) {
  if (!result || !result.address_components) {
    return {
      rua: '',
      numero: '',
      bairro: '',
      cidade: '',
      estado: '',
      estadoSigla: '',
      cep: '',
      pais: ''
    };
  }

  const components = result.address_components;

  const findComponent = (types: string[]) => {
    for (const type of types) {
      const comp = components.find((c: any) => c.types.includes(type));
      if (comp) return comp;
    }
    return null;
  };

  const ruaComp = findComponent(['route']);
  const rua = ruaComp ? ruaComp.long_name : '';

  const numeroComp = findComponent(['street_number']);
  const numero = numeroComp ? numeroComp.long_name : '';

  const bairroComp = findComponent([
    'sublocality_level_1',
    'sublocality',
    'neighborhood',
    'administrative_area_level_4',
    'administrative_area_level_3',
    'political'
  ]);
  const bairro = bairroComp ? bairroComp.long_name : '';

  const cidadeComp = findComponent(['administrative_area_level_2', 'locality']);
  const cidade = cidadeComp ? cidadeComp.long_name : '';

  const estadoComp = findComponent(['administrative_area_level_1']);
  const estado = estadoComp ? estadoComp.long_name : '';
  const estadoSigla = estadoComp ? estadoComp.short_name : '';

  const cepComp = findComponent(['postal_code']);
  const cep = cepComp ? cepComp.long_name : '';

  const paisComp = findComponent(['country']);
  const pais = paisComp ? paisComp.long_name : '';

  return {
    rua,
    numero,
    bairro,
    cidade,
    estado,
    estadoSigla,
    cep,
    pais
  };
}

export function normalizeText(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function cleanInvalidAddressValue(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  const lower = str.toLowerCase();
  const invalidValues = [
    's/n', 'sem numero', 'sem número', 'sem bairro', 'não informado', 'nao informado',
    'undefined', 'null', 'n/a', 'na', ''
  ];
  if (invalidValues.includes(lower)) {
    return '';
  }
  return str;
}

export function getConfidenceLevel(score: number): 'alta' | 'média' | 'baixa' {
  if (score >= 70) return 'alta';
  if (score >= 50) return 'média';
  return 'baixa';
}

export function buildAddressConfidenceScore(candidate: any, baseAddress: any, originalGps: { lat: number, lng: number }): number {
  let score = 0;
  const base = baseAddress || {};

  const candRua = normalizeText(candidate.rua || '');
  const baseRua = normalizeText(base.rua || '');
  if (candRua && baseRua && (candRua.includes(baseRua) || baseRua.includes(candRua))) {
    score += 30;
  }

  const candCidade = normalizeText(candidate.cidade || '');
  const baseCidade = normalizeText(base.cidade || '');
  if (candCidade && baseCidade && candCidade === baseCidade) {
    score += 25;
  }

  const candEstado = normalizeText(candidate.estado || '');
  const baseEstado = normalizeText(base.estado || '');
  const candEstadoSigla = normalizeText(candidate.estadoSigla || '');
  const baseEstadoSigla = normalizeText(base.estadoSigla || '');
  if (
    (candEstado && baseEstado && candEstado === baseEstado) ||
    (candEstadoSigla && baseEstadoSigla && candEstadoSigla === baseEstadoSigla) ||
    (candEstado && baseEstadoSigla && candEstado === baseEstadoSigla) ||
    (candEstadoSigla && baseEstado && candEstadoSigla === baseEstado)
  ) {
    score += 20;
  }

  if (candidate.latitude !== undefined && candidate.longitude !== undefined) {
    const dist = calculateDistanceMeters(originalGps.lat, originalGps.lng, candidate.latitude, candidate.longitude);
    if (dist <= 80) {
      score += 15;
    }
  }

  if (cleanInvalidAddressValue(candidate.numero)) {
    score += 10;
  }

  if (cleanInvalidAddressValue(candidate.bairro)) {
    score += 10;
  }

  return score;
}

export function selectBestAddressCandidate(candidates: any[], originalGps: { lat: number, lng: number, baseAddress?: any }) {
  if (!candidates || candidates.length === 0) return null;
  const base = originalGps.baseAddress || {};
  let bestCandidate = null;
  let highestScore = -1;

  for (const cand of candidates) {
    const score = buildAddressConfidenceScore(cand, base, originalGps);
    cand.confidenceScore = score;
    cand.confidenceLevel = getConfidenceLevel(score);
    if (score > highestScore) {
      highestScore = score;
      bestCandidate = cand;
    }
  }
  return bestCandidate;
}
