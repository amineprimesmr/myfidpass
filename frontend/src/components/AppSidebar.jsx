/**
 * AppSidebar — Sidebar Aceternity pour Fidpass
 * Navigation Dashboard, Caisse, Membres, etc.
 */
import React, { useState, useEffect } from "react";
import { Sidebar, DesktopSidebar, SidebarLink } from "./ui/sidebar.jsx";

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IconCaisse = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <rect x="7" y="7" width="10" height="10" rx="1" />
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);
const IconMembres = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconHistorique = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
const IconCarte = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 10h20" />
  </svg>
);
const IconMap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const IconIntegration = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22v-4" />
    <path d="M12 18a2 2 0 0 1-2-2V8a2 2 0 0 1 4 0v8a2 2 0 0 1-2 2z" />
    <path d="M8 6l4-4 4 4" />
    <path d="M8 6h8" />
  </svg>
);
const IconEngagement = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);
const IconNotifications = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconProfil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const APP_LINKS = [
  { section: "dashboard", href: "#dashboard", label: "Dashboard", icon: IconDashboard },
  { section: "caisse", href: "#caisse", label: "Caisse", icon: IconCaisse },
  { section: "membres", href: "#membres", label: "Membres", icon: IconMembres },
  { section: "historique", href: "#historique", label: "Historique", icon: IconHistorique },
  { section: "personnaliser", href: "#personnaliser", label: "Ma carte", icon: IconCarte },
  { section: "carte-perimetre", href: "#carte-perimetre", label: "Carte & périmètre", icon: IconMap },
  { section: "integration", href: "#integration", label: "Intégration caisse / borne", icon: IconIntegration },
  { section: "engagement", href: "#engagement", label: "Avis & Réseaux", icon: IconEngagement },
  { section: "notifications", href: "#notifications", label: "Notifications", icon: IconNotifications },
  { section: "profil", href: "#profil", label: "Profil", icon: IconProfil },
];

function getActiveSection() {
  let hash = (window.location.hash || "#dashboard").slice(1);
  if (hash === "scanner") hash = "caisse";
  if (hash === "partager") hash = "personnaliser";
  return hash;
}

export default function AppSidebar() {
  const [activeSection, setActiveSection] = useState(getActiveSection);

  useEffect(() => {
    const onHashChange = () => setActiveSection(getActiveSection());
    const onSectionChange = () => setActiveSection(getActiveSection());
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("app-section-change", onSectionChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("app-section-change", onSectionChange);
    };
  }, []);

  return (
    <Sidebar>
      <DesktopSidebar>
          <div className="app-sidebar-brand flex flex-col">
            <a href="/" className="app-sidebar-logo flex items-center gap-2" aria-label="Myfidpass">
              <img src="/assets/logo.png?v=20260311" alt="" className="app-sidebar-logo-img max-h-8 w-auto object-contain brightness-0 invert" onError={(e) => { e.target.style.display = "none"; e.target.nextElementSibling?.classList.remove("hidden"); }} />
              <span className="app-sidebar-logo-fallback hidden font-bold text-[var(--app-sidebar-text)]">Myfidpass</span>
            </a>
            <p id="app-business-name" className="app-sidebar-business mt-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--app-sidebar-text-muted)]">Mon espace</p>
          </div>
          <nav className="app-sidebar-nav flex-1 overflow-y-auto px-3 py-4" aria-label="Navigation principale">
            {APP_LINKS.map((link) => (
              <SidebarLink key={link.section} link={link} isActive={activeSection === link.section} />
            ))}
          </nav>
          <div className="app-sidebar-footer border-t border-[var(--app-sidebar-border)] px-5 py-4">
            <p id="app-user-email" className="app-sidebar-user mb-2 break-all text-xs text-[var(--app-sidebar-text-muted)]" />
            <button type="button" id="app-logout" className="app-sidebar-logout w-full rounded-[var(--app-radius-sm)] border border-[var(--app-sidebar-border)] bg-white/[0.04] px-3.5 py-2.5 text-sm font-medium text-[var(--app-sidebar-text-muted)] shadow-sm transition-colors hover:bg-[var(--app-sidebar-hover)] hover:text-[var(--app-sidebar-text)]">
              Déconnexion
            </button>
            <button type="button" id="app-reset-all" className="app-sidebar-reset mt-2 w-full px-3 py-1.5 text-left text-xs text-[var(--app-sidebar-text-muted)] hover:text-[#f87171] hover:underline" title="Supprime tous les comptes et cartes (dev)">
              Reset tout (dev)
            </button>
          </div>
      </DesktopSidebar>
    </Sidebar>
  );
}

export async function mountAppSidebar() {
  const root = document.getElementById("app-sidebar-root");
  if (!root || root._sidebarMounted) return;
  root._sidebarMounted = true;
  const { createRoot } = await import("react-dom/client");
  const { default: AppSidebar } = await import("./AppSidebar.jsx");
  createRoot(root).render(<AppSidebar />);
}
