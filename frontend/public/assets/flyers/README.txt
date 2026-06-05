Fonds flyer QR — source unique (SaaS + apps)

Structure
  fidelity/frontend/public/assets/flyers/     ← templates (cette dossier)
  fidelity/frontend/public/assets/flyer-wheels/ ← flyergame.png, giftflyer.png

Cible qualité export 4K (ratio 2:3)
  template{n}.png : 4096 × 6144 px (minimum 2400 × 3600)
  flyergame.png   : 2048 × 2048 px min. (PNG transparent)
  giftflyer.png   : 2700 × 2700 px min. (PNG transparent)

Workflow
  1. Déposer template1.png … templateN.png ici (+ entrées manifest.json).
  2. npm run sync-flyer-assets  (depuis le dossier fidelity)
     → copie vers myfidpass iOS (fondtemplate) et Android (drawable-nodpi).
  3. npm run deploy  (quand tu veux mettre le web à jour).

manifest.json : { "file": "template1.png", "label": "Template 1" }

Ne pas dupliquer manuellement vers Xcode ou Android — toujours passer par sync-flyer-assets.
