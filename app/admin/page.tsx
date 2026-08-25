"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth, firebaseEnabled } from "@/lib/firebase";
import { getRates, setMarketPrice, setPairMargin, computeRate, updateRatesFromLiveFx, type RateRow } from "@/lib/rates";
import { appendRateHistory } from "@/lib/rateHistory";
import { formatRate } from "@/lib/format";
import { getMarginPercent, setMarginPercent, getDailyTarget, setDailyTarget } from "@/lib/settings";
import { addSale, getRecentSales, type SaleEntry } from "@/lib/sales";
import { PAIRS, CURRENCIES } from "@/lib/corridors";

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
  const [marginInputs, setMarginInputs] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fxUpdating, setFxUpdating] = useState(false);
  const [fxMessage, setFxMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!user) return;
    getRates().then(setRates);
    getMarginPercent().then((m) => {
      setMargin(m);
      setMarginInput(String(m));
    });
    getRecentSales(400).then(setSales);
    getDailyTarget().then((t) => {
      setDailyTargetState(t);
      setTargetInput(String(t));
    });
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

  const todaysSale = sales.find((s) => s.date === todayStr());
  const todaysUsd = todaysSale?.usdSold ?? 0;
  const targetProgress = dailyTarget > 0 ? Math.min(100, (todaysUsd / dailyTarget) * 100) : 0;

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
        <h2 className="font-display text-base font-semibold text-ink">هامش الربح العام (الافتراضي)</h2>
        <p className="mt-1 text-xs text-subtle">
          يُطبّق على أي زوج ما عنده هامش خاص بيه — تقدر تحدد هامش مختلف لكل زوج بالأسفل (مثلاً هامش أعلى للأزواج المطلوبة زي السودان، وأقل للأزواج اللي عايز تنافس بيها).
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">أسعار السوق والهامش لكل زوج</h2>
            <p className="mt-1 text-xs text-subtle">
              كل الأزواج تتحدث تلقائياً كل يوم — الأزواج العادية من سعر الصرف الحقيقي، وأزواج الجنيه السوداني من متوسط أول 4 عروض شراء USDT/SDG على Binance P2P (لتقلبه الكبير). تقدر تعدل السعر أو الهامش يدوياً برضه.
            </p>
          </div>
          <button
            onClick={async () => {
              setFxUpdating(true);
              setFxMessage(null);
              try {
                const { updated, skipped } = await updateRatesFromLiveFx();
                setRates(await getRates());
                let msg = `✅ تم تحديث ${updated.length} زوج بأسعار السوق الحالية`;
                if (skipped.length > 0) {
                  msg += ` — تعذر تحديث: ${skipped.join(", ")}`;
                }
                setFxMessage(msg);
              } catch (err) {
                setFxMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
              }
              setFxUpdating(false);
            }}
            disabled={fxUpdating}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg disabled:opacity-60"
          >
            {fxUpdating ? "جارٍ التحديث…" : "🔄 تحديث الأسعار الآن"}
          </button>
        </div>

        {fxMessage && (
          <div className="mt-3 rounded-lg border border-border bg-surface2 p-3 text-sm text-ink">
            {fxMessage}
          </div>
        )}

        {saveError && (
          <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
            فشل الحفظ: {saveError}
            <br />
            تأكد من نشر قواعد Firestore (Rules → Publish) في لوحة Firebase.
          </div>
        )}

        <div className="mt-4 space-y-3">
          {PAIRS.map(({ a, b }) => {
            const row = rates.find((r) => r.from === a && r.to === b) ?? {
              from: a,
              to: b,
              marketPrice: 0,
              rate: 0,
              marginPercent: margin,
              marginOverride: undefined as number | undefined,
              updatedAt: null,
            };
            const fromC = CURRENCIES[a];
            const toC = CURRENCIES[b];
            const key = `${a}_${b}`;
            const effectiveMargin = row.marginOverride ?? margin;
            const marginInputValue = marginInputs[key] ?? (row.marginOverride != null ? String(row.marginOverride) : "");

            return (
              <div
                key={key}
                className="rounded-xl border border-border bg-surface p-4"
                dir="ltr"
              >
                <div className="flex items-center justify-between text-sm text-ink">
                  <span>
                    {fromC.flag} {a} ⇄ {toC.flag} {b}
                  </span>
                  <span className="text-xs text-subtle">
                    {a === "SDG" || b === "SDG" ? "🔄 تلقائي يومياً (Binance P2P)" : "🔄 تلقائي يومياً"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                  <label className="text-xs text-subtle">
                    سعر السوق ({a} لكل 1 {b})
                    <input
                      type="number"
                      step="any"
                      defaultValue={row.marketPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setRates((prev) => {
                          const others = prev.filter(
                            (r) => !((r.from === a && r.to === b) || (r.from === b && r.to === a))
                          );
                          return [
                            ...others,
                            {
                              from: a,
                              to: b,
                              marketPrice: val,
                              rate: computeRate(a, b, val, effectiveMargin),
                              marginPercent: effectiveMargin,
                              marginOverride: row.marginOverride,
                              updatedAt: row.updatedAt,
                              sdgSource: row.sdgSource,
                            },
                            {
                              from: b,
                              to: a,
                              marketPrice: val,
                              rate: computeRate(b, a, val, effectiveMargin),
                              marginPercent: effectiveMargin,
                              marginOverride: row.marginOverride,
                              updatedAt: row.updatedAt,
                              sdgSource: row.sdgSource,
                            },
                          ];
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm text-ink"
                    />
                  </label>
                  <div className="text-xs text-subtle">
                    {a}→{b}: <span className="font-semibold text-primary">{formatRate(computeRate(a, b, row.marketPrice, effectiveMargin))}</span>
                    <br />
                    {b}→{a}: <span className="font-semibold text-primary">{formatRate(computeRate(b, a, row.marketPrice, effectiveMargin))}</span>
                  </div>
                  <button
                    onClick={async () => {
                      setSaving(key);
                      setSaveError(null);
                      try {
                        await setMarketPrice(a, b, row.marketPrice, row.sdgSource);
                        await appendRateHistory(a, b, row.marketPrice);
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

                <div className="mt-3 flex items-end gap-3 border-t border-border pt-3">
                  <label className="text-xs text-subtle">
                    هامش خاص بهذا الزوج (فاضي = يستخدم العام {margin}%)
                    <input
                      type="number"
                      step="any"
                      placeholder={String(margin)}
                      value={marginInputValue}
                      onChange={(e) =>
                        setMarginInputs((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="mt-1 w-28 rounded-lg border border-border bg-surface2 px-2.5 py-2 text-sm text-ink"
                    />
                  </label>
                  <button
                    onClick={async () => {
                      setSaving(`${key}_margin`);
                      setSaveError(null);
                      try {
                        const raw = marginInputs[key];
                        const percent = raw === undefined || raw.trim() === "" ? null : parseFloat(raw);
                        await setPairMargin(a, b, percent);
                        setRates(await getRates());
                        setMarginInputs((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      } catch (err) {
                        setSaveError(err instanceof Error ? err.message : String(err));
                      }
                      setSaving(null);
                    }}
                    className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-ink"
                  >
                    {saving === `${key}_margin` ? "جارٍ الحفظ…" : "حفظ الهامش"}
                  </button>
                  {row.marginOverride != null && (
                    <span className="text-xs text-subtle">مخصص: {row.marginOverride}%</span>
                  )}
                </div>

                {(a === "SDG" || b === "SDG") && row.sdgSource && (
                  <p className="mt-2 text-xs text-subtle">
                    سعر USDT→SDG المستخدم: <span className="font-semibold text-ink">{row.sdgSource.usdtToSdg.toFixed(2)}</span>
                    {" "}(متوسط {row.sdgSource.prices.length} عروض Binance P2P: {row.sdgSource.prices.map((p) => p.toFixed(2)).join(", ")})
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily target */}
      <div className="mt-10 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">الهدف اليومي</h2>
        <p className="mt-1 text-xs text-subtle">
          حدد هدف البيع اليومي بالدولار، وشريط التقدم يتحدث تلقائياً كل ما تضيف مبلغ.
        </p>
        <div className="mt-4 flex items-center gap-3" dir="ltr">
          <span className="text-sm text-muted">$</span>
          <input
            type="number"
            step="any"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            className="w-32 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-ink"
          />
          <button
            onClick={async () => {
              setSavingTarget(true);
              const val = parseFloat(targetInput);
              await setDailyTarget(val);
              setDailyTargetState(val);
              setSavingTarget(false);
            }}
            className="mr-auto rounded-full bg-primary px-4 py-2 text-xs font-semibold text-bg"
          >
            {savingTarget ? "جارٍ الحفظ…" : "حفظ الهدف"}
          </button>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm" dir="ltr">
            <span className="font-mono font-semibold text-ink">
              ${todaysUsd.toLocaleString()} / ${dailyTarget.toLocaleString()}
            </span>
            <span className="font-mono text-xs text-subtle">{targetProgress.toFixed(0)}%</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${targetProgress}%` }}
            />
          </div>
          {targetProgress >= 100 && (
            <p className="mt-2 text-xs font-semibold text-primary">🎉 وصلت الهدف اليوم!</p>
          )}
        </div>
      </div>

      {/* Daily profit tracker */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">الأرباح اليومية</h2>
        <p className="mt-1 text-xs text-subtle">
          أضف كل عملية بيع بمبلغها — تُضاف تلقائياً لإجمالي اليوم، ويُحسب الربح حسب الهامش الحالي ({margin}%).
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
                  <th className="px-4 py-2.5 text-left font-medium">Profit</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.date} className="border-b border-border/50">
                    <td className="px-4 py-2.5 text-left text-ink">{s.date}</td>
                    <td className="px-4 py-2.5 text-left text-muted">${s.usdSold.toLocaleString()}</td>
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
