/**
 * Constantes partagées builder / checkout (templates carte, clé draft, labels).
 * Référence : REFONTE-REGLES.md — pas de monolithe.
 */

export const CARD_TEMPLATES = [
  { id: "fastfood-points", name: "Points (Fast food)", format: "points", design: "fastfood", bg: "#8B2942", fg: "#ffffff", label: "#ffd54f" },
  { id: "fastfood-tampons", name: "Tampons (Fast food)", format: "tampons", design: "fastfood", bg: "#8B2942", fg: "#ffffff", label: "#ffd54f" },
  { id: "beauty-points", name: "Points (Beauté)", format: "points", design: "beauty", bg: "#b76e79", fg: "#ffffff", label: "#fce4ec" },
  { id: "beauty-tampons", name: "Tampons (Beauté)", format: "tampons", design: "beauty", bg: "#b76e79", fg: "#ffffff", label: "#fce4ec" },
  { id: "coiffure-points", name: "Points (Coiffure)", format: "points", design: "coiffure", bg: "#2563eb", fg: "#ffffff", label: "#bfdbfe" },
  { id: "coiffure-tampons", name: "Tampons (Coiffure)", format: "tampons", design: "coiffure", bg: "#2563eb", fg: "#ffffff", label: "#bfdbfe" },
  { id: "boulangerie-points", name: "Points (Boulangerie)", format: "points", design: "boulangerie", bg: "#b8860b", fg: "#ffffff", label: "#fff8e1" },
  { id: "boulangerie-tampons", name: "Tampons (Boulangerie)", format: "tampons", design: "boulangerie", bg: "#b8860b", fg: "#ffffff", label: "#fff8e1" },
  { id: "boucherie-points", name: "Points (Boucherie)", format: "points", design: "boucherie", bg: "#6d2c3e", fg: "#ffffff", label: "#ffcdd2" },
  { id: "boucherie-tampons", name: "Tampons (Boucherie)", format: "tampons", design: "boucherie", bg: "#6d2c3e", fg: "#ffffff", label: "#ffcdd2" },
  { id: "cafe-points", name: "Points (Café)", format: "points", design: "cafe", bg: "#5d4e37", fg: "#ffffff", label: "#d7ccc8" },
  { id: "cafe-tampons", name: "Tampons (Café)", format: "tampons", design: "cafe", bg: "#5d4e37", fg: "#ffffff", label: "#d7ccc8" },
  { id: "classic", name: "Classique", format: "points", bg: "#0a7c42", fg: "#ffffff", label: "#e8f5e9" },
  { id: "bold", name: "Moderne", format: "points", bg: "#2563eb", fg: "#ffffff", label: "#bfdbfe" },
  { id: "elegant", name: "Élégant", format: "points", bg: "#8b7355", fg: "#ffffff", label: "#f5f0e6" },
];

export const BUILDER_DRAFT_KEY = "fidpass_builder_draft_v2";

export const DESIGN_CATEGORY_LABELS = {
  fastfood: "Fast food",
  beauty: "Beauté",
  coiffure: "Coiffure",
  boulangerie: "Boulangerie",
  boucherie: "Boucherie",
  cafe: "Café",
};
