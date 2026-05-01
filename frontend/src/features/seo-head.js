import { getSeoByRoute } from "./seo-head-route.js";

const DEFAULT_SITE_ORIGIN = "https://www.myfidpass.fr";

function siteOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return DEFAULT_SITE_ORIGIN;
}

const defaultImageUrl = () => `${siteOrigin()}/assets/icone.png?v=20260416`;
const JSON_LD_ID = "fidpass-seo-jsonld";

function upsertMeta({ name, property, content }) {
  if (typeof document === "undefined") return;
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    if (name) el.setAttribute("name", name);
    if (property) el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(url) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

function setJsonLd(json) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(JSON_LD_ID);
  if (!json) {
    existing?.remove();
    return;
  }
  const payload = Array.isArray(json) ? json : [json];
  const script = existing || document.createElement("script");
  script.id = JSON_LD_ID;
  script.setAttribute("type", "application/ld+json");
  script.textContent = JSON.stringify(payload.length === 1 ? payload[0] : payload);
  if (!existing) document.head.appendChild(script);
}

export function applyRouteSeoHead(route) {
  if (typeof document === "undefined") return;
  const seo = getSeoByRoute(route);
  const title = seo.title || "MyFidPass";
  const description = seo.description || "";
  const canonical = seo.canonical || siteOrigin();
  const robots = seo.robots || "index,follow";
  const image = defaultImageUrl();

  document.title = title;
  upsertMeta({ name: "description", content: description });
  upsertMeta({ name: "robots", content: robots });
  upsertCanonical(canonical);

  upsertMeta({ property: "og:type", content: "website" });
  upsertMeta({ property: "og:site_name", content: "MyFidPass" });
  upsertMeta({ property: "og:title", content: title });
  upsertMeta({ property: "og:description", content: description });
  upsertMeta({ property: "og:url", content: canonical });
  upsertMeta({ property: "og:image", content: image });

  upsertMeta({ name: "twitter:card", content: "summary_large_image" });
  upsertMeta({ name: "twitter:title", content: title });
  upsertMeta({ name: "twitter:description", content: description });
  upsertMeta({ name: "twitter:image", content: image });

  setJsonLd(seo.jsonLd || null);
}
