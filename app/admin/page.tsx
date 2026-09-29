"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { LogOut, RefreshCw, Percent, Coins, Target, TrendingUp, Wallet, Plus, CalendarDays } from "lucide-react";
import { auth, firebaseEnabled } from "@/lib/firebase";
import {
  getRatesWithMargin,
  setPairMargin,
  setSdgUsdtOverride,
  computeRate,
  updateRatesFromLiveFx,
  convertMid,
  averageMarginFor,
  type RateRow,
} from "@/lib/rates";
import { formatSmart } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relativeTime";
import { getDailyTarget, setDailyTarget, setMarginPercent } from "@/lib/settings";
import { addSale, getRecentSales, type SaleEntry, type CurrencyTotals } from "@/lib/sales";
import { getDisabledFlows, setDisabledFlows, flowKey } from "@/lib/flows";
import { PAIRS, CURRENCIES, FROM_CURRENCIES, validToCurrencies, type CurrencyCode } from "@/lib/corridors";

type Tab = "rates" | "profit";

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/* ---------- small building blocks ---------- */

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      dir="ltr"
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-emerald-500" : "bg-border"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  accent = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`card p-4 ${accent ? "border-primary/40 bg-gradient-to-b from-primary/10 to-surface" : ""}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-subtle">
        <span className={`flex size-7 items-center justify-center rounded-lg ${accent ? "bg-primary/15 text-primary" : "bg-surface2 text-muted"}`}>
          {icon}
        </span>
        {label}
      </div>
      <div className={`mt-3 font-mono text-2xl font-bold ${accent ? "text-primary" : "text-ink"}`} dir="ltr">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      {children}
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-end justify-between">
      <h2 className="font-display text-base font-semibold text-ink">{children}</h2>
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </div>
  );
}

