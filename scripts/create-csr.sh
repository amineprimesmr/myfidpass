#!/bin/bash
# Crée le fichier CSR pour le certificat Pass Type ID Apple Wallet.
# Les fichiers sont créés dans backend/certs/csr/ (dossier ignoré par Git).

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIR="$SCRIPT_DIR/../backend/certs/csr"
mkdir -p "$DIR"
cd "$DIR"

echo "Création de la clé privée..."
openssl genrsa -out private.key 2048

echo "Création du fichier CSR..."
openssl req -new -key private.key -out fidelity.certSigningRequest \
  -subj "/CN=Fidelity Pass/emailAddress=aminennasri@outlook.com"

echo ""
echo "Terminé. Fichiers dans: $DIR"
echo "  - fidelity.certSigningRequest  → à uploader sur le portail Apple (Choose File)"
echo "  - private.key                  → à garder précieusement pour plus tard (conversion en .pem)"
echo ""
