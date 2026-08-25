/**
 * Canonical formatting and utility functions (pt-BR).
 */

const formatterBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a numeric value (in Reais or Cents) to BRL currency string "R$ 1.250,50".
 * Safely handles numbers, numeric strings, undefined, null, NaN, and infinity.
 */
export function formatCurrency(value: number | string | null | undefined, isCents = false): string {
  if (value === undefined || value === null || value === '') {
    return 'R$ 0,00';
  }
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num) || !isFinite(num)) {
    return 'R$ 0,00';
  }
  const realValue = isCents ? num / 100 : num;
  return formatterBRL.format(realValue);
}

/**
 * Formats date value safely to pt-BR locale (e.g. "01/08/2026").
 * Accepts ISO string, Date instance, Firestore Timestamp object ({ toDate: () => Date }), or number timestamp.
 */
export function formatDate(
  dateValue: any,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
): string {
  if (!dateValue) return '-';
  try {
    let date: Date;
    if (typeof dateValue?.toDate === 'function') {
      date = dateValue.toDate();
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === 'string' && dateValue.includes('T')) {
      const [datePart] = dateValue.split('T');
      const parts = datePart.split('-');
      if (parts.length === 3 && !options.hour && !options.minute) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
      }
      date = new Date(dateValue);
    } else {
      date = new Date(dateValue);
    }

    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR', options);
  } catch {
    return '-';
  }
}

/**
 * Formats date and time to pt-BR string (e.g. "01/08/2026 14:30").
 */
export function formatDateTime(dateValue: any): string {
  if (!dateValue) return '-';
  try {
    let date: Date;
    if (typeof dateValue?.toDate === 'function') {
      date = dateValue.toDate();
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else {
      date = new Date(dateValue);
    }
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

/**
 * Formats time only to pt-BR string (e.g. "14:30").
 */
export function formatTime(dateValue: any): string {
  if (!dateValue) return '--:--';
  try {
    let date: Date;
    if (typeof dateValue?.toDate === 'function') {
      date = dateValue.toDate();
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else {
      date = new Date(dateValue);
    }
    if (isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}
