import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const smoothstep = (t) => t * t * (3 - 2 * t);

const PHASE_3D_END = 0.48;
const ANGLE_MAX = 64;
// Zooms modérés : moins d’amplitude = le appareil reste cadrable en hauteur dans le viewport
const ZOOM_HERO = 1.88;
const ZOOM_HERO_NARROW = 1.48;
const ZOOM_FLAT = 1.04;
const ZOOM_SLIDE = 0.94;

const PHONE_IMAGES = ["/assets/mockupiphone.png", "/assets/iphone-frame.png", "/assets/icone.png"];

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(
    () => (typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false),
  );
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);
  return narrow;
}

/**
 * Cadrage 3D + scroll.
 * Avant: top-0 + y en vh → incohérent avec scale, pivot bas et overflow → bas rogné,
 * et sens ressenti “ça monte”.
 * Ici: conteneur flex en bas d’écran, y de négatif → 0 = l’iPhone **descend**,
 * hauteur max + object-contain = l’entier se révèle, pas de overflow-y sur le sticky.
 */
export function PhoneScrollSection() {
  const [phoneImgIdx, setPhoneImgIdx] = useState(0);
  const narrow = useNarrowViewport();
  const zoomHero = narrow ? ZOOM_HERO_NARROW : ZOOM_HERO;
  const yLift0 = narrow ? 14 : 20; // vh — départ: mockup un peu “au-dessus” du bord bas
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // translateY: négatif = plus haut ; vers 0 = le téléphone **descend** (révèle surtout le haut, puis 0 = cadrage bas)
  const phoneY = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < PHASE_3D_END) {
      const a = t / PHASE_3D_END;
      const s = easeInOutCubic(a);
      return `${(-yLift0 * (1 - s)).toFixed(2)}vh`;
    }
    return "0px";
  });

  const phoneX = useTransform(scrollYProgress, (p) => {
    if (narrow) return "0vw";
    const t = clamp(p, 0, 1);
    if (t < PHASE_3D_END) return "0vw";
    const u = (t - PHASE_3D_END) / (1 - PHASE_3D_END);
    return `${-20 * easeInOutCubic(u)}vw`;
  });

  const phoneScale = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < PHASE_3D_END) {
      const a = t / PHASE_3D_END;
      return ZOOM_FLAT + (zoomHero - ZOOM_FLAT) * (1 - easeInOutCubic(a));
    }
    const b = (t - PHASE_3D_END) / (1 - PHASE_3D_END);
    return ZOOM_FLAT + (ZOOM_SLIDE - ZOOM_FLAT) * easeInOutCubic(b);
  });

  const phoneRotateX = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t >= PHASE_3D_END) return 0;
    const a = t / PHASE_3D_END;
    return ANGLE_MAX * (1 - easeInOutCubic(a));
  });

  const heroOpacity = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t <= 0.2) return 1;
    if (t >= 0.4) return 0;
    return 1 - smoothstep((t - 0.2) / 0.2);
  });
  const heroY = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t <= 0.22) return 0;
    if (t >= 0.44) return -32;
    return -32 * smoothstep((t - 0.22) / 0.22);
  });
  const rightOpacity = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < 0.32) return 0;
    if (t > 0.6) return 1;
    return smoothstep((t - 0.32) / 0.28);
  });
  const rightY = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < 0.32) return 24;
    if (t > 0.58) return 0;
    return 24 * (1 - smoothstep((t - 0.32) / 0.26));
  });

  return (
    <section
      ref={sectionRef}
      id="fintap-hero"
      className="fintap-hero relative min-h-[320vh] scroll-mt-0 bg-[#fdfcf9] text-black"
    >
      <div className="sticky top-0 z-0 h-[100dvh] max-h-[100dvh] overflow-x-clip [perspective:min(90vh,1200px)] [perspective-origin:50%_85%]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 8% 28%, rgba(162,245,255,0.3) 0%, rgba(162,245,255,0) 40%), radial-gradient(circle at 92% 24%, rgba(255,177,233,0.26) 0%, rgba(255,177,233,0) 42%)",
          }}
        />

        <div className="relative z-20 flex items-center justify-between px-6 pt-6 md:px-10">
          <div className="rounded-full bg-white px-4 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <span className="text-lg font-semibold tracking-tight">FinTap</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full border border-[#27F3A9]/40 bg-white px-5 py-2 text-sm font-medium text-black"
            >
              Get the template
            </button>
            <button
              type="button"
              className="rounded-full bg-[#0a98ff] px-5 py-2 text-sm font-medium text-white"
            >
              Download FinTap
            </button>
          </div>
        </div>

        <motion.div
          className="relative z-10 mx-auto mt-10 flex max-w-5xl flex-col items-center px-4 text-center"
          style={{ opacity: heroOpacity, y: heroY }}
        >
          <h2 className="text-5xl font-black uppercase leading-[0.95] tracking-[-0.02em] md:text-7xl">
            Payments and transfers.
            <br />
            Fast and safe.
          </h2>
          <p className="mt-4 max-w-xl text-xl text-[#636363]">
            Local and international transfers, 1000+ types of payments, up to 3% of cashbacks and a lot
            more
          </p>
          <button
            type="button"
            className="mt-5 rounded-full bg-[#0a98ff] px-6 py-3 text-base font-medium text-white"
          >
            Download FinTap
          </button>
        </motion.div>

        <div className="pointer-events-none absolute inset-0 z-30 flex min-h-0 select-none items-end justify-center max-md:pb-2 md:pb-0">
          <motion.div
            className="w-[min(90vw,560px)] max-w-full origin-bottom will-change-transform [backface-visibility:hidden] [transform-style:preserve-3d] max-md:mb-1 md:mb-[4vh]"
            style={{
              y: phoneY,
              x: phoneX,
              scale: phoneScale,
              rotateX: phoneRotateX,
              transformOrigin: "50% 100%",
            }}
          >
            <img
              src={PHONE_IMAGES[phoneImgIdx] ?? PHONE_IMAGES[0]}
              alt="Mockup iPhone FinTap"
              className="mx-auto h-auto w-full max-h-[min(72dvh,560px)] object-contain object-bottom drop-shadow-[0_40px_80px_rgba(0,0,0,0.28)]"
              onError={() => {
                setPhoneImgIdx((i) => (i < PHONE_IMAGES.length - 1 ? i + 1 : i));
              }}
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </motion.div>
        </div>

        <motion.div
          className="absolute right-[8%] top-1/2 z-20 hidden max-w-[560px] -translate-y-1/2 md:block"
          style={{ opacity: rightOpacity, y: rightY }}
        >
          <h3 className="text-6xl font-black leading-[1.02] tracking-[-0.02em] text-black">
            Downloaded by more than
            <br />
            <span className="text-[#0a98ff]">5 000 000 people</span>
          </h3>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="https://apps.apple.com"
              className="rounded-full border border-black/10 bg-white px-6 py-3 text-base font-medium shadow-sm transition hover:border-black/20"
              rel="noreferrer"
              target="_blank"
            >
              App Store ★ 4.9
            </a>
            <a
              href="https://play.google.com"
              className="rounded-full border border-black/10 bg-white px-6 py-3 text-base font-medium shadow-sm transition hover:border-black/20"
              rel="noreferrer"
              target="_blank"
            >
              Google Play ★ 4.8
            </a>
          </div>
        </motion.div>

        <p
          className="pointer-events-none absolute bottom-5 right-5 z-20 text-[0.7rem] font-medium text-black/30"
          aria-hidden="true"
        >
          Rebuilt in React
        </p>
      </div>
    </section>
  );
}
