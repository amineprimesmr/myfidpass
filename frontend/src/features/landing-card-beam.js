const CARD_IMAGES = [
  "/assets/caroussel/miecaline.png",
  "/assets/caroussel/nike.png",
  "/assets/caroussel/tastycrousty.png",
  "/assets/caroussel/sephora.png",
  "/assets/caroussel/gladalle.png",
  "/assets/caroussel/kazdal.png",
];

let mounted = false;

function makeAscii(width, height) {
  const lines = [];
  const chars = "abcdef0123456789(){}[]<>+-=/*";
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      row += chars[Math.floor(Math.random() * chars.length)];
    }
    lines.push(row);
  }
  return lines.join("\n");
}

function createCard(src) {
  const wrapper = document.createElement("article");
  wrapper.className = "landing-card-beam-card";

  const normal = document.createElement("div");
  normal.className = "landing-card-beam-card-normal";
  const img = new Image();
  img.src = src;
  img.alt = "Carte";
  img.loading = "eager";
  img.decoding = "async";
  img.draggable = false;
  normal.appendChild(img);

  const ascii = document.createElement("div");
  ascii.className = "landing-card-beam-card-ascii";
  const pre = document.createElement("pre");
  pre.className = "landing-card-beam-ascii-content";
  pre.textContent = makeAscii(58, 22);
  ascii.appendChild(pre);

  wrapper.appendChild(normal);
  wrapper.appendChild(ascii);
  return wrapper;
}

export function mountLandingCardBeam() {
  const stage = document.getElementById("landing-card-beam-stage");
  const stream = document.getElementById("landing-card-beam-stream");
  if (!stage || !stream || mounted) return;
  mounted = true;

  const cards = [];
  for (let i = 0; i < 18; i++) {
    const card = createCard(CARD_IMAGES[i % CARD_IMAGES.length]);
    stream.appendChild(card);
    cards.push(card);
  }

  let cardWidth = 260;
  let gap = 42;
  let trackWidth = 0;
  let pos = 0;
  let velocity = -90;
  let dragging = false;
  let lastX = 0;
  let lastTime = 0;
  let lastDelta = 0;

  function measure() {
    const sample = cards[0];
    if (!sample) return;
    cardWidth = sample.getBoundingClientRect().width;
    gap = parseFloat(getComputedStyle(stream).gap || "42");
    trackWidth = cards.length * (cardWidth + gap);
  }

  function updateClipping() {
    const scannerX = stage.getBoundingClientRect().left + stage.clientWidth / 2;
    const scannerW = 8;
    const scannerLeft = scannerX - scannerW / 2;
    const scannerRight = scannerX + scannerW / 2;

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const cardLeft = rect.left;
      const cardRight = rect.right;
      const width = rect.width || 1;
      if (cardLeft < scannerRight && cardRight > scannerLeft) {
        const interLeft = Math.max(scannerLeft - cardLeft, 0);
        const interRight = Math.min(scannerRight - cardLeft, width);
        const normalClipRight = (interLeft / width) * 100;
        const asciiClipLeft = (interRight / width) * 100;
        card.style.setProperty("--clip-right", `${normalClipRight}%`);
        card.style.setProperty("--clip-left", `${asciiClipLeft}%`);
      } else if (cardRight < scannerLeft) {
        card.style.setProperty("--clip-right", "100%");
        card.style.setProperty("--clip-left", "100%");
      } else {
        card.style.setProperty("--clip-right", "0%");
        card.style.setProperty("--clip-left", "0%");
      }
    });
  }

  function loop(ts) {
    const dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;
    if (!dragging) {
      pos += velocity * dt;
      if (pos < -trackWidth) pos = stage.clientWidth;
      if (pos > stage.clientWidth) pos = -trackWidth;
      stream.style.transform = `translateX(${pos}px)`;
    }
    updateClipping();
    requestAnimationFrame(loop);
  }

  stage.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastTime = performance.now();
    lastDelta = 0;
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    const dt = Math.max(1, now - lastTime) / 1000;
    pos += dx;
    stream.style.transform = `translateX(${pos}px)`;
    lastDelta = dx / dt;
    lastX = e.clientX;
    lastTime = now;
  });

  stage.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    velocity = Math.max(-220, Math.min(220, lastDelta));
    stage.releasePointerCapture(e.pointerId);
  });

  setInterval(() => {
    stream.querySelectorAll(".landing-card-beam-ascii-content").forEach((el) => {
      if (Math.random() < 0.2) el.textContent = makeAscii(58, 22);
    });
  }, 220);

  measure();
  pos = stage.clientWidth * 0.2;
  stream.style.transform = `translateX(${pos}px)`;
  window.addEventListener("resize", measure);
  requestAnimationFrame(loop);
}
