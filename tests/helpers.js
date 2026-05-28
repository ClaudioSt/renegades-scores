'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * Reads widget.html, extracts the <script> block, strips the IIFE initializer,
 * and runs the pure functions in a sandboxed VM context.
 *
 * Returns the context object — every `var` declared at the top level of the
 * widget script is a property on it.
 */
function loadWidgetContext(overrides) {
  const html   = fs.readFileSync(path.join(ROOT, 'widget.html'), 'utf8');
  const match  = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('No <script> block found in widget.html');

  // Strip only the async IIFE bootstrap (network calls) and ResizeObserver
  // wiring, but keep reportHeight and other post-IIFE declarations.
  let script = match[1];
  // Normalize line endings so indexOf works on both Windows (\r\n) and Unix (\n)
  script = script.replace(/\r\n/g, '\n');
  const initIdx = script.indexOf('\n// ── INIT');
  const iifeEnd = script.indexOf('\n})();\n', initIdx);
  if (initIdx !== -1 && iifeEnd !== -1) {
    script = script.slice(0, initIdx) + script.slice(iifeEnd + '\n})();\n'.length);
  } else if (initIdx !== -1) {
    script = script.slice(0, initIdx);
  }
  // Strip ResizeObserver live-wiring (uses document.body at module load)
  script = script.replace(/new ResizeObserver[\s\S]*?\.observe\([^;]+\);/, '');

  // Minimal localStorage mock backed by a plain object
  const _store = {};
  const localStorage = {
    getItem:    (k)    => Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null,
    setItem:    (k, v) => { _store[k] = String(v); },
    removeItem: (k)    => { delete _store[k]; },
    clear:      ()     => { Object.keys(_store).forEach(k => delete _store[k]); },
    _store,
  };

  const context = vm.createContext(Object.assign({
    // Browser globals used by pure functions
    URLSearchParams,
    encodeURIComponent,
    Math, Number, String, JSON, Date, Set, Array, Object,
    parseInt, parseFloat, Error, Boolean, isNaN, isFinite,
    Promise, setTimeout, clearTimeout, console,

    // Minimal DOM stubs (render functions only build strings, no real DOM access)
    window: {
      location: { search: '', href: 'http://localhost/widget.html' },
      parent:   { postMessage: () => {} },
    },
    document: {
      getElementById:   () => null,
      createElement:    (tag) => ({ tagName: tag, className: '', innerHTML: '', appendChild: () => {} }),
      documentElement:  { style: { setProperty: () => {} } },
      body:             { classList: { add: () => {}, remove: () => {} }, getBoundingClientRect: () => ({ height: 0 }) },
    },
    localStorage,
    ResizeObserver: class { constructor() {} observe() {} },
    fetch: async () => { throw new Error('fetch() not mocked in this test'); },
  }, overrides || {}));

  vm.runInContext(script, context);
  return context;
}

/**
 * Returns a fresh VM context (independent localStorage, clean module state).
 */
function freshContext(overrides) {
  return loadWidgetContext(overrides);
}

module.exports = { freshContext, ROOT };
