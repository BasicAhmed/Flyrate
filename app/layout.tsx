import type { Metadata } from "next";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlyRate Exchange — تحويل أموال أسرع وأفضل سعر للطلاب",
  description:
    "أرسل واستقبل الأموال بين السودان ومصر والسعودية وقطر والإمارات، مع تحويلات إلى جنوب أفريقيا وماليزيا و USDT. أفضل الأسعار، تحويل سريع، دعم عبر واتساب.",
  metadataBase: new URL("https://flyrate.exchange"),
  icons: {
    icon: "/icon.png",
  },
  openGraph: {
    title: "FlyRate Exchange",
    description: "تحويل أموال سريع وعادل للطلاب الدوليين.",
    type: "website",
    images: ["/logo-full.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-ink font-body antialiased transition-colors duration-300 selection:bg-primary selection:text-bg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
