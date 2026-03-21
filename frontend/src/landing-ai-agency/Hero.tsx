import { motion } from "motion/react";
import { ArrowUpRight, Play } from "lucide-react";
import { BlurText } from "./BlurText";
import { Button } from "./ui/button";

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8.mp4";

export function Hero() {
  return (
    <section className="relative flex min-h-[1000px] flex-col overflow-visible bg-black">
      <video
        className="absolute top-[20%] z-0 h-auto w-full object-contain"
        src={HERO_VIDEO}
        autoPlay
        muted
        playsInline
        loop
        poster="/images/hero_bg.jpeg"
      />
      <div className="absolute inset-0 z-0 bg-black/5" />
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1] h-[300px]"
        style={{
          background: "linear-gradient(to bottom, transparent, black)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 pb-8 pt-[150px] text-center">
        <div className="liquid-glass mb-10 inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2">
          <span className="rounded-full bg-white px-3 py-1 font-body text-xs font-semibold text-black">New</span>
          <span className="font-body text-sm font-medium text-white/90">Introducing AI-powered web design.</span>
        </div>

        <BlurText text="The Website Your Brand Deserves" />

        <motion.p
          className="ai-body mx-auto mt-8 max-w-xl text-base md:text-lg"
          initial={{ opacity: 0, filter: "blur(8px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          Stunning design. Blazing performance. Built by AI, refined by experts. This is web design, wildly reimagined.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
        >
          <Button type="button" className="gap-2">
            Get Started
            <ArrowUpRight className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="inline-flex items-center gap-2 font-body text-sm font-medium text-white/80 hover:text-white"
          >
            <Play className="h-4 w-4 fill-current" />
            Watch the Film
          </button>
        </motion.div>

        <div className="mt-auto w-full pt-16 pb-8" aria-hidden />
      </div>
    </section>
  );
}
