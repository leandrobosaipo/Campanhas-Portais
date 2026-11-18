import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  applyReferenceFrameToDomMediaInPage,
  buildReferenceFrameOverlayLayout,
} = require("./capture-insertion-proof.cjs");

class FakeStyle {
  setProperty(name, value) {
    const camelName = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    this[camelName] = String(value);
  }
}

class FakeClassList {
  constructor(values = []) {
    this.values = new Set(values);
  }
  contains(value) {
    return this.values.has(value);
  }
}

function matchesSelector(node, selector) {
  if (selector === "img") return node instanceof FakeImageElement;
  if (selector === "video") return node instanceof FakeVideoElement;
  if (selector === "img, video") return node instanceof FakeImageElement || node instanceof FakeVideoElement;
  if (selector === ".g-dyn") return node.classList.contains("g-dyn");
  const id = selector.match(/^#(.+)$/)?.[1];
  if (id) return node.getAttribute("id") === id;
  const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (attr) {
    return node.hasAttribute(attr[1]) && (attr[2] === undefined || node.getAttribute(attr[1]) === attr[2]);
  }
  return false;
}

class FakeElement {
  constructor(tagName, { classes = [], rect = null } = {}) {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList(classes);
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.isConnected = true;
    this.rect = rect;
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  set textContent(_value) {
    this.children.forEach((child) => { child.parentElement = null; });
    this.children = [];
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
    this.isConnected = false;
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  querySelector(selector) {
    const direct = selector.match(/^:scope > (.+)$/)?.[1];
    if (direct) return this.children.find((child) => matchesSelector(child, direct)) ?? null;
    const queue = [...this.children];
    while (queue.length) {
      const current = queue.shift();
      if (matchesSelector(current, selector)) return current;
      queue.push(...current.children);
    }
    return null;
  }
  getBoundingClientRect() {
    if (this.rect) return { ...this.rect };
    if (this.parentElement && this.style.position === "absolute" && this.style.inset === "0") {
      return this.parentElement.getBoundingClientRect();
    }
    if (this.parentElement && this.style.width === "100%" && this.style.height === "100%") {
      return this.parentElement.getBoundingClientRect();
    }
    return { left: 0, top: 0, width: 0, height: 0 };
  }
}

class FakeImageElement extends FakeElement {
  constructor(options) {
    super("img", options);
  }
}

class FakeVideoElement extends FakeElement {
  constructor(options) {
    super("video", options);
  }
}

const slot = new FakeElement("div", { classes: ["g"], rect: { left: 40, top: 80, width: 825, height: 120 } });
const wrapper = slot.appendChild(new FakeElement("div", { classes: ["g-dyn"] }));
const originalImage = wrapper.appendChild(new FakeImageElement({ rect: { left: 40, top: 80, width: 825, height: 120 } }));
originalImage.setAttribute("id", "media");
originalImage.setAttribute("src", "https://example.test/original.gif");

const fakeDocument = {
  querySelector(selector) {
    if (matchesSelector(slot, selector)) return slot;
    return slot.querySelector(selector);
  },
  createElement(tagName) {
    if (tagName === "img") return new FakeImageElement();
    if (tagName === "video") return new FakeVideoElement();
    return new FakeElement(tagName);
  },
};

const previousGlobals = {
  document: globalThis.document,
  window: globalThis.window,
  HTMLElement: globalThis.HTMLElement,
  HTMLImageElement: globalThis.HTMLImageElement,
  HTMLVideoElement: globalThis.HTMLVideoElement,
  requestAnimationFrame: globalThis.requestAnimationFrame,
};

globalThis.document = fakeDocument;
globalThis.window = {
  setInterval,
  clearInterval,
  __adopsReferenceFrameLockInterval: null,
};
globalThis.HTMLElement = FakeElement;
globalThis.HTMLImageElement = FakeImageElement;
globalThis.HTMLVideoElement = FakeVideoElement;
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

try {
  const result = await applyReferenceFrameToDomMediaInPage({
    selector: "#media",
    dataUrl: "data:image/png;base64,FRAME",
    overlayLayout: buildReferenceFrameOverlayLayout(),
    lockIntervalMs: 10,
  });
  assert.equal(result.ok, true);
  const overlay = slot.querySelector('[data-adops-reference-frame-overlay="1"]');
  const overlayImage = slot.querySelector('[data-adops-reference-frame-overlay-image="1"]');
  assert(overlay, "o overlay deve existir");
  assert(overlayImage, "a imagem estável deve existir");
  assert.equal(overlay.parentElement, slot, "o overlay deve ser filho direto do slot");
  assert.equal(slot.style.position, "relative");
  assert.equal(slot.style.overflow, "hidden");
  assert.deepEqual(overlay.getBoundingClientRect(), slot.getBoundingClientRect());
  assert.equal(overlayImage.style.objectFit, "contain");
  assert.equal(overlayImage.style.objectPosition, "center center");
  assert.equal(overlayImage.getAttribute("data-adops-reference-frame-locked"), "1");

  overlayImage.setAttribute("src", "https://example.test/mutated.gif");
  overlayImage.style.objectFit = "cover";
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(overlayImage.getAttribute("src"), "data:image/png;base64,FRAME");
  assert.equal(overlayImage.style.objectFit, "contain");
} finally {
  if (globalThis.window?.__adopsReferenceFrameLockInterval) {
    clearInterval(globalThis.window.__adopsReferenceFrameLockInterval);
  }
  Object.assign(globalThis, previousGlobals);
}

console.log(JSON.stringify({ ok: true }));
