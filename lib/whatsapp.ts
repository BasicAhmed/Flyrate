export const WHATSAPP_NUMBER = "97451131080"; // international format, no +, no spaces

export interface OrderDetails {
  amountReceived: string;
  toCurrency: string;
  toFlag?: string;
  amountSent: string;
  fromCurrency: string;
  fromFlag?: string;
  rateLine?: string; // e.g. "1 MYR = 4.10 ZAR"
  discountNote?: string;
}

/** The message that lands in Ahmed's WhatsApp when a customer taps "order".
 *  Laid out so he can read the whole order at a glance and reply with
 *  account details straight away — no back-and-forth to confirm amounts. */
export function buildOrderMessage(o: OrderDetails): string {
  const from = `${o.fromFlag ? o.fromFlag + " " : ""}${o.amountSent} ${o.fromCurrency}`;
  const to = `${o.toFlag ? o.toFlag + " " : ""}${o.amountReceived} ${o.toCurrency}`;
  return [
    "السلام عليكم 👋",
    "عاوز أعمل تحويل:",
    "",
    `📤 حأرسل: ${from}`,
    `📥 يستلم: ${to}`,
    ...(o.rateLine ? [`💱 السعر: ${o.rateLine}`] : []),
    ...(o.discountNote ? [`🎁 ${o.discountNote}`] : []),
    "",
    "ممكن ترسل لي تفاصيل الحساب؟ 🙏",
  ].join("\n");
}

export function whatsappLink(message: string, number = WHATSAPP_NUMBER): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
