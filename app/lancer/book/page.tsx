"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, CheckCircle2, Languages } from "lucide-react";
import { getCarRates, getBankAccounts, getStudents, type CarRates, type BankAccount, type Student } from "@/lib/settings";
import { createPublicBooking, computeReturnDate, computeTotal, getBookedRanges, type RateType } from "@/lib/carBookings";
import { whatsappLink } from "@/lib/whatsapp";
import BookingCalendar from "./Calendar";

type Lang = "ar" | "en";

const DICT = {
  ar: {
    title: "احجز لانسر",
    subtitle: "اختر تاريخ الاستلام من التقويم، واملأ الباقي.",
    namePlaceholder: "اسمك",
    phonePlaceholder: "رقم هاتفك",
    pickupTime: "وقت الاستلام",
    duration: "المدة",
    day: "يوم",
    week: "أسبوع",
    month: "شهر",
    quantity: "العدد",
    weekendNote: (r: number) => `* أيام السبت والأحد بسعر مختلف (R${r.toLocaleString()}/يوم).`,
    paymentAccount: "حساب الدفع",
    pickupDate: "تاريخ الاستلام",
    chooseDate: "اختر تاريخاً",
    expectedReturn: "تاريخ الإرجاع المتوقع",
    total: "الإجمالي",
    confirmBooking: "تأكيد الحجز",
    booking: "جارٍ الحجز…",
    conflictWarning: "المدة المختارة تتداخل مع حجز آخر — جرّب تاريخاً مختلفاً أو مدة أقصر.",
    errNoDate: "اختر تاريخ الاستلام من التقويم.",
    errNoNamePhone: "أدخل اسمك ورقم هاتفك.",
    errNoAccount: "لا يوجد حساب دفع متاح حالياً — تواصل معنا مباشرة.",
    errConflict: "المدة المختارة تتداخل مع حجز آخر.",
    received: "تم استلام حجزك",
    stepsTitle: "خطوات إتمام الحجز",
    step1: (amount: string) => `1. حوّل مبلغ ${amount} إلى الحساب التالي:`,
    step2: (num: string) => (
      <>2. أرسل صورة إثبات الدفع على واتساب مع ذكر رقم الحجز <span className="font-mono text-ink">{num}</span>.</>
    ),
    step3: (
      <>3. يجب إتمام الدفع خلال <span className="font-semibold text-primary">3 ساعات</span> من الآن، وإلا يُلغى الحجز تلقائياً.</>
    ),
    sendProof: "إرسال إثبات الدفع عبر واتساب",
    loading: "جارِ التحميل…",
  },
  en: {
    title: "Book the Lancer",
    subtitle: "Pick a pickup date on the calendar, then fill in the rest.",
    namePlaceholder: "Your name",
    phonePlaceholder: "Your phone number",
    pickupTime: "Pickup time",
    duration: "Duration",
    day: "Day",
    week: "Week",
    month: "Month",
    quantity: "Quantity",
    weekendNote: (r: number) => `* Saturdays & Sundays are priced differently (R${r.toLocaleString()}/day).`,
    paymentAccount: "Payment account",
    pickupDate: "Pickup date",
    chooseDate: "Choose a date",
    expectedReturn: "Expected return date",
    total: "Total",
    confirmBooking: "Confirm booking",
    booking: "Booking…",
    conflictWarning: "This stretch overlaps another booking — try a different date or shorter stay.",
    errNoDate: "Pick a pickup date on the calendar.",
    errNoNamePhone: "Enter your name and phone number.",
    errNoAccount: "No payment account available right now — contact us directly.",
    errConflict: "The selected dates overlap another booking.",
    received: "Booking received",
    stepsTitle: "Steps to complete your booking",
    step1: (amount: string) => `1. Transfer ${amount} to the account below:`,
    step2: (num: string) => (
      <>2. Send a screenshot of the payment on WhatsApp, mentioning booking number <span className="font-mono text-ink">{num}</span>.</>
    ),
    step3: (
      <>3. Payment must be completed within <span className="font-semibold text-primary">3 hours</span>, or the booking is automatically cancelled.</>
    ),
    sendProof: "Send payment proof on WhatsApp",
    loading: "Loading…",
  },
};