/* ---------- page ---------- */

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [tab, setTab] = useState<Tab>("rates");

  // Shared: rates are needed by both tabs (profit uses them for USD conversion)
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [margin, setMargin] = useState(3.5);

  // Rates tab
  const [flowsLoaded, setFlowsLoaded] = useState(false);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [marginInput, setMarginInput] = useState("3.5");
  const [savingMargin, setSavingMargin] = useState(false);
  const [marginInputs, setMarginInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fxUpdating, setFxUpdating] = useState(false);
  const [fxMessage, setFxMessage] = useState<string | null>(null);
  const [sdgOverrideInput, setSdgOverrideInput] = useState("");
  const [savingSdgOverride, setSavingSdgOverride] = useState(false);

  // Profit tab
  const [profitLoaded, setProfitLoaded] = useState(false);
  const [saleDate, setSaleDate] = useState(todayStr());
  const [saleCurrency, setSaleCurrency] = useState<CurrencyCode>("MYR");
  const [saleCounter, setSaleCounter] = useState<CurrencyCode | "AVG">("AVG");
  const [saleAmount, setSaleAmount] = useState("");
  const [savingSale, setSavingSale] = useState(false);
  const [saleFlash, setSaleFlash] = useState<string | null>(null);
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [dailyTarget, setDailyTargetState] = useState(2000);
  const [targetInput, setTargetInput] = useState("2000");
  const [editingTarget, setEditingTarget] = useState(false);

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

  // Load on demand per tab — never refetch what's already in memory.
  useEffect(() => {
    if (!user) return;
    if (!ratesLoaded) {
      getRatesWithMargin().then(({ rates, defaultMargin }) => {
        setRates(rates);
        setMargin(defaultMargin);
        setMarginInput(String(defaultMargin));
        setRatesLoaded(true);
      });
    }
    if (tab === "rates" && !flowsLoaded) {
      getDisabledFlows().then((d) => {
        setDisabled(d);
        setFlowsLoaded(true);
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
  }, [user, tab, ratesLoaded, flowsLoaded, profitLoaded]);

  /* ---------- derived: profit ---------- */
  const saleAmountNum = parseFloat(saleAmount.replace(/,/g, "")) || 0;
  const saleUsd = ratesLoaded && saleAmountNum > 0 ? convertMid(saleAmountNum, saleCurrency, "USDT", rates) : null;
  const saleMargin = useMemo(() => {
    if (!ratesLoaded) return null;
    if (saleCounter === "AVG") return averageMarginFor(saleCurrency, rates);
    return rates.find((r) => r.from === saleCurrency && r.to === saleCounter)?.marginPercent ?? null;
  }, [ratesLoaded, rates, saleCurrency, saleCounter]);
  const saleProfit = saleUsd !== null && saleMargin !== null ? saleUsd * (saleMargin / 100) : null;

  const today = todayStr();
  const todaysSale = sales.find((s) => s.date === today);
  const todaysUsd = todaysSale?.usdSold ?? 0;
  const todaysProfit = todaysSale?.profit ?? 0;
  const targetProgress = dailyTarget > 0 ? Math.min(100, (todaysUsd / dailyTarget) * 100) : 0;

  const currentMonth = today.slice(0, 7);
  const thisMonthSales = sales.filter((s) => s.date.startsWith(currentMonth));
  const thisMonthProfit = thisMonthSales.reduce((sum, s) => sum + s.profit, 0);
  const thisMonthUsd = thisMonthSales.reduce((sum, s) => sum + s.usdSold, 0);

  const monthByCurrency = useMemo(() => {
    const m = new Map<CurrencyCode, CurrencyTotals>();
    for (const s of thisMonthSales) {
      for (const [code, t] of Object.entries(s.byCurrency) as [CurrencyCode, CurrencyTotals][]) {
        const e = m.get(code) ?? { amount: 0, usd: 0, profit: 0 };
        m.set(code, { amount: e.amount + t.amount, usd: e.usd + t.usd, profit: e.profit + t.profit });
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1].usd - a[1].usd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, currentMonth]);

  const todayByCurrency = todaysSale
    ? (Object.entries(todaysSale.byCurrency) as [CurrencyCode, CurrencyTotals][]).sort((a, b) => b[1].usd - a[1].usd)
    : [];

  const monthlyTotals = useMemo(() => {
    const monthlyMap = new Map<string, { usdSold: number; profit: number }>();
    for (const s of sales) {
      const month = s.date.slice(0, 7);
      const existing = monthlyMap.get(month) ?? { usdSold: 0, profit: 0 };
      monthlyMap.set(month, { usdSold: existing.usdSold + s.usdSold, profit: existing.profit + s.profit });
    }
    return Array.from(monthlyMap.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .slice(0, 12);
  }, [sales]);

  /* ---------- gates ---------- */
  if (!firebaseEnabled) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center text-ink">
        <h1 className="font-display text-xl font-semibold">Firebase غير مُفعّل</h1>
        <p className="mt-3 text-sm text-muted">
          أضف مفاتيح مشروع Firebase إلى متغيرات البيئة في Vercel (راجع <code>.env.example</code>) لتفعيل لوحة الإدارة.
        </p>
      </div>
    );
  }

  if (checking) return null;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-grid-fade px-5">
        <div className="card-raised w-full max-w-sm p-7">
          <div className="flex flex-col items-center text-center">
            <Image src="/logo-icon.png" alt="FlyRate" width={52} height={44} className="h-11 w-auto" priority />
            <h1 className="mt-4 font-display text-xl font-semibold text-ink">لوحة الإدارة</h1>
            <p className="mt-1 text-sm text-muted">سجّل دخولك لإدارة الأسعار والأرباح.</p>
          </div>
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
            <input type="email" required placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className="field py-3" />
            <input type="password" required placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" className="field py-3" />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button className="btn-primary w-full py-3">تسجيل الدخول</button>
          </form>
        </div>
      </div>
    );
  }

  /* ---------- actions ---------- */
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

  async function savePair(a: CurrencyCode, b: CurrencyCode) {
    const key = `${a}_${b}`;
    const marginRaw = marginInputs[key];
    if (marginRaw === undefined) return;
    const newMarginOverride = marginRaw.trim() === "" ? null : parseFloat(marginRaw);
    setSaving(key);
    setSaveError(null);
    try {
      await setPairMargin(a, b, newMarginOverride);
      patchRatePair(a, b, {
        marginPercent: newMarginOverride ?? margin,
        marginOverride: newMarginOverride ?? undefined,
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

  async function toggleFlow(from: CurrencyCode, to: CurrencyCode, active: boolean) {
    const k = flowKey(from, to);
    const prev = disabled;
    const next = active ? prev.filter((x) => x !== k) : Array.from(new Set([...prev, k]));
    setDisabled(next); // optimistic
    try {
      await setDisabledFlows(next);
    } catch (err) {
      setDisabled(prev);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveGlobalMargin() {
    const val = parseFloat(marginInput);
    if (Number.isNaN(val)) return;
    setSavingMargin(true);
    try {
      await setMarginPercent(val);
      setMargin(val);
      setRates((prev) =>
        prev.map((r) =>
          r.marginOverride == null ? { ...r, marginPercent: val, rate: computeRate(r.from, r.to, r.marketPrice, val) } : r
        )
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
    setSavingMargin(false);
  }

  async function updateNow() {
    setFxUpdating(true);
    setFxMessage(null);
    try {
      const { updated, skipped } = await updateRatesFromLiveFx();
      const stamp = new Date().toISOString();
      for (const u of updated) {
        patchRatePair(u.from, u.to, { marketPrice: u.marketPrice, sdgSource: u.sdgSource, updatedAt: stamp });
      }
      setFxMessage(skipped.length > 0 ? `تم تحديث ${updated.length} — تعذر: ${skipped.join(", ")}` : `تم تحديث ${updated.length} زوج`);
    } catch (err) {
      setFxMessage(`تعذر التحديث: ${err instanceof Error ? err.message : String(err)}`);
    }
    setFxUpdating(false);
  }

  async function saveSdgOverride(currentSdgUsdt: number) {
    const val = parseFloat(sdgOverrideInput);
    if (!val) return;
    setSavingSdgOverride(true);
    setSaveError(null);
    try {
      await setSdgUsdtOverride(val);
      setRates((prev) =>
        prev.map((r) => {
          if ((r.from !== "SDG" && r.to !== "SDG") || !r.sdgSource) return r;
          const newMarketPrice = r.marketPrice * (val / (r.sdgSource.usdtToSdg || currentSdgUsdt));
          return {
            ...r,
            marketPrice: newMarketPrice,
            rate: computeRate(r.from, r.to, newMarketPrice, r.marginPercent),
            sdgSource: { usdtToSdg: val, prices: [] },
            updatedAt: new Date().toISOString(),
          };
        })
      );
      setSdgOverrideInput("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
    setSavingSdgOverride(false);
  }

  async function recordSale() {
    if (saleUsd === null || saleMargin === null || saleAmountNum <= 0) return;
    setSavingSale(true);
    setSaveError(null);
    try {
      const { usd: u, profit } = await addSale({
        date: saleDate,
        currency: saleCurrency,
        amount: saleAmountNum,
        usdValue: saleUsd,
        marginPercent: saleMargin,
      });
      setSales((prev) => {
        const existing = prev.find((s) => s.date === saleDate);
        const prevCur = existing?.byCurrency[saleCurrency] ?? { amount: 0, usd: 0, profit: 0 };
        const entry: SaleEntry = {
          date: saleDate,
          usdSold: (existing?.usdSold ?? 0) + u,
          profit: (existing?.profit ?? 0) + profit,
          byCurrency: {
            ...(existing?.byCurrency ?? {}),
            [saleCurrency]: { amount: prevCur.amount + saleAmountNum, usd: prevCur.usd + u, profit: prevCur.profit + profit },
          },
          updatedAt: new Date().toISOString(),
        };
        return [entry, ...prev.filter((s) => s.date !== saleDate)].sort((x, y) => (x.date < y.date ? 1 : -1));
      });
      setSaleFlash(`+ ${num(saleAmountNum)} ${saleCurrency} ← ${usd(u)} · ربح ${usd(profit)}`);
      setTimeout(() => setSaleFlash(null), 3500);
      setSaleAmount("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
    setSavingSale(false);
  }

  const currentSdgUsdt = rates.find((r) => (r.from === "SDG" || r.to === "SDG") && r.sdgSource)?.sdgSource?.usdtToSdg;
  const lastUpdate = rates.reduce<string | null>((acc, r) => (r.updatedAt && (!acc || r.updatedAt > acc) ? r.updatedAt : acc), null);
  const pausedCount = disabled.length;

  /* ---------- render ---------- */
  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-icon.png" alt="FlyRate" width={30} height={25} className="h-6 w-auto" />
            <span className="font-display text-sm font-semibold text-ink">لوحة الإدارة</span>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface2 p-1">
            {(
              [
                ["rates", "الأسعار"],
                ["profit", "الأرباح"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all sm:px-6 ${
                  tab === value ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => signOut(auth!)} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink" title="تسجيل الخروج">
            <LogOut size={15} />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
        {saveError && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-500">
            فشل الحفظ: {saveError} — تأكد من نشر قواعد Firestore.
          </div>
        )}

        {/* ================= RATES ================= */}
        {tab === "rates" &&
          (!ratesLoaded || !flowsLoaded ? (
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card h-28 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="card p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-subtle">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-surface2 text-muted"><Percent size={14} /></span>
                    الهامش العام
                  </div>
                  <div className="mt-3 flex items-center gap-2" dir="ltr">
                    <input type="number" step="any" value={marginInput} onChange={(e) => setMarginInput(e.target.value)} className="field w-24 text-center font-mono" />
                    <span className="text-sm text-muted">%</span>
                    <button onClick={saveGlobalMargin} disabled={savingMargin || parseFloat(marginInput) === margin} className="btn-ghost ml-auto px-3 py-2 text-xs">
                      {savingMargin ? "…" : "حفظ"}
                    </button>
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-subtle">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-surface2 text-muted"><Coins size={14} /></span>
                    سعر USDT/SDG المستخدم
                  </div>
                  {currentSdgUsdt !== undefined ? (
                    <div className="mt-3 flex items-center gap-2" dir="ltr">
                      <input
                        type="number"
                        step="any"
                        value={sdgOverrideInput}
                        onChange={(e) => setSdgOverrideInput(e.target.value)}
                        placeholder={currentSdgUsdt.toFixed(2)}
                        className="field w-28 text-center font-mono"
                      />
                      <button onClick={() => saveSdgOverride(currentSdgUsdt)} disabled={!sdgOverrideInput || savingSdgOverride} className="btn-ghost ml-auto px-3 py-2 text-xs">
                        {savingSdgOverride ? "…" : "حفظ"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted">اضغط «تحديث الآن» أول مرة لجلب السعر.</p>
                  )}
                </div>

                <div className="card flex flex-col p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-subtle">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-surface2 text-muted"><RefreshCw size={14} /></span>
                    أسعار السوق
                  </div>
                  <p className="mt-2 text-xs text-muted">{lastUpdate ? `آخر تحديث ${formatRelativeTime(lastUpdate)}` : "لم يتم التحديث بعد"}</p>
                  <button onClick={updateNow} disabled={fxUpdating} className="btn-primary mt-auto w-full py-2 text-xs">
                    <RefreshCw size={14} className={fxUpdating ? "animate-spin" : ""} />
                    {fxUpdating ? "جارٍ التحديث…" : "تحديث الآن"}
                  </button>
                </div>
              </div>
              {fxMessage && <p className="mt-2 text-xs text-subtle">{fxMessage}</p>}

              <SectionTitle hint={pausedCount > 0 ? `${pausedCount} مسار متوقف` : "كل المسارات شغالة"}>
                الممرات
              </SectionTitle>

              <div className="grid gap-3 md:grid-cols-2">
                {PAIRS.map(({ a, b }) => {
                  const row = rates.find((r) => r.from === a && r.to === b);
                  if (!row) return null;
                  const key = `${a}_${b}`;
                  const isSdg = a === "SDG" || b === "SDG";
                  const dirty = marginInputs[key] !== undefined;
                  const marginValue = marginInputs[key] ?? (row.marginOverride != null ? String(row.marginOverride) : "");
                  const directions: [CurrencyCode, CurrencyCode][] = [
                    [a, b],
                    [b, a],
                  ];

                  return (
                    <div key={key} className="card overflow-hidden">
                      <div className="flex items-center justify-between border-b border-border px-4 py-3" dir="ltr">
                        <span className="font-semibold text-ink">
                          {CURRENCIES[a].flag} {a} <span className="text-subtle">⇄</span> {CURRENCIES[b].flag} {b}
                        </span>
                        <span className="text-[11px] text-subtle">{row.updatedAt ? formatRelativeTime(row.updatedAt) : "—"}</span>
                      </div>

                      <div className="divide-y divide-border/60">
                        {directions.map(([f, t]) => {
                          const active = !disabled.includes(flowKey(f, t));
                          return (
                            <div key={`${f}${t}`} className={`flex items-center gap-3 px-4 py-2.5 transition-opacity ${active ? "" : "opacity-50"}`}>
                              <div className="flex flex-1 items-center justify-between" dir="ltr">
                                <span className="text-sm text-muted">
                                  {f} → {t}
                                </span>
                                <span className="font-mono text-base font-bold text-primary">{formatSmart(computeRate(f, t, row.marketPrice, row.marginPercent))}</span>
                              </div>
                              <Toggle on={active} onChange={(v) => toggleFlow(f, t, v)} label={`${f} إلى ${t}`} />
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2 border-t border-border bg-surface2/50 px-4 py-2.5">
                        <span className="text-xs text-subtle">الهامش</span>
                        <div className="flex items-center gap-1.5" dir="ltr">
                          <input
                            type="number"
                            step="any"
                            value={marginValue}
                            onChange={(e) => setMarginInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                            placeholder={String(margin)}
                            className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-center font-mono text-sm text-ink outline-none focus:border-primary"
                          />
                          <span className="text-xs text-muted">%</span>
                        </div>
                        {row.marginOverride == null && !dirty && <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-subtle">عام</span>}
                        {isSdg && row.sdgSource && (
                          <span className="font-mono text-[11px] text-subtle" dir="ltr">
                            USDT {row.sdgSource.usdtToSdg.toFixed(0)}
                          </span>
                        )}
                        {(dirty || saving === key) && (
                          <button onClick={() => savePair(a, b)} disabled={saving === key} className="btn-primary mr-auto px-3 py-1.5 text-xs">
                            {saving === key ? "…" : "حفظ"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ))}

        {/* ================= PROFIT ================= */}
        {tab === "profit" &&
          (!profitLoaded || !ratesLoaded ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="card h-28 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile icon={<Target size={14} />} label="مبيعات اليوم" value={usd(todaysUsd, 0)} sub={`من هدف ${usd(dailyTarget, 0)}`}>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${targetProgress}%` }} />
                  </div>
                  {editingTarget ? (
                    <div className="mt-2 flex items-center gap-1.5" dir="ltr">
                      <input type="number" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} className="w-20 rounded-lg border border-border bg-surface2 px-2 py-1 font-mono text-xs text-ink outline-none" />
                      <button
                        onClick={async () => {
                          const val = parseFloat(targetInput);
                          if (!val) return;
                          await setDailyTarget(val);
                          setDailyTargetState(val);
                          setEditingTarget(false);
                        }}
                        className="text-xs font-semibold text-primary"
                      >
                        حفظ
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingTarget(true)} className="mt-2 text-[11px] text-subtle underline-offset-2 hover:underline">
                      {targetProgress.toFixed(0)}% · تعديل الهدف
                    </button>
                  )}
                </StatTile>
                <StatTile icon={<Wallet size={14} />} label="ربح اليوم" value={usd(todaysProfit)} sub="بالدولار" />
                <StatTile accent icon={<TrendingUp size={14} />} label="ربح هذا الشهر" value={usd(thisMonthProfit)} sub={`من ${usd(thisMonthUsd, 0)} مبيعات`} />
                <StatTile icon={<CalendarDays size={14} />} label="أيام هذا الشهر" value={thisMonthSales.length} sub="أيام فيها مبيعات" />
              </div>

              {/* Record a sale */}
              <SectionTitle hint="يتحول تلقائياً للدولار بسعر السوق">سجّل بيع</SectionTitle>
              <div className="card p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr_1fr]">
                  <label className="text-xs text-subtle">
                    العملة
                    <select value={saleCurrency} onChange={(e) => { setSaleCurrency(e.target.value as CurrencyCode); setSaleCounter("AVG"); }} className="field mt-1">
                      {FROM_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-subtle">
                    مقابل
                    <select value={saleCounter} onChange={(e) => setSaleCounter(e.target.value as CurrencyCode | "AVG")} className="field mt-1">
                      <option value="AVG">كل الممرات (متوسط)</option>
                      {validToCurrencies(saleCurrency).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-subtle">
                    المبلغ ({saleCurrency})
                    <input
                      inputMode="decimal"
                      value={saleAmount}
                      onChange={(e) => setSaleAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && recordSale()}
                      placeholder="10,000"
                      dir="ltr"
                      className="field mt-1 font-mono"
                    />
                  </label>
                  <label className="text-xs text-subtle">
                    التاريخ
                    <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="field mt-1" dir="ltr" />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
                    {saleUsd !== null ? (
                      <>
                        <span>
                          القيمة <b className="font-mono text-ink" dir="ltr">{usd(saleUsd)}</b>
                        </span>
                        <span>
                          الربح <b className="font-mono text-emerald-500" dir="ltr">{saleProfit !== null ? usd(saleProfit) : "—"}</b>
                        </span>
                        <span className="text-xs text-subtle">
                          هامش <span dir="ltr">{saleMargin?.toFixed(2)}%</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-subtle">اكتب المبلغ لتشوف القيمة بالدولار والربح</span>
                    )}
                  </div>
                  <button onClick={recordSale} disabled={savingSale || saleUsd === null} className="btn-primary mr-auto px-5">
                    <Plus size={15} />
                    {savingSale ? "…" : "إضافة"}
                  </button>
                </div>
                {saleFlash && <p className="mt-2 text-xs text-emerald-500" dir="ltr">{saleFlash}</p>}
              </div>

              {/* Breakdown */}
              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <div>
                  <SectionTitle>اليوم حسب العملة</SectionTitle>
                  <BreakdownTable rows={todayByCurrency} empty="ما في مبيعات مسجلة اليوم." />
                </div>
                <div>
                  <SectionTitle>هذا الشهر حسب العملة</SectionTitle>
                  <BreakdownTable rows={monthByCurrency} empty="ما في مبيعات هذا الشهر." />
                </div>
              </div>

              {monthlyTotals.length > 0 && (
                <>
                  <SectionTitle>الأشهر</SectionTitle>
                  <div className="card overflow-hidden">
                    <table className="w-full border-collapse text-left font-mono text-sm" dir="ltr">
                      <thead>
                        <tr className="border-b border-border bg-surface2 text-xs text-subtle">
                          <th className="px-4 py-2.5 font-medium">Month</th>
                          <th className="px-4 py-2.5 font-medium">Sold (USD)</th>
                          <th className="px-4 py-2.5 font-medium">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyTotals.map((m) => (
                          <tr key={m.month} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-2.5 text-ink">{m.month}</td>
                            <td className="px-4 py-2.5 text-muted">{usd(m.usdSold, 0)}</td>
                            <td className="px-4 py-2.5 font-semibold text-primary">{usd(m.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ))}
      </main>
    </div>
  );
}

function BreakdownTable({ rows, empty }: { rows: [CurrencyCode, CurrencyTotals][]; empty: string }) {
  if (rows.length === 0) return <div className="card px-4 py-6 text-center text-sm text-subtle">{empty}</div>;
  const total = rows.reduce((acc, [, t]) => ({ usd: acc.usd + t.usd, profit: acc.profit + t.profit }), { usd: 0, profit: 0 });
  return (
    <div className="card overflow-hidden">
      <table className="w-full border-collapse text-left font-mono text-sm" dir="ltr">
        <thead>
          <tr className="border-b border-border bg-surface2 text-xs text-subtle">
            <th className="px-4 py-2.5 font-medium">Currency</th>
            <th className="px-4 py-2.5 font-medium">Amount</th>
            <th className="px-4 py-2.5 font-medium">USD</th>
            <th className="px-4 py-2.5 font-medium">Profit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([code, t]) => (
            <tr key={code} className="border-b border-border/50">
              <td className="px-4 py-2.5 text-ink">
                {CURRENCIES[code]?.flag} {code}
              </td>
              <td className="px-4 py-2.5 text-muted">{num(t.amount)}</td>
              <td className="px-4 py-2.5 text-ink">{usd(t.usd, 0)}</td>
              <td className="px-4 py-2.5 font-semibold text-emerald-500">{usd(t.profit)}</td>
            </tr>
          ))}
          <tr className="bg-surface2/60">
            <td className="px-4 py-2.5 text-xs font-semibold text-subtle" colSpan={2}>
              TOTAL
            </td>
            <td className="px-4 py-2.5 font-semibold text-ink">{usd(total.usd, 0)}</td>
            <td className="px-4 py-2.5 font-bold text-primary">{usd(total.profit)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
