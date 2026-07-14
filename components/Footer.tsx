import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="container-page flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2" dir="ltr">
          <Image src="/logo-icon.png" alt="FlyRate" width={28} height={23} className="h-6 w-auto" />
          <span className="font-display text-base font-bold text-ink">
            Fly<span className="text-primary">Rate</span> Exchange
          </span>
        </div>
        <p className="text-xs text-subtle">
          © {new Date().getFullYear()} FlyRate Exchange. الأسعار المعروضة تقريبية ويتم تأكيدها وقت الطلب.
        </p>
      </div>
    </footer>
  );
}
