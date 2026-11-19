import { ArrowLeft } from "lucide-react";
import Reveal from "./Reveal";

/** Closing call-to-action before the footer. */
export default function CTABand() {
  return (
    <section className="py-16 sm:py-20">
      <div className="container-page">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] bg-brand-gradient px-6 py-12 text-center text-white shadow-[0_30px_60px_-30px_rgba(254,82,0,0.9)] sm:px-12 sm:py-16">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 animate-drift rounded-full bg-white/15 blur-2xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-black/10 blur-2xl" />
            <svg aria-hidden viewBox="0 0 600 120" className="pointer-events-none absolute inset-x-0 top-1/2 w-full -translate-y-1/2 opacity-30">
              <path id="cta-arc" d="M-20,100 Q300,-40 620,100" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="2 10" className="animate-dash-flow" />
              <path d="M7,0 L-5,-5 L-2,0 L-5,5 Z" fill="#fff">
                <animateMotion dur="7s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#cta-arc" />
                </animateMotion>
              </path>
            </svg>
            <div className="relative">
              <h2 className="font-display text-3xl font-bold leading-tight sm:text-5xl">جاهز تحوّل؟</h2>
              <p className="mx-auto mt-3 max-w-md text-white/85">احسب المبلغ في ثواني، واطلب على واتساب، والفلوس توصل في دقائق.</p>
              <a
                href="#calculator"
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-primary shadow-lg transition-transform hover:scale-[1.04]"
              >
                ابدأ التحويل الآن
                <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
