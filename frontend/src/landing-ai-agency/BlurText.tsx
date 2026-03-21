import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "./utils/cn";

type BlurTextProps = {
  text: string;
  className?: string;
};

/** Word-by-word blur → clear (IntersectionObserver + motion). ~0.35s steps per spec. */
export function BlurText({ text, className }: BlurTextProps) {
  const words = text.split(" ");
  const rootRef = useRef<HTMLHeadingElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setActive(true);
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <h1
      ref={rootRef}
      className={cn(
        "flex flex-wrap justify-center gap-x-3 gap-y-1 text-6xl md:text-7xl lg:text-[5.5rem]",
        "font-heading italic leading-[0.8] tracking-[-4px] text-white",
        className,
      )}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="inline-block"
          initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
          animate={
            active
              ? {
                  filter: ["blur(10px)", "blur(5px)", "blur(0px)"],
                  opacity: [0, 0.5, 1],
                  y: [50, -5, 0],
                }
              : {}
          }
          transition={{
            duration: 0.35 * 3,
            delay: i * 0.1,
            times: [0, 0.45, 1],
            ease: "easeOut",
          }}
        >
          {word}
        </motion.span>
      ))}
    </h1>
  );
}
