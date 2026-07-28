/**
 * Utility functions for BRL currency and percentage formatting & input masks.
 * Formats values with 2 decimal places in pt-BR locale.
 */

const formatterBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatterBRL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Formats a numeric value (in Reais or Cents) to BRL currency string "R$ 1.250,50".
 */
export function formatCurrency(value: number, isCents = false): string {
  if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
    return 'R$ 0,00';
  }
  const realValue = isCents ? value / 100 : value;
  return formatterBRL.format(realValue);
}

export function formatCentsToBRL(cents: number): string {
  return formatCurrency(cents, true);
}

export function formatNumberBRL(value: number): string {
  if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
    return '0,00';
  }
  return numberFormatterBRL.format(value);
}

/**
 * Parses a pasted value to cents, supporting various formats:
 * - 1250,50 -> 125050 centavos
 * - 1250.50 -> 125050 centavos
 * - R$ 1.250,50 -> 125050 centavos
 * - 125050 -> 125050 centavos
 */
export function parsePastedValue(text: string): number {
  if (!text) return 0;
  let clean = text.trim();
  if (!clean) return 0;

  // Remove currency symbol and whitespace
  clean = clean.replace(/R\$\s*/gi, '').trim();

  // If contains a comma, it's a decimal in Brazilian format
  if (clean.includes(',')) {
    const normalized = clean.replace(/\./g, '').replace(',', '.');
    const val = parseFloat(normalized);
    const result = isNaN(val) ? 0 : Math.round(val * 100);
    return Math.min(Math.max(0, result), Number.MAX_SAFE_INTEGER);
  }

  // If contains a dot and no comma
  if (clean.includes('.')) {
    const val = parseFloat(clean);
    const result = isNaN(val) ? 0 : Math.round(val * 100);
    return Math.min(Math.max(0, result), Number.MAX_SAFE_INTEGER);
  }

  // E.g. "125050" (no separators) -> treat as integer cents directly
  const digits = clean.replace(/\D/g, '');
  const result = digits ? parseInt(digits, 10) : 0;
  return Math.min(Math.max(0, result), Number.MAX_SAFE_INTEGER);
}

/**
 * Parses user input (string or number) into integer cents.
 * Handles continuous typing digits as well as pasted strings like "1250,50", "1250.50", "R$ 1.250,50".
 */
export function parseToCents(input: string | number): number {
  if (typeof input === 'number') {
    if (isNaN(input) || !isFinite(input)) return 0;
    return Math.min(Math.max(0, Math.round(input)), Number.MAX_SAFE_INTEGER);
  }
  return parsePastedValue(input);
}

/**
 * Converts a raw user typing string into cents (integer)
 * and returns the numeric BRL value and its formatted string "R$ 12,50".
 */
export function parseCurrencyDigits(inputStr: string): { cents: number; numberValue: number; formatted: string } {
  const cents = parseToCents(inputStr);
  const numberValue = cents / 100;
  const formatted = formatCurrency(numberValue);
  return { cents, numberValue, formatted };
}

/**
 * Formats a percentage input from raw typing digits into 2 decimal places.
 * E.g., "1" -> 0.01 (0,01%), "100" -> 1.00 (1,00%), "1050" -> 10.50 (10,50%)
 */
export function parsePercentDigits(inputStr: string): { percentValue: number; formatted: string } {
  const digits = String(inputStr || '').replace(/\D/g, '');
  if (!digits) {
    return { percentValue: 0, formatted: '0,00%' };
  }
  const cents = parseInt(digits, 10) || 0;
  const percentValue = cents / 100;
  const formatted = `${formatNumberBRL(percentValue)}%`;
  return { percentValue, formatted };
}

