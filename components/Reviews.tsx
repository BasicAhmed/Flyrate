"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star } from "lucide-react";

const REVIEWS = [
  {
    name: "مريم أ.",
    corridor: "السودان ← ماليزيا",
    quote:
      "كنت محتاجة أرسل فلوس الإيجار على عجل لكوالالمبور. FlyRate رد عليّ على واتساب خلال دقائق وخلصت المعاملة بنفس اليوم.",
  },
  {
    name: "يوسف ك.",
    corridor: "مصر ← جنوب أفريقيا",
    quote:
      "سعر أحسن من البنك وبدون أي أوراق. بس أرسل صورة من الحاسبة ويكملوا الباقي.",
  },
  {
    name: "لينا ح.",
    corridor: "السعودية ← ماليزيا",
    quote:
      "الأسعار واضحة وبدون مفاجآت. أتأكد من الجدول قبل كل تحويل ودايماً يطابق اللي أستلمه فعلاً.",
  },
  {
    name: "عمر س.",
    corridor: "الإمارات ← جنوب أفريقيا",
    quote:
      "كطالب، التوقيت مهم بالنسبالي. FlyRate الخدمة الوحيدة اللي استخدمتها بهالسرعة من دون ما أحس فيه أي خطر.",
  },
];

export default function Reviews() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % REVIEWS.length), 5500);
    return () => clearInterval(t);
  }, []);

  const r = REVIEWS[index];

  return (
    <section className="border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <p className="eyebrow">آراء العملاء</p>
        <h2 className="section-heading mt-3">شنو يقول الطلاب.</h2>

        <div className="mt-10 min-h-[220px] rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex gap-1 text-primary">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={16} fill="currentColor" strokeWidth={0} />
                ))}
              </div>
              <p className="mt-5 max-w-2xl font-display text-lg leading-relaxed text-ink sm:text-xl">
                «{r.quote}»
              </p>
              <div className="mt-6 text-sm">
                <span className="font-semibold text-ink">{r.name}</span>
                <span className="text-subtle"> — {r.corridor}</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-5 flex gap-2">
          {REVIEWS.map((_, i) => (
            <button
              key={i}
              aria-label={`عرض الرأي ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-primary" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
