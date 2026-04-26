import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const PHONE_IMAGE = "/assets/iphone.png";

export function PhoneScrollSection() {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const ZOOM_MAX = 3.1; // contre-plongée (gros plan)
  const ZOOM_END = 0.72; // en fin de scroll

  // Cadrage : un cran plus bas au départ si le scale max augmente, pour ne pas rogner trop le haut.
  const phoneY = useTransform(scrollYProgress, (p) => {
    const t = Math.max(0, Math.min(1, p));
    const yVh = 79 - 69 * t; // 79vh → 10vh
    return `${yVh}vh`;
  });
  const phoneX = useTransform(scrollYProgress, [0, 0.58, 0.75, 1], ["0vw", "0vw", "-18vw", "-24vw"]);
  // Dézoom linéaire en fonction du progrès de la section = même cadence de A à Z, sans à-coups.
  const phoneScale = useTransform(scrollYProgress, (p) => {
    const t = Math.max(0, Math.min(1, p));
    return ZOOM_MAX - t * (ZOOM_MAX - ZOOM_END);
  });
  // Grosse contre-plongée (rotateX) uniquement : aucun rotateY = zéro penché sur le côté.
  const phoneRotateX = useTransform(
    scrollYProgress,
    [0, 0.05, 0.14, 0.3, 0.48, 0.65, 0.82, 1],
    [82, 76, 64, 46, 28, 12, 3, 0],
  );
  const heroOpacity = useTransform(scrollYProgress, [0, 0.38, 0.52], [1, 1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.52], ["0px", "-36px"]);
  const rightOpacity = useTransform(scrollYProgress, [0.54, 0.72, 1], [0, 1, 1]);
  const rightY = useTransform(scrollYProgress, [0.54, 0.72], ["20px", "0px"]);

  return (
    <section ref={sectionRef} className="relative min-h-[300vh] bg-[#fdfcf9] text-black">
      <div className="sticky top-0 h-screen overflow-hidden [perspective:min(72vh,640px)] [perspective-origin:50%_8%]">
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
            Local and international transfers, 100+ types of payments, up to 3% of cashbacks and a lot
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
            src={PHONE_IMAGE}
            alt="Mockup iPhone FinTap"
            className="h-auto w-full drop-shadow-[0_40px_80px_rgba(0,0,0,0.28)]"
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
          <div className="mt-8 flex gap-4">
            <div className="rounded-full border border-black/10 bg-white px-6 py-3 text-lg">App Store ★ 4.9</div>
            <div className="rounded-full border border-black/10 bg-white px-6 py-3 text-lg">Google Play ★ 4.8</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
