import { useRef, useSyncExternalStore } from "react";
import { FinTapStepsScrollDesktop } from "./FinTapStepsScrollDesktop.jsx";
import { FinTapStepsScrollMobile } from "./FinTapStepsScrollMobile.jsx";
import "./fintap-steps-scroll.css";
import "./fintap-steps-mobile.css";
import "./fintap-steps-mock.css";

const DESKTOP_MQ = "(min-width: 901px)";

function subscribeDesktopMql(onStoreChange) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(DESKTOP_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getDesktopMqlSnapshot() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_MQ).matches;
}

function getDesktopMqlServerSnapshot() {
  return false;
}

export function FinTapStepsScrollSection() {
  const sectionRef = useRef(/** @type {HTMLElement | null} */ (null));
  const isDesktop = useSyncExternalStore(subscribeDesktopMql, getDesktopMqlSnapshot, getDesktopMqlServerSnapshot);

  return (
    <section
      ref={sectionRef}
      className="fintap-steps-scroll"
      id="comment-ca-marche"
      aria-labelledby="fintap-steps-heading"
    >
      {isDesktop ? <FinTapStepsScrollDesktop measureRef={sectionRef} /> : <FinTapStepsScrollMobile />}
    </section>
  );
}
