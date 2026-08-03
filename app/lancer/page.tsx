"use client";

import { useEffect, useState, Fragment } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth, firebaseEnabled } from "@/lib/firebase";
import { getCarRates, setCarRates, type CarRates } from "@/lib/settings";
import {
  createBooking,
  markKeysHandedOver,
  completeBooking,
  computeReturnDate,
  getBookings,
  type CarBooking,
  type RateType,
} from "@/lib/carBookings";

const RATE_LABELS: Record<RateType, string> = { day: "يوم", week: "أسبوع", month: "شهر" };
const STATUS_LABELS: Record<CarBooking["status"], string> = {
  waiting: "بانتظار التسليم",
  active: "قيد التنفيذ",
  completed: "مكتمل",
};

function monthStr(iso: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 7);
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nowLocalInput() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function LancerPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [rates, setRates] = useState<CarRates>({ day: 400, week: 2500, month: 9000 });
  const [rateInputs, setRateInputs] = useState({ day: "400", week: "2500", month: "9000" });
  const [savingRates, setSavingRates] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);

  const [bookings, setBookings] = useState<CarBooking[]>([]);
  const [renterName, setRenterName] = useState("");
  const [renterPhone, setRenterPhone] = useState("");
  const [bankUsed, setBankUsed] = useState("");
  const [collectionAt, setCollectionAt] = useState(nowLocalInput());
  const [rateType, setRateType] = useState<RateType>("day");
  const [quantity, setQuantity] = useState("1");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      setChecking(false);
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    getCarRates().then((r) => {
      setRates(r);
      setRateInputs({ day: String(r.day), week: String(r.week), month: String(r.month) });
    });
    getBookings().then(setBookings);
  }, [user]);

  if (!firebaseEnabled) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center text-ink">
        <h1 className="font-display text-xl font-semibold">Firebase غير مُفعّل</h1>
        <p className="mt-3 text-sm text-muted">
          أضف مفاتيح مشروع Firebase إلى متغيرات البيئة في Vercel لتفعيل لوحة الحجوزات.
        </p>
      </div>
    );
  }

  if (checking) return null;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <h1 className="font-display text-xl font-semibold text-ink">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-muted">حجوزات لانسر — نفس بيانات دخول لوحة FlyRate.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await signInWithEmailAndPassword(auth!, email, password);
            } catch {
              setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
            }
          }}
          className="mt-6 space-y-3"
        >
          <input
            type="email"
            required
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-3 text-sm text-ink"
          />
          <input
            type="password"
            required
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-3 text-sm text-ink"
          />
          {error && <p className="text-sm text-primary">{error}</p>}
          <button className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-bg">
            تسجيل الدخول
          </button>
        </form>
      </div>
    );
  }

  const activeBooking = bookings.find((b) => b.status === "active");
  const nextWaiting = bookings
    .filter((b) => b.status === "waiting")
    .sort((a, b) => a.collectionAt.localeCompare(b.collectionAt))[0];

  const liveReturnPreview = collectionAt
    ? computeReturnDate(new Date(collectionAt), rateType, parseFloat(quantity) || 1)
    : null;
  const liveTotal = (rates[rateType] ?? 0) * (parseFloat(quantity) || 0);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = shiftMonth(thisMonth, -1);
  const monthTotal = (ym: string) =>
    bookings.filter((b) => monthStr(b.createdAt) === ym).reduce((sum, b) => sum + b.total, 0);

  const monthlyMap = new Map<string, number>();
  for (const b of bookings) {
    const m = monthStr(b.createdAt);
    monthlyMap.set(m, (monthlyMap.get(m) ?? 0) + b.total);
  }
  const monthlyTotals = Array.from(monthlyMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">حجوزات لانسر</h1>
        <button
          onClick={() => signOut(auth!)}
          className="text-sm text-muted underline underline-offset-4"
        >
          تسجيل الخروج
        </button>
      </div>

      {/* Shareable status card */}
      <div
        className={`mt-6 overflow-hidden rounded-3xl border p-8 text-center ${
          activeBooking
            ? "border-primary/50 bg-gradient-to-b from-primary/15 to-surface"
            : nextWaiting
            ? "border-border bg-gradient-to-b from-surface2 to-surface"
            : "border-primary/30 bg-gradient-to-b from-primary/10 to-surface"
        }`}
      >
        <div className="text-5xl">{activeBooking ? "🚘" : "✅"}</div>
        <p className="mt-3 font-display text-2xl font-bold text-ink">
          {activeBooking ? "السيارة محجوزة حالياً" : "السيارة متاحة الآن"}
        </p>

        {activeBooking && (
          <div className="mt-3 space-y-1 text-sm text-muted" dir="ltr">
            <p className="text-ink">{activeBooking.renterName}</p>
            <p>يُتوقع الإرجاع: {fmtDateTime(activeBooking.returnAt)}</p>
          </div>
        )}

        {!activeBooking && nextWaiting && (
          <div className="mt-3 space-y-1 text-sm text-muted" dir="ltr">
            <p>حجز قادم: {nextWaiting.renterName}</p>
            <p>وقت الاستلام: {fmtDateTime(nextWaiting.collectionAt)}</p>
          </div>
        )}

        <p className="mt-5 font-display text-xs font-semibold tracking-wide text-primary">
          FlyRate · Lancer
        </p>
      </div>

      {/* New booking */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">حجز جديد</h2>

        {formError && (
          <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
            {formError}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="اسم المستأجر"
              value={renterName}
              onChange={(e) => setRenterName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink"
            />
            <input
              placeholder="رقم الهاتف"
              value={renterPhone}
              onChange={(e) => setRenterPhone(e.target.value)}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink"
            />
          </div>

          <input
            placeholder="البنك المستخدم"
            value={bankUsed}
            onChange={(e) => setBankUsed(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface2 px-3.5 py-3 text-sm text-ink"
          />

          <label className="block text-xs text-subtle">
            وقت الحجز (الاستلام)
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

          <div className="space-y-2 rounded-xl bg-surface2 p-4 font-mono text-sm" dir="ltr">
            <div className="flex items-center justify-between">
              <span className="text-subtle">تاريخ الإرجاع المتوقع</span>
              <span className="text-ink">{liveReturnPreview ? fmtDateTime(liveReturnPreview.toISOString()) : "—"}</span>
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
                setFormError("أدخل اسم المستأجر ورقم الهاتف.");
                return;
              }
              setCreating(true);
              try {
                await createBooking({
                  renterName: renterName.trim(),
                  renterPhone: renterPhone.trim(),
                  bankUsed: bankUsed.trim(),
                  rateType,
                  quantity: parseFloat(quantity) || 1,
                  rate: rates[rateType],
                  collectionAt: new Date(collectionAt).toISOString(),
                });
                setRenterName("");
                setRenterPhone("");
                setBankUsed("");
                setQuantity("1");
                setCollectionAt(nowLocalInput());
                setBookings(await getBookings());
              } catch (err) {
                setFormError(err instanceof Error ? err.message : String(err));
              }
              setCreating(false);
            }}
            className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-bg"
          >
            {creating ? "جارٍ الحفظ…" : "تأكيد الحجز"}
          </button>
        </div>
      </div>

      {/* This month / last month */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-subtle">هذا الشهر</p>
          <p className="mt-1 font-mono text-xl font-bold text-primary" dir="ltr">
            R{monthTotal(thisMonth).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-subtle">الشهر الماضي</p>
          <p className="mt-1 font-mono text-xl font-bold text-ink" dir="ltr">
            R{monthTotal(lastMonth).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Rates (collapsed by default, tucked away) */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <button
          onClick={() => setRatesOpen((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-semibold text-ink"
        >
          أسعار الإيجار
          <span className="text-xs text-subtle">{ratesOpen ? "إخفاء" : "تعديل"}</span>
        </button>
        {ratesOpen && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3" dir="ltr">
              {(["day", "week", "month"] as RateType[]).map((rt) => (
                <label key={rt} className="text-xs text-subtle">
                  {RATE_LABELS[rt]} (R)
                  <input
                    type="number"
                    step="any"
                    value={rateInputs[rt]}
                    onChange={(e) => setRateInputs((prev) => ({ ...prev, [rt]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm text-ink"
                  />
                </label>
              ))}
            </div>
            <button
              onClick={async () => {
                setSavingRates(true);
                const next: CarRates = {
                  day: parseFloat(rateInputs.day) || 0,
                  week: parseFloat(rateInputs.week) || 0,
                  month: parseFloat(rateInputs.month) || 0,
                };
                await setCarRates(next);
                setRates(next);
                setSavingRates(false);
              }}
              className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg"
            >
              {savingRates ? "جارٍ الحفظ…" : "حفظ الأسعار"}
            </button>
          </>
        )}
      </div>

      {/* Monthly history */}
      {monthlyTotals.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink">سجل شهري</h3>
          <div className="mt-2 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[300px] border-collapse text-left font-mono text-sm" dir="ltr">
              <thead>
                <tr className="border-b border-border bg-surface2 text-xs text-subtle">
                  <th className="px-4 py-2.5 font-medium">Month</th>
                  <th className="px-4 py-2.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTotals.map((m) => (
                  <tr key={m.month} className="border-b border-border/50">
                    <td className="px-4 py-2.5 text-ink">{m.month}</td>
                    <td className="px-4 py-2.5 font-semibold text-primary">
                      R{m.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bookings table */}
      {bookings.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink">الحجوزات السابقة</h3>
          <p className="mt-1 text-xs text-subtle">اضغط على أي حجز لعرض التفاصيل الكاملة.</p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-border bg-surface2 text-xs text-subtle">
                  <th className="px-4 py-2.5 font-medium">الاسم</th>
                  <th className="px-4 py-2.5 font-medium">الرقم</th>
                  <th className="px-4 py-2.5 font-medium">المبلغ</th>
                  <th className="px-4 py-2.5 font-medium">الاستلام</th>
                  <th className="px-4 py-2.5 font-medium">الإرجاع</th>
                  <th className="px-4 py-2.5 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const isOpen = openId === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr
                        onClick={() => setOpenId(isOpen ? null : b.id)}
                        className="cursor-pointer border-b border-border/50 hover:bg-surface2"
                      >
                        <td className="px-4 py-2.5 text-ink">{b.renterName}</td>
                        <td className="px-4 py-2.5 text-muted" dir="ltr">{b.renterPhone}</td>
                        <td className="px-4 py-2.5 font-mono text-primary" dir="ltr">R{b.total.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-subtle text-xs" dir="ltr">{fmtDateTime(b.collectionAt)}</td>
                        <td className="px-4 py-2.5 text-subtle text-xs" dir="ltr">{fmtDateTime(b.returnAt)}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              b.status === "active"
                                ? "bg-primary/20 text-primary"
                                : b.status === "waiting"
                                ? "bg-surface2 text-muted border border-border"
                                : "bg-surface2 text-subtle"
                            }`}
                          >
                            {STATUS_LABELS[b.status]}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border/50 bg-surface2">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
                              <div>
                                <span className="text-subtle">البنك المستخدم: </span>
                                <span className="text-ink">{b.bankUsed || "—"}</span>
                              </div>
                              <div dir="ltr">
                                <span className="text-subtle">المدة: </span>
                                <span className="text-ink">{b.quantity} {RATE_LABELS[b.rateType]}</span>
                              </div>
                              <div dir="ltr">
                                <span className="text-subtle">السعر: </span>
                                <span className="text-ink">R{b.rate.toLocaleString()}</span>
                              </div>
                              <div dir="ltr">
                                <span className="text-subtle">تاريخ الحجز: </span>
                                <span className="text-ink">{fmtDateTime(b.createdAt)}</span>
                              </div>
                              {b.completedAt && (
                                <div dir="ltr">
                                  <span className="text-subtle">تاريخ الإرجاع الفعلي: </span>
                                  <span className="text-ink">{fmtDateTime(b.completedAt)}</span>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 flex gap-2">
                              {b.status === "waiting" && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setBusyId(b.id);
                                    await markKeysHandedOver(b.id);
                                    setBookings(await getBookings());
                                    setBusyId(null);
                                  }}
                                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg"
                                >
                                  {busyId === b.id ? "…" : "تسليم المفاتيح"}
                                </button>
                              )}
                              {b.status === "active" && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setBusyId(b.id);
                                    await completeBooking(b.id);
                                    setBookings(await getBookings());
                                    setBusyId(null);
                                  }}
                                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg"
                                >
                                  {busyId === b.id ? "…" : "استلام السيارة"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
