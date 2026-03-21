import { BarChart3, Palette, Shield, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Card = { icon: LucideIcon; title: string; desc: string };

const CARDS: Card[] = [
  {
    icon: Zap,
    title: "Days, Not Months",
    desc: "Concept to launch at a pace that redefines fast.",
  },
  {
    icon: Palette,
    title: "Obsessively Crafted",
    desc: "Every detail considered. Every element refined.",
  },
  {
    icon: BarChart3,
    title: "Built to Convert",
    desc: "Layouts informed by data. Decisions backed by performance.",
  },
  {
    icon: Shield,
    title: "Secure by Default",
    desc: "Enterprise-grade protection comes standard.",
  },
];

export function FeaturesGrid() {
  return (
    <section className="bg-black px-6 py-24 md:px-16 lg:px-24">
      <div className="mx-auto max-w-6xl">
        <span className="liquid-glass ai-section-badge">Why Us</span>
        <h2 className="ai-section-heading mt-2">The difference is everything.</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {CARDS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="liquid-glass rounded-2xl p-6">
              <div className="liquid-glass-strong flex h-10 w-10 items-center justify-center rounded-full">
                <Icon className="h-5 w-5 text-white" aria-hidden />
              </div>
              <h3 className="mt-4 font-heading text-lg italic text-white">{title}</h3>
              <p className="ai-body mt-2">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
