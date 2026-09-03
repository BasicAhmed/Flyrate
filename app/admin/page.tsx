"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth, firebaseEnabled } from "@/lib/firebase";
import {
  getRatesWithMargin,
  setPairMargin,
  computeRate,
  updateRatesFromLiveFx,
  type RateRow,
} from "@/lib/rates";
import { formatRate, formatSmart } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relativeTime";
import { getDailyTarget, setDailyTarget, setMarginPercent } from "@/lib/settings";
import { addSale, getRecentSales, type SaleEntry } from "@/lib/sales";
import { PAIRS, CURRENCIES } from "@/lib/corridors";

type Tab = "rates" | "profit";

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

  const [tab, setTab] = useState<Tab>("rates");

  // Rates tab state
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [margin, setMargin] = useState(3.5);
  const [marginInput, setMarginInput] = useState("3.5");
  const [savingMargin, setSavingMargin] = useState(false);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [marginInputs, setMarginInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fxUpdating, setFxUpdating] = useState(false);
  const [fxMessage, setFxMessage] = useState<string | null>(null);

  // Profit tab state
  const [profitLoaded, setProfitLoaded] = useState(false);
  const [saleDate, setSaleDate] = useState(todayStr());
  const [usdSold, setUsdSold] = useState("");
  const [savingSale, setSavingSale] = useState(false);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [dailyTarget, setDailyTargetState] = useState(2000);
  const [targetInput, setTargetInput] = useState("2000");
  const [savingTarget, setSavingTarget] = useState(false);

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

  // Load only the active tab's data — switching tabs loads on demand, not upfront.
  useEffect(() => {
    if (!user) return;
    if (tab === "rates" && !ratesLoaded) {
      getRatesWithMargin().then(({ rates, defaultMargin }) => {
        setRates(rates);
        setMargin(defaultMargin);
        setMarginInput(String(defaultMargin));
        setRatesLoaded(true);
      });
    }
    if (tab === "profit" && !profitLoaded) {
      Promise.all([getRecentSales(400), getDailyTarget()]).then(([salesData, target]) => {
        setSales(salesData);
        setDailyTargetState(target);
        setTargetInput(String(target));
        setProfitLoaded(true);
      });
    }
  }, [user, tab, ratesLoaded, profitLoaded]);

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

  const todaysSale = sales.find((s) => s.date === todayStr());
  const todaysUsd = todaysSale?.usdSold ?? 0;
  const targetProgress = dailyTarget > 0 ? Math.min(100, (todaysUsd / dailyTarget) * 100) : 0;

  const currentMonth = todayStr().slice(0, 7);
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
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .slice(0, 12);

  /** Applies a save result to local state directly — no refetch. */
  function patchRatePair(a: string, b: string, updates: Partial<RateRow>) {
    setRates((prev) =>
      prev.map((r) => {
        if ((r.from === a && r.to === b) || (r.from === b && r.to === a)) {
          const merged = { ...r, ...updates };
          return { ...merged, rate: computeRate(r.from, r.to, merged.marketPrice, merged.marginPercent) };
        }
        return r;
      })
    );
  }

  async function savePair(a: (typeof PAIRS)[number]["a"], b: (typeof PAIRS)[number]["b"]) {
    const key = `${a}_${b}`;
    const row = rates.find((r) => r.from === a && r.to === b);
    if (!row) return;

    // Market price is only ever set by the automated FX update now — this
    // button just saves the margin override for this pair.
    const marginRaw = marginInputs[key];
    const newMarginOverride = marginRaw === undefined || marginRaw.trim() === "" ? null : parseFloat(marginRaw);

    setSaving(key);
    setSaveError(null);
    try {
      await setPairMargin(a, b, newMarginOverride);
      const effectiveMargin = newMarginOverride ?? margin;
      patchRatePair(a, b, {
        marginPercent: effectiveMargin,
        marginOverride: newMarginOverride ?? undefined,
        updatedAt: new Date().toISOString(),
      });
      setMarginInputs((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
    setSaving(null);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">لوحة الإدارة</h1>
        <button onClick={() => signOut(auth!)} className="text-sm text-muted underline underline-offset-4">
          تسجيل الخروج
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-border bg-surface2 p-1">
        {(
          [
            ["rates", "الأسعار"],
            ["profit", "الأرباح"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-full py-2.5 text-sm font-semibold transition-colors ${
              tab === value ? "bg-primary text-bg" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "rates" && (
        <div className="mt-6">
          {!ratesLoaded ? (
            <p className="py-10 text-center text-sm text-subtle">جارٍ التحميل…</p>
          ) : (
            <>
              {/* Global margin + FX update, compact single row */}
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
                <span className="text-sm font-medium text-ink">الهامش العام</span>
                <div className="flex items-center gap-2" dir="ltr">
                  <input
                    type="number"
                    step="any"
                    value={marginInput}
                    onChange={(e) => setMarginInput(e.target.value)}
                    className="w-20 rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-sm text-ink"
                  />
                  <span className="text-sm text-muted">%</span>
                </div>
                <button
                  onClick={async () => {
                    setSavingMargin(true);
                    const val = parseFloat(marginInput);
                    await setMarginPercent(val);
                    setMargin(val);
                    setRates((prev) =>
                      prev.map((r) =>
                        r.marginOverride == null
                          ? { ...r, marginPercent: val, rate: computeRate(r.from, r.to, r.marketPrice, val) }
                          : r
                      )
                    );
                    setSavingMargin(false);
                  }}
                  className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-ink"
                >
                  {savingMargin ? "…" : "حفظ"}
                </button>

                <button
                  onClick={async () => {
                    setFxUpdating(true);
                    setFxMessage(null);
                    try {
                      const { updated, skipped } = await updateRatesFromLiveFx();
                      const stamp = new Date().toISOString();
                      for (const u of updated) {
                        patchRatePair(u.from, u.to, {
                          marketPrice: u.marketPrice,
                          sdgSource: u.sdgSource,
                          updatedAt: stamp,
                        });
                      }
                      setFxMessage(
                        skipped.length > 0
                          ? `✅ ${updated.length} تحديث — تعذر: ${skipped.join(", ")}`
                          : `✅ تم تحديث ${updated.length} زوج`
                      );
                    } catch (err) {
                      setFxMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
                    }
                    setFxUpdating(false);
                  }}
                  disabled={fxUpdating}
                  className="mr-auto rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-bg disabled:opacity-60"
                >
                  {fxUpdating ? "جارٍ التحديث…" : "🔄 تحديث الآن"}
                </button>
              </div>

              {fxMessage && <p className="mt-2 text-xs text-subtle">{fxMessage}</p>}
              {saveError && (
                <p className="mt-2 text-xs text-primary">
                  فشل الحفظ: {saveError} — تأكد من نشر قواعد Firestore.
                </p>
              )}

              {/* Rate rows — every row has the exact same structure and
                  weight: header (pair + source badge + updated time), then
                  price / margin / final rate as three equal boxes, then a
                  full-width save action. Nothing is demoted to fine print. */}
              <div className="mt-4 space-y-2">
                {PAIRS.map(({ a, b }) => {
                  const row = rates.find((r) => r.from === a && r.to === b);
                  if (!row) return null;
                  const fromC = CURRENCIES[a];
                  const toC = CURRENCIES[b];
                  const key = `${a}_${b}`;
                  const marginValue = marginInputs[key] ?? (row.marginOverride != null ? String(row.marginOverride) : "");
                  const isSdg = a === "SDG" || b === "SDG";

                  return (
                    <div key={key} className="rounded-xl border border-border bg-surface p-3.5">
                      <div className="flex items-center justify-between text-sm text-ink" dir="ltr">
                        <span className="font-medium">
                          {fromC.flag} {a} ⇄ {toC.flag} {b}
                        </span>
                        <span className="text-xs text-subtle">
                          {row.updatedAt ? formatRelativeTime(row.updatedAt) : "—"}
                        </span>
                      </div>

                      {/* Simple, plain lines — no boxes. Both directions
                          always shown, then the margin, then (for SDG pairs)
                          the raw USDT→SDG price the whole pair is derived
                          from. */}
                      <div className="mt-2.5 space-y-1 text-sm" dir="ltr">
                        <div className="flex items-center justify-between">
                          <span className="text-muted">{a} → {b}</span>
                          <span className="font-mono font-semibold text-primary">
                            {formatSmart(computeRate(a, b, row.marketPrice, row.marginPercent))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted">{b} → {a}</span>
                          <span className="font-mono font-semibold text-primary">
                            {formatSmart(computeRate(b, a, row.marketPrice, row.marginPercent))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted">هامش الربح</span>
                          <span className="font-mono font-semibold text-ink">{row.marginPercent}%</span>
                        </div>
                        {isSdg && row.sdgSource && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted">USDT → SDG</span>
                            <span className="font-mono font-semibold text-ink">
                              {row.sdgSource.usdtToSdg.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3" dir="ltr">
                        <label className="mb-1 block text-[10px] text-subtle">الهامش %</label>
                        <input
                          type="number"
                          step="any"
                          value={marginValue}
                          onChange={(e) => setMarginInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={String(margin)}
                          className="w-full rounded-lg border border-border bg-surface2 px-2.5 py-2 text-center font-mono text-sm text-ink"
                        />
                      </div>

                      <button
                        onClick={() => savePair(a, b)}
                        className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-semibold text-bg"
                      >
                        {saving === key ? "جارٍ الحفظ…" : "حفظ"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "profit" && (
        <div className="mt-6">
          {!profitLoaded ? (
            <p className="py-10 text-center text-sm text-subtle">جارٍ التحميل…</p>
          ) : (
            <>
              {/* Daily target */}
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between text-sm" dir="ltr">
                  <span className="font-mono font-semibold text-ink">
                    ${todaysUsd.toLocaleString()} / ${dailyTarget.toLocaleString()}
                  </span>
                  <span className="font-mono text-xs text-subtle">{targetProgress.toFixed(0)}%</span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface2">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${targetProgress}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2" dir="ltr">
                  <span className="text-sm text-muted">الهدف $</span>
                  <input
                    type="number"
                    step="any"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    className="w-24 rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-sm text-ink"
                  />
                  <button
                    onClick={async () => {
                      setSavingTarget(true);
                      const val = parseFloat(targetInput);
                      await setDailyTarget(val);
                      setDailyTargetState(val);
                      setSavingTarget(false);
                    }}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-ink"
                  >
                    {savingTarget ? "…" : "حفظ"}
                  </button>
                </div>
              </div>

              {/* This month's profit */}
              <div className="mt-4 rounded-xl border border-primary/40 bg-primary/10 p-4">
                <p className="text-xs text-subtle">أرباحك هذا الشهر</p>
                <p className="mt-1 font-mono text-2xl font-bold text-primary" dir="ltr">
                  ${thisMonthProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs text-muted" dir="ltr">
                  من ${thisMonthUsd.toLocaleString()} دولار مباع
                </p>
              </div>

              {/* Add a sale */}
              <div className="mt-4 grid grid-cols-[1fr_1fr_auto] items-end gap-2" dir="ltr">
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
                  مبلغ العملية ($)
                  <input
                    type="number"
                    step="any"
                    value={usdSold}
                    onChange={(e) => setUsdSold(e.target.value)}
                    placeholder="200"
                    className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm text-ink"
                  />
                </label>
                <button
                  onClick={async () => {
                    const val = parseFloat(usdSold);
                    if (!val) return;
                    setSavingSale(true);
                    await addSale(saleDate, val, margin);
                    const profitDelta = val * (margin / 100);
                    setSales((prev) => {
                      const existing = prev.find((s) => s.date === saleDate);
                      const updatedEntry: SaleEntry = existing
                        ? { ...existing, usdSold: existing.usdSold + val, profit: existing.profit + profitDelta }
                        : { date: saleDate, usdSold: val, profit: profitDelta, updatedAt: new Date().toISOString() };
                      const rest = prev.filter((s) => s.date !== saleDate);
                      return [updatedEntry, ...rest].sort((x, y) => (x.date < y.date ? 1 : -1));
                    });
                    setUsdSold("");
                    setSavingSale(false);
                  }}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg"
                >
                  {savingSale ? "…" : "إضافة"}
                </button>
              </div>

              {/* Monthly totals only — full daily log dropped as clutter */}
              {monthlyTotals.length > 0 && (
                <div className="mt-6 overflow-x-auto rounded-xl border border-border">
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
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
