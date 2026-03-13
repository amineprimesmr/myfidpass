/**
 * FloatingDock — Aceternity UI style, macOS dock
 * API: items { title, icon, href }[], mobileClassName, desktopClassName
 */
import React from "react";
import "./floating-dock.css";

const SPRING = { mass: 0.1, stiffness: 170, damping: 12 };
const SCALE = 2.25;
const DISTANCE = 110;
const NUDGE = 40;

function IconContainer({ mouseX, title, icon, href, onClick, isActive }) {
  const ref = React.useRef(null);

  const handleClick = (e) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <a
      ref={ref}
      href={href || "#"}
      onClick={handleClick}
      className={`floating-dock-icon ${isActive ? "floating-dock-icon-active" : ""}`}
      aria-label={title}
      title={title}
    >
      <span className="floating-dock-icon-inner">{icon}</span>
    </a>
  );
}

export function FloatingDock({ items = [], mobileClassName = "", desktopClassName = "", activeId = "" }) {
  const [mouseX, setMouseX] = React.useState(-Infinity);
  const dockRef = React.useRef(null);

  const onMouseMove = (e) => {
    if (!dockRef.current) return;
    const rect = dockRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setMouseX(x);
  };

  const onMouseLeave = () => setMouseX(-Infinity);

  return (
    <>
      {/* Desktop */}
      <div
        ref={dockRef}
        className={`floating-dock floating-dock-desktop ${desktopClassName}`}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <div className="floating-dock-bar">
          {items.map((item, i) => (
            <IconContainer
              key={i}
              mouseX={mouseX}
              title={item.title}
              icon={item.icon}
              href={item.href}
              onClick={item.onClick}
              isActive={item.tabId && item.tabId === activeId}
            />
          ))}
        </div>
      </div>

      {/* Mobile */}
      <div className={`floating-dock floating-dock-mobile ${mobileClassName}`}>
        <div className="floating-dock-bar">
          {items.map((item, i) => (
            <IconContainer
              key={i}
              mouseX={-Infinity}
              title={item.title}
              icon={item.icon}
              href={item.href}
              onClick={item.onClick}
              isActive={item.tabId && item.tabId === activeId}
            />
          ))}
        </div>
      </div>
    </>
  );
}
