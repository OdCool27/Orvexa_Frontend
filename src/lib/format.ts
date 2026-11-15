export function money(cents: number, currency = 'JMD') {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(cents / 100);
}
export function majorToCents(value: number | string): number {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error('Enter a nonnegative amount with up to two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Amount exceeds supported range.');
  return cents;
}
export function date(value: unknown) {
  if (!value) return '—';
  const text = String(value);
  const parsed = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(text) ? text.replace(' ', 'T') + 'Z' : text);
  return Number.isNaN(parsed.getTime())
    ? text
    : parsed.toLocaleString('en-JM', { dateStyle: 'medium', timeStyle: 'short' });
}
export const shortId = (value: string) => value.slice(0, 8).toUpperCase();
export const label = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase());
