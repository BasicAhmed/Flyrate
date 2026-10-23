"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowLeftRight, BarChart3, HandCoins, Landmark, LogOut, PlusCircle, Power, RefreshCw, TrendingUp } from "lucide-react";
import {
  getRatesWithMargin,
  setFlowMargins,
  setSdgUsdtOverride,
  computeRate,
  updateRatesFromLiveFx,
  type RateRow,
} from "@/lib/rates";
import { formatSmart } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relativeTime";
import {
  setMarginPercent,
  getAutoUpdate,
  setAutoUpdate,
  pingAutoUpdate,
  getManualQuote,
  setManualQuote,
  type AutoUpdateSettings,
} from "@/lib/settings";
import { flowKey, getDisabledFlows, setDisabledFlows } from "@/lib/flows";
import { PAIRS, CURRENCIES, type CurrencyCode } from "@/lib/corridors";
import { cacheGet, cacheSet } from "@/lib/localCache";
import { refreshSite } from "@/lib/refreshSite";
import ProfitTab, { type View as ProfitView } from "./ProfitTab";

type Tab = ProfitView | "rates";

/** Bottom bar — every admin screen is one tap away. */
const NAV: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: "add", label: "تسجيل", icon: PlusCircle },
  { id: "rates", label: "الأسعار", icon: TrendingUp },
  { id: "capital", label: "رأس المال", icon: Landmark },
  { id: "debts", label: "المستحقات", icon: HandCoins },
  { id: "reports", label: "التقارير", icon: BarChart3 },
];

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <RefreshCw size={20} className="animate-spin text-primary" />
    </div>
  );
}

function SmallButton({ onClick, busy, children }: { onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="shrink-0 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-ink shadow-soft transition-all hover:-translate-y-px hover:border-primary/60 disabled:opacity-60"
    >
      {busy ? "…" : children}
    </button>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-emerald-500 shadow-[0_0_12px_-2px_rgba(16,185,129,0.7)]" : "bg-border shadow-well"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow ${on ? "left-[1.375rem]" : "left-0.5"}`}
      />
    </button>
  );
}

interface RatesCache {
  rates: RateRow[];
  margin: number;
  disabled: string[];
}

