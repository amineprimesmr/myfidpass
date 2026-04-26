/**
 * Démonstration liquidGL (iframe) : init après peinture, feedback clics, retrait du loader.
 */
(function () {
  "use strict";

  var liquidStarted = false;

  function removeBoot() {
    var el = document.getElementById("lgt-boot");
    if (el) {
      el.style.opacity = "0";
      setTimeout(function () {
        if (el.parentNode) el.remove();
      }, 280);
    }
    document.body.setAttribute("data-liquid-ready", "1");
  }

  function tryStartLiquid(attempt) {
    if (liquidStarted) return;
    if (typeof window.html2canvas === "undefined" || typeof window.liquidGL !== "function") {
      if ((attempt || 0) < 200) {
        setTimeout(function () {
          tryStartLiquid((attempt || 0) + 1);
        }, 20);
      } else {
        removeBoot();
        console.warn("liquidGL: html2canvas ou liquidGL manquant (réseau ou bloqueur).");
      }
      return;
    }
    try {
      window.liquidGL({
        snapshot: "body",
        target: ".liquidGL",
        resolution: 1.2,
        refraction: 0.025,
        bevelDepth: 0.075,
        bevelWidth: 0.2,
        frost: 0.7,
        shadow: true,
        specular: true,
        reveal: "fade",
        tilt: true,
        tiltFactor: 4,
        magnify: 1,
        on: {
          init: function () {
            removeBoot();
          },
        },
      });
      liquidStarted = true;
    } catch (e) {
      removeBoot();
      throw e;
    }
  }

  function afterPaint() {
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          tryStartLiquid(0);
        });
      });
    } else {
      setTimeout(function () {
        tryStartLiquid(0);
      }, 32);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", afterPaint);
  } else {
    afterPaint();
  }

  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-demo]");
    if (!t) return;
    t.classList.add("lgt-wiggle");
    setTimeout(function () {
      t.classList.remove("lgt-wiggle");
    }, 160);
  });
})();
