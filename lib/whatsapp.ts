export const WHATSAPP_NUMBER = "97451131080"; // international format, no +, no spaces

export interface OrderDetails {
  amountReceived: string;
  toCurrency: string;
  amountSent: string;
  fromCurrency: string;
}

export function buildOrderMessage(o: OrderDetails): string {
  return [
    "سلام عليكم كيف الحال",
    `انا عاوز ${o.amountReceived} ${o.toCurrency}`,
    `و حاحول كده ${o.amountSent} ${o.fromCurrency}`,
    "رسل لي رقم الحساب",
  ].join("\n");
}

export function whatsappLink(message: string, number = WHATSAPP_NUMBER): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
