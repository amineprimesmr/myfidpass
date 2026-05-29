/** Environnement d’exploitation réelle (Railway / Vercel prod). */
export function isProductionEnvironment() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.RAILWAY_ENVIRONMENT_NAME === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}