export default function AdminDashboard({ onSignOut, authReady }: { onSignOut: () => void; authReady: boolean }) {
  const [tab, setTabState] = useState<Tab>(() => {
    const t = cacheGet<Tab>("adminTab");
    return t && NAV.some((n) => n.id === t) ? t : "add";
  });
  const [lastProfitView, setLastProfitView] = useState<ProfitView>(tab === "rates" ? "add" : tab);
  const setTab = (t: Tab) => {
    setTabState(t);
    if (t !== "rates") setLastProfitView(t);
    cacheSet("adminTab", t);
    window.scrollTo({ top: 0 });
  };
  // Last-known data from this device — on screen instantly, replaced by the
  // fresh copy a moment later.
  const [cached] = useState(() => cacheGet<RatesCache>("rates"));
  const [profitOpened, setProfitOpened] = useState(false);

  const [ratesLoaded, setRatesLoaded] = useState(!!cached);
  const [margin, setMargin] = useState(cached?.margin ?? 3.5);
  const [marginInput, setMarginInput] = useState(String(cached?.margin ?? 3.5));
  const [savingMargin, setSavingMargin] = useState(false);
  const [rates, setRates] = useState<RateRow[]>(cached?.rates ?? []);
  const [marginInputs, setMarginInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fxUpdating, setFxUpdating] = useState(false);
  const [fxMessage, setFxMessage] = useState<string | null>(null);
  const [sdgOverrideInput, setSdgOverrideInput] = useState("");
  const [savingSdgOverride, setSavingSdgOverride] = useState(false);
  const [disabled, setDisabled] = useState<string[]>(cached?.disabled ?? []);
  const [auto, setAuto] = useState<AutoUpdateSettings | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);
  const [manualMyr, setManualMyr] = useState<number | null>(null);
  const [myrInput, setMyrInput] = useState("");
  const [savingMyr, setSavingMyr] = useState(false);

  // Auto price refresh: load the setting, and keep nudging the server while
  // /admin is open (it only refreshes when the chosen interval has passed).
  useEffect(() => {
    getAutoUpdate().then(setAuto).catch(() => {});
    getManualQuote("MYR").then(setManualMyr).catch(() => {});
    pingAutoUpdate();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") pingAutoUpdate();
    }, 5 * 60_000);
    return () => window.clearInterval(t);
  }, []);

  async function chooseAuto(enabled: boolean, minutes: number) {
    setSavingAuto(true);
    setSaveError(null);
    try {
      await setAutoUpdate(enabled, minutes);
      setAuto((prev) => ({ lastRunAt: prev?.lastRunAt ?? null, enabled, minutes }));
      if (enabled) pingAutoUpdate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
    setSavingAuto(false);
  }

  // Rates are needed by both tabs (the profit tab converts sales to USD).
  useEffect(() => {
    // With a cached copy on screen, a failed refresh keeps the cache rather
    // than swapping in placeholder prices.
    Promise.all([getRatesWithMargin({ strict: !!cached }), getDisabledFlows()])
      .then(([{ rates, defaultMargin }, flows]) => {
        setRates(rates);
        setMargin(defaultMargin);
        setMarginInput(String(defaultMargin));
        setDisabled(flows);
        setRatesLoaded(true);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the device cache in step with whatever is on screen.
  useEffect(() => {
    if (ratesLoaded) cacheSet("rates", { rates, margin, disabled } satisfies RatesCache);
  }, [ratesLoaded, rates, margin, disabled]);

  // Warm the profit tab in the background once the session is ready, so
  // switching to it is instant; after that it stays mounted.
  useEffect(() => {
    if (authReady && ratesLoaded) setProfitOpened(true);
  }, [authReady, ratesLoaded]);

  const currentMyrUsdt = rates.find((r) => r.from === "MYR" && r.to === "USD")?.marketPrice;
  const currentSdgUsdt = rates.find((r) => (r.from === "SDG" || r.to === "SDG") && r.sdgSource)?.sdgSource?.usdtToSdg;
  const lastUpdated = rates
    .map((r) => r.updatedAt)
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  const totalDirections = PAIRS.length * 2;
  const activeDirections = totalDirections - disabled.length;

  /** Applies a save result to local state directly — no refetch. */
  function patchRatePair(a: string, b: string, updates: Partial<RateRow>) {
    setRates((prev) =>
      prev.map((r) => {
        if ((r.from === a && r.to === b) || (r.from === b && r.to === a)) {
          const merged = { ...r, ...updates };
          return { ...merged, rate: computeRate(r.from, r.to, merged.marketPrice, merged.marginPercent, merged) };
        }
        return r;
      })
    );
  }

  async function toggleFlow(from: CurrencyCode, to: CurrencyCode) {
    const key = flowKey(from, to);
    const prev = disabled;
    const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    setDisabled(next); // optimistic
    setSaveError(null);
    try {
      await setDisabledFlows(next);
      refreshSite();
    } catch (err) {
      setDisabled(prev);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Saves both flows' margins for one pair. An empty box = global default. */
  async function savePair(a: CurrencyCode, b: CurrencyCode) {
    const key = `${a}_${b}`;
    const current = (x: CurrencyCode, y: CurrencyCode) => rates.find((r) => r.from === x && r.to === y)?.marginOverride;
    const parse = (x: CurrencyCode, y: CurrencyCode): number | null => {
      const raw = marginInputs[flowKey(x, y)];
      if (raw === undefined) return current(x, y) ?? null; // untouched → keep as is
      return raw.trim() === "" ? null : parseFloat(raw);
    };
    const forward = parse(a, b);
    const reverse = parse(b, a);

    setSaving(key);
    setSaveError(null);
    try {
      await setFlowMargins(a, b, { forward, reverse });
      refreshSite();
      const stamp = new Date().toISOString();
      setRates((prev) =>
        prev.map((r) => {
          const o = r.from === a && r.to === b ? forward : r.from === b && r.to === a ? reverse : undefined;
          if (o === undefined) return r;
          const pct = o ?? margin;
          return {
            ...r,
            marginPercent: pct,
            marginOverride: o ?? undefined,
            rate: computeRate(r.from, r.to, r.marketPrice, pct, r),
            updatedAt: stamp,
          };
        })
      );
      setMarginInputs((prev) => {
        const next = { ...prev };
        delete next[flowKey(a, b)];
        delete next[flowKey(b, a)];
        return next;
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
    setSaving(null);
  }

  async function saveGlobalMargin() {
    setSavingMargin(true);
    setSaveError(null);
    try {
      const val = parseFloat(marginInput);
      await setMarginPercent(val);
      refreshSite();
      setMargin(val);
      setRates((prev) =>
        prev.map((r) =>
          r.marginOverride == null ? { ...r, marginPercent: val, rate: computeRate(r.from, r.to, r.marketPrice, val, r) } : r
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
      refreshSite();
      const stamp = new Date().toISOString();
      for (const u of updated) {
        patchRatePair(u.from, u.to, {
          marketPrice: u.marketPrice,
          buyPrice: u.buyPrice,
          sellPrice: u.sellPrice,
          sdgSource: u.sdgSource,
          updatedAt: stamp,
        });
      }
      setFxMessage(
        skipped.length > 0 ? `✅ ${updated.length} تحديث — تعذر: ${skipped.join(", ")}` : `✅ تم تحديث ${updated.length} زوج`
      );
    } catch (err) {
      setFxMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
    setFxUpdating(false);
  }

  /** USDT/MYR typed by hand (null = back to automatic). Every MYR pair is
   *  re-priced from it straight away, and auto-updates keep using it. */
  async function saveMyr(price: number | null) {
    if (price !== null && !(price > 0)) return;
    setSavingMyr(true);
    setSaveError(null);
    try {
      await setManualQuote("MYR", price);
      setManualMyr(price);
      setMyrInput("");
      await updateNow();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
    setSavingMyr(false);
  }

  async function saveSdgOverride() {
    const val = parseFloat(sdgOverrideInput);
    if (!val) return;
    setSavingSdgOverride(true);
    setSaveError(null);
    try {
      await setSdgUsdtOverride(val);
      refreshSite();
      setRates((prev) =>
        prev.map((r) => {
          if ((r.from !== "SDG" && r.to !== "SDG") || !r.sdgSource) return r;
          const ratio = val / r.sdgSource.usdtToSdg;
          const newMarketPrice = r.marketPrice * ratio;
          const sides = {
            buyPrice: r.buyPrice != null ? r.buyPrice * ratio : undefined,
            sellPrice: r.sellPrice != null ? r.sellPrice * ratio : undefined,
          };
          return {
            ...r,
            marketPrice: newMarketPrice,
            ...sides,
            rate: computeRate(r.from, r.to, newMarketPrice, r.marginPercent, sides),
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

  return (
    <div className="min-h-screen pb-32">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border bg-surface2 p-1.5 shadow-soft">
              <Image src="/logo-icon.png" alt="" width={34} height={28} className="h-7 w-auto" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-bold text-ink" dir="ltr">
                Fly<span className="text-primary">Rate</span>
              </p>
              <p className="text-[11px] text-subtle">لوحة الإدارة</p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            aria-label="تسجيل الخروج"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted shadow-soft transition-colors hover:text-ink"
          >
            <LogOut size={14} /> خروج
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 pt-6">
        {saveError && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
            فشل الحفظ: {saveError}
          </p>
        )}

        {!ratesLoaded && <Spinner />}

        {ratesLoaded && (profitOpened || tab !== "rates") && (
          <div className={tab !== "rates" ? "" : "hidden"}>
            <ProfitTab
              view={tab === "rates" ? lastProfitView : tab}
              rates={rates}
              defaultMargin={margin}
              authReady={authReady}
              onError={setSaveError}
            />
          </div>
        )}

        {ratesLoaded && (
          <div className={`mt-5 space-y-4 ${tab === "rates" ? "" : "hidden"}`}>
            {/* Controls */}
            <div className="card overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 bg-gradient-to-br from-primary/15 via-transparent to-accent/10 p-5">
                <div>
                  <p className="text-xs text-muted">آخر تحديث للأسعار</p>
                  <p className="mt-0.5 font-display text-lg font-bold text-ink">
                    {lastUpdated ? formatRelativeTime(lastUpdated) : "لم تُحدَّث بعد"}
                  </p>
                </div>
                <button onClick={updateNow} disabled={fxUpdating} className="btn-primary px-5 py-3 text-sm">
                  <RefreshCw size={15} className={fxUpdating ? "animate-spin" : ""} />
                  {fxUpdating ? "جارٍ التحديث…" : "تحديث الآن"}
                </button>
              </div>
              {fxMessage && <p className="border-t border-border/60 px-5 py-2.5 text-xs text-muted">{fxMessage}</p>}

              {/* Auto refresh from Binance */}
              <div className="border-t border-border/60 px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink">التحديث التلقائي من Binance</p>
                  {auto?.enabled && auto.lastRunAt && (
                    <p className="text-[11px] text-subtle">آخر تحديث تلقائي: {formatRelativeTime(auto.lastRunAt)}</p>
                  )}
                </div>
                <div className="mt-2.5 grid grid-cols-5 gap-1 rounded-xl bg-surface2 p-1 shadow-well">
                  {(
                    [
                      [false, 0, "إيقاف"],
                      [true, 15, "15 د"],
                      [true, 30, "30 د"],
                      [true, 60, "ساعة"],
                      [true, 180, "3 ساعات"],
                    ] as const
                  ).map(([en, min, label]) => {
                    const active = auto ? (en ? auto.enabled && auto.minutes === min : !auto.enabled) : false;
                    return (
                      <button
                        key={label}
                        onClick={() => chooseAuto(en, en ? min : auto?.minutes ?? 30)}
                        disabled={savingAuto || !auto}
                        className={`rounded-lg py-2 text-[11px] font-semibold transition-colors ${
                          active ? "bg-primary text-white shadow-soft" : "text-muted hover:text-ink"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-subtle">
                  الأسعار بتتحدث براها كل الفترة دي طالما في زوار في الموقع أو الأدمن مفتوح. تحديث يومي احتياطي بيشتغل دائماً.
                </p>
              </div>

              <div className="grid gap-4 border-t border-border/60 p-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-subtle">الهامش العام</label>
                  <div className="flex gap-2" dir="ltr">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={marginInput}
                        onChange={(e) => setMarginInput(e.target.value)}
                        className="field py-2.5 pl-3.5 pr-8 font-mono text-sm font-semibold"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-subtle">
                        %
                      </span>
                    </div>
                    <SmallButton onClick={saveGlobalMargin} busy={savingMargin}>
                      حفظ
                    </SmallButton>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-subtle">
                    سعر USDT/MYR — الحالي{" "}
                    <span className="font-mono font-semibold text-ink">
                      {(manualMyr ?? currentMyrUsdt)?.toFixed(3) ?? "—"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        manualMyr ? "bg-accent/15 text-accent" : "bg-surface2 text-muted"
                      }`}
                    >
                      {manualMyr ? "يدوي" : "تلقائي"}
                    </span>
                  </label>
                  <div className="flex gap-2" dir="ltr">
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      value={myrInput}
                      onChange={(e) => setMyrInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveMyr(parseFloat(myrInput))}
                      placeholder="مثلاً 4.25"
                      className="field flex-1 px-3.5 py-2.5 font-mono text-sm font-semibold"
                    />
                    <SmallButton onClick={() => saveMyr(parseFloat(myrInput))} busy={savingMyr}>
                      تطبيق
                    </SmallButton>
                  </div>
                  {manualMyr ? (
                    <button
                      onClick={() => saveMyr(null)}
                      disabled={savingMyr}
                      className="mt-1.5 text-[11px] font-semibold text-primary hover:underline"
                    >
                      رجوع للسعر التلقائي
                    </button>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-subtle">كم رينجت مقابل 1 USDT — بيتطبق على كل أزواج MYR.</p>
                  )}
                </div>

                {currentSdgUsdt !== undefined && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-subtle">
                      سعر USDT/SDG — الحالي{" "}
                      <span className="font-mono font-semibold text-ink">{currentSdgUsdt.toFixed(2)}</span>
                    </label>
                    <div className="flex gap-2" dir="ltr">
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={sdgOverrideInput}
                        onChange={(e) => setSdgOverrideInput(e.target.value)}
                        placeholder="سعر جديد"
                        className="field flex-1 px-3.5 py-2.5 font-mono text-sm font-semibold"
                      />
                      <SmallButton onClick={saveSdgOverride} busy={savingSdgOverride}>
                        تطبيق
                      </SmallButton>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Active flows summary */}
            <div className="card-sm flex items-center gap-3 p-4">
              <span
                className={`rounded-xl p-2 ${
                  disabled.length ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
                }`}
              >
                <Power size={16} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">
                  الاتجاهات المتاحة:{" "}
                  <span className="font-mono" dir="ltr">
                    {activeDirections}/{totalDirections}
                  </span>
                </p>
                <p className="text-[11px] leading-relaxed text-muted">
                  اقفل أي اتجاه ما عندك سيولة فيه — يفضل ظاهر في الحاسبة مع ملاحظة «غير متاح حالياً». التغيير يظهر في
                  الموقع خلال دقيقة.
                </p>
              </div>
            </div>

            {/* Pair cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              {PAIRS.map(({ a, b }) => {
                const row = rates.find((r) => r.from === a && r.to === b);
                if (!row) return null;
                const fromC = CURRENCIES[a];
                const toC = CURRENCIES[b];
                const key = `${a}_${b}`;
                const rowFor = (x: CurrencyCode, y: CurrencyCode) =>
                  rates.find((r) => r.from === x && r.to === y) ?? row;
                const marginValueFor = (x: CurrencyCode, y: CurrencyCode) => {
                  const o = rowFor(x, y).marginOverride;
                  return marginInputs[flowKey(x, y)] ?? (o != null ? String(o) : "");
                };
                const hasCustomMargin = rowFor(a, b).marginOverride != null || rowFor(b, a).marginOverride != null;
                const isSdg = a === "SDG" || b === "SDG";
                const bothOff = disabled.includes(flowKey(a, b)) && disabled.includes(flowKey(b, a));

                return (
                  <div key={key} className={`card-sm p-4 transition-opacity ${bothOff ? "opacity-70" : ""}`}>
                    <div className="flex items-center justify-between" dir="ltr">
                      <div className="flex items-center gap-2.5">
                        <div className="flex -space-x-2">
                          <span className="flex size-8 items-center justify-center rounded-full border-2 border-surface bg-surface2 text-base shadow-soft">
                            {fromC.flag}
                          </span>
                          <span className="flex size-8 items-center justify-center rounded-full border-2 border-surface bg-surface2 text-base shadow-soft">
                            {toC.flag}
                          </span>
                        </div>
                        <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-ink">
                          {a} <ArrowLeftRight size={12} className="text-subtle" /> {b}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasCustomMargin && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                            هامش خاص
                          </span>
                        )}
                        <span className="text-[11px] text-subtle">
                          {row.updatedAt ? formatRelativeTime(row.updatedAt) : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Each direction: rate + on/off */}
                    <div className="mt-3 grid grid-cols-2 gap-2" dir="ltr">
                      {(
                        [
                          [a, b],
                          [b, a],
                        ] as const
                      ).map(([x, y]) => {
                        const on = !disabled.includes(flowKey(x, y));
                        const flowRow = rowFor(x, y);
                        return (
                          <div
                            key={`${x}${y}`}
                            className={`rounded-xl px-3 py-2.5 shadow-well transition-colors ${
                              on ? "bg-surface2" : "bg-red-500/5 ring-1 ring-inset ring-red-500/25"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-mono text-[10px] font-semibold text-subtle">
                                {x} → {y}
                              </p>
                              <Switch on={on} onChange={() => toggleFlow(x, y)} label={`${x} إلى ${y}`} />
                            </div>
                            <p
                              className={`mt-1 font-mono text-base font-bold ${
                                on ? "text-primary" : "text-subtle line-through decoration-red-500/60"
                              }`}
                            >
                              {formatSmart(computeRate(x, y, flowRow.marketPrice, flowRow.marginPercent, flowRow))}
                            </p>
                            <p className={`text-[10px] font-semibold ${on ? "text-emerald-500" : "text-red-500"}`} dir="rtl">
                              {on ? "متاح" : "متوقف"}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {row.buyPrice != null && row.sellPrice != null && (
                      <p className="mt-2 text-[11px] text-subtle" dir="ltr">
                        Binance {a}/{b} — buy{" "}
                        <span className="font-mono font-semibold text-muted">{formatSmart(row.buyPrice)}</span> · sell{" "}
                        <span className="font-mono font-semibold text-muted">{formatSmart(row.sellPrice)}</span>
                      </p>
                    )}

                    {isSdg && row.sdgSource && (
                      <p className="mt-2 text-[11px] text-subtle" dir="ltr">
                        USDT → SDG{" "}
                        <span className="font-mono font-semibold text-muted">{row.sdgSource.usdtToSdg.toFixed(2)}</span>
                      </p>
                    )}

                    <p className="mb-1.5 mt-3 text-[11px] text-subtle">
                      هامش كل اتجاه — اتركه فاضي لاستخدام الهامش العام ({margin}%)
                    </p>
                    <div className="grid grid-cols-2 gap-2" dir="ltr">
                      {(
                        [
                          [a, b],
                          [b, a],
                        ] as const
                      ).map(([x, y]) => (
                        <label key={`m${x}${y}`} className="block">
                          <span className="mb-1 block font-mono text-[10px] font-semibold text-subtle">
                            {x} → {y}
                          </span>
                          <span className="relative block">
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              value={marginValueFor(x, y)}
                              onChange={(e) => setMarginInputs((prev) => ({ ...prev, [flowKey(x, y)]: e.target.value }))}
                              placeholder={String(margin)}
                              aria-label={`هامش ${x} إلى ${y}`}
                              className="field py-2.5 pl-3.5 pr-8 font-mono text-sm"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-subtle">
                              %
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <button onClick={() => savePair(a, b)} className="btn-primary mt-2 w-full py-2.5 text-xs">
                      {saving === key ? "…" : "حفظ"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface/95 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold"
              >
                {active && (
                  <motion.span
                    layoutId="admin-nav"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-primary"
                  />
                )}
                <span
                  className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
                    active ? "bg-primary/10 text-primary" : "text-subtle"
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={active ? "text-primary" : "text-muted"}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
