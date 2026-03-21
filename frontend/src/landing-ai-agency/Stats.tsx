import { HlsVideo } from "./HlsVideo";

const MUX = "https://stream.mux.com/NcU3HlHeF7CUL86azTTzpy3Tlb00d6iF3BmCdFslMJYM.m3u8";

const STATS = [
  { value: "200+", label: "Sites launched" },
  { value: "98%", label: "Client satisfaction" },
  { value: "3.2x", label: "More conversions" },
  { value: "5 days", label: "Average delivery" },
];

export function Stats() {
  return (
    <section className="relative min-h-[480px] overflow-hidden bg-black py-24">
      <HlsVideo
        src={MUX}
        className="absolute inset-0 z-0 h-full w-full object-cover opacity-50"
        desaturate
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[200px] bg-gradient-to-b from-black to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[200px] bg-gradient-to-t from-black to-transparent"
        aria-hidden
      />
      <div className="relative z-10 mx-auto max-w-5xl px-6 md:px-12">
        <div className="liquid-glass grid grid-cols-2 gap-8 rounded-3xl p-12 text-center md:p-16 lg:grid-cols-4">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <p className="font-heading text-4xl italic text-white md:text-5xl lg:text-6xl">{value}</p>
              <p className="ai-body mt-2">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
