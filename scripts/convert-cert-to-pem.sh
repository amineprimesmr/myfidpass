#!/bin/bash
# Place le .cer téléchargé d'Apple dans ~/Desktop/fidelity-csr/ et nomme-le pass.cer
# Puis lance ce script pour générer signerCert.pem et signerKey.pem

set -e
DIR="$HOME/Desktop/fidelity-csr"
CER="$DIR/pass.cer"

if [ ! -f "$CER" ]; then
  echo "Fichier $CER introuvable."
  echo "Copie le certificat .cer téléchargé d'Apple dans fidelity-csr et renomme-le en pass.cer"
  echo "  Ex: cp ~/Downloads/pass_com_fidelity.cer $DIR/pass.cer"
  exit 1
fi

cd "$DIR"
openssl x509 -inform DER -in pass.cer -out signerCert.pem
cp private.key signerKey.pem

echo ""
echo "OK. signerCert.pem et signerKey.pem sont dans $DIR"
echo "Copie-les dans le projet :"
echo "  cp $DIR/signerCert.pem $(dirname "$0")/../backend/certs/"
echo "  cp $DIR/signerKey.pem $(dirname "$0")/../backend/certs/"
echo ""
