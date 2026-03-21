const ITEMS = [
  {
    quote: "A complete rebuild in five days. We didn't think it was possible until we saw it live.",
    name: "Sarah Chen",
    role: "CEO Luminary",
  },
  {
    quote: "Conversions up 4x in the first month. The AI iterations are scary good.",
    name: "Marcus Webb",
    role: "Head of Growth Arcline",
  },
  {
    quote: "They didn't just design our site—they engineered an experience our customers actually love.",
    name: "Elena Voss",
    role: "Brand Director Helix",
  },
];

export function Testimonials() {
  return (
    <section id="work" className="bg-black px-6 py-24 md:px-16 lg:px-24">
      <div className="mx-auto max-w-6xl">
        <span className="liquid-glass ai-section-badge">What They Say</span>
        <h2 className="ai-section-heading mt-2">{"Don't take our word for it."}</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {ITEMS.map(({ quote, name, role }) => (
            <blockquote key={name} className="liquid-glass rounded-2xl p-8">
              <p className="font-body text-sm font-light italic text-white/80">{quote}</p>
              <footer className="mt-6">
                <p className="font-body text-sm font-medium text-white">{name}</p>
                <p className="font-body text-xs font-light text-white/50">{role}</p>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
