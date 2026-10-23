"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, HandCoins, Phone, Plus, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import {
  addDebtEntry,
  capitalEffect,
  deleteDebtAccount,
  deleteDebtEntry,
  ENTRY_LABEL,
  getDebts,
  KIND_LABEL,
  outstanding,
  type DebtAccount,
  type DebtEntryType,
  type DebtKind,
} from "@/lib/debts";
import { cacheGet, cacheSet } from "@/lib/localCache";

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const cleanNum = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
const fmtInput = (raw: string) => {
  const clean = raw.replace(/[^0-9.]/g, "");
  if (!clean) return "";
  const [i, ...d] = clean.split(".");
  const intFmt = Number(i || "0").toLocaleString("en-US");
  return d.length ? `${intFmt}.${d.join("").slice(0, 2)}` : intFmt;
};

type Filter = DebtKind | "settled";

/** What a new entry does to capital, in words, for the form hint. */
function effectHint(kind: DebtKind, type: DebtEntryType) {
  return capitalEffect(kind, type, 1) > 0 ? "بيتضاف لرأس المال" : "بيتخصم من رأس المال";
}

export default function DebtsPanel({
  today,
  authReady,
  onError,
}: {
  today: string;
  authReady: boolean;
  onError: (msg: string) => void;
}) {
  const [cached] = useState(() => cacheGet<DebtAccount[]>("debts"));
  const [accounts, setAccounts] = useState<DebtAccount[]>(cached ?? []);
  const [loaded, setLoaded] = useState(!!cached);
  const [filter, setFilter] = useState<Filter>("owedToUs");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New account form
  const [newKind, setNewKind] = useState<DebtKind | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Shared amount form (new account or an entry on an open account)
  const [entryFor, setEntryFor] = useState<{ id: string; type: DebtEntryType } | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!authReady) return;
    getDebts()
      .then((a) => {
        setAccounts(a);
        setLoaded(true);
      })
      .catch((err) => {
        if (!cached) onError(err instanceof Error ? err.message : String(err));
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);
  useEffect(() => {
    if (loaded) cacheSet("debts", accounts);
  }, [loaded, accounts]);

  const totals = useMemo(() => {
    let owedToUs = 0, weOwe = 0;
    for (const a of accounts) {
      const o = outstanding(a);
      if (a.kind === "owedToUs") owedToUs += Math.max(0, o);
      else weOwe += Math.max(0, o);
    }
    return { owedToUs, weOwe, net: owedToUs - weOwe };
  }, [accounts]);

  const list = accounts
    .filter((a) => {
      const o = outstanding(a);
      return filter === "settled" ? Math.abs(o) < 0.005 && a.entries.length > 0 : a.kind === filter && Math.abs(o) >= 0.005;
    })
    .sort((a, b) => outstanding(b) - outstanding(a));

  const counts = {
    owedToUs: accounts.filter((a) => a.kind === "owedToUs" && Math.abs(outstanding(a)) >= 0.005).length,
    weOwe: accounts.filter((a) => a.kind === "weOwe" && Math.abs(outstanding(a)) >= 0.005).length,
    settled: accounts.filter((a) => Math.abs(outstanding(a)) < 0.005 && a.entries.length > 0).length,
  };

  function resetForm() {
    setNewKind(null);
    setEntryFor(null);
    setName("");
    setPhone("");
    setAmount("");
    setNote("");
    setDate(today);
  }

  async function run(fn: () => Promise<{ accounts: DebtAccount[] }>) {
    setBusy(true);
    try {
      const out = await fn();
      setAccounts(out.accounts);
      resetForm();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  function saveNew() {
    const amt = cleanNum(amount);
    if (!newKind || !name.trim() || amt <= 0) return;
    const kind = newKind;
    run(() => addDebtEntry({ accountId: null, name, phone, kind, type: "draw", amount: amt, date, note })).then(() =>
      setFilter(kind)
    );
  }

  function saveEntry() {
    const amt = cleanNum(amount);
    if (!entryFor || amt <= 0) return;
    const { id, type } = entryFor;
    run(() => addDebtEntry({ accountId: id, type, amount: amt, date, note }));
  }

  const amountFields = (onSave: () => void, hint: string, cta: string) => (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2" dir="ltr">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-subtle">$</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(fmtInput(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && onSave()}
            placeholder="500"
            aria-label="المبلغ"
            className="field py-2.5 pl-7 pr-3 font-mono text-sm font-bold"
          />
        </div>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          aria-label="التاريخ"
          className="field px-2 py-2.5 font-mono text-[11px]"
        />
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" className="field px-3 py-2 text-xs" />
      <p className="text-[11px] text-subtle">{hint}</p>
      <button onClick={onSave} disabled={busy || cleanNum(amount) <= 0} className="btn-primary w-full py-2.5 text-xs">
        {busy ? "جارٍ الحفظ…" : cta}
      </button>
    </div>
  );

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <RefreshCw size={20} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="card relative overflow-hidden p-4">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="relative">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <HandCoins size={14} className="text-primary" /> المستحقات
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { l: "مديون لنا", v: usd(totals.owedToUs), c: "text-emerald-500" },
              { l: "مديون له", v: usd(totals.weOwe), c: "text-red-500" },
              { l: "الصافي", v: `${totals.net >= 0 ? "+" : "−"}${usd(Math.abs(totals.net))}`, c: totals.net >= 0 ? "text-ink" : "text-red-500" },
            ].map((k) => (
              <div key={k.l} className="rounded-xl bg-surface2 px-2.5 py-2.5 shadow-well">
                <p className="text-[10px] text-subtle">{k.l}</p>
                <p className={`mt-0.5 truncate font-mono text-sm font-bold ${k.c}`} dir="ltr">
                  {k.v}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["owedToUs", "weOwe"] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  resetForm();
                  setNewKind(newKind === k ? null : k);
                }}
                className={`btn-ghost py-2.5 text-xs ${
                  newKind === k ? (k === "owedToUs" ? "border-emerald-500/60 text-emerald-500" : "border-red-500/60 text-red-500") : ""
                }`}
              >
                <Plus size={14} /> {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <AnimatePresence initial={false}>
            {newKind && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-2 rounded-2xl bg-surface2 p-3 shadow-well">
                  <p className="text-[11px] text-muted">
                    {newKind === "owedToUs" ? "شخص أخد مننا فلوس وحيرجعها" : "شخص إدانا فلوس وحنرجعها ليه"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" className="field px-3 py-2.5 text-sm" />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="رقم الهاتف (اختياري)"
                      inputMode="tel"
                      dir="ltr"
                      className="field px-3 py-2.5 font-mono text-xs"
                    />
                  </div>
                  {amountFields(saveNew, effectHint(newKind, "draw"), `حفظ — ${KIND_LABEL[newKind]}`)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Filter */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/60 bg-surface p-1 shadow-soft">
        {(
          [
            ["owedToUs", "مديون لنا"],
            ["weOwe", "مديون له"],
            ["settled", "مسدد"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-xl py-2 text-xs font-semibold transition-colors ${
              filter === k ? "bg-primary text-white shadow-soft" : "text-muted hover:text-ink"
            }`}
          >
            {l} <span className="opacity-70">({counts[k]})</span>
          </button>
        ))}
      </div>

      {/* Accounts */}
      {list.length === 0 ? (
        <div className="card p-8 text-center text-xs text-subtle">ما في أحد هنا.</div>
      ) : (
        <div className="space-y-2.5">
          {list.map((a) => {
            const o = outstanding(a);
            const isOpen = open === a.id;
            const tone = a.kind === "owedToUs" ? "text-emerald-500" : "text-red-500";
            // balance after each entry, oldest → newest
            let running = 0;
            const withBal = [...a.entries]
              .reverse()
              .map((e) => ({ e, bal: (running += e.type === "draw" ? e.amount : -e.amount) }))
              .reverse();
            return (
              <div key={a.id} className="card overflow-hidden p-0">
                <button onClick={() => setOpen(isOpen ? null : a.id)} className="flex w-full items-center gap-3 px-4 py-3 text-right">
                  <span className="flex size-9 items-center justify-center rounded-full bg-surface2 text-muted shadow-well">
                    <UserRound size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{a.name}</p>
                    <p className="text-[11px] text-subtle">
                      {KIND_LABEL[a.kind]} · {a.entries.length} حركة
                      {a.entries[0] && (
                        <>
                          {" "}
                          · <span dir="ltr" className="font-mono">{a.entries[0].date}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className={`font-mono text-base font-extrabold ${Math.abs(o) < 0.005 ? "text-subtle" : tone}`} dir="ltr">
                    {usd(Math.abs(o))}
                  </span>
                  <ChevronDown size={16} className={`text-subtle transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 border-t border-border/60 px-4 py-3">
                        {a.phone && (
                          <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1.5 text-[11px] text-primary" dir="ltr">
                            <Phone size={12} /> {a.phone}
                          </a>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {(["payment", "draw"] as const).map((t) => {
                            const active = entryFor?.id === a.id && entryFor.type === t;
                            return (
                              <button
                                key={t}
                                onClick={() => {
                                  setAmount("");
                                  setNote("");
                                  setDate(today);
                                  setEntryFor(active ? null : { id: a.id, type: t });
                                }}
                                className={`btn-ghost py-2.5 text-xs ${
                                  active ? (t === "payment" ? "border-emerald-500/60 text-emerald-500" : "border-red-500/60 text-red-500") : ""
                                }`}
                              >
                                {t === "payment" ? "تسجيل سداد" : "تسجيل سحب"}
                              </button>
                            );
                          })}
                        </div>
                        {entryFor?.id === a.id &&
                          amountFields(
                            saveEntry,
                            `${entryFor.type === "payment" ? "السداد بيقلل الدين" : "السحب بيزيد الدين"} · ${effectHint(a.kind, entryFor.type)}`,
                            entryFor.type === "payment" ? "حفظ السداد" : "حفظ السحب"
                          )}

                        <ul className="space-y-1.5">
                          {withBal.map(({ e, bal }) => {
                            const cap = capitalEffect(a.kind, e.type, e.amount);
                            return (
                              <li key={e.id} className="flex items-center gap-2.5 rounded-xl border border-border/60 px-3 py-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    e.type === "payment" ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-600"
                                  }`}
                                >
                                  {ENTRY_LABEL[e.type]}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs text-ink">{e.note || ENTRY_LABEL[e.type]}</p>
                                  <p className="font-mono text-[10px] text-subtle" dir="ltr">
                                    {e.date} · owed {usd(bal, 0)} · capital {cap >= 0 ? "+" : "−"}
                                    {usd(Math.abs(cap), 0)}
                                  </p>
                                </div>
                                <span className="font-mono text-xs font-bold text-ink" dir="ltr">
                                  {usd(e.amount)}
                                </span>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`حذف ${ENTRY_LABEL[e.type]} ${usd(e.amount)}؟ بيترجع أثره على رأس المال.`))
                                      run(() => deleteDebtEntry(a.id, e.id));
                                  }}
                                  disabled={busy}
                                  aria-label="حذف"
                                  className="rounded-lg p-1 text-subtle hover:bg-red-500/10 hover:text-red-500"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </li>
                            );
                          })}
                        </ul>

                        <button
                          onClick={() => {
                            if (window.confirm(`حذف حساب ${a.name} بكل حركاته؟ بيترجع أثرها على رأس المال.`)) run(() => deleteDebtAccount(a.id));
                          }}
                          disabled={busy}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:underline"
                        >
                          <X size={12} /> حذف الحساب
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
