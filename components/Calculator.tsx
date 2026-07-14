"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { FROM_CURRENCIES, validToCurrencies, CURRENCIES, isMultiplyCorridor, type CurrencyCode } from "@/lib/corridors";
import { formatRate } from "@/lib/format";
import type { RateRow } from "@/lib/rates";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";

type Mode = "send" | "receive";

export default function Calculator({ rates }: { rates: RateRow[] }) {
  const [mode, setMode] = useState<Mode>("send");
  const [fromCode, setFromCode] = useState<CurrencyCode>(FROM_CURRENCIES[0].code);
  const toOptions = useMemo(() => validToCurrencies(fromCode), [fromCode]);
  const [toCode, setToCode] = useState<CurrencyCode>(toOptions[0]?.code);
  const [amount, setAmount] = useState("1000");

  const currentToOptions = useMemo(() => validToCurrencies(fromCode), [fromCode]);
  const toCurrency = currentToOptions.find((c) => c.code === toCode) ?? currentToOptions[0];
  const fromCurrency = CURRENCIES[fromCode];

  const rate = rates.find((r) => r.from === fromCode && r.to === toCurrency?.code);

  const amountNum = parseFloat(amount) || 0;

  // Almost every corridor uses "amount ÷ rate" (rate = units of FROM per 1 unit of TO).
  // SAR→ZAR and QAR→ZAR are the exceptions: they use "amount × rate" instead.
  const usesMultiply = toCurrency ? isMultiplyCorridor(fromCode, toCurrency.code) : false;

  // "send" mode: student knows what they're sending (fromCurrency amount).
  // "receive" mode: student knows what they need the recipient to get (toCurrency amount).
  const amountSent =
    mode === "send"
      ? amountNum
      : rate
      ? usesMultiply
        ? amountNum / rate.rate
        : amountNum * rate.rate
      : 0;
  const amountReceived =
    mode === "receive"
      ? amountNum
      : rate
      ? usesMultiply
        ? amountNum * rate.rate
        : amountNum / rate.rate
      : 0;

  function handleFromChange(code: CurrencyCode) {
    setFromCode(code);
    const next = validToCurrencies(code);
    setToCode(next[0]?.code);
  }

  function orderNow() {
    if (!rate || !toCurrency) return;
    const message = buildOrderMessage({
      amountReceived: amountReceived.toLocaleString("en-US", { maximumFractionDigits: 2 }),
      toCurrency: toCurrency.code,
      amountSent: amountSent.toLocaleString("en-US", { maximumFractionDigits: 2 }),
      fromCurrency: fromCurrency.code,
    });
    window.open(whatsappLink(message), "_blank", "noopener,noreferrer");
  }

  return (
    <section id="calculator" className="border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <p className="eyebrow">الحاسبة</p>
            <h2 className="section-heading mt-3">احسبها صاح</h2>
            <p className="mt-3 max-w-md text-muted">
              شوف انت عاوز كم و حتحول كم باسهل طريقه و اطلب الان.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-full border border-border bg-surface2 p-1">
              <button
                onClick={() => setMode("send")}
                className={`rounded-full py-2 text-sm font-semibold transition-colors ${
                  mode === "send" ? "bg-primary text-bg" : "text-muted"
                }`}
              >
                عندي مبلغ محدد أرسله
              </button>
              <button
                onClick={() => setMode("receive")}
                className={`rounded-full py-2 text-sm font-semibold transition-colors ${
                  mode === "receive" ? "bg-primary text-bg" : "text-muted"
                }`}
              >
                عاوز يوصل مبلغ محدد
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-subtle">
                  من عملة
                </span>
                <select
                  value={fromCode}
                  onChange={(e) => handleFromChange(e.target.value as CurrencyCode)}
                  className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink focus:border-primary"
                >
                  {FROM_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-subtle">
                  إلى عملة
                </span>
                <select
                  value={toCurrency?.code}
                  onChange={(e) => setToCode(e.target.value as CurrencyCode)}
                  className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink focus:border-primary"
                >
                  {currentToOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-subtle">
                {mode === "send"
                  ? `المبلغ اللي حترسله (${fromCurrency.code})`
                  : `المبلغ اللي عاوزه يوصل (${toCurrency?.code})`}
              </span>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-left font-mono text-lg text-ink focus:border-primary"
              />
            </label>

            <div className="mt-6 space-y-3 rounded-2xl bg-surface2 p-5 font-mono text-sm">
              <div className="flex items-center justify-between" dir="ltr">
                <span className={mode === "send" ? "text-primary font-semibold" : "text-ink"}>
                  {amountSent.toLocaleString("en-US", { maximumFractionDigits: 2 })} {fromCurrency.code}
                </span>
                <span className="text-subtle">المبلغ المُرسل</span>
              </div>
              <div className="flex items-center justify-between" dir="ltr">
                <span className="text-ink">{rate ? formatRate(rate.rate) : "—"}</span>
                <span className="text-subtle">سعر الصرف</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-base" dir="ltr">
                <span className={mode === "receive" ? "font-semibold text-primary" : "font-semibold text-ink"}>
                  {rate
                    ? `${amountReceived.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${toCurrency.code}`
                    : "اختر ممر التحويل"}
                </span>
                <span className="font-medium text-muted">المستلم يستلم</span>
              </div>
            </div>

            <button
              onClick={orderNow}
              disabled={!rate || amountNum <= 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-sm font-semibold text-bg transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MessageCircle size={16} /> اطلب الآن عبر واتساب <ArrowLeft size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
