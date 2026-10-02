"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { RefreshCw } from "lucide-react";
import { auth, firebaseEnabled } from "@/lib/firebase";
import { cacheClear, cacheGet, cacheSet } from "@/lib/localCache";
import AdminLogin from "./Login";
import AdminDashboard from "./Dashboard";

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  // Signed in last time on this device → open the dashboard straight away
  // with cached data while Firebase restores the session in the background.
  const [optimistic, setOptimistic] = useState(false);

  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      setChecking(false);
      return;
    }
    setOptimistic(cacheGet<boolean>("authed") === true);
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
      if (u) cacheSet("authed", true);
      else cacheClear(); // signed out / session expired — drop cached data
    });
  }, []);

  if (!firebaseEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="font-display text-xl font-semibold text-ink">Firebase غير مُفعّل</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            أضف مفاتيح مشروع Firebase إلى متغيرات البيئة في Vercel (راجع <code>.env.example</code>) ثم أعد النشر
            لتفعيل لوحة الإدارة.
          </p>
        </div>
      </div>
    );
  }

  if (user || (checking && optimistic)) {
    return (
      <AdminDashboard
        authReady={!!user}
        onSignOut={() => {
          cacheClear();
          signOut(auth!);
        }}
      />
    );
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-primary" />
      </div>
    );
  }

  return <AdminLogin />;
}
