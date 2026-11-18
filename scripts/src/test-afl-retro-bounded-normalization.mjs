import assert from 'node:assert/strict';
import vm from 'node:vm';
import capture from './capture-insertion-proof.cjs';

class Element {
  attrs = new Map(); children = []; textContent = '';
  setAttribute(k,v) { this.attrs.set(k,v); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  hasAttribute(k) { return this.attrs.has(k); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  matches() { return true; }
}
const date = new Element(); date.textContent = 'há 2 dias';
const hero = new Element();
hero.querySelectorAll = () => [date];
date.closest = () => hero;
const main = new Element(); main.querySelectorAll = selector => selector === '*' ? [date] : [hero];
const document = {documentElement:new Element(),
  querySelector: selector => selector === 'main' ? main : selector.includes('hero-post') ? hero : null,
  querySelectorAll: selector => selector === 'main article' ? [hero] : []};
let intervals = 0, observers = 0;
const window = {location:{origin:'https://afolhalivre.com'}, clearInterval(){}, setInterval(){ intervals++; }};
const page = {evaluate: async (fn,arg) => vm.runInNewContext(`(${fn})(arg)`, {
  document, window, HTMLElement:Element, URL, Intl, arg,
  MutationObserver:class { constructor(){observers++;} observe(){} disconnect(){} }, queueMicrotask,
}, {timeout:1000})};
const result = await capture.applyAflRetroPreview(page,{domain:'afolhalivre.com',page:'home'},'2026-09-15T20:41',{
  posts:[{slug:'noticia',title:'Notícia',date:'2026-09-15T10:00:00',url:'/noticia/'}],
});
assert.equal(result.applied,true);
assert.match(date.textContent,/15\/09\/2026.*10:00/);
assert.equal(intervals,0,'captura não pode deixar varredura persistente no renderer');
assert.equal(observers,0,'normalização não pode observar as próprias mutações');
date.textContent='há 3 dias';
window.__cod5NormalizeAflRetroDates();
assert.match(date.textContent,/15\/09\/2026.*10:00/,'lazy render é normalizado explicitamente antes da captura');
console.log('ok: AFL normaliza datas com execução finita e mantém normalização explícita');
