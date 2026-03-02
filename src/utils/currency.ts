export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'PYG', symbol: '₲', name: 'Guaraní' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
  { code: 'CLP', symbol: '$', name: 'Chilean Peso' },
  { code: 'COP', symbol: '$', name: 'Colombian Peso' },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol' },
  { code: 'BOB', symbol: 'Bs', name: 'Bolivian Boliviano' },
  { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
] as const;

export type Currency = typeof CURRENCIES[number]['code'];

/**
 * Get the currency symbol for a given currency code
 */
export function getCurrencySymbol(currency?: string): string {
  const found = CURRENCIES.find((c) => c.code === currency);
  return found ? found.symbol : '$';
}

/**
 * Get a short display label like "$ USD" for a currency code
 */
export function getCurrencyLabel(currency?: string): string {
  const found = CURRENCIES.find((c) => c.code === currency);
  return found ? `${found.symbol} ${found.code}` : '$ USD';
}

/**
 * Format an amount with the appropriate currency symbol
 */
export function formatCurrency(
  amount: number | undefined | null,
  currency?: string,
  showSymbol: boolean = true
): string {
  if (amount === undefined || amount === null) {
    return showSymbol ? `${getCurrencySymbol(currency)}0` : '0';
  }

  const formattedNumber = amount.toLocaleString();

  if (showSymbol) {
    return `${getCurrencySymbol(currency)}${formattedNumber}`;
  }

  return formattedNumber;
}

/**
 * Format an amount as a monthly rent string
 */
export function formatMonthlyRent(
  amount: number | undefined | null,
  currency?: string
): string {
  return `${formatCurrency(amount, currency)}/mo`;
}
