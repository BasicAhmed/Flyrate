"use client";

import { useRef } from "react";
import { Zap, TrendingUp, ShieldCheck, GraduationCap, Globe2, MessageCircle } from "lucide-react";
import Reveal from "./Reveal";

const ITEMS = [
  { icon: Zap, title: "تحويل في دقائق", desc: "متوسط التحويل أقل من 30 دقيقة — بدون فرع ولا انتظار.", big: true },
  { icon: TrendingUp, title: "سعر من السوق مباشرة", desc: "أسعارنا مربوطة بالسوق وتتحدث تلقائياً كل دقائق." },
  { icon: ShieldCheck, title: "آمن ومؤكد", desc: "كل طلب نأكده معاك قبل ما تتحرك أي فلوس." },
  { icon: Globe2, title: "8 دول", desc: "السودان، مصر، السعودية، الإمارات، قطر، جنوب أفريقيا، ماليزيا وكينيا." },
  { icon: GraduationCap, title: "معمول للطلاب", desc: "مبالغ صغيرة أو كبيرة — نفس السرعة ونفس الاهتمام." },
  { icon: MessageCircle, title: "ناس حقيقيين في واتساب", desc: "ردود من شخص حقيقي، مو نظام تذاكر.", big: true },
];

/** Card with a soft orange spotlight that follows the pointer. */
function Tile({ item, i }: { item: (typeof ITEMS)[number]; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const Icon = item.icon;
  return (
    <Reveal delay={i * 0.06} className={item.big ? "sm:col-span-2" : ""}>
      <div
        ref={ref}
        onPointerMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
          ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
        }}
        className="group relative h-full overflow-hidden rounded-3xl border border-border/70 bg-surface p-6 shadow-card transition-transform duration-300 hover:-translate-y-1"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: "radial-gradient(260px circle at var(--mx,50%) var(--my,50%), rgba(254,82,0,0.16), transparent 70%)" }}
        />
        {item.big && (
          <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 size-48 rounded-full bg-primary/10 blur-2xl" />
        )}
        <div className="relative">
          <div className="inline-flex rounded-2xl bg-primary/10 p-3 text-primary transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
            <Icon size={22} />
          </div>
          <h3 className={`mt-4 font-display font-semibold text-ink ${item.big ? "text-xl" : "text-base"}`}>{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{item.desc}</p>
        </div>
      </div>
    </Reveal>
  );
}

export default function WhyChoose() {
  return (
    <section id="why" className="border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <Reveal>
          <p className="eyebrow">لماذا FlyRate</p>
          <h2 className="section-heading mt-3">سريع، واضح، ومعمول لينا.</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item, i) => (
            <Tile key={item.title} item={item} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
