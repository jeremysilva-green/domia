export type Currency = 'USD' | 'PYG';

/**
 * Get the currency symbol for a given currency code
 */
export function getCurrencySymbol(currency?: string): string {
  return currency === 'PYG' ? '₲' : '$';
}

/**
 * Format an amount with the appropriate currency symbol
 * @param amount - The amount to format
 * @param currency - The currency code ('USD' or 'PYG')
 * @param showSymbol - Whether to show the currency symbol (default: true)
 * @returns Formatted string like "$1,500" or "₲5,000,000"
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
 * @param amount - The amount to format
 * @param currency - The currency code ('USD' or 'PYG')
 * @returns Formatted string like "$1,500/mo" or "₲5,000,000/mo"
 */
export function formatMonthlyRent(
  amount: number | undefined | null,
  currency?: string
): string {
  return `${formatCurrency(amount, currency)}/mo`;
}
