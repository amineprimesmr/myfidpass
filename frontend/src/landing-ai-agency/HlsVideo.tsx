import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { cn } from "./utils/cn";

type HlsVideoProps = {
  src: string;
  className?: string;
  desaturate?: boolean;
};

export function HlsVideo({ src, className, desaturate }: HlsVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
      };
    }
  }, [src]);

  return (
    <video
      ref={ref}
      className={cn(className)}
      style={desaturate ? { filter: "saturate(0)" } : undefined}
      autoPlay
      muted
      playsInline
      loop
    />
  );
}
