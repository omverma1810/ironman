import { CTABanner } from "@/components/landing/CTABanner";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Marquee } from "@/components/landing/Marquee";
import { Navbar } from "@/components/landing/Navbar";
import { NumberedFeatures } from "@/components/landing/NumberedFeatures";
import { PricingTeaser } from "@/components/landing/PricingTeaser";
import { ServicesGrid } from "@/components/landing/ServicesGrid";
import { Testimonials } from "@/components/landing/Testimonials";
import { WhatsAppFloat } from "@/components/landing/WhatsAppFloat";

/**
 * The public marketing landing page. CTAs link straight into the real
 * booking (`/book`), account/order-history (`/account`) and legal
 * (`/privacy`, `/terms`) routes that already ship elsewhere in this app —
 * there is no separate mock booking form or stub tracking lookup here,
 * since a working one already exists.
 */
export default function Home() {
  return (
    <div className="bg-landing-paper">
      <Navbar />
      <Marquee />
      <main>
        <Hero />
        <ServicesGrid />
        <NumberedFeatures />
        <HowItWorks />
        <Testimonials />
        <PricingTeaser />
        <FAQ />
        <CTABanner />
      </main>
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
