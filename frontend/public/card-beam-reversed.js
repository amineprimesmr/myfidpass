/**
 * Card Beam Animation - Reversed (cartes gauche → droite)
 * Basé sur CodePen blacklead-studio/xbwaqxE
 * Utilise THREE (global depuis three.min.js)
 */

const SCANNER_X_RATIO = 0.38; // barre de révélation décalée à gauche (38 % de l'écran)

const codeChars =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789(){}[]<>;:,._-+=!@#$%^&*|\\/\"'`~?";

class CardStreamController {
  constructor() {
    this.container = document.getElementById("cardStream");
    this.cardLine = document.getElementById("cardLine");
    this.speedIndicator = document.getElementById("speedValue");

    this.position = 0;
    this.velocity = 120;
    this.direction = 1; // inversé: cartes gauche → droite
    this.isAnimating = true;
    this.isDragging = false;

    this.lastTime = 0;
    this.lastMouseX = 0;
    this.mouseVelocity = 0;
    this.friction = 0.95;
    this.minVelocity = 30;

    this.containerWidth = 0;
    this.cardLineWidth = 0;
    this.fullyRevealed = false;

    this.init();
  }

  init() {
    this.populateCardLine();
    this.calculateDimensions();
    this.position = -this.cardLineWidth; // inversé: départ à gauche
    this.setupEventListeners();
    this.updateCardPosition();
    this.animate();
    this.startPeriodicUpdates();
  }

  calculateDimensions() {
    this.containerWidth = this.container.offsetWidth;
    const cardWidth = 260;
    const cardGap = 60;
    const cardCount = this.cardLine.children.length;
    this.cardLineWidth = (cardWidth + cardGap) * cardCount;
  }

  setupEventListeners() {
    this.cardLine.addEventListener("mousedown", (e) => this.startDrag(e));
    document.addEventListener("mousemove", (e) => this.onDrag(e));
    document.addEventListener("mouseup", () => this.endDrag());

    this.cardLine.addEventListener(
      "touchstart",
      (e) => this.startDrag(e.touches[0]),
      { passive: false }
    );
    document.addEventListener("touchmove", (e) => this.onDrag(e.touches[0]), {
      passive: false,
    });
    document.addEventListener("touchend", () => this.endDrag());

    this.cardLine.addEventListener("wheel", (e) => this.onWheel(e));
    this.cardLine.addEventListener("selectstart", (e) => e.preventDefault());
    this.cardLine.addEventListener("dragstart", (e) => e.preventDefault());

    window.addEventListener("resize", () => this.calculateDimensions());
  }

  startDrag(e) {
    e.preventDefault();
    this.isDragging = true;
    this.isAnimating = false;
    this.lastMouseX = e.clientX;
    this.mouseVelocity = 0;

    const transform = window.getComputedStyle(this.cardLine).transform;
    if (transform !== "none") {
      const matrix = new DOMMatrix(transform);
      this.position = matrix.m41;
    }

    this.cardLine.style.animation = "none";
    this.cardLine.classList.add("dragging");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }

  onDrag(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    const deltaX = e.clientX - this.lastMouseX;
    this.position += deltaX;
    this.mouseVelocity = deltaX * 60;
    this.lastMouseX = e.clientX;
    this.cardLine.style.transform = `translateX(${this.position}px)`;
    this.updateCardClipping();
  }

  endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.cardLine.classList.remove("dragging");

    if (Math.abs(this.mouseVelocity) > this.minVelocity) {
      this.velocity = Math.abs(this.mouseVelocity);
      this.direction = this.mouseVelocity > 0 ? 1 : -1;
    } else {
      this.velocity = 120;
    }

    this.isAnimating = true;
    this.updateSpeedIndicator();
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  animate() {
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    if (this.isAnimating && !this.isDragging) {
      if (this.velocity > this.minVelocity) {
        this.velocity *= this.friction;
      } else {
        this.velocity = Math.max(this.minVelocity, this.velocity);
      }
      this.position += this.velocity * this.direction * deltaTime;
      this.updateCardPosition();
      this.updateSpeedIndicator();
    }

    requestAnimationFrame(() => this.animate());
  }

  updateCardPosition() {
    if (this.fullyRevealed) return;
    const containerWidth = this.containerWidth;
    const cardLineWidth = this.cardLineWidth;

    if (this.position < -cardLineWidth) {
      this.position = containerWidth;
    } else if (this.position > containerWidth) {
      this.position = -cardLineWidth;
    }

    this.cardLine.style.transform = `translateX(${this.position}px)`;
    this.updateCardClipping();
  }

  updateSpeedIndicator() {
    if (this.speedIndicator) {
      this.speedIndicator.textContent = Math.round(this.velocity);
    }
  }

