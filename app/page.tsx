import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroSection } from "@/components/sections/hero-section";
import { TrustSection } from "@/components/sections/trust-section";
import { FeaturesGrid } from "@/components/sections/features-grid";
import { HowItWorks } from "@/components/sections/how-it-works";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fafafa] overflow-hidden selection:bg-orange-100 selection:text-orange-900">
      <Navbar />
      <main className="pt-32 pb-20">
        <HeroSection />
        <TrustSection />
        <FeaturesGrid />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
