"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "كم يستغرق التحويل؟",
    a: "متوسط التحويل أقل من 30 دقيقة بعد تأكيد الدفع. بعض الحالات قد تستغرق وقت أطول حسب مواعيد عمل البنوك.",
  },
  {
    q: "فيه حد أدنى أو أقصى للمبلغ؟",
    a: "الحد الأدنى والأقصى يختلف حسب الممر. أرسل لنا رسالة على واتساب بالمبلغ ونأكد لك فوراً.",
  },
  {
    q: "كيف أضمن إن السعر ما يتغير بعد ما أرسل الفلوس؟",
    a: "السعر اللي نأكده معك على واتساب هو نفس السعر اللي تحصل عليه. يكون مثبّت لتلك المعاملة.",
  },
  {
    q: "شنو العملات والدول المدعومة؟",
    a: "السودان ومصر والسعودية والإمارات وقطر من جهة، وجنوب أفريقيا وماليزيا من جهة أخرى — 7 دول بالكامل، موضحة في جدول الأسعار أعلاه.",
  },
  {
    q: "فيه رسوم إضافية؟",
    a: "لا توجد رسوم خدمة منفصلة — السعر اللي تشوفه في الحاسبة هو اللي يُطبّق فعلياً.",
  },
  {
    q: "كيف أبدأ طلب؟",
    a: "استخدم الحاسبة أعلاه، اضغط «اطلب الآن»، وواتساب يفتح وتفاصيلك جاهزة. نكمل الباقي من عندنا.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <p className="eyebrow">الأسئلة الشائعة</p>
        <h2 className="section-heading mt-3">أسئلة يتكرر سؤالها.</h2>

        <div className="mt-8 divide-y divide-border rounded-2xl border border-border">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4.5 text-right sm:px-6"
                >
                  <span className="font-medium text-ink">{item.q}</span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-subtle transition-transform ${
                      isOpen ? "rotate-180 text-primary" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
