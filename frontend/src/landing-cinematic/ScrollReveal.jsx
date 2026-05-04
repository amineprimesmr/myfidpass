import { motion, useReducedMotion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const def = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0 } };

/**
 * Révélation au scroll — évite whileInView seul : au retour d’onglet l’IntersectionObserver
 * peut laisser des blocs en état « hidden » (chevauchement / opacité) jusqu’au refresh.
 *
 * @param {object} props
 * @param {import("react").ReactNode} props.children
 * @param {string} [props.className]
 * @param {number} [props.delay]
 */
export function ScrollReveal({ children, className, delay = 0 }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.2, margin: "0px 0px -12% 0px" });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduce) return;
    if (inView) setVisible(true);
  }, [inView, reduce]);

  useEffect(() => {
    if (reduce) return;
    const snapIfIntersecting = () => {
      if (document.visibilityState !== "visible") return;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const h = window.innerHeight || 1;
        if (r.top < h * 0.93 && r.bottom > h * 0.07) {
          setVisible(true);
        }
      });
    };
    document.addEventListener("visibilitychange", snapIfIntersecting);
    window.addEventListener("pageshow", snapIfIntersecting);
    return () => {
      document.removeEventListener("visibilitychange", snapIfIntersecting);
      window.removeEventListener("pageshow", snapIfIntersecting);
    };
  }, [reduce]);

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={def}
      initial="hidden"
      animate={visible ? "show" : "hidden"}
      transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1], delay: visible ? delay : 0 }}
    >
      {children}
    </motion.div>
  );
}
