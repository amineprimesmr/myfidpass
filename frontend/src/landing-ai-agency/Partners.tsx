const NAMES = ["Stripe", "Vercel", "Linear", "Notion", "Figma"];

export function Partners() {
  return (
    <div className="flex flex-col items-center pb-8">
      <div className="liquid-glass ai-section-badge">Trusted by the teams behind</div>
      <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
        {NAMES.map((name) => (
          <span key={name} className="font-heading text-2xl italic text-white md:text-3xl">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
