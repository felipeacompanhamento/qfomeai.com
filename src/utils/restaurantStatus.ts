export const isRestaurantOpen = (rest: any, schedules: any[] = []) => {
  if (!rest) return false;
  
  // Manual override
  if (rest.status_operacao_config === 'fechado') return false;
  if (rest.status_operacao_config === 'aberto') return true;
  
  // Automatic logic
  const now = new Date();
  const day = now.getDay(); // 0-6 (Sun-Sat)
  const time = now.getHours() * 60 + now.getMinutes();
  
  const dayMap: Record<number, string> = {
    0: 'Domingo',
    1: 'Segunda',
    2: 'Terça',
    3: 'Quarta',
    4: 'Quinta',
    5: 'Sexta',
    6: 'Sábado'
  };
  
  const todayName = dayMap[day];
  
  // Use new schedules if available
  if (schedules && schedules.length > 0) {
    const todaySchedule = schedules.find(s => s.dia_semana === todayName);
    
    if (!todaySchedule || todaySchedule.status === 'fechado') return false;
    
    const [startH, startM] = todaySchedule.hora_abertura.split(':').map(Number);
    const [endH, endM] = todaySchedule.hora_fechamento.split(':').map(Number);
    
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    
    if (end < start) {
      return time >= start || time <= end;
    }
    
    return time >= start && time <= end;
  }
  
  // Fallback to legacy logic
  if (!rest.horarios_funcionamento) return true;
  
  let todayHours: any = null;
  
  if (Array.isArray(rest.horarios_funcionamento)) {
    todayHours = rest.horarios_funcionamento.find((h: any) => h.dia_semana === day);
    if (todayHours) {
      todayHours = {
        ...todayHours,
        inicio: todayHours.abertura || todayHours.inicio,
        fim: todayHours.fechamento || todayHours.fim,
        aberto: todayHours.aberto !== undefined ? todayHours.aberto : (!!todayHours.abertura || !!todayHours.inicio)
      };
    }
  } else {
    const legacyDayMap: Record<number, string> = {
      0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado'
    };
    todayHours = rest.horarios_funcionamento[legacyDayMap[day]];
  }
  
  if (!todayHours || (todayHours.aberto === false)) return false;
  
  let inicio = todayHours.inicio || todayHours.abertura;
  let fim = todayHours.fim || todayHours.fechamento;
  
  if (typeof todayHours === 'string') {
    const parts = todayHours.split('-');
    if (parts.length === 2) {
      inicio = parts[0].trim();
      fim = parts[1].trim();
    }
  }
  
  if (!inicio || !fim || typeof inicio !== 'string' || typeof fim !== 'string') return false;
  
  const [startH, startM] = inicio.split(':').map(Number);
  const [endH, endM] = fim.split(':').map(Number);
  
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  
  if (end < start) {
    return time >= start || time <= end;
  }
  
  return time >= start && time <= end;
};
