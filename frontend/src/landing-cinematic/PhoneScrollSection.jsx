import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const smoothstep = (t) => t * t * (3 - 2 * t);

/** 0 = intro “carte” ; 1 = cadrage final. Si l’effet te semble inversé, c’est ici que p et (1-p) s’inversent. */
const FACE_REACHED = 0.4;
const SPLIT_END = 0.55;

const ZOOM_IN = 1.12;
const NARROW_IN = 1.06;
const FACE = 1;

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

/**
 * p : 0 = haut de section, 1 = on a scrolle jusqu’en bas (offset start/end classique).
 * Plus p augmente, plus l’iPhone se rapproche d’une image 2D de face (scale 1, pas de 3D).
 */
export function PhoneScrollSection() {
  const [phoneImgIdx, setPhoneImgIdx] = useState(0);
  const narrow = useNarrowViewport();
  const zoomIn = narrow ? NARROW_IN : ZOOM_IN;
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    // Bas du bloc aligne le haut du viewport en fin = p va bien de “debut de scroll” a “apres le hero”
    offset: ["start start", "end start"],
  });

  const phoneY = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    const a = t < SPLIT_END ? t / SPLIT_END : 1;
    const s = easeInOutCubic(a);
    return `${(30 - 18 * s).toFixed(2)}vh`;
  });

  const phoneX = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < SPLIT_END) return "0";
    const u = (t - SPLIT_END) / (1 - SPLIT_END);
    return `${-16 * easeInOutCubic(u)}vw`;
  });

  const phoneScale = useTransform(scrollYProgress, (p) => {
    const t = clamp(p, 0, 1);
    if (t < FACE_REACHED) {
      const a = t / FACE_REACHED;
      const s = 1 - (1 - a) * (1 - a);
      return zoomIn + (FACE - zoomIn) * s;
    }
    if (t < SPLIT_END) {
      return FACE;
    }
    const b = (t - SPLIT_END) / (1 - SPLIT_END);
    return FACE + (0.96 - FACE) * easeInOutCubic(b);
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
      <div className="sticky top-0 h-screen overflow-x-hidden overflow-y-visible">
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
          className="pointer-events-none absolute left-1/2 top-0 z-30 w-[min(62vw,560px)] -translate-x-1/2 will-change-transform"
          style={{ y: phoneY, x: phoneX, scale: phoneScale }}
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
