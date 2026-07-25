/**
 * Utility functions for BRL currency and percentage formatting & input masks.
 * Formats values with 2 decimal places in pt-BR locale.
 */

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatCurrency(value: number): string {
  if (isNaN(value) || !isFinite(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatNumberBRL(value: number): string {
  if (isNaN(value) || !isFinite(value)) return '0,00';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Converts a raw user typing string (containing digits) into cents (integer)
 * and returns the numeric BRL value and its formatted string "R$ 12,50".
 */
export function parseCurrencyDigits(inputStr: string): { cents: number; numberValue: number; formatted: string } {
  const digits = inputStr.replace(/\D/g, '');
  if (!digits) {
    return { cents: 0, numberValue: 0, formatted: 'R$ 0,00' };
  }
  const cents = parseInt(digits, 10) || 0;
  const numberValue = cents / 100;
  const formatted = formatCurrency(numberValue);
  return { cents, numberValue, formatted };
}

/**
 * Formats a percentage input from raw typing digits into 2 decimal places.
 * E.g., "1" -> 0.01 (0,01%), "100" -> 1.00 (1,00%), "1050" -> 10.50 (10,50%)
 */
export function parsePercentDigits(inputStr: string): { percentValue: number; formatted: string } {
  const digits = inputStr.replace(/\D/g, '');
  if (!digits) {
    return { percentValue: 0, formatted: '0,00%' };
  }
  const cents = parseInt(digits, 10) || 0;
  const percentValue = cents / 100;
  const formatted = `${formatNumberBRL(percentValue)}%`;
  return { percentValue, formatted };
}
