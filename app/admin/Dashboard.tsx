"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  BarChart3,
  ChevronDown,
  HandCoins,
  Landmark,
  LogOut,
  PlusCircle,
  Power,
  RefreshCw,
  Settings2,
  TrendingUp,
} from "lucide-react";
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
import ThemeToggle from "@/components/ThemeToggle";

type Tab = ProfitView | "rates";

/** Bottom bar — every admin screen is one tap away. */
/** Title + one-line hint shown at the top of each screen. */
const SECTION: Record<Tab, { title: string; hint: string }> = {
  add: { title: "تسجيل عملية", hint: "سجّل البيع وشوف ربح اليوم" },
  rates: { title: "الأسعار", hint: "أسعار Binance والهوامش والاتجاهات" },
  capital: { title: "رأس المال", hint: "رصيدك والإيداع والسحب" },
  debts: { title: "المستحقات", hint: "مديون لنا ومديون له" },
  reports: { title: "التقارير", hint: "السجل الكامل وتصدير PDF" },
};

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
  const [showSettings, setShowSettings] = useState(false);
  const [pairFilter, setPairFilter] = useState<CurrencyCode | "all">("all");
  const [openPair, setOpenPair] = useState<string | null>(null);
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
    <div className="admin-ui min-h-screen pb-32">
      <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 pb-2 pt-3">
          <div className="flex items-center gap-2">
            <Image src="/logo-icon.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg bg-surface object-contain p-0.5" />
            <span className="text-[15px] font-bold text-ink" dir="ltr">
              Fly<span className="text-primary">Rate</span>
            </span>
          </div>
          <div className="flex items-center gap-2 [&>button]:border-0 [&>button]:bg-surface [&>button]:text-muted">
            <ThemeToggle />
            <button
              onClick={onSignOut}
              aria-label="تسجيل الخروج"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-red-500"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5">
        <div className="px-1 pt-1">
          <p className="text-[13px] font-medium text-subtle">
            {tab === "add"
              ? new Date().toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" })
              : SECTION[tab].hint}
          </p>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-ink">{SECTION[tab].title}</h1>
        </div>

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
          <div className={`mt-4 space-y-4 ${tab === "rates" ? "" : "hidden"}`}>
            {/* Status */}
            <div className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-subtle">آخر تحديث</p>
                  <p className="mt-0.5 text-[17px] font-bold text-ink">
                    {lastUpdated ? formatRelativeTime(lastUpdated) : "لم تُحدَّث بعد"}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                    <span className={`size-1.5 rounded-full ${auto?.enabled ? "bg-emerald-500" : "bg-subtle"}`} />
                    {auto ? (auto.enabled ? `تلقائي كل ${auto.minutes} د` : "التحديث التلقائي متوقف") : "…"} · Binance
                  </p>
                </div>
                <button onClick={updateNow} disabled={fxUpdating} className="btn-primary h-11 shrink-0 px-4 text-[13px]">
                  <RefreshCw size={15} className={fxUpdating ? "animate-spin" : ""} />
                  {fxUpdating ? "جارٍ…" : "تحديث"}
                </button>
              </div>
              {fxMessage && <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">{fxMessage}</p>}
            </div>

            {/* Settings + flows */}
            <div className="card group-list overflow-hidden p-0">
              <button onClick={() => setShowSettings((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3.5 text-right">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary/15 text-primary">
                  <Settings2 size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">إعدادات الأسعار</p>
                  <p className="truncate text-[11px] text-subtle">
                    هامش {margin}%{manualMyr ? ` · MYR يدوي ${manualMyr}` : ""}
                  </p>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-subtle transition-transform ${showSettings ? "rotate-180" : ""}`} />
              </button>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] ${
                    disabled.length ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
                  }`}
                >
                  <Power size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">الاتجاهات المتاحة</p>
                  <p className="text-[11px] text-subtle">اقفل أي اتجاه ما عندك فيه سيولة من داخل الزوج</p>
                </div>
                <span className="font-mono text-[13px] font-bold text-ink" dir="ltr">
                  {activeDirections}/{totalDirections}
                </span>
              </div>
            </div>

            {showSettings && (
              <div className="card overflow-hidden p-0">
              {/* Auto refresh from Binance */}
              <div className="px-5 py-4">
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
            )}

            {/* Currency filter */}
            <div className="no-scrollbar -mx-5 overflow-x-auto px-5" dir="ltr">
              <div className="flex w-max gap-2">
                {(["all", ...Array.from(new Set(PAIRS.flatMap((p) => [p.a, p.b])))] as (CurrencyCode | "all")[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setPairFilter(c)}
                    className={`flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                      pairFilter === c ? "bg-ink text-bg" : "bg-surface text-muted"
                    }`}
                  >
                    {c === "all" ? (
                      "الكل"
                    ) : (
                      <>
                        <span>{CURRENCIES[c].flag}</span>
                        <span className="font-mono">{c}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Pairs — tap a row to edit */}
            <div>
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-[13px] font-semibold text-muted">الأزواج</p>
                <p className="text-[12px] text-subtle">
                  {PAIRS.filter(({ a, b }) => pairFilter === "all" || a === pairFilter || b === pairFilter).length}
                </p>
              </div>
              <div className="card group-list overflow-hidden p-0">
              {PAIRS.filter(({ a, b }) => pairFilter === "all" || a === pairFilter || b === pairFilter).map(({ a, b }) => {
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
                const isSdg = a === "SDG" || b === "SDG";
                const offAB = disabled.includes(flowKey(a, b));
                const offBA = disabled.includes(flowKey(b, a));
                const mAB = rowFor(a, b).marginPercent;
                const mBA = rowFor(b, a).marginPercent;
                const isOpen = openPair === key;
                const rateAB = formatSmart(computeRate(a, b, rowFor(a, b).marketPrice, mAB, rowFor(a, b)));
                const rateBA = formatSmart(computeRate(b, a, rowFor(b, a).marketPrice, mBA, rowFor(b, a)));

                return (
                  <div key={key}>
                    <button onClick={() => setOpenPair(isOpen ? null : key)} className="flex w-full items-center gap-3 px-4 py-3.5 text-right">
                      <span className="flex shrink-0 -space-x-2" dir="ltr">
                        <span className="flex size-9 items-center justify-center rounded-full border-2 border-surface bg-surface2 text-lg">
                          {fromC.flag}
                        </span>
                        <span className="flex size-9 items-center justify-center rounded-full border-2 border-surface bg-surface2 text-lg">
                          {toC.flag}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[15px] font-bold text-ink" dir="ltr" style={{ textAlign: "right" }}>
                          {a} ⇄ {b}
                        </p>
                        <p className="text-[11px] text-subtle">
                          هامش {mAB === mBA ? `${mAB}%` : `${mAB}% / ${mBA}%`}
                          {(offAB || offBA) && <span className="text-red-500"> · {offAB && offBA ? "متوقف" : "اتجاه متوقف"}</span>}
                        </p>
                      </div>
                      <div className="shrink-0 text-left" dir="ltr">
                        <p className={`font-mono text-[15px] font-bold ${offAB ? "text-subtle line-through" : "text-ink"}`}>{rateAB}</p>
                        <p className={`font-mono text-[11px] ${offBA ? "text-subtle line-through" : "text-muted"}`}>{rateBA}</p>
                      </div>
                      <ChevronDown size={16} className={`shrink-0 text-subtle transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="space-y-2 px-4 pb-4">
                    {/* Each direction: rate + on/off */}
                    <div className="grid grid-cols-2 gap-2" dir="ltr">
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
                            className={`rounded-2xl px-3 py-2.5 transition-colors ${
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
                    <button onClick={() => savePair(a, b)} className="btn-primary mt-3 h-11 w-full text-[13px]">
                      {saving === key ? "…" : "حفظ"}
                    </button>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation — floating */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[26px] border border-border/60 bg-surface/90 p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-[20px] py-2 text-[10px] font-semibold transition-colors ${
                  active ? "bg-primary text-white shadow-[0_6px_16px_-6px_rgba(254,82,0,0.8)]" : "text-muted"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
