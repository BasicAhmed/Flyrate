import { getRates } from "@/lib/rates";
import { getDisabledFlows } from "@/lib/flows";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import RateTicker from "@/components/RateTicker";
import RatesTable from "@/components/RatesTable";
import Calculator from "@/components/Calculator";
import WhyChoose from "@/components/WhyChoose";
import HowItWorks from "@/components/HowItWorks";
import Reviews from "@/components/Reviews";
import FAQ from "@/components/FAQ";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import { LiveRatesProvider } from "@/components/LiveRates";

export const revalidate = 60; // re-fetch rates at most once a minute

export default async function Home() {
  const [rates, disabledFlows] = await Promise.all([getRates(), getDisabledFlows()]);

  return (
    <LiveRatesProvider initialRates={rates} initialFlows={disabledFlows}>
      <Nav />
      <Hero rates={rates} disabledFlows={disabledFlows} />
      <Calculator rates={rates} disabledFlows={disabledFlows} />
      <RateTicker rates={rates} />
      <HowItWorks />
      <RatesTable rates={rates} disabledFlows={disabledFlows} />
      <WhyChoose />
      <Reviews />
      <FAQ />
      <Contact />
      <Footer />
      <FloatingWhatsApp />
    </LiveRatesProvider>
  );
}
