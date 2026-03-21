import { HlsVideo } from "./HlsVideo";
import { Button } from "./ui/button";

const MUX = "https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8";

export function CtaFooter() {
  return (
    <section id="pricing" className="relative overflow-hidden bg-black pb-16 pt-24">
      <HlsVideo src={MUX} className="absolute inset-0 z-0 h-full w-full object-cover opacity-50" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[200px] bg-gradient-to-b from-black to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[200px] bg-gradient-to-t from-black to-transparent"
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <h2 className="font-heading text-5xl italic tracking-tight text-white md:text-6xl lg:text-7xl">
          Your next website starts here.
        </h2>
        <p className="ai-body mx-auto mt-6 max-w-md">
          Book a free strategy call. See what AI-powered design can do.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button type="button">Book a Call</Button>
          <Button type="button" variant="solid">
            View Pricing
          </Button>
        </div>

        <footer className="mt-32 border-t border-white/10 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="font-body text-xs text-white/40">© 2026 Studio</p>
            <div className="flex gap-6 font-body text-xs text-white/40">
              <a href="#privacy" className="hover:text-white/70">
                Privacy
              </a>
              <a href="#terms" className="hover:text-white/70">
                Terms
              </a>
              <a href="#contact" className="hover:text-white/70">
                Contact
              </a>
            </div>
          </div>
        </footer>
      </div>
    </section>
  );
}
