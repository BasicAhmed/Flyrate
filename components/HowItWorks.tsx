const STEPS = [
  {
    n: "٠١",
    title: "احسب",
    desc: "أدخل ممر التحويل والمبلغ عشان تشوف السعر والمبلغ المستلم بالضبط.",
  },
  {
    n: "٠٢",
    title: "تواصل عبر واتساب",
    desc: "زر «اطلب الآن» يفتح واتساب وتفاصيلك معبّاة تلقائياً.",
  },
  {
    n: "٠٣",
    title: "أرسل الدفع",
    desc: "نأكد طلبك ونشاركك تفاصيل الدفع من طرفك.",
  },
  {
    n: "٠٤",
    title: "استلم الأموال",
    desc: "المستلم يحصل على المبلغ بعملته المحلية — في أقل من 30 دقيقة.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <p className="eyebrow">آلية العمل</p>
        <h2 className="section-heading mt-3">أربع خطوات، من البداية للنهاية.</h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative pl-1">
              <div className="font-display text-4xl font-bold text-border" dir="ltr">{s.n}</div>
              <h3 className="mt-3 font-display text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.desc}</p>
              {i < STEPS.length - 1 && (
                <div className="mt-6 hidden h-px w-full bg-gradient-to-l from-border to-transparent lg:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
