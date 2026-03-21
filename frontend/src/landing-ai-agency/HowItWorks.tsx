import { ArrowUpRight } from "lucide-react";
import { HlsVideo } from "./HlsVideo";
import { Button } from "./ui/button";

const MUX =
  "https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8";

export function HowItWorks() {
  return (
    <section id="process" className="relative min-h-[700px] overflow-hidden bg-black py-32">
      <HlsVideo
        src={MUX}
        className="absolute inset-0 z-0 h-full w-full object-cover opacity-60"
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[200px] bg-gradient-to-b from-black to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[200px] bg-gradient-to-t from-black to-transparent"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-[500px] max-w-3xl flex-col items-center justify-center px-6 text-center md:px-16 lg:px-24">
        <span className="liquid-glass ai-section-badge">How It Works</span>
        <h2 className="ai-section-heading mt-2">You dream it. We ship it.</h2>
        <p className="ai-body mx-auto mt-6 max-w-lg">
          Share your vision. Our AI handles the rest—wireframes, design, code, launch. All in days, not quarters.
        </p>
        <Button type="button" className="mt-8 gap-2">
          Get Started
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
