#!/usr/bin/env sh
# Génère les 3 fichiers dans railway-secrets/ avec les valeurs base64 à coller dans Railway.
# Usage : sh scripts/write-railway-secrets.sh
set -e
cd "$(dirname "$0")/.."
CERTS="backend/certs"
OUT="railway-secrets"
mkdir -p "$OUT"
for f in wwdr.pem signerCert.pem signerKey.pem; do
  if [ ! -f "$CERTS/$f" ]; then
    echo "ERREUR: $CERTS/$f manquant." >&2
    exit 1
  fi
done
echo "Génération des valeurs base64..."
base64 < "$CERTS/wwdr.pem" | tr -d '\n' > "$OUT/WWDR_PEM_BASE64.txt"
base64 < "$CERTS/signerCert.pem" | tr -d '\n' > "$OUT/SIGNER_CERT_PEM_BASE64.txt"
base64 < "$CERTS/signerKey.pem" | tr -d '\n' > "$OUT/SIGNER_KEY_PEM_BASE64.txt"
cat > "$OUT/LISEZMOI.txt" << 'LISEZMOI'
1. Va sur railway.app → ton projet → service fidpass-api → onglet Variables.
2. Supprime les anciennes variables WWDR_PEM, SIGNER_CERT_PEM, SIGNER_KEY_PEM si elles existent.
3. Pour chaque fichier .txt dans ce dossier (sauf ce LISEZMOI) :
   - Nom de la variable sur Railway = nom du fichier sans .txt (ex. WWDR_PEM_BASE64)
   - Valeur = ouvre le fichier, Cmd+A, Cmd+C, colle dans Railway
4. Redéploie le service (bouton Redeploy).
5. Attends 1–2 min puis teste « Ajouter à Apple Wallet » sur ton iPhone.
LISEZMOI
echo "OK. Fichiers créés dans $OUT/"
ls -la "$OUT"
