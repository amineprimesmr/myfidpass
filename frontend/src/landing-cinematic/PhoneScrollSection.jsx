import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const smoothstep = (t) => t * t * (3 - 2 * t);

/** Fin de la 3D + début de la “carte” 2D (image de face) — le reste du scroll n’a plus de perspective. */
const FLAT_AT = 0.36;
const LAYOUT_SPLIT_AT = 0.48; // cadrage 2 colonnes (même frise qu’avant, mais sans 3D après FLAT_AT)

// Intro légère : l’exagération (2.4×, 64°, 720px de push) donnait l’impression d’une plongée qui empire.
const ANGLE_INTRO = 18;
const ZOOM_INTRO = 1.2;
const ZOOM_FACE = 1;
const ZOOM_LATE = 0.94;
const NARROW_INTRO = 1.1;

const PHONE_IMAGES = ["/assets/iphone.png", "/assets/mockupiphone.png", "/assets/iphone-frame.png", "/assets/icone.png"];

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

export function PhoneScrollSection() {
  const [phoneImgIdx, setPhoneImgIdx] = useState(0);
  const narrow = useNarrowViewport();
  const zoomIntro = narrow ? NARROW_INTRO : ZOOM_INTRO;
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Phase 2 (après LAYOUT_SPLIT_AT) : position en Y uniquement, sans 3D.
  const yPhaseB = (t) => {
    const u = (t - LAYOUT_SPLIT_AT) / (1 - LAYOUT_SPLIT_AT);
    const s = easeInOutCubic(Math.max(0, Math.min(1, u)));
    return 10 + 30 * s;
  };

  const phoneY = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < LAYOUT_SPLIT_AT) {
      const a = t / LAYOUT_SPLIT_AT;
      const s = easeInOutCubic(a);
      return `${(32 - 22 * s).toFixed(2)}vh`;
    }
    return `${yPhaseB(t).toFixed(2)}vh`;
  });

  const phoneX = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < LAYOUT_SPLIT_AT) return "0";
    const u = (t - LAYOUT_SPLIT_AT) / (1 - LAYOUT_SPLIT_AT);
    return `${-18 * easeInOutCubic(u)}vw`;
  });

  const phoneScale = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < FLAT_AT) {
      const a = t / FLAT_AT;
      const s = 1 - (1 - a) * (1 - a);
      return zoomIntro + (ZOOM_FACE - zoomIntro) * s;
    }
    if (t < LAYOUT_SPLIT_AT) {
      return ZOOM_FACE;
    }
    const b = (t - LAYOUT_SPLIT_AT) / (1 - LAYOUT_SPLIT_AT);
    return ZOOM_FACE + (ZOOM_LATE - ZOOM_FACE) * easeInOutCubic(b);
  });

  // 0° au moment FLAT_AT : dès là, image de face, plus de plongée 3D.
  const phoneRotateX = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t >= FLAT_AT) return 0;
    const a = 1 - t / FLAT_AT;
    return ANGLE_INTRO * a * a;
  });

  const wrapPerspective = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t >= FLAT_AT) return 1e6;
    const a = t / FLAT_AT;
    return 900 + 2000 * easeInOutCubic(a);
  });

  const wrapPerspectiveOrigin = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t >= FLAT_AT) return "50% 50%";
    const a = t / FLAT_AT;
    const yp = 20 + 25 * easeInOutCubic(a);
    return `50% ${yp}%`;
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
      className="fintap-hero relative min-h-[480vh] scroll-mt-0 bg-[#fdfcf9] text-black"
    >
      <motion.div
        className="sticky top-0 h-screen overflow-x-hidden overflow-y-visible"
        style={{ perspective: wrapPerspective, perspectiveOrigin: wrapPerspectiveOrigin }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 8% 28%, rgba(162,245,255,0.3) 0%, rgba(162,245,255,0) 40%), radial-gradient(circle at 92% 24%, rgba(255,177,233,0.26) 0%, rgba(255,177,233,0) 42%)",
          }}
        />

        <motion.div
          className="relative z-10 mx-auto mt-16 flex w-full max-w-5xl flex-col items-center px-12 pt-10 text-center sm:mt-20 sm:px-16 sm:pt-12 md:mt-24 md:px-28 md:pt-16 lg:px-36 xl:px-44 2xl:px-52"
          style={{ opacity: heroOpacity, y: heroY }}
        >
          <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-[-0.02em] sm:text-5xl md:text-6xl">
            Payments and transfers.
            <br />
            Fast and safe.
          </h2>
          <div className="mx-auto mt-4 w-full max-w-lg px-6 sm:px-10 md:px-14">
            <p className="text-center text-[0.8125rem] font-medium leading-snug tracking-tight text-[#636363] sm:text-sm md:text-[0.875rem] md:leading-[1.35]">
              Local and international transfers, 1000+ types of payments, up to 3% of cashbacks and a lot
              more
            </p>
          </div>
        </motion.div>

        <motion.div
          className="pointer-events-none absolute left-1/2 top-0 z-30 w-[min(62vw,560px)] -translate-x-1/2 will-change-transform [backface-visibility:hidden]"
          style={{
            y: phoneY,
            x: phoneX,
            scale: phoneScale,
            rotateX: phoneRotateX,
            transformOrigin: "50% 50%",
            transformStyle: "preserve-3d",
          }}
        >
          <img
            src={PHONE_IMAGES[phoneImgIdx] ?? PHONE_IMAGES[0]}
            alt="Mockup iPhone FinTap"
            className="h-auto w-full max-w-full select-none drop-shadow-[0_40px_80px_rgba(0,0,0,0.28)]"
            onError={() => {
              setPhoneImgIdx((i) => (i < PHONE_IMAGES.length - 1 ? i + 1 : i));
            }}
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </motion.div>

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
      </motion.div>
    </section>
  );
}
