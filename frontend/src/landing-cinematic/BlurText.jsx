import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

const STEP_DURATION = 0.35;
const DURATION = STEP_DURATION * 2;

/**
 * @param {object} props
 * @param {string} props.text
 * @param {string} props.className
 */
export function BlurText({ text, className }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const words = text.split(" ");

  return (
    <p
      ref={ref}
      className={`m-0 flex flex-wrap justify-center [row-gap:0.1em] ${className || ""}`.trim()}
    >
      {words.map((word, i) => (
        <motion.span
          key={`w-${i}`}
          className="inline-block"
          style={{ marginRight: "0.28em" }}
          initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
          animate={
            inView
              ? {
                  filter: ["blur(10px)", "blur(5px)", "blur(0px)"],
                  opacity: [0, 0.5, 1],
                  y: [50, -5, 0],
                }
              : { filter: "blur(10px)", opacity: 0, y: 50 }
          }
          transition={{
            duration: DURATION,
            times: [0, 0.5, 1],
            ease: "easeOut",
            delay: (i * 100) / 1000,
          }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  );
}
