"use client";

import { motion } from "framer-motion";
import { Calculator, MessageCircle, Wallet, BadgeCheck } from "lucide-react";
import Reveal from "./Reveal";

const STEPS = [
  { icon: Calculator, title: "احسب", desc: "اختار الممر والمبلغ وشوف السعر والمبلغ اللي حيوصل بالضبط." },
  { icon: MessageCircle, title: "اطلب في واتساب", desc: "زر «اطلب الآن» يفتح واتساب وتفاصيلك معبّاة تلقائياً." },
  { icon: Wallet, title: "ادفع", desc: "نأكد طلبك ونرسل لك تفاصيل الدفع من طرفك." },
  { icon: BadgeCheck, title: "استلم", desc: "المستلم ياخد المبلغ بعملته — في أقل من 30 دقيقة." },
];

export default function HowItWorks() {
  return (
    <section id="how" className="relative border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <Reveal>
          <p className="eyebrow">آلية العمل</p>
          <h2 className="section-heading mt-3">أربع خطوات، ودقائق بس.</h2>
        </Reveal>

        <div className="relative mt-12">
          {/* connecting line — draws itself when the section scrolls in */}
          <div aria-hidden className="absolute right-[27px] top-2 bottom-2 w-px bg-border lg:inset-x-[12%] lg:right-auto lg:top-[27px] lg:bottom-auto lg:h-px lg:w-auto" />
          <motion.div
            aria-hidden
            initial={{ scaleY: 0, scaleX: 0 }}
            whileInView={{ scaleY: 1, scaleX: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1.6, ease: [0.65, 0, 0.35, 1] }}
            className="absolute right-[27px] top-2 bottom-2 w-px origin-top bg-gradient-to-b from-primary to-accent lg:inset-x-[12%] lg:right-auto lg:top-[27px] lg:bottom-auto lg:h-px lg:w-auto lg:origin-right lg:bg-gradient-to-l"
          />

          <ol className="relative grid gap-8 lg:grid-cols-4 lg:gap-6">
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: 0.25 + i * 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="flex gap-4 lg:flex-col lg:items-center lg:text-center"
              >
                <motion.span
                  initial={{ scale: 0.5 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.3 + i * 0.22 }}
                  className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-surface text-primary shadow-lift"
                >
                  <Icon size={22} />
                  <span className="absolute -left-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                </motion.span>
                <div className="pt-1 lg:pt-0">
                  <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">{desc}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
