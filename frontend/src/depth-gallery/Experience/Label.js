class Label {
  constructor(gallery) {
    this.gallery = gallery

    this.overlayElement = null
    this.leftIndexElement = null
    this.wordElement = null
    this.chipElement = null
    this.cmykValueElement = null
    this.rgbValueElement = null
    this.hexValueElement = null
    this.pmsValueElement = null
    this.activePlaneIndex = -1
  }

  createElement() {
    const element = document.createElement('section')
    element.className = 'plane-label-overlay'
    element.innerHTML = `
      <div class="plane-label-overlay__left">
        <p class="plane-label-overlay__index"></p>
        <p class="plane-label-card__word"></p>
        <span class="plane-label-overlay__chip"></span>
      </div>
      <article class="plane-label-card plane-label-overlay__right">
        <dl class="plane-label-card__specs">
          <div class="plane-label-card__row">
            <dt>CMYK</dt>
            <dd class="plane-label-card__value plane-label-card__value--cmyk"></dd>
          </div>
          <div class="plane-label-card__row">
            <dt>RGB</dt>
            <dd class="plane-label-card__value plane-label-card__value--rgb"></dd>
          </div>
          <div class="plane-label-card__row">
            <dt>HEX</dt>
            <dd class="plane-label-card__value plane-label-card__value--hex"></dd>
          </div>
          <div class="plane-label-card__row">
            <dt>PMS</dt>
            <dd class="plane-label-card__value plane-label-card__value--pms"></dd>
          </div>
        </dl>
      </article>
    `

    return {
      element,
      leftIndexElement: element.querySelector('.plane-label-overlay__index'),
      wordElement: element.querySelector('.plane-label-card__word'),
      chipElement: element.querySelector('.plane-label-overlay__chip'),
      cmykValueElement: element.querySelector('.plane-label-card__value--cmyk'),
      rgbValueElement: element.querySelector('.plane-label-card__value--rgb'),
      hexValueElement: element.querySelector('.plane-label-card__value--hex'),
      pmsValueElement: element.querySelector('.plane-label-card__value--pms'),
    }
  }

  init() {
    if (this.overlayElement) return

    const {
      element,
      leftIndexElement,
      wordElement,
      chipElement,
      cmykValueElement,
      rgbValueElement,
      hexValueElement,
      pmsValueElement,
    } = this.createElement()

    this.overlayElement = element
    this.leftIndexElement = leftIndexElement
    this.wordElement = wordElement
    this.chipElement = chipElement
    this.cmykValueElement = cmykValueElement
    this.rgbValueElement = rgbValueElement
    this.hexValueElement = hexValueElement
    this.pmsValueElement = pmsValueElement
    this.overlayElement.style.opacity = '0'

    document.body.append(this.overlayElement)
  }

  normalizeHexColor(rawColor) {
    const fallbackColor = '#ffffff'
    if (typeof rawColor !== 'string') return fallbackColor

    let hexColor = rawColor.trim()
    if (!hexColor) return fallbackColor
    if (!hexColor.startsWith('#')) {
      hexColor = `#${hexColor}`
    }

    if (/^#[0-9a-fA-F]{3}$/.test(hexColor)) {
      const shortHex = hexColor.slice(1)
      hexColor = `#${shortHex
        .split('')
        .map((character) => `${character}${character}`)
        .join('')}`
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(hexColor)) return fallbackColor
    return hexColor.toLowerCase()
  }

  hexToRgb(hexColor) {
    const normalizedColor = this.normalizeHexColor(hexColor).slice(1)
    const red = Number.parseInt(normalizedColor.slice(0, 2), 16)
    const green = Number.parseInt(normalizedColor.slice(2, 4), 16)
    const blue = Number.parseInt(normalizedColor.slice(4, 6), 16)

    return {
      r: red,
      g: green,
      b: blue,
    }
  }

  rgbToCmyk({ r, g, b }) {
    const red = r / 255
    const green = g / 255
    const blue = b / 255
    const black = 1 - Math.max(red, green, blue)

    if (black >= 0.999) {
      return { c: 0, m: 0, y: 0, k: 100 }
    }

    const cyan = ((1 - red - black) / (1 - black)) * 100
    const magenta = ((1 - green - black) / (1 - black)) * 100
    const yellow = ((1 - blue - black) / (1 - black)) * 100

    return {
      c: Math.round(cyan),
      m: Math.round(magenta),
      y: Math.round(yellow),
      k: Math.round(black * 100),
    }
  }

  buildColorSpecs(accentColor, pmsValue) {
    const normalizedAccentColor = this.normalizeHexColor(accentColor)
    const rgb = this.hexToRgb(normalizedAccentColor)
    const cmyk = this.rgbToCmyk(rgb)

    return {
      chipHex: normalizedAccentColor,
      cmyk: `${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`,
      rgb: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
      hex: normalizedAccentColor.slice(1).toUpperCase(),
      pms: pmsValue || 'N/A',
    }
  }

  getTargetPlaneIndex(cameraZ) {
    const blendData = this.gallery.getPlaneBlendData(cameraZ)
    if (!blendData) return -1
    return blendData.blend >= 0.5 ? blendData.nextPlaneIndex : blendData.currentPlaneIndex
  }

  applyPlaneContent(planeIndex) {
    const plane = this.gallery.planes[planeIndex]
    if (!plane || this.activePlaneIndex === planeIndex) return

    const labelData = plane.userData.label || {}
    const colorSpecs = this.buildColorSpecs(plane.userData.accentColor, labelData.pms)

    this.leftIndexElement.textContent = String(planeIndex + 1).padStart(2, '0')
    this.wordElement.textContent = labelData.word || 'tone'
    this.chipElement.style.backgroundColor = colorSpecs.chipHex
    this.cmykValueElement.textContent = colorSpecs.cmyk
    this.rgbValueElement.textContent = colorSpecs.rgb
    this.hexValueElement.textContent = colorSpecs.hex
    this.pmsValueElement.textContent = colorSpecs.pms
    this.overlayElement.style.color = labelData.color || ''

    this.activePlaneIndex = planeIndex
  }

  resize() {}

  update(camera = null) {
    if (!camera || !this.overlayElement) return

    const targetPlaneIndex = this.getTargetPlaneIndex(camera.position.z)
    if (targetPlaneIndex < 0) {
      this.overlayElement.style.opacity = '0'
      return
    }

    this.applyPlaneContent(targetPlaneIndex)
    this.overlayElement.style.opacity = '1'
  }

  render() {}

  dispose() {
    this.overlayElement?.remove()
    this.overlayElement = null
    this.leftIndexElement = null
    this.wordElement = null
    this.chipElement = null
    this.cmykValueElement = null
    this.rgbValueElement = null
    this.hexValueElement = null
    this.pmsValueElement = null
    this.activePlaneIndex = -1
  }
}

export { Label }
