import { useEffect, useRef } from "react";

const FADE_MS = 500;
const FADE_OUT_LEAD = 0.55;

/**
 * @param {object} props
 * @param {string} props.src
 * @param {string} props.className
 * @param {import('react').CSSProperties} [props.style]
 */
export function FadingVideo({ src, className, style }) {
  const videoRef = useRef(null);
  const rafIdRef = useRef(null);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let didInit = false;
    const fadeTo = (target, durationMs) => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      const startWall = performance.now();
      const startOp = (() => {
        const s = video.style.opacity;
        const p = parseFloat(s);
        return Number.isFinite(p) ? p : 0;
      })();

      const step = (now) => {
        const t = Math.min(1, (now - startWall) / durationMs);
        const next = startOp + (target - startOp) * t;
        video.style.opacity = String(next);
        if (t < 1) {
          rafIdRef.current = requestAnimationFrame(step);
        } else {
          rafIdRef.current = null;
        }
      };
      rafIdRef.current = requestAnimationFrame(step);
    };

    const onLoadedData = () => {
      if (didInit) return;
      didInit = true;
      video.style.opacity = "0";
      void video.play().catch(() => {});
      fadeTo(1, FADE_MS);
    };

    const onTimeUpdate = () => {
      const d = video.duration;
      if (!d || !Number.isFinite(d)) return;
      const remain = d - video.currentTime;
      if (!fadingOutRef.current && remain <= FADE_OUT_LEAD && remain > 0) {
        fadingOutRef.current = true;
        fadeTo(0, FADE_MS);
      }
    };

    const onEnded = () => {
      video.style.opacity = "0";
      setTimeout(() => {
        if (!videoRef.current) return;
        const v = videoRef.current;
        v.currentTime = 0;
        fadingOutRef.current = false;
        void v.play().catch(() => {});
        fadeTo(1, FADE_MS);
      }, 100);
    };

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    if (video.readyState >= 2) onLoadedData();

    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      className={className}
      style={{ opacity: 0, ...style }}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden
    />
  );
}
