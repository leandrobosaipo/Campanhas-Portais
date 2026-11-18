import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { auditHeaderAdPolicy } = createRequire(import.meta.url)('./capture-insertion-proof.cjs');

class Element {
  constructor(classes, row = true, top = 10) {
    this.className = classes;
    this.row = row;
    this.top = top;
    this.classList = { contains: value => classes.split(' ').includes(value) };
  }
  getBoundingClientRect() { return { top: this.top, left: 0, width: 300, height: 90, bottom: this.top + 90 }; }
  closest(selector) { return selector === '#header-ads-row' && this.row ? this : null; }
  matches() { return false; }
  querySelectorAll(selector) { return selector === 'img,video,picture,iframe' ? [new Image()] : []; }
}
class Image extends Element {
  constructor() { super(''); }
  getAttribute(name) { return name === 'src' ? 'https://example.test/banner.gif' : null; }
}
globalThis.HTMLElement = Element;
globalThis.HTMLImageElement = Image;
globalThis.HTMLVideoElement = class extends Element {};
globalThis.HTMLIFrameElement = class extends Element {};
globalThis.HTMLPictureElement = class extends Element {};
globalThis.window = { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) };
let groups;
globalThis.document = {
  querySelector: selector => selector === 'header.perrengue-header' ? new Element('', false, 200) : null,
  querySelectorAll: selector => selector === '.g' || selector.startsWith('#header-ads-row .g') ? groups : [],
};
const page = { evaluate: (fn, args) => fn(args) };
async function audit(...entries) {
  groups = entries.map(([name, row = true]) => new Element(name, row));
  return auditHeaderAdPolicy(page, { domain: 'perrenguematogrosso.com', groupId: 10 });
}
assert.equal((await audit(['g g-1'], ['g g-10'])).ok, true, 'two distinct legitimate header slots');
for (const group of ['g g-1', 'g g-10']) {
  assert.equal((await audit([group], [group])).ok, false, `duplicate ${group}`);
}
assert.equal((await audit(['g g-9'])).ok, false, 'popup cannot be a header slot');
assert.equal((await audit(['g g-12'])).ok, false, 'unknown header group');
console.log('ok: header slots coexist without accepting duplicates or unknown groups');
