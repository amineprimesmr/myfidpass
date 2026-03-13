/**
 * Cover — Aceternity UI
 * Wraps children, providing beams and space effect, hover to reveal speed.
 * https://ui.aceternity.com/components/container-cover
 */
import React from "react";
import "./cover.css";

export function Cover({ children, className = "" }) {
  return (
    <span className={`cover-wrapper ${className}`.trim()}>
      {children}
    </span>
  );
}
