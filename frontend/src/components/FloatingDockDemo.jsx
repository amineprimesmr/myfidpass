/**
 * FloatingDockDemo — exactement copié-collé du code fourni (Aceternity)
 * Adapté pour la nav mobile app (Dashboard, Scanner, Ma Carte, Profil)
 */
import React from "react";
import { FloatingDock } from "./ui/floating-dock.jsx";

// Icons style Tabler (SVG inline)
const IconHome = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="floating-dock-svg">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconTerminal2 = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="floating-dock-svg">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);
const IconNewSection = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="floating-dock-svg">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconExchange = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="floating-dock-svg">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);
const IconUser = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="floating-dock-svg">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconScan = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="floating-dock-svg">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </svg>
);

function dispatchTabChange(tabId) {
  window.dispatchEvent(new CustomEvent("fidpass-mobile-tab", { detail: { tab: tabId } }));
}

export function FloatingDockDemo() {
  const [activeTab, setActiveTab] = React.useState(() => {
    const hash = (window.location.hash || "#dashboard").slice(1);
    return ["dashboard", "caisse", "personnaliser", "profil"].includes(hash) ? hash : "dashboard";
  });

  React.useEffect(() => {
    const onSectionChange = (e) => {
      const id = e.detail?.sectionId;
      if (id) setActiveTab(id);
    };
    window.addEventListener("app-section-change", onSectionChange);
    return () => window.removeEventListener("app-section-change", onSectionChange);
  }, []);

  const links = [
    { title: "Dashboard", tabId: "dashboard", icon: <IconHome />, href: "#", onClick: () => dispatchTabChange("dashboard") },
    { title: "Scanner", tabId: "caisse", icon: <IconScan />, href: "#", onClick: () => dispatchTabChange("caisse") },
    { title: "Ma Carte", tabId: "personnaliser", icon: <IconNewSection />, href: "#", onClick: () => dispatchTabChange("personnaliser") },
    { title: "Profil", tabId: "profil", icon: <IconUser />, href: "#", onClick: () => dispatchTabChange("profil") },
  ];

  return (
    <div className="floating-dock-demo-wrap">
      <FloatingDock items={links} activeId={activeTab} mobileClassName="translate-y-20" />
    </div>
  );
}
