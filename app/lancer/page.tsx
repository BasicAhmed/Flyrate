"use client";

import { useEffect, useState } from "react";
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
  completeBooking,
  getBookings,
  type CarBooking,
  type RateType,
} from "@/lib/carBookings";

const RATE_LABELS: Record<RateType, string> = { day: "يوم", week: "أسبوع", month: "شهر" };

function monthStr(iso: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 7);
}

function dateStr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

  const [bookings, setBookings] = useState<CarBooking[]>([]);
  const [renterName, setRenterName] = useState("");
  const [renterPhone, setRenterPhone] = useState("");
  const [rateType, setRateType] = useState<RateType>("day");
  const [quantity, setQuantity] = useState("1");
  const [creating, setCreating] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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

      {/* Current status */}
      <div
        className={`mt-6 rounded-2xl border p-5 ${
          activeBooking ? "border-primary/40 bg-primary/10" : "border-border bg-surface"
        }`}
      >
        {activeBooking ? (
          <>
            <p className="text-sm font-semibold text-primary">🚗 السيارة محجوزة حالياً</p>
            <p className="mt-1 text-sm text-ink" dir="ltr">
              {activeBooking.renterName} — {activeBooking.renterPhone}
            </p>
            <p className="mt-1 text-xs text-subtle">
              {activeBooking.quantity} {RATE_LABELS[activeBooking.rateType]} · منذ {dateStr(activeBooking.createdAt)}
            </p>
          </>
        ) : (
          <p className="text-sm font-semibold text-ink">✅ السيارة متاحة الآن</p>
        )}
      </div>

      {/* Rates */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">أسعار الإيجار</h2>
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

      {/* New booking */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">حجز جديد</h2>

        {formError && (
          <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
            {formError}
          </div>
        )}

        <div className="mt-4 space-y-3">
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

          <div className="flex items-center justify-between rounded-xl bg-surface2 p-4 font-mono text-sm" dir="ltr">
            <span className="text-subtle">الإجمالي</span>
            <span className="font-semibold text-primary">R{liveTotal.toLocaleString()}</span>
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
                  rateType,
                  quantity: parseFloat(quantity) || 1,
                  rate: rates[rateType],
                });
                setRenterName("");
                setRenterPhone("");
                setQuantity("1");
                setBookings(await getBookings());
              } catch (err) {
                setFormError(err instanceof Error ? err.message : String(err));
              }
              setCreating(false);
            }}
            className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-bg"
          >
            {creating ? "جارٍ الحفظ…" : "تأكيد الحجز (تم استلام الدفع)"}
          </button>
        </div>
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

      {/* Bookings list */}
      {bookings.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink">كل الحجوزات</h3>
          <div className="mt-2 space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-ink" dir="ltr">
                    {b.renterName} — {b.renterPhone}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      b.status === "active" ? "bg-primary/20 text-primary" : "bg-surface2 text-muted"
                    }`}
                  >
                    {b.status === "active" ? "نشط" : "منتهي"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-subtle" dir="ltr">
                  <span>
                    {b.quantity} {RATE_LABELS[b.rateType]} · R{b.total.toLocaleString()} · {dateStr(b.createdAt)}
                  </span>
                  {b.status === "active" && (
                    <button
                      onClick={async () => {
                        setCompletingId(b.id);
                        await completeBooking(b.id);
                        setBookings(await getBookings());
                        setCompletingId(null);
                      }}
                      className="rounded-full bg-primary/90 px-3 py-1.5 text-xs font-semibold text-bg"
                    >
                      {completingId === b.id ? "…" : "إنهاء (استلام السيارة)"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
