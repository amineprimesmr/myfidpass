import { motion, useReducedMotion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const EASE = [0.22, 1, 0.36, 1];

const VARIANTS = {
  "fade-up": {
    hidden: { opacity: 0, y: 40, filter: "blur(8px)" },
    show:   { opacity: 1, y: 0,  filter: "blur(0px)" },
  },
  "fade-in": {
    hidden: { opacity: 0 },
    show:   { opacity: 1 },
  },
  "scale-up": {
    hidden: { opacity: 0, scale: 0.92, filter: "blur(4px)" },
    show:   { opacity: 1, scale: 1,    filter: "blur(0px)" },
  },
  "slide-left": {
    hidden: { opacity: 0, x: -48, filter: "blur(4px)" },
    show:   { opacity: 1, x: 0,   filter: "blur(0px)" },
  },
  "slide-right": {
    hidden: { opacity: 0, x: 48, filter: "blur(4px)" },
    show:   { opacity: 1, x: 0,  filter: "blur(0px)" },
  },
};

/**
 * Révélation au scroll avec variants d'animation.
 *
 * @param {object}  props
 * @param {import("react").ReactNode} props.children
 * @param {string}  [props.className]
 * @param {number}  [props.delay]      délai en secondes
 * @param {"fade-up"|"fade-in"|"scale-up"|"slide-left"|"slide-right"} [props.variant]
 * @param {string}  [props.tag]        tag HTML cible (div, li, section, …)
 */
export function ScrollReveal({ children, className, delay = 0, variant = "fade-up", tag = "div" }) {
  const reduce = useReducedMotion();
  const ref    = useRef(null);
  const inView = useInView(ref, { amount: 0.15, margin: "0px 0px -8% 0px" });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduce) return;
    if (inView) setVisible(true);
  }, [inView, reduce]);

  // Snap si l'élément est déjà visible au retour d'onglet / pageshow (bfcache)
  useEffect(() => {
    if (reduce) return;
    const snap = () => {
      if (document.visibilityState !== "visible") return;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const h = window.innerHeight || 1;
        if (r.top < h * 0.95 && r.bottom > h * 0.05) setVisible(true);
      });
    };
    document.addEventListener("visibilitychange", snap);
    window.addEventListener("pageshow", snap);
    return () => {
      document.removeEventListener("visibilitychange", snap);
      window.removeEventListener("pageshow", snap);
    };
  }, [reduce]);

  const vars = VARIANTS[variant] ?? VARIANTS["fade-up"];

  if (reduce) {
    const Plain = tag;
    return <Plain className={className}>{children}</Plain>;
  }

  const Tag = motion[tag] ?? motion.div;

  return (
    <Tag
      ref={ref}
      className={className}
      variants={vars}
      initial="hidden"
      animate={visible ? "show" : "hidden"}
      transition={{ duration: 0.7, ease: EASE, delay: visible ? delay : 0 }}
    >
      {children}
    </Tag>
  );
}
