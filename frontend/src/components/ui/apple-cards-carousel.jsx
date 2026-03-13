/**
 * Apple Cards Carousel - Aceternity UI (adapté pour Vite, sans Next.js)
 * https://ui.aceternity.com/components/apple-cards-carousel
 */
import React, {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import {
  IconArrowNarrowLeft,
  IconArrowNarrowRight,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useOutsideClick } from "@/hooks/use-outside-click";

const CarouselContext = createContext({
  onCardClose: () => {},
  currentIndex: 0,
});

export function Carousel({ items, initialScroll = 0 }) {
  const carouselRef = React.useRef(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  const checkScrollability = () => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    if (carouselRef.current) {
      carouselRef.current.scrollLeft = initialScroll;
      checkScrollability();
    }
  }, [initialScroll]);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScrollability);
    window.addEventListener("resize", checkScrollability);
    return () => {
      el.removeEventListener("scroll", checkScrollability);
      window.removeEventListener("resize", checkScrollability);
    };
  }, []);

  const scrollLeft = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: -300, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({ left: 300, behavior: "smooth" });
    }
  };

  const handleCardClose = (index) => {
    if (carouselRef.current) {
      const isMobile = window.innerWidth < 768;
      const cardWidth = isMobile ? 230 : 384;
      const gap = isMobile ? 4 : 8;
      const scrollPosition = (cardWidth + gap) * (index + 1);
      carouselRef.current.scrollTo({
        left: scrollPosition,
        behavior: "smooth",
      });
      setCurrentIndex(index);
    }
  };

  return (
    <CarouselContext.Provider value={{ onCardClose: handleCardClose, currentIndex }}>
      <div className="relative w-full">
        <div
          ref={carouselRef}
          className="flex w-full overflow-x-auto overflow-y-hidden py-4 scroll-smooth scrollbar-hide md:gap-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className="flex flex-shrink-0 gap-2 pl-4 pr-4 md:gap-2 md:pl-8 md:pr-16">
            {items.map((item, index) => (
              <div key={index} className="flex flex-shrink-0">
                {item}
              </div>
            ))}
          </div>
        </div>
        {canScrollLeft && (
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-100/90 shadow-md transition hover:bg-neutral-200/90 dark:bg-neutral-800/90 dark:hover:bg-neutral-700/90"
          >
            <IconArrowNarrowLeft className="h-5 w-5" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-100/90 shadow-md transition hover:bg-neutral-200/90 dark:bg-neutral-800/90 dark:hover:bg-neutral-700/90"
          >
            <IconArrowNarrowRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </CarouselContext.Provider>
  );
}

export function Card({ card, index, layout = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const { onCardClose } = useContext(CarouselContext);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") handleClose();
    }
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useOutsideClick(containerRef, () => handleClose());

  const handleOpen = () => setOpen(true);
  const handleClose = () => {
    setOpen(false);
    onCardClose(index);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          >
            <motion.div
              ref={containerRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-900 md:p-8"
            >
              <button
                onClick={handleClose}
                className="absolute right-2 top-2 rounded-full p-2 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              >
                <IconX className="h-5 w-5" />
              </button>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                {card.category}
              </p>
              <p className="mt-2 text-2xl font-bold text-neutral-800 dark:text-neutral-100">
                {card.title}
              </p>
              <div className="mt-4 text-neutral-600 dark:text-neutral-300">
                {card.content}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        layout={layout}
        onClick={handleOpen}
        className={cn(
          "group relative h-[280px] w-[230px] cursor-pointer overflow-hidden rounded-2xl md:h-[320px] md:w-96"
        )}
      >
        <BlurImage
          src={card.src}
          alt={card.title}
          fill
          className="object-cover transition duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <p className="text-xs font-medium opacity-90">{card.category}</p>
          <p className="mt-1 text-lg font-bold">{card.title}</p>
        </div>
      </motion.div>
    </>
  );
}

export function BlurImage({ src, alt, className, fill, ...rest }) {
  const [isLoading, setLoading] = useState(true);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <img
        src={src}
        alt={alt || "Card image"}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoading(false)}
        className={cn(
          "h-full w-full object-cover transition duration-300",
          isLoading && "scale-110 blur-md",
          !isLoading && "blur-0",
          className
        )}
        {...rest}
      />
    </div>
  );
}
