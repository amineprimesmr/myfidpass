import { FadingVideo } from "./FadingVideo.jsx";
import { IconMaterialImage, IconMaterialLightbulb, IconMaterialMovie } from "./LandingIcons.jsx";

const CAP_V =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4";

const CARDS = [
  {
    title: "AI Scenery",
    body: "AI analyzes your product to create indistinguishable natural environments — from Icelandic cliffs to misty forests.",
    tags: ["Natural Context", "Photo Realism", "Infinite Settings", "Eco-Vibe"],
    Icon: IconMaterialImage,
  },
  {
    title: "Batch Production",
    body: "Style your entire product line in minutes. Create a unified visual identity for catalogues and social media without weeks of retouching.",
    tags: ["Scale Fast", "Visual Consistency", "Time Saver", "Ready to Post"],
    Icon: IconMaterialMovie,
  },
  {
    title: "Smart Lighting",
    body: "Automatic lighting and material adjustment. Achieve flawless integration with realistic shadows and sunlight.",
    tags: ["Ray Tracing", "Physical Shadows", "Studio Quality", "Sunlight Sync"],
    Icon: IconMaterialLightbulb,
  },
];

export function CapabilitiesSection() {
  return (
    <section
      id="capabilities"
      className="relative min-h-screen overflow-hidden bg-black"
    >
      <FadingVideo
        src={CAP_V}
        className="absolute inset-0 z-0 h-full w-full object-cover"
      />
      <div className="relative z-10 flex min-h-screen flex-col px-8 pb-10 pt-24 md:px-16 lg:px-20">
        <header className="mb-auto">
          <p className="font-body mb-6 text-sm text-white/80">// Capabilities</p>
          <h2 className="font-heading text-6xl italic leading-[0.9] tracking-[-3px] text-white md:text-7xl lg:text-[6rem]">
            Production
            <br />
            evolved
          </h2>
        </header>
        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {CARDS.map((c) => (
            <div
              key={c.title}
              className="liquid-glass flex min-h-[360px] flex-col rounded-[1.25rem] p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="liquid-glass flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[0.75rem]">
                  <c.Icon className="h-6 w-6 text-white" />
                </div>
                <div className="flex max-w-[70%] flex-wrap justify-end gap-1.5">
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="liquid-glass font-body text-[11px] whitespace-nowrap rounded-full px-3 py-1 text-white/90"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1" />
              <div className="mt-6">
                <h3 className="font-heading text-3xl italic leading-none tracking-[-1px] text-white md:text-4xl">
                  {c.title}
                </h3>
                <p className="font-body mt-3 max-w-[32ch] text-sm font-light leading-snug text-white/90">
                  {c.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
