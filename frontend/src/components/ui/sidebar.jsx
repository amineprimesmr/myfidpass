/**
 * Sidebar — Aceternity UI style
 * Expandable on hover, mobile responsive
 * https://ui.aceternity.com/components/sidebar
 */
import React, { createContext, useContext, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

const SidebarContext = createContext({
  open: false,
  setOpen: () => {},
});

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function SidebarProvider({ children, open: controlledOpen, setOpen: controlledSetOpen }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && controlledSetOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledSetOpen : setInternalOpen;

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function Sidebar({ children, open, setOpen, animate = true }) {
  return (
    <SidebarProvider open={open} setOpen={setOpen}>
      <SidebarBody animate={animate}>{children}</SidebarBody>
    </SidebarProvider>
  );
}

export function SidebarBody({ children, animate = true, ...props }) {
  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: 1 }}
      className="flex h-full w-full"
      {...(animate ? {} : { layout: false })}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function DesktopSidebar({ children, className, ...props }) {
  const { open, setOpen } = useSidebar();
  const [isHovered, setIsHovered] = useState(false);
  const expanded = open || isHovered;

  React.useEffect(() => {
    const app = document.getElementById("app-app");
    if (app) app.dataset.sidebarExpanded = expanded ? "true" : "false";
  }, [expanded]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    setOpen(true);
    const app = document.getElementById("app-app");
    if (app) app.dataset.sidebarExpanded = "true";
  }, [setOpen]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setOpen(false);
    const app = document.getElementById("app-app");
    if (app) app.dataset.sidebarExpanded = "false";
  }, [setOpen]);

  return (
    <motion.aside
      className={cn(
        "app-sidebar hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-[90]",
        "border-r border-[var(--app-sidebar-border)] bg-[var(--app-sidebar-bg)]",
        className
      )}
      initial={false}
      animate={{
        width: expanded ? 272 : 72,
      }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ minWidth: expanded ? 272 : 72 }}
      {...props}
    >
      {children}
    </motion.aside>
  );
}

export function MobileSidebar({ children, className, ...props }) {
  const { open, setOpen } = useSidebar();

  return (
    <>
      {/* Hamburger trigger — visible only on mobile */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="md:hidden fixed left-3 top-[.7rem] z-[110] w-10 h-10 flex items-center justify-center rounded-lg bg-[var(--app-sidebar-hover)] text-[var(--app-sidebar-text)]"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? (
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <>
              <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {/* Overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-[95] bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={cn(
              "md:hidden fixed left-0 top-0 bottom-0 z-[100] w-[272px] max-w-[85vw]",
              "flex flex-col border-r border-[var(--app-sidebar-border)] bg-[var(--app-sidebar-bg)] shadow-xl",
              className
            )}
            {...props}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function SidebarLink({ link, isActive, className, ...props }) {
  const { open } = useSidebar();
  const Icon = link.icon;

  return (
    <a
      href={link.href}
      className={cn(
        "app-sidebar-link flex items-center gap-3 rounded-[var(--app-radius-sm)] px-3 py-2.5",
        "text-[var(--app-sidebar-text-muted)] hover:bg-[var(--app-sidebar-hover)] hover:text-[var(--app-sidebar-text)]",
        "transition-colors duration-200",
        isActive && "app-sidebar-link-active bg-[var(--app-sidebar-active)] text-[var(--app-sidebar-text)] font-semibold",
        className
      )}
      data-section={link.section}
      {...props}
    >
      <span className="app-sidebar-icon flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-[1.2rem] [&>svg]:w-[1.2rem]">
        {typeof Icon === "function" ? <Icon className="h-full w-full" /> : Icon}
      </span>
      <span className="app-sidebar-link-text truncate whitespace-nowrap">{link.label}</span>
    </a>
  );
}
