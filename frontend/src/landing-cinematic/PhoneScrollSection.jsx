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

export function PhoneScrollSection() {
  const [phoneImgIdx, setPhoneImgIdx] = useState(0);
  const narrow = useNarrowViewport();
  const zoomHero = narrow ? ZOOM_HERO_NARROW : ZOOM_HERO;
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Cadrage vertical : translateY + = le mockup descend. Avant 78→12 (Y baissait = l’iPhone
  // « montait ») et le bas restait en dehors du cadre. Ici 0→phaseA : l’iPhone DESCEND
  // progressivement → bas visible, appareil entier révélé. Phase B : léger ajustement split.
  const y0 = narrow ? 8 : 2;
  const y1 = narrow ? 32 : 38; // fin contre-plongée / iPhone entier (bas visible)
  const phoneY = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < PHASE_3D_END) {
      const a = t / PHASE_3D_END;
      const s = easeInOutCubic(a);
      return `${(y0 + (y1 - y0) * s).toFixed(2)}vh`;
    }
    // Même hauteur en phase split : pas de remontée, seul le X glisse
    return `${y1.toFixed(2)}vh`;
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
      <div className="sticky top-0 h-screen overflow-hidden [perspective:min(85vh,1100px)] [perspective-origin:50%_12%]">
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

        <motion.div
          className="pointer-events-none absolute left-1/2 top-0 z-30 w-[min(62vw,560px)] -translate-x-1/2 will-change-transform [transform-style:preserve-3d] [backface-visibility:hidden]"
          style={{
            y: phoneY,
            x: phoneX,
            scale: phoneScale,
            rotateX: phoneRotateX,
            // Pivot sur le bas = le haut du cadre part vraiment “vers l’arrière” (effet worm’s eye)
            transformOrigin: "50% 100%",
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
      </div>
    </section>
  );
}
