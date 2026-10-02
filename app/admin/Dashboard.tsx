"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowLeftRight, LogOut, Power, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import {
  getRatesWithMargin,
  setPairMargin,
  setSdgUsdtOverride,
  computeRate,
  updateRatesFromLiveFx,
  type RateRow,
} from "@/lib/rates";
import { formatSmart } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relativeTime";
import { setMarginPercent } from "@/lib/settings";
import { flowKey, getDisabledFlows, setDisabledFlows } from "@/lib/flows";
import { PAIRS, CURRENCIES, type CurrencyCode } from "@/lib/corridors";
import { cacheGet, cacheSet } from "@/lib/localCache";
import { refreshSite } from "@/lib/refreshSite";
import ProfitTab from "./ProfitTab";

type Tab = "rates" | "profit";

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
  const [tab, setTab] = useState<Tab>("rates");
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
          return { ...merged, rate: computeRate(r.from, r.to, merged.marketPrice, merged.marginPercent) };
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

  async function savePair(a: CurrencyCode, b: CurrencyCode) {
    const key = `${a}_${b}`;
    const row = rates.find((r) => r.from === a && r.to === b);
    if (!row) return;
    const marginRaw = marginInputs[key];
    const newMarginOverride = marginRaw === undefined || marginRaw.trim() === "" ? null : parseFloat(marginRaw);

    setSaving(key);
    setSaveError(null);
    try {
      await setPairMargin(a, b, newMarginOverride);
      refreshSite();
      patchRatePair(a, b, {
        marginPercent: newMarginOverride ?? margin,
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
      refreshSite();
      const stamp = new Date().toISOString();
      for (const u of updated) {
        patchRatePair(u.from, u.to, { marketPrice: u.marketPrice, sdgSource: u.sdgSource, updatedAt: stamp });
      }
      setFxMessage(
        skipped.length > 0 ? `✅ ${updated.length} تحديث — تعذر: ${skipped.join(", ")}` : `✅ تم تحديث ${updated.length} زوج`
      );
    } catch (err) {
      setFxMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
    setFxUpdating(false);
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
          const newMarketPrice = r.marketPrice * (val / r.sdgSource.usdtToSdg);
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

  return (
    <div className="min-h-screen pb-16">
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
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-surface2 p-1 shadow-well">
          {(
            [
              ["rates", "الأسعار", TrendingUp],
              ["profit", "الأرباح", Wallet],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className="relative flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
            >
              {tab === value && (
                <motion.span
                  layoutId="admin-tab"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-primary shadow-glow"
                />
              )}
              <span className={`relative flex items-center gap-2 ${tab === value ? "text-bg" : "text-muted"}`}>
                <Icon size={15} /> {label}
              </span>
            </button>
          ))}
        </div>

        {saveError && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
            فشل الحفظ: {saveError} — تأكد من نشر قواعد Firestore.
          </p>
        )}

        {!ratesLoaded && <Spinner />}

        {ratesLoaded && (profitOpened || tab === "profit") && (
          <div className={tab === "profit" ? "" : "hidden"}>
            <ProfitTab rates={rates} defaultMargin={margin} authReady={authReady} onError={setSaveError} />
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
                const marginValue = marginInputs[key] ?? (row.marginOverride != null ? String(row.marginOverride) : "");
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
                        {row.marginOverride != null && (
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
                              {formatSmart(computeRate(x, y, row.marketPrice, row.marginPercent))}
                            </p>
                            <p className={`text-[10px] font-semibold ${on ? "text-emerald-500" : "text-red-500"}`} dir="rtl">
                              {on ? "متاح" : "متوقف"}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {isSdg && row.sdgSource && (
                      <p className="mt-2 text-[11px] text-subtle" dir="ltr">
                        USDT → SDG{" "}
                        <span className="font-mono font-semibold text-muted">{row.sdgSource.usdtToSdg.toFixed(2)}</span>
                      </p>
                    )}

                    <p className="mb-1.5 mt-3 text-[11px] text-subtle">
                      هامش هذا الزوج — اتركه فاضي لاستخدام الهامش العام ({margin}%)
                    </p>
                    <div className="flex gap-2" dir="ltr">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={marginValue}
                          onChange={(e) => setMarginInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={String(margin)}
                          aria-label="هامش هذا الزوج"
                          className="field py-2.5 pl-3.5 pr-8 font-mono text-sm"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-subtle">
                          %
                        </span>
                      </div>
                      <button onClick={() => savePair(a, b)} className="btn-primary shrink-0 px-5 py-2.5 text-xs">
                        {saving === key ? "…" : "حفظ"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
