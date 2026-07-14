import { MessageCircle, Mail, Clock } from "lucide-react";
import { whatsappLink } from "@/lib/whatsapp";

export default function Contact() {
  return (
    <section id="contact" className="border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <div className="grid gap-10 rounded-3xl border border-border bg-surface p-8 sm:p-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow">تواصل معنا</p>
            <h2 className="section-heading mt-3">تكلم معنا مباشرة.</h2>
            <p className="mt-3 max-w-md text-muted">
              ردود حقيقية، مو تذاكر آلية. تواصل معنا في أي وقت خلال ساعات
              العمل وبنرد عليك بسرعة.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href={whatsappLink("مرحباً FlyRate Exchange، عندي سؤال.")}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-xl border border-border bg-surface2 p-4 transition-colors hover:border-primary"
            >
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <MessageCircle size={20} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">واتساب</div>
                <div className="text-sm text-muted" dir="ltr">+974 5113 1080</div>
              </div>
            </a>

            <a
              href="mailto:hello@flyrate.exchange"
              className="flex items-center gap-4 rounded-xl border border-border bg-surface2 p-4 transition-colors hover:border-primary"
            >
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <Mail size={20} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">البريد الإلكتروني</div>
                <div className="text-sm text-muted" dir="ltr">hello@flyrate.exchange</div>
              </div>
            </a>

            <div className="flex items-center gap-4 rounded-xl border border-border bg-surface2 p-4">
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <Clock size={20} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">ساعات العمل</div>
                <div className="text-sm text-muted">السبت–الخميس، 9:00–22:00 (توقيت غرينتش+2)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
