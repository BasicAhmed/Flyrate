"use client";

import { useState } from "react";
import Image from "next/image";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Lock, Mail, LogIn } from "lucide-react";
import { auth } from "@/lib/firebase";

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth/wrong-password": "كلمة المرور غير صحيحة.",
  "auth/user-not-found": "ما في حساب بهذا البريد — أضفه من Firebase → Authentication → Users.",
  "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
  "auth/operation-not-allowed": "تسجيل الدخول بالبريد غير مفعّل — فعّل Email/Password في Firebase → Authentication.",
  "auth/configuration-not-found": "Authentication غير مفعّل في مشروع Firebase — اضغط Get started في Authentication.",
  "auth/invalid-api-key": "مفتاح API غلط — راجع FIREBASE_API_KEY في Vercel.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "مفتاح API غلط — راجع FIREBASE_API_KEY في Vercel.",
  "auth/unauthorized-domain": "الدومين غير مسموح — أضفه في Firebase → Authentication → Settings → Authorized domains.",
  "auth/too-many-requests": "محاولات كثيرة — انتظر شوية وجرب تاني.",
  "auth/network-request-failed": "مشكلة في الاتصال بالإنترنت.",
};

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
      </div>

      <div className="card w-full max-w-sm p-6 shadow-lift sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-2xl border border-border bg-surface2 p-2.5 shadow-glow-lg">
            <Image src="/logo-icon.png" alt="FlyRate" width={52} height={44} className="h-11 w-auto" priority />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold text-ink">لوحة الإدارة</h1>
          <p className="mt-1 text-sm text-muted">إدارة أسعار الصرف والأرباح لـ FlyRate.</p>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setBusy(true);
            try {
              await signInWithEmailAndPassword(auth!, email, password);
            } catch (err) {
              const code = (err as { code?: string })?.code ?? "unknown";
              setError(`${AUTH_ERRORS[code] ?? "تعذر تسجيل الدخول."} (${code})`);
            }
            setBusy(false);
          }}
          className="mt-7 space-y-3"
        >
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute inset-y-0 left-3.5 my-auto text-subtle" />
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="field py-3 pl-10 pr-3.5 text-sm"
            />
          </div>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute inset-y-0 left-3.5 my-auto text-subtle" />
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="field py-3 pl-10 pr-3.5 text-sm"
            />
          </div>
          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-500">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn-primary w-full py-3.5 text-sm">
            <LogIn size={16} /> {busy ? "جارٍ الدخول…" : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </div>
  );
}
