/**
 * Constantes et templates pour la génération des passes Apple Wallet.
 * Référence : REFONTE-REGLES.md — pass.js découpé en sous-modules < 400 lignes.
 */
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const assetsDir = resolve(__dirname, "..", "..", "assets");
export const certsDir = resolve(__dirname, "..", "..", "certs");

/**
 * Spec Apple PassKit : emplacement max. 160×50 pt, logo@2x = 320×100 px.
 * Valeurs légèrement au-dessus pour lisibilité ; l’aperçu SaaS utilise le ratio officiel.
 */
export const LOGO_WIDTH_2X = 400;
export const LOGO_HEIGHT_2X = 125;
export const LOGO_WIDTH_1X = 200;
export const LOGO_HEIGHT_1X = 62;

/** Dimensions icône pass (notifications, écran verrouillage). */
export const ICON_SIZE_1X = 29;
export const ICON_SIZE_2X = 58;
export const ICON_SIZE_3X = 87;

/** Lien en-tête droit (face avant) — fixe, non configurable commerce. */
export const PASS_HEADER_RIGHT_LABEL = "Récompenses ↗";

/** Libellé champ « membre » (face avant / auxiliaire) — aligné aperçu Ma carte. */
export const PASS_LABEL_MEMBER = "MEMBRE";

/** Bandeau logo Wallet quand aucune image commerce n’est fournie (aligné app iOS). */
export const PASS_LOGO_PLACEHOLDER_TEXT = "[ Votre logo ]";

/** Strip Apple : 750×246. Tampons : diam. 96 px. */
export const STRIP_W = 750;
export const STRIP_H = 246;
export const STAMP_R = 48;
export const STAMP_SIZE = STAMP_R * 2;
export const STAMP_GAP = 8;
export const STAMP_TOP = 40;

/** Rayon terrestre (m) et 1° latitude ≈ 111.32 km. */
export const EARTH_RADIUS_M = 6371000;
export const METERS_PER_DEG_LAT = (Math.PI * EARTH_RADIUS_M) / 180;

/** Templates de design (couleurs). */
export const PASS_TEMPLATES = {
  classic: { backgroundColor: "#0a7c42", foregroundColor: "#ffffff", labelColor: "#e8f5e9" },
  modern: { backgroundColor: "#1a237e", foregroundColor: "#ffffff", labelColor: "#c5cae9" },
  dark: { backgroundColor: "#212121", foregroundColor: "#ffffff", labelColor: "#b0b0b0" },
  warm: { backgroundColor: "#bf360c", foregroundColor: "#ffffff", labelColor: "#ffccbc" },
  fastfood: { backgroundColor: "#8B2942", foregroundColor: "#ffffff", labelColor: "#ffd54f" },
  beauty: { backgroundColor: "#b76e79", foregroundColor: "#ffffff", labelColor: "#fce4ec" },
  coiffure: { backgroundColor: "#5c4a6a", foregroundColor: "#ffffff", labelColor: "#d1c4e0" },
  boulangerie: { backgroundColor: "#b8860b", foregroundColor: "#ffffff", labelColor: "#fff8e1" },
  boucherie: { backgroundColor: "#6d2c3e", foregroundColor: "#ffffff", labelColor: "#ffcdd2" },
  cafe: { backgroundColor: "#5d4e37", foregroundColor: "#ffffff", labelColor: "#d7ccc8" },
};
