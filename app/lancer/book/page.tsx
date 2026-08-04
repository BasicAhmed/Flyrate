"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { getCarRates, getBankAccounts, type CarRates, type BankAccount } from "@/lib/settings";
import { createPublicBooking, computeReturnDate, computeTotal, getBookedRanges, type RateType } from "@/lib/carBookings";
import { whatsappLink } from "@/lib/whatsapp";
import BookingCalendar from "./Calendar";

const RATE_LABELS: Record<RateType, string> = { day: "يوم", week: "أسبوع", month: "شهر" };

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function expandRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const cur = new Date(startStr);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endStr);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    out.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export default function PublicBookingPage() {
  const [rates, setRates] = useState<CarRates | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [renterName, setRenterName] = useState("");
  const [renterPhone, setRenterPhone] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [time, setTime] = useState("10:00");
  const [rateType, setRateType] = useState<RateType>("day");
  const [quantity, setQuantity] = useState("1");
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [result, setResult] = useState<{ bookingNumber: string; total: number; account: BankAccount } | null>(null);

  useEffect(() => {
    Promise.all([getCarRates(), getBankAccounts(), getBookedRanges()]).then(([r, a, ranges]) => {
      setRates(r);
      setAccounts(a);
      setAccountId(a[0]?.id ?? "");
      const dates = new Set<string>();
      ranges.forEach((rg) => {
        const days = expandRange(rg.start, rg.end);
        days.slice(0, -1).forEach((d) => dates.add(d)); // return day itself isn't blocked
      });
      setBookedDates(dates);
      setLoading(false);
    });
  }, []);

  const collectionAt = selectedDate ? `${selectedDate}T${time}` : null;
  const liveTotal = rates && collectionAt ? computeTotal(rates, rateType, parseFloat(quantity) || 0, new Date(collectionAt)) : 0;
  const liveReturn = collectionAt ? computeReturnDate(new Date(collectionAt), rateType, parseFloat(quantity) || 1) : null;
  const selectedAccount = accounts.find((a) => a.id === accountId);

  const projectedDates = useMemo(() => {
    if (!selectedDate || !liveReturn) return new Set<string>();
    return new Set(expandRange(selectedDate, toDateStr(liveReturn)));
  }, [selectedDate, liveReturn]);

  const hasConflict = useMemo(() => {
    for (const d of projectedDates) {
      if (d !== selectedDate && bookedDates.has(d)) return true;
    }
    return false;
  }, [projectedDates, bookedDates, selectedDate]);

  if (loading) {
    return <div className="mx-auto max-w-lg px-6 py-24 text-center text-muted">جارِ التحميل…</div>;
  }

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
      <p className="mt-1 text-sm text-muted">اختر تاريخ الاستلام من التقويم، واملأ الباقي.</p>

      {formError && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
          {formError}
        </div>
      )}

      <div className="mt-5 space-y-4">
        <BookingCalendar
          bookedDates={bookedDates}
          projectedDates={projectedDates}
          selected={selectedDate}
          onSelect={setSelectedDate}
        />

        {hasConflict && (
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-primary">
            المدة المختارة تتداخل مع حجز آخر — جرّب تاريخاً مختلفاً أو مدة أقصر.
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
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

          <div className="grid grid-cols-3 gap-3" dir="ltr">
            <label className="text-xs text-subtle">
              وقت الاستلام
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2.5 text-sm text-ink"
              />
            </label>
            <label className="text-xs text-subtle">
              المدة
              <select
                value={rateType}
                onChange={(e) => setRateType(e.target.value as RateType)}
                className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2.5 text-sm text-ink"
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
                className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2.5 text-sm text-ink"
              />
            </label>
          </div>
          {rateType === "day" && (
            <p className="text-xs text-subtle">* أيام السبت والأحد بسعر مختلف (R{rates?.weekendDay.toLocaleString()}/يوم).</p>
          )}

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
              <span className="text-subtle">تاريخ الاستلام</span>
              <span className="text-ink">{collectionAt ? fmtDateTime(collectionAt) : "اختر تاريخاً"}</span>
            </div>
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
              if (!selectedDate) {
                setFormError("اختر تاريخ الاستلام من التقويم.");
                return;
              }
              if (!renterName.trim() || !renterPhone.trim()) {
                setFormError("أدخل اسمك ورقم هاتفك.");
                return;
              }
              if (!selectedAccount) {
                setFormError("لا يوجد حساب دفع متاح حالياً — تواصل معنا مباشرة.");
                return;
              }
              if (hasConflict) {
                setFormError("المدة المختارة تتداخل مع حجز آخر.");
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
                  rates: rates!,
                  collectionAt: new Date(collectionAt!).toISOString(),
                });
                setResult({ bookingNumber, total: liveTotal, account: selectedAccount });
              } catch (err) {
                setFormError(err instanceof Error ? err.message : String(err));
              }
              setSubmitting(false);
            }}
            className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-bg disabled:opacity-40"
            disabled={!selectedDate || hasConflict}
          >
            {submitting ? "جارٍ الحجز…" : "تأكيد الحجز"}
          </button>
        </div>
      </div>
    </div>
  );
}
