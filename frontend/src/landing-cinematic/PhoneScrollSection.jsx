import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/** Type Framer (scroll ciné) : ralenti au début + à la fin. */
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const smoothstep = (t) => t * t * (3 - 2 * t);

const PHASE_3D_END = 0.48; // 1ère moitié du scroll : 3D + gros plan → iPhone de face
const ANGLE_MAX = 64; // contre-plongée (même ordre que le template, pas 80°+)
const ZOOM_HERO = 2.4; // gros plan en worm’s eye (proche de la ref Framer)
const ZOOM_HERO_NARROW = 1.9; // dézoom en contre-plongée sur iPhone / petit écran (moins de crop)
const ZOOM_FLAT = 1.02; // iPhone quasiment face caméra en fin de phase 3D
const ZOOM_SLIDE = 0.9; // léger dolly en phase “split” avec le texte

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
  const zoomHero = narrow ? ZOOM_HERO_NARROW : ZOOM_HERO;
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Phase B : iPhone descend nettement (vraie marge visuelle vs le texte — le padding du hero est sous le z-index phone).
  const yPhaseB = (t) => {
    const u = (t - PHASE_3D_END) / (1 - PHASE_3D_END);
    const s = easeInOutCubic(Math.max(0, Math.min(1, u)));
    return 12 + 34 * s; // 12vh → 46vh en fin de scroll dans la section
  };
  // Phase A : 3D + dézoom (sens Framer = la majeure partie du “ciné” dans la 1ère moitié du scroll).
  const phoneY = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < PHASE_3D_END) {
      const a = t / PHASE_3D_END;
      const s = easeInOutCubic(a);
      // Départ plus haut (~2/3 du mockup visibles) : 55vh → 12vh (jointure yPhaseB == 12)
      return `${(55 - 43 * s).toFixed(2)}vh`;
    }
    return `${yPhaseB(t).toFixed(2)}vh`;
  });

  const phoneX = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < PHASE_3D_END) return "0";
    const u = (t - PHASE_3D_END) / (1 - PHASE_3D_END);
    // Entrée progressive du cadrage 2 colonnes (comme la compo Framer final).
    return `${-22 * easeInOutCubic(u)}vw`;
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
    const s = 1 - a;
    return ANGLE_MAX * s * s;
  });

  // Sans ça, en phase 2 rotateX=0 mais perspective + gros translate X/Y/scale
  // donne l’impression que le mockup se “casse” / se penche (projection 3D).
  const wrapPerspective = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t >= PHASE_3D_END) return 4000;
    const a = easeInOutCubic(t / PHASE_3D_END);
    return 1100 + 2900 * a;
  });
  const wrapPerspectiveOrigin = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t >= PHASE_3D_END) return "50% 50%";
    const a = easeInOutCubic(t / PHASE_3D_END);
    const yp = 12 + 40 * a;
    return `50% ${yp}%`;
  });
  const phoneTransformOrigin = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t >= PHASE_3D_END) return "50% 50%";
    const a = t / PHASE_3D_END;
    const s = 1 - a;
    const yPct = 100 * s * s;
    return `50% ${yPct.toFixed(1)}%`;
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
  // Poussée additionnelle (px) en fin de parcours : écart texte ↔ mockup (fusionné dans y, calc + transform).
  const phonePushPx = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < 0.28) return 0;
    const u = (t - 0.28) / 0.72;
    return Math.round(720 * easeInOutCubic(u));
  });
  const phoneYFinal = useTransform([phoneY, phonePushPx], ([yv, push]) => {
    const yStr = typeof yv === "string" ? yv : `${yv}`;
    const px = typeof push === "number" ? push : 0;
    return px ? `calc(${yStr} + ${px}px)` : yStr;
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
      {/* perspective pilotée par scroll (voir wrapPerspective) : en fin de parcours, projection quasi plate = mockup “droit” */}
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
            y: phoneYFinal,
            x: phoneX,
            scale: phoneScale,
            rotateX: phoneRotateX,
            transformOrigin: phoneTransformOrigin,
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
