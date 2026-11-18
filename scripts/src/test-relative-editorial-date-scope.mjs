import assert from 'node:assert/strict';
import vm from 'node:vm';
import capture from './capture-insertion-proof.cjs';

class Element {
  constructor(text = '') { this.textContent = text; }
  getBoundingClientRect() { return { width: 100, height: 40 }; }
  closest() { return null; }
  matches() { return false; }
  getAttribute(name) { return name === 'datetime' ? '2026-09-15T16:15:00' : null; }
}
const title = new Element('Elefante que vive há 40 anos em Sorocaba');
const date = new Element('15/09/2026 16:15');
const link = { href: 'https://afolhalivre.com/elefante/', textContent: title.textContent };
const card = new Element(`${title.textContent} ${date.textContent}`);
card.querySelectorAll = selector => selector === 'a[href]' ? [link] : selector === 'time[datetime]' || selector === 'time' ? [date] : [];
card.querySelector = () => title;
card.matches = selector => selector === '[data-adops-retro-post-date]';
const page = { evaluate: (fn, arg) => vm.runInNewContext(`(${fn})(arg)`, {
  arg, URL, HTMLElement: Element,
  document: { querySelectorAll: selector => selector === 'article' ? [card] : [], querySelector: () => null },
  window: { location: { href: 'https://afolhalivre.com/', origin: 'https://afolhalivre.com' }, getComputedStyle: () => ({}) },
  fetch: async () => ({ ok: false }),
}) };
const read = () => capture.collectRetroContentEvidence(page, { page: 'home', auditConfig: {} }, '2026-09-15T20:41', null);
assert.deepEqual(Array.from((await read()).contentRelativeTimeSamples), [], 'texto do título não é data de publicação');
date.textContent = 'há 2 dias';
assert.deepEqual(Array.from((await read()).contentRelativeTimeSamples), ['há 2 dias'], 'data relativa real continua bloqueada mesmo com datetime absoluto');
console.log('ok: relative editorial dates exclude headlines and retain timestamp checks');
