import { Zap, TrendingUp, ShieldCheck, GraduationCap, Globe2, MessageCircle } from "lucide-react";

const ITEMS = [
  {
    icon: Zap,
    title: "تحويل سريع",
    desc: "متوسط التحويل أقل من 30 دقيقة — بدون زيارة فرع أو انتظار.",
  },
  {
    icon: TrendingUp,
    title: "أفضل سعر صرف",
    desc: "أسعار شراء وبيع واضحة، تتحدث بانتظام، بدون هامش مخفي.",
  },
  {
    icon: ShieldCheck,
    title: "تحويلات آمنة",
    desc: "كل طلب يتم تأكيده معك مباشرة قبل ما تتحرك أي أموال.",
  },
  {
    icon: GraduationCap,
    title: "موثوق من الطلاب",
    desc: "مصمم خصيصاً للطريقة اللي فعلاً يحول فيها الطلاب الدوليون أموالهم.",
  },
  {
    icon: Globe2,
    title: "دول متعددة",
    desc: "7 دول مدعومة: السودان ومصر والسعودية والإمارات وقطر وجنوب أفريقيا وماليزيا.",
  },
  {
    icon: MessageCircle,
    title: "دعم فوري عبر واتساب",
    desc: "ردود من شخص حقيقي — مو نظام تذاكر آلي.",
  },
];

export default function WhyChoose() {
  return (
    <section id="why" className="border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <p className="eyebrow">لماذا FlyRate</p>
        <h2 className="section-heading mt-3">مصمم للطريقة اللي فعلاً يحول فيها الطلاب أموالهم.</h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/50"
            >
              <div className="inline-flex rounded-xl bg-primary/10 p-2.5 text-primary">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
