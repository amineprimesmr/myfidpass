import { useState } from "react";
import { motion } from "framer-motion";
import { FadingVideo } from "./FadingVideo.jsx";
import { BlurText } from "./BlurText.jsx";
import { IconArrowUpRight, IconClockOutline, IconGlobeOutline, IconPlay } from "./LandingIcons.jsx";

const easeOut = [0, 0, 0.2, 1];
const HERO_V =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_080021_d598092b-c4c2-4e53-8e46-94cf9064cd50.mp4";

const enter = { filter: "blur(10px)", opacity: 0, y: 20 };

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "#capabilities", label: "Voyages" },
  { href: "#capabilities", label: "Worlds" },
  { href: "#capabilities", label: "Innovation" },
  { href: "/creer-ma-carte", label: "Plan Launch" },
];

export function HeroSection() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden bg-black">
      <FadingVideo
        src={HERO_V}
        className="absolute left-1/2 top-0 z-0 -translate-x-1/2 object-cover object-top"
        style={{ width: "120%", height: "120%" }}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <nav
          className="fixed top-4 z-50 flex w-full items-center justify-between px-8 lg:px-16"
          aria-label="Principale"
        >
          <a
            href="/"
            className="liquid-glass flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
            aria-label="Accueil"
          >
            <span className="font-heading text-xl italic text-white">a</span>
          </a>
          <div className="liquid-glass hidden items-center gap-0 rounded-full px-1.5 py-1.5 sm:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="font-body rounded-full px-3 py-2 text-sm font-medium text-white/90"
              >
                {l.label}
              </a>
            ))}
            <a
              href="/creer-ma-carte"
              className="ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 py-2 text-sm font-medium text-black"
            >
              Claim a Spot
              <IconArrowUpRight className="h-4 w-4" />
            </a>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((s) => !s)}
            className="liquid-glass flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-white sm:hidden"
            aria-expanded={mobileMenuOpen}
            aria-label="Ouvrir le menu"
          >
            <span className="text-lg leading-none">{mobileMenuOpen ? "×" : "☰"}</span>
          </button>
          <div className="hidden h-12 w-12 flex-shrink-0 sm:block" aria-hidden="true" />
        </nav>

        {mobileMenuOpen ? (
          <div className="fixed left-4 right-4 top-20 z-50 sm:hidden">
            <div className="liquid-glass rounded-[1.25rem] p-3">
              <div className="flex flex-col gap-1">
                {NAV_LINKS.map((l) => (
                  <a
                    key={`m-${l.label}`}
                    href={l.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="font-body rounded-full px-3 py-2 text-sm font-medium text-white/90"
                  >
                    {l.label}
                  </a>
                ))}
                <a
                  href="/creer-ma-carte"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-1 inline-flex items-center justify-center gap-1 rounded-full bg-white px-3 py-2 text-sm font-medium text-black"
                >
                  Claim a Spot
                  <IconArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        ) : null}

        <div className="font-body flex flex-1 flex-col items-center justify-center px-4 pt-24 text-center">
          <motion.div
            initial={enter}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4, ease: easeOut }}
            className="liquid-glass mb-0 inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3"
          >
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black">New</span>
            <span className="pr-1 text-sm text-white/90">Maiden Crewed Voyage to Mars Arrives 2026</span>
          </motion.div>

          <BlurText
            className="mt-6 text-6xl font-heading text-white leading-[0.8] tracking-[-4px] md:text-7xl lg:max-w-2xl lg:text-[5.5rem]"
            text="Venture Past Our Sky Across the Universe"
          />

          <motion.p
            initial={enter}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8, ease: easeOut }}
            className="font-body mt-4 max-w-2xl text-sm font-light leading-tight text-white md:text-base"
          >
            Discover the universe in ways once unimaginable. Our pioneering vessels and breakthrough
            engineering bring deep-space exploration within reach—secure and extraordinary.
          </motion.p>

          <motion.div
            initial={enter}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.1, ease: easeOut }}
            className="mt-6 flex items-center justify-center gap-6"
          >
            <a
              href="/creer-ma-carte"
              className="liquid-glass-strong inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white"
            >
              Start Your Voyage
              <IconArrowUpRight className="h-5 w-5" />
            </a>
            <a
              href="#capabilities"
              className="font-body inline-flex items-center gap-2 text-sm font-medium text-white"
            >
              View Liftoff
              <IconPlay className="h-4 w-4" />
            </a>
          </motion.div>

          <motion.div
            initial={enter}
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.3, ease: easeOut }}
            className="mt-8 flex flex-wrap items-stretch justify-center gap-4"
          >
            <div className="liquid-glass flex w-[220px] flex-col items-start rounded-[1.25rem] p-5 text-left">
              <div className="text-white">
                <IconClockOutline className="h-7 w-7" />
              </div>
              <p className="font-heading mt-6 text-4xl italic leading-none tracking-[-1px] text-white">
                34.5 Min
              </p>
              <p className="font-body mt-2 text-xs font-light text-white">Average Videos Watch Time</p>
            </div>
            <div className="liquid-glass flex w-[220px] flex-col items-start rounded-[1.25rem] p-5 text-left">
              <div className="text-white">
                <IconGlobeOutline className="h-7 w-7" />
              </div>
              <p className="font-heading mt-6 text-4xl italic leading-none tracking-[-1px] text-white">
                2.8B+
              </p>
              <p className="font-body mt-2 text-xs font-light text-white">Users Across the Globe</p>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={enter}
          animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.4, ease: easeOut }}
          className="font-body relative z-10 flex flex-col items-center gap-4 pb-8"
        >
          <div className="liquid-glass rounded-full px-3.5 py-1 text-xs font-medium text-white">
            Collaborating with top aerospace pioneers globally
          </div>
          <div className="flex flex-wrap items-center justify-center gap-8 text-2xl font-heading tracking-tight text-white md:gap-16 md:text-3xl">
            <span className="italic">Aeon</span>
            <span className="text-white/40" aria-hidden>
              ·
            </span>
            <span className="italic">Vela</span>
            <span className="text-white/40" aria-hidden>
              ·
            </span>
            <span className="italic">Apex</span>
            <span className="text-white/40" aria-hidden>
              ·
            </span>
            <span className="italic">Orbit</span>
            <span className="text-white/40" aria-hidden>
              ·
            </span>
            <span className="italic">Zeno</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
