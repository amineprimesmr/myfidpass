import { Navbar } from "./Navbar";
import { Hero } from "./Hero";
import { Partners } from "./Partners";
import { HowItWorks } from "./HowItWorks";
import { FeaturesChess } from "./FeaturesChess";
import { FeaturesGrid } from "./FeaturesGrid";
import { Stats } from "./Stats";
import { Testimonials } from "./Testimonials";
import { CtaFooter } from "./CtaFooter";

export default function App() {
  return (
    <div className="overflow-visible bg-black text-white">
      <Navbar />
      <main>
        <Hero />
        <Partners />
        <HowItWorks />
        <FeaturesChess />
        <FeaturesGrid />
        <Stats />
        <Testimonials />
        <CtaFooter />
      </main>
    </div>
  );
}