  generateCode(width, height) {
    const randInt = (min, max) =>
      Math.floor(Math.random() * (max - min + 1)) + min;
    const pick = (arr) => arr[randInt(0, arr.length - 1)];

    const header = [
      "// compiled preview • scanner demo",
      "/* generated for visual effect – not executed */",
      "const SCAN_WIDTH = 8;",
      "const FADE_ZONE = 35;",
      "const MAX_PARTICLES = 2500;",
      "const TRANSITION = 0.05;",
    ];

    const helpers = [
      "function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }",
      "function lerp(a, b, t) { return a + (b - a) * t; }",
      "const now = () => performance.now();",
      "function rng(min, max) { return Math.random() * (max - min) + min; }",
    ];

    const particleBlock = (idx) => [
      `class Particle${idx} {`,
      " constructor(x, y, vx, vy, r, a) {",
      " this.x = x; this.y = y;",
      " this.vx = vx; this.vy = vy;",
      " this.r = r; this.a = a;",
      " }",
      " step(dt) { this.x += this.vx * dt; this.y += this.vy * dt; }",
      "}",
    ];

    const scannerBlock = [
      "const scanner = {",
      " x: Math.floor(window.innerWidth / 2),",
      " width: SCAN_WIDTH,",
      " glow: 3.5,",
      "};",
      "",
      "function drawParticle(ctx, p) {",
      " ctx.globalAlpha = clamp(p.a, 0, 1);",
      " ctx.drawImage(gradient, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);",
      "}",
    ];

    const loopBlock = [
      "function tick(t) {",
      " // requestAnimationFrame(tick);",
      " const dt = 0.016;",
      " // update & render",
      "}",
    ];

    const misc = [
      "const state = { intensity: 1.2, particles: MAX_PARTICLES };",
      "const bounds = { w: window.innerWidth, h: 300 };",
      "const gradient = document.createElement('canvas');",
      "const ctx = gradient.getContext('2d');",
      "ctx.globalCompositeOperation = 'lighter';",
      "// ascii overlay is masked with a 3-phase gradient",
    ];

    const library = [];
    header.forEach((l) => library.push(l));
    helpers.forEach((l) => library.push(l));
    for (let b = 0; b < 3; b++)
      particleBlock(b).forEach((l) => library.push(l));
    scannerBlock.forEach((l) => library.push(l));
    loopBlock.forEach((l) => library.push(l));
    misc.forEach((l) => library.push(l));

    for (let i = 0; i < 40; i++) {
      const n1 = randInt(1, 9);
      const n2 = randInt(10, 99);
      library.push(`const v${i} = (${n1} + ${n2}) * 0.${randInt(1, 9)};`);
    }
    for (let i = 0; i < 20; i++) {
      library.push(
        `if (state.intensity > ${1 + (i % 3)}) { scanner.glow += 0.01; }`
      );
    }

    let flow = library.join(" ");
    flow = flow.replace(/\s+/g, " ").trim();
    const totalChars = width * height;
    while (flow.length < totalChars + width) {
      const extra = pick(library).replace(/\s+/g, " ").trim();
      flow += " " + extra;
    }

    let out = "";
    let offset = 0;
    for (let row = 0; row < height; row++) {
      let line = flow.slice(offset, offset + width);
      if (line.length < width) line = line + " ".repeat(width - line.length);
      out += line + (row < height - 1 ? "\n" : "");
      offset += width;
    }
    return out;
  }

  calculateCodeDimensions(cardWidth, cardHeight) {
    const fontSize = 11;
    const lineHeight = 13;
    const charWidth = 6;
    const width = Math.floor(cardWidth / charWidth);
    const height = Math.floor(cardHeight / lineHeight);
    return { width, height, fontSize, lineHeight };
  }

