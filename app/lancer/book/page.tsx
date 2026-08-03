"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { getCarRates, getBankAccounts, type CarRates, type BankAccount } from "@/lib/settings";
import { createPublicBooking, computeReturnDate, type RateType } from "@/lib/carBookings";
import { whatsappLink } from "@/lib/whatsapp";

const RATE_LABELS: Record<RateType, string> = { day: "يوم", week: "أسبوع", month: "شهر" };

function nowLocalInput() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PublicBookingPage() {
  const [rates, setRates] = useState<CarRates | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [renterName, setRenterName] = useState("");
  const [renterPhone, setRenterPhone] = useState("");
  const [collectionAt, setCollectionAt] = useState(nowLocalInput());
  const [rateType, setRateType] = useState<RateType>("day");
  const [quantity, setQuantity] = useState("1");
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [result, setResult] = useState<{ bookingNumber: string; total: number; account: BankAccount } | null>(null);

  useEffect(() => {
    Promise.all([getCarRates(), getBankAccounts()]).then(([r, a]) => {
      setRates(r);
      setAccounts(a);
      setAccountId(a[0]?.id ?? "");
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="mx-auto max-w-lg px-6 py-24 text-center text-muted">جارِ التحميل…</div>;
  }

  const liveTotal = rates ? (rates[rateType] ?? 0) * (parseFloat(quantity) || 0) : 0;
  const liveReturn = collectionAt ? computeReturnDate(new Date(collectionAt), rateType, parseFloat(quantity) || 1) : null;
  const selectedAccount = accounts.find((a) => a.id === accountId);

  if (result) {
    const message = [
      `مرحباً، هذا إثبات دفع للحجز رقم ${result.bookingNumber}`,
      `الاسم: ${renterName}`,
      `المبلغ: R${result.total.toLocaleString()}`,
    ].join("\n");

    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <div className="rounded-3xl border border-primary/40 bg-primary/10 p-6 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 font-display text-xl font-bold text-ink">تم استلام حجزك</p>
          <p className="mt-1 font-mono text-lg font-semibold text-primary" dir="ltr">
            {result.bookingNumber}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-base font-semibold text-ink">خطوات إتمام الحجز</h2>
          <ol className="mt-3 space-y-2 text-sm text-muted">
            <li>1. حوّل مبلغ <span className="font-semibold text-ink">R{result.total.toLocaleString()}</span> إلى الحساب التالي:</li>
          </ol>
          <div className="mt-3 rounded-xl bg-surface2 p-4 text-sm" dir="ltr">
            <p className="font-semibold text-ink">{result.account.bankName}</p>
            <p className="mt-1 whitespace-pre-line text-muted">{result.account.details}</p>
          </div>
          <ol start={2} className="mt-3 space-y-2 text-sm text-muted">
            <li>2. أرسل صورة إثبات الدفع على واتساب مع ذكر رقم الحجز <span className="font-mono text-ink">{result.bookingNumber}</span>.</li>
            <li>3. يجب إتمام الدفع خلال <span className="font-semibold text-primary">3 ساعات</span> من الآن، وإلا يُلغى الحجز تلقائياً.</li>
          </ol>

          <a
            href={whatsappLink(message)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-bg"
          >
            <MessageCircle size={16} /> إرسال إثبات الدفع عبر واتساب
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-xl font-semibold text-ink">احجز لانسر</h1>
      <p className="mt-1 text-sm text-muted">املأ التفاصيل، وسنرسل لك خطوات الدفع فوراً.</p>

      {formError && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
          {formError}
        </div>
      )}

      <div className="mt-5 space-y-3 rounded-2xl border border-border bg-surface p-5">
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="اسمك"
            value={renterName}
            onChange={(e) => setRenterName(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink"
          />
          <input
            placeholder="رقم هاتفك"
            value={renterPhone}
            onChange={(e) => setRenterPhone(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink"
          />
        </div>

        <label className="block text-xs text-subtle">
          وقت الاستلام
          <input
            type="datetime-local"
            value={collectionAt}
            onChange={(e) => setCollectionAt(e.target.value)}
            dir="ltr"
            className="mt-1 w-full rounded-lg border border-border bg-surface2 px-3.5 py-2.5 text-sm text-ink"
          />
        </label>

        <div className="grid grid-cols-2 gap-3" dir="ltr">
          <label className="text-xs text-subtle">
            المدة
            <select
              value={rateType}
              onChange={(e) => setRateType(e.target.value as RateType)}
              className="mt-1 w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-ink"
            >
              <option value="day">يوم</option>
              <option value="week">أسبوع</option>
              <option value="month">شهر</option>
            </select>
          </label>
          <label className="text-xs text-subtle">
            العدد
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-ink"
            />
          </label>
        </div>

        {accounts.length > 0 && (
          <label className="block text-xs text-subtle">
            حساب الدفع
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-ink"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bankName}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="space-y-2 rounded-xl bg-surface2 p-4 font-mono text-sm" dir="ltr">
          <div className="flex items-center justify-between">
            <span className="text-subtle">تاريخ الإرجاع المتوقع</span>
            <span className="text-ink">{liveReturn ? fmtDateTime(liveReturn.toISOString()) : "—"}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-subtle">الإجمالي</span>
            <span className="font-semibold text-primary">R{liveTotal.toLocaleString()}</span>
          </div>
        </div>

        <button
          onClick={async () => {
            setFormError(null);
            if (!renterName.trim() || !renterPhone.trim()) {
              setFormError("أدخل اسمك ورقم هاتفك.");
              return;
            }
            if (!selectedAccount) {
              setFormError("لا يوجد حساب دفع متاح حالياً — تواصل معنا مباشرة.");
              return;
            }
            setSubmitting(true);
            try {
              const bookingNumber = await createPublicBooking({
                renterName: renterName.trim(),
                renterPhone: renterPhone.trim(),
                bankUsed: selectedAccount.bankName,
                rateType,
                quantity: parseFloat(quantity) || 1,
                rate: rates![rateType],
                collectionAt: new Date(collectionAt).toISOString(),
              });
              setResult({ bookingNumber, total: liveTotal, account: selectedAccount });
            } catch (err) {
              setFormError(err instanceof Error ? err.message : String(err));
            }
            setSubmitting(false);
          }}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-bg"
        >
          {submitting ? "جارٍ الحجز…" : "تأكيد الحجز"}
        </button>
      </div>
    </div>
  );
}
