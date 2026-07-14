import { getRates } from "@/lib/rates";
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

export const revalidate = 60; // re-fetch rates at most once a minute

export default async function Home() {
  const rates = await getRates();

  return (
    <>
      <Nav />
      <Hero />
      <RateTicker rates={rates} />
      <RatesTable rates={rates} />
      <Calculator rates={rates} />
      <WhyChoose />
      <HowItWorks />
      <Reviews />
      <FAQ />
      <Contact />
      <Footer />
    </>
  );
}
