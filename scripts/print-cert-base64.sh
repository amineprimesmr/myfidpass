#!/usr/bin/env sh
# Affiche le contenu des certificats en base64 pour les coller dans Railway (Variables).
# Usage : sh scripts/print-cert-base64.sh
# Puis sur Railway, crée 3 variables : WWDR_PEM_BASE64, SIGNER_CERT_PEM_BASE64, SIGNER_KEY_PEM_BASE64
set -e
cd "$(dirname "$0")/.."
CERTS="backend/certs"
for f in wwdr.pem signerCert.pem signerKey.pem; do
  if [ ! -f "$CERTS/$f" ]; then
    echo "ERREUR: $CERTS/$f manquant. Génère les certificats (voir docs/APPLE-WALLET-SETUP.md)." >&2
    exit 1
  fi
done
echo "--- Colle ces valeurs dans Railway → Variables (puis redéploie) ---"
echo ""
echo "WWDR_PEM_BASE64 ="
base64 < "$CERTS/wwdr.pem" | tr -d '\n'
echo ""
echo ""
echo "SIGNER_CERT_PEM_BASE64 ="
base64 < "$CERTS/signerCert.pem" | tr -d '\n'
echo ""
echo ""
echo "SIGNER_KEY_PEM_BASE64 ="
base64 < "$CERTS/signerKey.pem" | tr -d '\n'
echo ""
echo ""
echo "--- Fin ---"
