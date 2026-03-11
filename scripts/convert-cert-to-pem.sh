#!/bin/bash
# Place le .cer téléchargé d'Apple dans backend/certs/csr/ et nomme-le pass.cer
# Puis lance ce script pour générer signerCert.pem et signerKey.pem

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIR="$SCRIPT_DIR/../backend/certs/csr"
CER="$DIR/pass.cer"

if [ ! -f "$CER" ]; then
  echo "Fichier $CER introuvable."
  echo "Copie le certificat .cer téléchargé d'Apple dans backend/certs/csr/ et nomme-le pass.cer"
  echo "  Ex: cp ~/Downloads/pass_com_fidelity.cer $DIR/pass.cer"
  exit 1
fi

cd "$DIR"
openssl x509 -inform DER -in pass.cer -out signerCert.pem
cp private.key signerKey.pem

CERTS_DIR="$SCRIPT_DIR/../backend/certs"
cp signerCert.pem signerKey.pem "$CERTS_DIR/"

echo ""
echo "OK. signerCert.pem et signerKey.pem ont été générés et copiés dans backend/certs/"
echo ""
