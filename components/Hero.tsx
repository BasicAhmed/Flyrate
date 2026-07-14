"use client";

import { motion } from "framer-motion";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/whatsapp";

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-grid-fade">
      <div className="container-page flex flex-col items-center py-20 text-center sm:py-28">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="eyebrow"
        >
          موثوق من الطلاب في 7 دول
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.2] tracking-tight text-ink sm:text-6xl"
        >
          حول قروشك أسرع،
          <br />
          بسعر <span className="text-primary">يستاهل فعلاً.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-6 max-w-xl text-base text-muted sm:text-lg"
        >
          FlyRate يحول قروشك بين السودان ومصر والسعودية والإمارات من جهة،
          وجنوب أفريقيا وماليزيا من جهة أخرى — مصمم للطلاب اللي محتاجين
          سرعة وسعر ظابط، من دون جرجرة.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-9 flex flex-col gap-3 sm:flex-row"
        >
          <a
            href="#calculator"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-bg transition-transform hover:scale-[1.03]"
          >
            احسب التحويل <ArrowLeft size={16} />
          </a>
          <a
            href={whatsappLink("مرحباً FlyRate Exchange، عندي استفسار عن تحويل أموال.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-7 py-3.5 text-sm font-semibold text-ink transition-colors hover:border-primary"
          >
            <MessageCircle size={16} className="text-primary" /> تواصل عبر واتساب
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-14 grid w-full max-w-2xl grid-cols-3 gap-6 border-t border-border pt-8 text-center"
        >
          {[
            ["7", "دول"],
            ["أقل من 30 دقيقة", "متوسط التحويل"],
            ["واتساب", "دعم فوري"],
          ].map(([stat, label]) => (
            <div key={label}>
              <div className="font-display text-xl font-bold text-ink sm:text-2xl" dir="ltr">
                {stat}
              </div>
              <div className="mt-1 text-xs text-subtle">{label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
