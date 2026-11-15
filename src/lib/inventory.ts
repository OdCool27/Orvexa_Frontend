export function acquisitionCost(value: string) {
  if (!/^\d{1,10}(\.\d{1,6})?$/.test(value))
    throw new Error(
      'Enter a nonnegative acquisition cost with at most ten integer digits and six decimal places.',
    );
  return value;
}
export function wholeQuantity(value: string, allowZero = false) {
  if (!/^\d+$/.test(value) || +value > 2147483647 || +value < (allowZero ? 0 : 1))
    throw new Error(`Enter a whole quantity from ${allowZero ? 0 : 1} to 2147483647.`);
  return +value;
}
export function isoDate(value: string) {
  if (!value) return null;
  if (
    value.startsWith('0000') ||
    !/^\d{4}-\d\d-\d\d$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Enter a valid calendar expiry date.');
  return value;
}
// A display ratio only: the API exposes value and on-hand, not its internal
// average. Never use this result to post costs, value movements or price sales.
export function displayAverage(value: string | undefined, quantity: number) {
  if (!value || !/^\d+(\.\d{1,6})?$/.test(value) || !Number.isInteger(quantity) || quantity <= 0)
    return null;
  const [whole, fraction = ''] = value.split('.');
  const micros = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  const divisor = BigInt(quantity);
  const rounded = (micros + divisor / 2n) / divisor;
  return `${rounded / 1000000n}.${String(rounded % 1000000n).padStart(6, '0')}`;
}
