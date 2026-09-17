import { AboutSection } from "@/components/landing/AboutSection";
import { CTABanner } from "@/components/landing/CTABanner";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { ImpactStats } from "@/components/landing/ImpactStats";
import { Marquee } from "@/components/landing/Marquee";
import { Navbar } from "@/components/landing/Navbar";
import { NumberedFeatures } from "@/components/landing/NumberedFeatures";
import { PricingTeaser } from "@/components/landing/PricingTeaser";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { ServicesGrid } from "@/components/landing/ServicesGrid";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
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
    <SmoothScroll>
      <div className="bg-landing-paper">
        <Navbar />
        <Marquee />
        <main>
          <Hero />
          <ImpactStats />
          <ServicesGrid />
          <ProcessSection />
          <NumberedFeatures />
          <AboutSection />
          <Testimonials />
          <PricingTeaser />
          <FAQ />
          <CTABanner />
        </main>
        <Footer />
        <WhatsAppFloat />
      </div>
    </SmoothScroll>
  );
}