  createCardWrapper(index) {
    const wrapper = document.createElement("div");
    wrapper.className = "card-wrapper";

    const normalCard = document.createElement("div");
    normalCard.className = "card card-normal";

    const cardImages = [
      "https://cdn.prod.website-files.com/68789c86c8bc802d61932544/689f20b55e654d1341fb06f8_4.1.png",
      "https://cdn.prod.website-files.com/68789c86c8bc802d61932544/689f20b5a080a31ee7154b19_1.png",
      "https://cdn.prod.website-files.com/68789c86c8bc802d61932544/689f20b5c1e4919fd69672b8_3.png",
      "https://cdn.prod.website-files.com/68789c86c8bc802d61932544/689f20b5f6a5e232e7beb4be_2.png",
      "https://cdn.prod.website-files.com/68789c86c8bc802d61932544/689f20b5bea2f1b07392d936_4.png",
    ];

    const cardImage = document.createElement("img");
    cardImage.className = "card-image";
    cardImage.src = cardImages[index % cardImages.length];
    cardImage.alt = "Carte";
    cardImage.onerror = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 260;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, 260, 400);
      gradient.addColorStop(0, "#667eea");
      gradient.addColorStop(1, "#764ba2");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 260, 400);
      cardImage.src = canvas.toDataURL();
    };

    normalCard.appendChild(cardImage);

    const asciiCard = document.createElement("div");
    asciiCard.className = "card card-ascii";

    const asciiContent = document.createElement("div");
    asciiContent.className = "ascii-content";

    const { width, height, fontSize, lineHeight } =
      this.calculateCodeDimensions(260, 400);
    asciiContent.style.fontSize = fontSize + "px";
    asciiContent.style.lineHeight = lineHeight + "px";
    asciiContent.textContent = this.generateCode(width, height);

    asciiCard.appendChild(asciiContent);
    wrapper.appendChild(normalCard);
    wrapper.appendChild(asciiCard);

    return wrapper;
  }

  updateCardClipping() {
    if (this.fullyRevealed) {
      document.querySelectorAll(".card-wrapper").forEach((wrapper) => {
        const normalCard = wrapper.querySelector(".card-normal");
        const asciiCard = wrapper.querySelector(".card-ascii");
        normalCard.style.setProperty("--clip-right", "0%");
        asciiCard.style.setProperty("--clip-left", "100%");
      });
      return;
    }

    const scannerX = window.innerWidth * SCANNER_X_RATIO;
    const scannerWidth = 8;
    const scannerLeft = scannerX - scannerWidth / 2;
    const scannerRight = scannerX + scannerWidth / 2;
    let anyScanningActive = false;

    document.querySelectorAll(".card-wrapper").forEach((wrapper) => {
      const rect = wrapper.getBoundingClientRect();
      const cardLeft = rect.left;
      const cardRight = rect.right;
      const cardWidth = rect.width;

      const normalCard = wrapper.querySelector(".card-normal");
      const asciiCard = wrapper.querySelector(".card-ascii");

      if (cardLeft > scannerRight && !this.fullyRevealed) {
        this.setFullyRevealed();
        return;
      }

      if (cardLeft < scannerRight && cardRight > scannerLeft) {
        anyScanningActive = true;
        const scannerIntersectLeft = Math.max(scannerLeft - cardLeft, 0);
        const scannerIntersectRight = Math.min(
          scannerRight - cardLeft,
          cardWidth
        );

        const normalClipRight = (scannerIntersectLeft / cardWidth) * 100;
        const asciiClipLeft = (scannerIntersectRight / cardWidth) * 100;

        normalCard.style.setProperty("--clip-right", `${normalClipRight}%`);
        asciiCard.style.setProperty("--clip-left", `${asciiClipLeft}%`);

        if (!wrapper.hasAttribute("data-scanned") && scannerIntersectLeft > 0) {
          wrapper.setAttribute("data-scanned", "true");
          const scanEffect = document.createElement("div");
          scanEffect.className = "scan-effect";
          wrapper.appendChild(scanEffect);
          setTimeout(() => {
            if (scanEffect.parentNode) {
              scanEffect.parentNode.removeChild(scanEffect);
            }
          }, 600);
        }
      } else {
        if (cardRight < scannerLeft) {
          normalCard.style.setProperty("--clip-right", "100%");
          asciiCard.style.setProperty("--clip-left", "100%");
        } else if (cardLeft > scannerRight) {
          normalCard.style.setProperty("--clip-right", "0%");
          asciiCard.style.setProperty("--clip-left", "0%");
        }
        wrapper.removeAttribute("data-scanned");
      }
    });

    if (window.setScannerScanning) {
      window.setScannerScanning(anyScanningActive);
    }
  }

  setFullyRevealed() {
    if (this.fullyRevealed) return;
    this.fullyRevealed = true;
    this.isAnimating = false;
    const cardWidth = 260;
    const centerX = window.innerWidth / 2;
    this.position = centerX - cardWidth / 2;
    this.cardLine.style.transform = `translateX(${this.position}px)`;
    this.updateCardClipping();
    if (window.setScannerScanning) {
      window.setScannerScanning(false);
    }
  }

  updateAsciiContent() {
    if (this.fullyRevealed) return;
    document.querySelectorAll(".ascii-content").forEach((content) => {
      if (Math.random() < 0.15) {
        const { width, height } = this.calculateCodeDimensions(260, 400);
        content.textContent = this.generateCode(width, height);
      }
    });
  }

  getMerchantCardData() {
    try {
      const raw = localStorage.getItem("fidpass_builder_draft_v2");
      if (!raw) return null;
      const d = JSON.parse(raw);
      const tplId = d.selectedTemplateId || "bold";
      const templates = {
        bold: { bg: "#2563eb", fg: "#fff", label: "#bfdbfe", format: "points" },
        "fastfood-tampons": { bg: "#c41e3a", fg: "#fff", label: "#ffd54f", format: "tampons" },
        "fastfood-points": { bg: "#c41e3a", fg: "#fff", label: "#ffd54f", format: "points" },
        classic: { bg: "#1e3a8a", fg: "#fff", label: "#dbeafe", format: "points" },
        elegant: { bg: "#8b7355", fg: "#fff", label: "#f5f0e6", format: "points" },
        "beauty-points": { bg: "#b76e79", fg: "#fff", label: "#fce4ec", format: "points" },
        "beauty-tampons": { bg: "#b76e79", fg: "#fff", label: "#fce4ec", format: "tampons" },
        "coiffure-points": { bg: "#2563eb", fg: "#fff", label: "#bfdbfe", format: "points" },
        "coiffure-tampons": { bg: "#2563eb", fg: "#fff", label: "#bfdbfe", format: "tampons" },
        "boulangerie-points": { bg: "#b8860b", fg: "#fff", label: "#fff8e1", format: "points" },
        "boulangerie-tampons": { bg: "#b8860b", fg: "#fff", label: "#fff8e1", format: "tampons" },
        "boucherie-points": { bg: "#6d2c3e", fg: "#fff", label: "#ffcdd2", format: "points" },
        "boucherie-tampons": { bg: "#6d2c3e", fg: "#fff", label: "#ffcdd2", format: "tampons" },
        "cafe-points": { bg: "#5d4e37", fg: "#fff", label: "#d7ccc8", format: "points" },
        "cafe-tampons": { bg: "#5d4e37", fg: "#fff", label: "#d7ccc8", format: "tampons" },
      };
      const tpl = templates[tplId] || (String(tplId).includes("tampons") ? templates["fastfood-tampons"] : templates.bold);
      return {
        organizationName: (d.organizationName || "Votre commerce").trim() || "Votre commerce",
        logoDataUrl: typeof d.logoDataUrl === "string" && d.logoDataUrl.startsWith("data:image/") ? d.logoDataUrl : "",
        ...tpl,
      };
    } catch (_) {
      return null;
    }
  }

  createMerchantCardWrapper(data) {
    const wrapper = document.createElement("div");
    wrapper.className = "card-wrapper";

    const normalCard = document.createElement("div");
    normalCard.className = "card card-normal";

    const headerBg = data.bg || "#2563eb";
    const bodyBg = data.bg || "#1e40af";
    const fg = data.fg || "#fff";
    const labelColor = data.label || "#bfdbfe";

    const logoHtml = data.logoDataUrl
      ? `<img src="${data.logoDataUrl.replace(/"/g, "&quot;")}" alt="" style="max-height:28px;max-width:80px;object-fit:contain" />`
      : '<span style="font-size:12px;font-weight:600;opacity:0.9">Logo</span>';
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const orgName = esc((data.organizationName || "").slice(0, 20));

    let bodyHtml;
    if (data.format === "tampons") {
      const row = (n) => Array(5).fill(0).map((_, i) => `<span style="font-size:14px;opacity:${i < n ? 1 : 0.4}">☕</span>`).join("");
      bodyHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0"><div style="display:flex;gap:2px">${row(3)}</div><div style="display:flex;gap:2px">${row(1)}</div><div style="font-size:10px;opacity:0.9">= 10</div></div>`;
    } else {
      bodyHtml = `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px"><span style="font-size:28px;font-weight:700;color:${fg}">0</span><span style="font-size:11px;color:${labelColor};text-transform:uppercase;letter-spacing:0.05em">points</span></div>`;
    }

    normalCard.innerHTML = `
      <div style="display:flex;flex-direction:column;width:100%;height:100%;border-radius:16px;overflow:hidden;background:linear-gradient(180deg,${headerBg} 0%,${bodyBg} 100%);color:${fg}">
        <div style="padding:14px 12px;min-height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;flex-shrink:0">${logoHtml}${orgName ? `<span style="font-size:12px;font-weight:600;opacity:0.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${orgName}</span>` : ""}</div>
        <div style="flex:1;padding:20px 16px;display:flex;align-items:center;justify-content:center">${bodyHtml}</div>
      </div>`;

    const asciiCard = document.createElement("div");
    asciiCard.className = "card card-ascii";
    const asciiContent = document.createElement("div");
    asciiContent.className = "ascii-content";
    const { width, height, fontSize, lineHeight } = this.calculateCodeDimensions(260, 400);
    asciiContent.style.fontSize = fontSize + "px";
    asciiContent.style.lineHeight = lineHeight + "px";
    asciiContent.textContent = this.generateCode(width, height);
    asciiCard.appendChild(asciiContent);

    wrapper.appendChild(normalCard);
    wrapper.appendChild(asciiCard);
    return wrapper;
  }

  populateCardLine() {
    this.cardLine.innerHTML = "";
    const merchantData = this.getMerchantCardData();
    const cardWrapper = merchantData
      ? this.createMerchantCardWrapper(merchantData)
      : this.createCardWrapper(0);
    this.cardLine.appendChild(cardWrapper);
  }

  startPeriodicUpdates() {
    setInterval(() => {
      this.updateAsciiContent();
    }, 200);

    const updateClipping = () => {
      this.updateCardClipping();
      requestAnimationFrame(updateClipping);
    };
    updateClipping();
  }

  resetPosition() {
    this.fullyRevealed = false;
    this.position = -this.cardLineWidth;
    this.velocity = 120;
    this.direction = 1;
    this.isAnimating = true;
    this.isDragging = false;

    this.cardLine.style.animation = "none";
    this.cardLine.style.transform = `translateX(${this.position}px)`;
    this.cardLine.classList.remove("dragging");

    this.updateSpeedIndicator();
  }
}

class ParticleSystem {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.particles = null;
    this.particleCount = 120;
    this.canvas = document.getElementById("particleCanvas");

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(
      -window.innerWidth / 2,
      window.innerWidth / 2,
      210,
      -210,
      1,
      1000
    );
    this.camera.position.z = 100;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(window.innerWidth, 420);
    this.renderer.setClearColor(0x000000, 0);

    this.createParticles();

    this.animate();

    window.addEventListener("resize", () => this.onWindowResize());
  }

  createParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);
    const sizes = new Float32Array(this.particleCount);
    const velocities = new Float32Array(this.particleCount);

    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");

    const half = canvas.width / 2;
    const hue = 217;

    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.25, "rgba(200,210,255,0.5)");
    gradient.addColorStop(0.5, "rgba(150,180,255,0.15)");
    gradient.addColorStop(1, "transparent");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);

    for (let i = 0; i < this.particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * window.innerWidth * 2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 420;
      positions[i * 3 + 2] = 0;

      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;

      const orbitRadius = Math.random() * 200 + 100;
      sizes[i] = (Math.random() * (orbitRadius - 60) + 60) / 8;

      velocities[i] = -(Math.random() * 60 + 30); // négatif: gauche → droite
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    this.velocities = velocities;

    const alphas = new Float32Array(this.particleCount);
    for (let i = 0; i < this.particleCount; i++) {
      alphas[i] = (Math.random() * 8 + 2) / 10;
    }
    geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
    this.alphas = alphas;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: texture },
        size: { value: 6.0 },
      },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        varying vec3 vColor;
        uniform float size;

        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          gl_FragColor = vec4(vColor, vAlpha) * texture2D(pointTexture, gl_PointCoord);
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      vertexColors: true,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      const alphas = this.particles.geometry.attributes.alpha.array;
      const time = Date.now() * 0.001;

      for (let i = 0; i < this.particleCount; i++) {
        positions[i * 3] -= this.velocities[i] * 0.016;

        if (positions[i * 3] < -window.innerWidth / 2 - 100) {
          positions[i * 3] = window.innerWidth / 2 + 100;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 420;
        }

        positions[i * 3 + 1] += Math.sin(time + i * 0.1) * 0.5;

        const twinkle = Math.floor(Math.random() * 10);
        if (twinkle === 1 && alphas[i] > 0) {
          alphas[i] -= 0.05;
        } else if (twinkle === 2 && alphas[i] < 1) {
          alphas[i] += 0.05;
        }

        alphas[i] = Math.max(0, Math.min(1, alphas[i]));
      }

      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.geometry.attributes.alpha.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    this.camera.left = -window.innerWidth / 2;
    this.camera.right = window.innerWidth / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, 420);
  }

  destroy() {
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
    }
  }
}

class ParticleScanner {
  constructor() {
    this.canvas = document.getElementById("scannerCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.animationId = null;

    this.w = window.innerWidth;
    this.h = 450;
    this.particles = [];
    this.count = 0;
    this.maxParticles = 800;
    this.intensity = 0.8;
    this.lightBarX = this.w * SCANNER_X_RATIO;
    this.lightBarWidth = 3;
    this.fadeZone = 60;

    this.scanTargetIntensity = 1.8;
    this.scanTargetParticles = 2500;
    this.scanTargetFadeZone = 35;

    this.scanningActive = false;

    this.baseIntensity = this.intensity;
    this.baseMaxParticles = this.maxParticles;
    this.baseFadeZone = this.fadeZone;

    this.currentIntensity = this.intensity;
    this.currentMaxParticles = this.maxParticles;
    this.currentFadeZone = this.fadeZone;
    this.transitionSpeed = 0.05;

    this.setupCanvas();
    this.createGradientCache();
    this.initParticles();
    this.animate();

    window.addEventListener("resize", () => this.onResize());
  }

  setupCanvas() {
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  onResize() {
    this.w = window.innerWidth;
    this.lightBarX = this.w * SCANNER_X_RATIO;
    this.setupCanvas();
  }

  createGradientCache() {
    this.gradientCanvas = document.createElement("canvas");
    this.gradientCtx = this.gradientCanvas.getContext("2d");
    this.gradientCanvas.width = 16;
    this.gradientCanvas.height = 16;

    const half = this.gradientCanvas.width / 2;
    const gradient = this.gradientCtx.createRadialGradient(
      half,
      half,
      0,
      half,
      half,
      half
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.3, "rgba(196, 181, 253, 0.8)");
    gradient.addColorStop(0.7, "rgba(139, 92, 246, 0.4)");
    gradient.addColorStop(1, "transparent");

    this.gradientCtx.fillStyle = gradient;
    this.gradientCtx.beginPath();
    this.gradientCtx.arc(half, half, half, 0, Math.PI * 2);
    this.gradientCtx.fill();
  }

  random(min, max) {
    if (arguments.length < 2) {
      max = min;
      min = 0;
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  randomFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  createParticle() {
    const intensityRatio = this.intensity / this.baseIntensity;
    const speedMultiplier = 1 + (intensityRatio - 1) * 1.2;
    const sizeMultiplier = 1 + (intensityRatio - 1) * 0.7;

    return {
      x:
        this.lightBarX +
        this.randomFloat(-this.lightBarWidth / 2, this.lightBarWidth / 2),
      y: this.randomFloat(0, this.h),

      vx: -this.randomFloat(0.2, 1.0) * speedMultiplier,
      vy: this.randomFloat(-0.15, 0.15) * speedMultiplier,

      radius: this.randomFloat(0.4, 1) * sizeMultiplier,
      alpha: this.randomFloat(0.6, 1),
      decay: this.randomFloat(0.005, 0.025) * (2 - intensityRatio * 0.5),
      originalAlpha: 0,
      life: 1.0,
      time: 0,
      startX: 0,

      twinkleSpeed: this.randomFloat(0.02, 0.08) * speedMultiplier,
      twinkleAmount: this.randomFloat(0.1, 0.25),
    };
  }

  initParticles() {
    for (let i = 0; i < this.maxParticles; i++) {
      const particle = this.createParticle();
      particle.originalAlpha = particle.alpha;
      particle.startX = particle.x;
      this.count++;
      this.particles[this.count] = particle;
    }
  }

  updateParticle(particle) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.time++;

    particle.alpha =
      particle.originalAlpha * particle.life +
      Math.sin(particle.time * particle.twinkleSpeed) * particle.twinkleAmount;

    particle.life -= particle.decay;

    if (particle.x < -10 || particle.life <= 0) {
      this.resetParticle(particle);
    }
  }

  resetParticle(particle) {
    particle.x =
      this.lightBarX +
      this.randomFloat(-this.lightBarWidth / 2, this.lightBarWidth / 2);
    particle.y = this.randomFloat(0, this.h);
    particle.vx = -this.randomFloat(0.2, 1.0);
    particle.vy = this.randomFloat(-0.15, 0.15);
    particle.alpha = this.randomFloat(0.6, 1);
    particle.originalAlpha = particle.alpha;
    particle.life = 1.0;
    particle.time = 0;
    particle.startX = particle.x;
  }

  drawParticle(particle) {
    if (particle.life <= 0) return;

    let fadeAlpha = 1;

    if (particle.y < this.fadeZone) {
      fadeAlpha = particle.y / this.fadeZone;
    } else if (particle.y > this.h - this.fadeZone) {
      fadeAlpha = (this.h - particle.y) / this.fadeZone;
    }

    fadeAlpha = Math.max(0, Math.min(1, fadeAlpha));

    this.ctx.globalAlpha = particle.alpha * fadeAlpha;
    this.ctx.drawImage(
      this.gradientCanvas,
      particle.x - particle.radius,
      particle.y - particle.radius,
      particle.radius * 2,
      particle.radius * 2
    );
  }

  drawLightBar() {
    const verticalGradient = this.ctx.createLinearGradient(0, 0, 0, this.h);
    verticalGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    verticalGradient.addColorStop(
      this.fadeZone / this.h,
      "rgba(255, 255, 255, 1)"
    );
    verticalGradient.addColorStop(
      1 - this.fadeZone / this.h,
      "rgba(255, 255, 255, 1)"
    );
    verticalGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    this.ctx.globalCompositeOperation = "lighter";

    const targetGlowIntensity = this.scanningActive ? 3.5 : 1;

    if (!this.currentGlowIntensity) this.currentGlowIntensity = 1;

    this.currentGlowIntensity +=
      (targetGlowIntensity - this.currentGlowIntensity) * this.transitionSpeed;

    const glowIntensity = this.currentGlowIntensity;
    const lineWidth = this.lightBarWidth;
    const glow1Alpha = this.scanningActive ? 1.0 : 0.8;
    const glow2Alpha = this.scanningActive ? 0.8 : 0.6;
    const glow3Alpha = this.scanningActive ? 0.6 : 0.4;

    const coreGradient = this.ctx.createLinearGradient(
      this.lightBarX - lineWidth / 2,
      0,
      this.lightBarX + lineWidth / 2,
      0
    );
    coreGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    coreGradient.addColorStop(
      0.3,
      `rgba(255, 255, 255, ${0.9 * glowIntensity})`
    );
    coreGradient.addColorStop(0.5, `rgba(255, 255, 255, ${1 * glowIntensity})`);
    coreGradient.addColorStop(
      0.7,
      `rgba(255, 255, 255, ${0.9 * glowIntensity})`
    );
    coreGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = coreGradient;

    const radius = 15;
    this.ctx.beginPath();
    if (this.ctx.roundRect) {
      this.ctx.roundRect(
        this.lightBarX - lineWidth / 2,
        0,
        lineWidth,
        this.h,
        radius
      );
    } else {
      this.ctx.rect(
        this.lightBarX - lineWidth / 2,
        0,
        lineWidth,
        this.h
      );
    }
    this.ctx.fill();

    const glow1Gradient = this.ctx.createLinearGradient(
      this.lightBarX - lineWidth * 2,
      0,
      this.lightBarX + lineWidth * 2,
      0
    );
    glow1Gradient.addColorStop(0, "rgba(139, 92, 246, 0)");
    glow1Gradient.addColorStop(
      0.5,
      `rgba(196, 181, 253, ${0.8 * glowIntensity})`
    );
    glow1Gradient.addColorStop(1, "rgba(139, 92, 246, 0)");

    this.ctx.globalAlpha = glow1Alpha;
    this.ctx.fillStyle = glow1Gradient;

    const glow1Radius = 25;
    this.ctx.beginPath();
    if (this.ctx.roundRect) {
      this.ctx.roundRect(
        this.lightBarX - lineWidth * 2,
        0,
        lineWidth * 4,
        this.h,
        glow1Radius
      );
    } else {
      this.ctx.rect(
        this.lightBarX - lineWidth * 2,
        0,
        lineWidth * 4,
        this.h
      );
    }
    this.ctx.fill();

    const glow2Gradient = this.ctx.createLinearGradient(
      this.lightBarX - lineWidth * 4,
      0,
      this.lightBarX + lineWidth * 4,
      0
    );
    glow2Gradient.addColorStop(0, "rgba(139, 92, 246, 0)");
    glow2Gradient.addColorStop(
      0.5,
      `rgba(139, 92, 246, ${0.4 * glowIntensity})`
    );
    glow2Gradient.addColorStop(1, "rgba(139, 92, 246, 0)");

    this.ctx.globalAlpha = glow2Alpha;
    this.ctx.fillStyle = glow2Gradient;

    const glow2Radius = 35;
    this.ctx.beginPath();
    if (this.ctx.roundRect) {
      this.ctx.roundRect(
        this.lightBarX - lineWidth * 4,
        0,
        lineWidth * 8,
        this.h,
        glow2Radius
      );
    } else {
      this.ctx.rect(
        this.lightBarX - lineWidth * 4,
        0,
        lineWidth * 8,
        this.h
      );
    }
    this.ctx.fill();

    if (this.scanningActive) {
      const glow3Gradient = this.ctx.createLinearGradient(
        this.lightBarX - lineWidth * 8,
        0,
        this.lightBarX + lineWidth * 8,
        0
      );
      glow3Gradient.addColorStop(0, "rgba(139, 92, 246, 0)");
      glow3Gradient.addColorStop(0.5, "rgba(139, 92, 246, 0.2)");
      glow3Gradient.addColorStop(1, "rgba(139, 92, 246, 0)");

      this.ctx.globalAlpha = glow3Alpha;
      this.ctx.fillStyle = glow3Gradient;

      const glow3Radius = 45;
      this.ctx.beginPath();
      if (this.ctx.roundRect) {
        this.ctx.roundRect(
          this.lightBarX - lineWidth * 8,
          0,
          lineWidth * 16,
          this.h,
          glow3Radius
        );
      } else {
        this.ctx.rect(
          this.lightBarX - lineWidth * 8,
          0,
          lineWidth * 16,
          this.h
        );
      }
      this.ctx.fill();
    }

    this.ctx.globalCompositeOperation = "destination-in";
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = verticalGradient;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  render() {
    const targetIntensity = this.scanningActive
      ? this.scanTargetIntensity
      : this.baseIntensity;
    const targetMaxParticles = this.scanningActive
      ? this.scanTargetParticles
      : this.baseMaxParticles;
    const targetFadeZone = this.scanningActive
      ? this.scanTargetFadeZone
      : this.baseFadeZone;

    this.currentIntensity +=
      (targetIntensity - this.currentIntensity) * this.transitionSpeed;
    this.currentMaxParticles +=
      (targetMaxParticles - this.currentMaxParticles) * this.transitionSpeed;
    this.currentFadeZone +=
      (targetFadeZone - this.currentFadeZone) * this.transitionSpeed;

    this.intensity = this.currentIntensity;
    this.maxParticles = Math.floor(this.currentMaxParticles);
    this.fadeZone = this.currentFadeZone;

    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.clearRect(0, 0, this.w, this.h);

    this.drawLightBar();

    this.ctx.globalCompositeOperation = "lighter";
    for (let i = 1; i <= this.count; i++) {
      if (this.particles[i]) {
        this.updateParticle(this.particles[i]);
        this.drawParticle(this.particles[i]);
      }
    }

    const currentIntensity = this.intensity;
    const currentMaxParticles = this.maxParticles;

    if (Math.random() < currentIntensity && this.count < currentMaxParticles) {
      const particle = this.createParticle();
      particle.originalAlpha = particle.alpha;
      particle.startX = particle.x;
      this.count++;
      this.particles[this.count] = particle;
    }

    const intensityRatio = this.intensity / this.baseIntensity;

    if (intensityRatio > 1.1 && Math.random() < (intensityRatio - 1.0) * 1.2) {
      const particle = this.createParticle();
      particle.originalAlpha = particle.alpha;
      particle.startX = particle.x;
      this.count++;
      this.particles[this.count] = particle;
    }

    if (intensityRatio > 1.3 && Math.random() < (intensityRatio - 1.3) * 1.4) {
      const particle = this.createParticle();
      particle.originalAlpha = particle.alpha;
      particle.startX = particle.x;
      this.count++;
      this.particles[this.count] = particle;
    }

    if (intensityRatio > 1.5 && Math.random() < (intensityRatio - 1.5) * 1.8) {
      const particle = this.createParticle();
      particle.originalAlpha = particle.alpha;
      particle.startX = particle.x;
      this.count++;
      this.particles[this.count] = particle;
    }

    if (intensityRatio > 2.0 && Math.random() < (intensityRatio - 2.0) * 2.0) {
      const particle = this.createParticle();
      particle.originalAlpha = particle.alpha;
      particle.startX = particle.x;
      this.count++;
      this.particles[this.count] = particle;
    }

    if (this.count > currentMaxParticles + 200) {
      const excessCount = Math.min(15, this.count - currentMaxParticles);
      for (let i = 0; i < excessCount; i++) {
        delete this.particles[this.count - i];
      }
      this.count -= excessCount;
    }
  }

  animate() {
    this.render();
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  setScanningActive(active) {
    this.scanningActive = active;
  }

  getStats() {
    return {
      intensity: this.intensity,
      maxParticles: this.maxParticles,
      currentParticles: this.count,
      lightBarWidth: this.lightBarWidth,
      fadeZone: this.fadeZone,
      scanningActive: this.scanningActive,
      canvasWidth: this.w,
      canvasHeight: this.h,
    };
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.particles = [];
    this.count = 0;
  }
}

let cardStream;
let particleSystem;
let particleScanner;

document.addEventListener("DOMContentLoaded", () => {
  if (typeof THREE === "undefined") {
    console.error("THREE.js non chargé. Inclure three.min.js avant ce script.");
    return;
  }

  cardStream = new CardStreamController();
  particleSystem = new ParticleSystem();
  particleScanner = new ParticleScanner();

  window.setScannerScanning = (active) => {
    if (particleScanner) {
      particleScanner.setScanningActive(active);
    }
  };

  window.getScannerStats = () => {
    if (particleScanner) {
      return particleScanner.getStats();
    }
    return null;
  };

  window.resetCardBeamPosition = () => {
    if (cardStream) {
      cardStream.resetPosition();
    }
  };
});
