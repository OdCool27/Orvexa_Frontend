import { unitDecimal } from './catalogue';
import { wholeQuantity } from './inventory';
import { money } from './format';
import type { Sale } from '../api/checkout';
export interface BasketLine {
  productId: string;
  name: string;
  sku: string;
  baseUnit: string;
  unitCode: string;
  quantity: string;
}
export function discountPercent(value: string) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a discount from 0 to 100 with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) > 10000n)
    throw new Error('Discount cannot exceed 100%.');
  return value;
}
export function basketPayload(lines: BasketLine[], locationId: number, percent = '', reason = '') {
  if (!lines.length || lines.length > 100) throw new Error('Choose 1–100 distinct products.');
  const result = {
    locationId,
    lines: lines.map((line) => {
      if (line.unitCode === 'BASE') {
        const quantity = wholeQuantity(line.quantity);
        if (quantity > 100000) throw new Error('A base-unit line supports at most 100000 units.');
        return { productId: line.productId, quantity };
      }
      return {
        productId: line.productId,
        unitCode: line.unitCode,
        unitQuantity: unitDecimal(line.quantity, true),
      };
    }),
  };
  if (!percent) return result;
  const normalized = discountPercent(percent);
  if (Number(normalized) > 0 && !reason.trim())
    throw new Error('Give a reason for the manual discount.');
  return { ...result, discountPercent: normalized, discountReason: reason.trim() };
}
export const safeAmount = (amount: number) => Number.isSafeInteger(amount) && amount >= 0;
export function saleMoney(amount: number, currency: string) {
  return safeAmount(amount) ? money(amount, currency) : 'Amount exceeds supported display range';
}
export function paymentCanStart(order: Sale, now = Date.now()) {
  return (
    order.status === 'RESERVED' &&
    order.payment_state === 'NOT_STARTED' &&
    order.expires_at_ms > now &&
    safeAmount(order.total_cents)
  );
}
