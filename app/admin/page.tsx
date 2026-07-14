"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth, firebaseEnabled } from "@/lib/firebase";
import { getRates, setMarketPrice, computeRate, type RateRow } from "@/lib/rates";
import { formatRate } from "@/lib/format";
import { getMarginPercent, setMarginPercent } from "@/lib/settings";
import { addSale, getRecentSales, type SaleEntry } from "@/lib/sales";
import { CORRIDORS, CURRENCIES } from "@/lib/corridors";

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [margin, setMargin] = useState(3.5);
  const [marginInput, setMarginInput] = useState("3.5");
  const [savingMargin, setSavingMargin] = useState(false);

  const [rates, setRates] = useState<RateRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [saleDate, setSaleDate] = useState(todayStr());
  const [usdSold, setUsdSold] = useState("");
  const [savingSale, setSavingSale] = useState(false);
  const [sales, setSales] = useState<SaleEntry[]>([]);

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
    getRates().then(setRates);
    getMarginPercent().then((m) => {
      setMargin(m);
      setMarginInput(String(m));
    });
    getRecentSales(400).then(setSales);
  }, [user]);

  if (!firebaseEnabled) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center text-ink">
        <h1 className="font-display text-xl font-semibold">Firebase غير مُفعّل</h1>
        <p className="mt-3 text-sm text-muted">
          أضف مفاتيح مشروع Firebase إلى متغيرات البيئة في Vercel (راجع{" "}
          <code>.env.example</code>) لتفعيل لوحة الإدارة.
        </p>
      </div>
    );
  }

  if (checking) return null;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <h1 className="font-display text-xl font-semibold text-ink">تسجيل الدخول للإدارة</h1>
        <p className="mt-1 text-sm text-muted">إدارة أسعار الصرف والأرباح لـ FlyRate.</p>
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

  const totalProfitShown = sales.reduce((sum, s) => sum + s.profit, 0);
  const totalUsdShown = sales.reduce((sum, s) => sum + s.usdSold, 0);

  const currentMonth = todayStr().slice(0, 7); // YYYY-MM
  const thisMonthSales = sales.filter((s) => s.date.startsWith(currentMonth));
  const thisMonthProfit = thisMonthSales.reduce((sum, s) => sum + s.profit, 0);
  const thisMonthUsd = thisMonthSales.reduce((sum, s) => sum + s.usdSold, 0);

  const monthlyMap = new Map<string, { usdSold: number; profit: number }>();
  for (const s of sales) {
    const month = s.date.slice(0, 7);
    const existing = monthlyMap.get(month) ?? { usdSold: 0, profit: 0 };
    monthlyMap.set(month, {
      usdSold: existing.usdSold + s.usdSold,
      profit: existing.profit + s.profit,
    });
  }
  const monthlyTotals = Array.from(monthlyMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">لوحة الإدارة</h1>
        <button
          onClick={() => signOut(auth!)}
          className="text-sm text-muted underline underline-offset-4"
        >
          تسجيل الخروج
        </button>
      </div>

      {/* Global margin */}
      <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">هامش الربح العام</h2>
        <p className="mt-1 text-xs text-subtle">
          يُطبّق تلقائياً على كل سعر السوق لحساب السعر النهائي، وعلى حساب الأرباح اليومية.
        </p>
        <div className="mt-4 flex items-center gap-3" dir="ltr">
          <input
            type="number"
            step="any"
            value={marginInput}
            onChange={(e) => setMarginInput(e.target.value)}
            className="w-28 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-ink"
          />
          <span className="text-sm text-muted">%</span>
          <button
            onClick={async () => {
              setSavingMargin(true);
              const val = parseFloat(marginInput);
              await setMarginPercent(val);
              setMargin(val);
              const fresh = await getRates();
              setRates(fresh);
              setSavingMargin(false);
            }}
            className="mr-auto rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg"
          >
            {savingMargin ? "جارٍ الحفظ…" : "حفظ الهامش"}
          </button>
        </div>
      </div>

      {/* Rates */}
      <div className="mt-6">
        <h2 className="font-display text-base font-semibold text-ink">أسعار السوق</h2>
        <p className="mt-1 text-xs text-subtle">
          أدخل سعر السوق فقط — السعر النهائي المعروض للعملاء يُحسب تلقائياً بإضافة الهامش.
        </p>

        {saveError && (
          <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
            فشل الحفظ: {saveError}
            <br />
            تأكد من نشر قواعد Firestore (Rules → Publish) في لوحة Firebase.
          </div>
        )}

        <div className="mt-4 space-y-3">
          {CORRIDORS.map(({ from, to }) => {
            const row = rates.find((r) => r.from === from && r.to === to) ?? {
              from,
              to,
              marketPrice: 0,
              rate: 0,
              updatedAt: null,
            };
            const fromC = CURRENCIES[from];
            const toC = CURRENCIES[to];
            const key = `${from}_${to}`;
            const usesMultiply = key === "SAR_ZAR" || key === "QAR_ZAR";

            return (
              <div
                key={key}
                className="rounded-xl border border-border bg-surface p-4"
                dir="ltr"
              >
                <div className="flex items-center justify-between text-sm text-ink">
                  <span>
                    {fromC.flag} {from} → {toC.flag} {to}
                  </span>
                  <span className="text-xs text-subtle">
                    ({usesMultiply ? "× ضرب" : "÷ قسمة"})
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                  <label className="text-xs text-subtle">
                    سعر السوق
                    <input
                      type="number"
                      step="any"
                      defaultValue={row.marketPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setRates((prev) => {
                          const others = prev.filter((r) => !(r.from === from && r.to === to));
                          return [
                            ...others,
                            { from, to, marketPrice: val, rate: computeRate(from, to, val, margin), updatedAt: row.updatedAt },
                          ];
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm text-ink"
                    />
                  </label>
                  <div className="text-xs text-subtle">
                    السعر النهائي
                    <div className="mt-1 rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm font-semibold text-primary">
                      {formatRate(computeRate(from, to, row.marketPrice, margin))}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setSaving(key);
                      setSaveError(null);
                      try {
                        await setMarketPrice(from, to, row.marketPrice);
                      } catch (err) {
                        setSaveError(err instanceof Error ? err.message : String(err));
                      }
                      setSaving(null);
                    }}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg"
                  >
                    {saving === key ? "جارٍ الحفظ…" : "حفظ"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily profit tracker */}
      <div className="mt-10 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">الأرباح اليومية</h2>
        <p className="mt-1 text-xs text-subtle">
          أدخل إجمالي الدولار المباع في اليوم، ويُحسب الربح تلقائياً حسب الهامش الحالي ({margin}%).
        </p>

        <div className="mt-5 rounded-xl border border-primary/40 bg-primary/10 p-4">
          <p className="text-xs text-subtle">أرباحك حتى الآن هذا الشهر</p>
          <p className="mt-1 font-mono text-2xl font-bold text-primary" dir="ltr">
            ${thisMonthProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-muted" dir="ltr">
            من ${thisMonthUsd.toLocaleString()} دولار مباع
          </p>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr_auto] items-end gap-3" dir="ltr">
          <label className="text-xs text-subtle">
            التاريخ
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-xs text-subtle">
            الدولار المباع اليوم ($)
            <input
              type="number"
              step="any"
              value={usdSold}
              onChange={(e) => setUsdSold(e.target.value)}
              placeholder="1000"
              className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm text-ink"
            />
          </label>
          <button
            onClick={async () => {
              const val = parseFloat(usdSold);
              if (!val) return;
              setSavingSale(true);
              await addSale(saleDate, val, margin);
              const fresh = await getRecentSales(400);
              setSales(fresh);
              setUsdSold("");
              setSavingSale(false);
            }}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg"
          >
            {savingSale ? "جارٍ الحفظ…" : "إضافة"}
          </button>
        </div>

        {monthlyTotals.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink">سجل الأرباح الشهرية</h3>
            <div className="mt-2 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[380px] border-collapse text-left font-mono text-sm" dir="ltr">
                <thead>
                  <tr className="border-b border-border bg-surface2 text-xs text-subtle">
                    <th className="px-4 py-2.5 font-medium">Month</th>
                    <th className="px-4 py-2.5 font-medium">USD Sold</th>
                    <th className="px-4 py-2.5 font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyTotals.map((m) => (
                    <tr key={m.month} className="border-b border-border/50">
                      <td className="px-4 py-2.5 text-ink">{m.month}</td>
                      <td className="px-4 py-2.5 text-muted">${m.usdSold.toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-semibold text-primary">
                        ${m.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sales.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-ink">سجل يومي (تفصيلي)</h3>
            <div className="mt-2 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[420px] border-collapse text-right font-mono text-sm" dir="ltr">
              <thead>
                <tr className="border-b border-border bg-surface2 text-xs text-subtle">
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium">USD Sold</th>
                  <th className="px-4 py-2.5 text-left font-medium">Margin</th>
                  <th className="px-4 py-2.5 text-left font-medium">Profit</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.date} className="border-b border-border/50">
                    <td className="px-4 py-2.5 text-left text-ink">{s.date}</td>
                    <td className="px-4 py-2.5 text-left text-muted">${s.usdSold.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-left text-subtle">{s.marginPercent}%</td>
                    <td className="px-4 py-2.5 text-left font-semibold text-primary">
                      ${s.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface2">
                  <td className="px-4 py-2.5 text-left font-semibold text-ink">Total</td>
                  <td className="px-4 py-2.5 text-left font-semibold text-ink">
                    ${totalUsdShown.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-left font-semibold text-primary">
                    ${totalProfitShown.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
