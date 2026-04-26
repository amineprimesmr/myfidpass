import { motion, useReducedMotion } from "framer-motion";

const def = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0 } };

/**
 * @param {object} props
 * @param {import("react").ReactNode} props.children
 * @param {string} [props.className]
 * @param {number} [props.delay]
 */
export function ScrollReveal({ children, className, delay = 0 }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={def}
      transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