function fmtDateTime(iso: string, lang: Lang) {
  return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "en-GB", {
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

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export default function PublicBookingPage() {
  const [lang, setLang] = useState<Lang>("ar");
  const t = DICT[lang];
  const dir = lang === "en" ? "ltr" : "rtl";

  const [rates, setRates] = useState<CarRates | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
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
    Promise.all([getCarRates(), getBankAccounts(), getBookedRanges(), getStudents()]).then(([r, a, ranges, st]) => {
      setRates(r);
      setAccounts(a);
      setAccountId(a[0]?.id ?? "");
      setStudents(st);
      const dates = new Set<string>();
      ranges.forEach((rg) => {
        const days = expandRange(rg.start, rg.end);
        days.slice(0, -1).forEach((d) => dates.add(d));
      });
      setBookedDates(dates);
      setLoading(false);
    });
  }, []);

  function handleNameChange(value: string) {
    setRenterName(value);
    const match = students.find((s) => s.name.trim().toLowerCase() === value.trim().toLowerCase());
    if (match) setRenterPhone(match.phone);
  }

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

  const LangToggle = (
    <button
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-semibold text-ink backdrop-blur"
    >
      <Languages size={14} /> {lang === "ar" ? "EN" : "عربي"}
    </button>
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16" dir={dir}>
        <div className="h-6 w-40 animate-pulse rounded bg-surface2" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-surface2" />
        <div className="mt-5 h-72 animate-pulse rounded-2xl bg-surface2" />
        <div className="mt-4 h-64 animate-pulse rounded-2xl bg-surface2" />
      </div>
    );
  }

  if (result) {
    const message = [
      `مرحباً، هذا إثبات دفع للحجز رقم ${result.bookingNumber}`,
      `الاسم: ${renterName}`,
      `المبلغ: R${result.total.toLocaleString()}`,
    ].join("\n");

    return (
      <div className="mx-auto max-w-lg px-6 py-16" dir={dir}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="rounded-3xl border border-primary/40 bg-primary/10 p-6 text-center"
        >
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-primary"
          >
            <CheckCircle2 size={32} />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-3 font-display text-xl font-bold text-ink"
          >
            {t.received}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mt-1 font-mono text-lg font-semibold text-primary"
            dir="ltr"
          >
            {result.bookingNumber}
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="mt-5 rounded-2xl border border-border bg-surface p-5"
        >
          <h2 className="font-display text-base font-semibold text-ink">{t.stepsTitle}</h2>
          <p className="mt-3 text-sm text-muted">{t.step1(`R${result.total.toLocaleString()}`)}</p>
          <div className="mt-3 rounded-xl bg-surface2 p-4 text-sm" dir="ltr">
            <p className="font-semibold text-ink">{result.account.bankName}</p>
            <p className="mt-1 whitespace-pre-line text-muted">{result.account.details}</p>
          </div>
          <p className="mt-3 text-sm text-muted">{t.step2(result.bookingNumber)}</p>
          <p className="mt-2 text-sm text-muted">{t.step3}</p>

          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            href={whatsappLink(message)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-bg"
          >
            <MessageCircle size={16} /> {t.sendProof}
          </motion.a>
        </motion.div>
      </div>
    );
  }

  return (
    <div dir={dir}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative h-[46vh] min-h-[280px] w-full overflow-hidden"
      >
        <motion.div
          initial={{ scale: 1.08 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="relative h-full w-full"
        >
          <Image src="/lancer-hero.jpg" alt="Mitsubishi Lancer" fill priority className="object-cover object-[center_35%]" />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-bg/10" />
        <div className="absolute inset-x-0 top-4 flex justify-center">{LangToggle}</div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="absolute inset-x-0 bottom-0 px-6 pb-6 text-center"
        >
          <p className="font-display text-2xl font-bold text-ink drop-shadow">{t.title}</p>
          <p className="mt-1 text-sm text-muted drop-shadow">{t.subtitle}</p>
        </motion.div>
      </motion.div>

      <div className="mx-auto max-w-lg px-6 pb-16 pt-8">
        <AnimatePresence>
          {formError && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="overflow-hidden rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary"
            >
              {formError}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 space-y-4">
          <motion.div initial="initial" animate="animate" variants={fadeUp} transition={{ duration: 0.45, delay: 0.05 }}>
            <BookingCalendar
              bookedDates={bookedDates}
              projectedDates={projectedDates}
              selected={selectedDate}
              onSelect={setSelectedDate}
              lang={lang}
            />
          </motion.div>

          <AnimatePresence>
            {hasConflict && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-primary"
              >
                {t.conflictWarning}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial="initial"
            animate="animate"
            variants={fadeUp}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="space-y-3 rounded-2xl border border-border bg-surface p-5"
          >
            <div className="grid grid-cols-2 gap-3">
              <input
                list="student-names"
                placeholder={t.namePlaceholder}
                value={renterName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink transition-colors focus:border-primary"
              />
              <datalist id="student-names">
                {students.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
              <input
                placeholder={t.phonePlaceholder}
                value={renterPhone}
                onChange={(e) => setRenterPhone(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink transition-colors focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-3 gap-3" dir="ltr">
              <label className="text-xs text-subtle">
                {t.pickupTime}
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2.5 text-sm text-ink transition-colors focus:border-primary"
                />
              </label>
              <label className="text-xs text-subtle">
                {t.duration}
                <select
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value as RateType)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2.5 text-sm text-ink transition-colors focus:border-primary"
                >
                  <option value="day">{t.day}</option>
                  <option value="week">{t.week}</option>
                  <option value="month">{t.month}</option>
                </select>
              </label>
              <label className="text-xs text-subtle">
                {t.quantity}
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2.5 text-sm text-ink transition-colors focus:border-primary"
                />
              </label>
            </div>
            {rateType === "day" && rates && <p className="text-xs text-subtle">{t.weekendNote(rates.weekendDay)}</p>}

            {accounts.length > 0 && (
              <label className="block text-xs text-subtle">
                {t.paymentAccount}
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-ink transition-colors focus:border-primary"
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
                <span className="text-subtle">{t.pickupDate}</span>
                <span className="text-ink">{collectionAt ? fmtDateTime(collectionAt, lang) : t.chooseDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-subtle">{t.expectedReturn}</span>
                <span className="text-ink">{liveReturn ? fmtDateTime(liveReturn.toISOString(), lang) : "—"}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-subtle">{t.total}</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={liveTotal}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.15 }}
                    className="font-semibold text-primary"
                  >
                    R{liveTotal.toLocaleString()}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>

            <motion.button
              whileHover={!(!selectedDate || hasConflict) ? { scale: 1.015 } : undefined}
              whileTap={!(!selectedDate || hasConflict) ? { scale: 0.98 } : undefined}
              onClick={async () => {
                setFormError(null);
                if (!selectedDate) {
                  setFormError(t.errNoDate);
                  return;
                }
                if (!renterName.trim() || !renterPhone.trim()) {
                  setFormError(t.errNoNamePhone);
                  return;
                }
                if (!selectedAccount) {
                  setFormError(t.errNoAccount);
                  return;
                }
                if (hasConflict) {
                  setFormError(t.errConflict);
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
              {submitting ? t.booking : t.confirmBooking}
            </motion.button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
