'use strict';

/**
 * The kind icons: the drawings a row wears in place of a letter.
 *
 * The art lives in owl-site/icons as one 16x16 svg per icon, stated in currentColor and nothing
 * else, so a single drawing serves every kind that shares it and takes its colour from whatever
 * draws it - which is the --kind property for that kind, the same one the letters were painted from.
 *
 * They are drawn from a sprite rather than written out where they are used. A sidebar tree runs to
 * hundreds of rows and the smallest of these drawings is a few hundred bytes of path data, so a page
 * that inlined each one would carry the same geometry over and over. Instead every icon is declared
 * once per document and each row is a <use> of it, which is a few dozen bytes.
 *
 * The whole set is declared on every page, not the part the page happens to render: the search box
 * in the header draws rows for whatever the reader types, and an icon it asked for that the page
 * never declared would come out blank.
 */

const fs = require('node:fs');
const path = require('node:path');

const ICON_DIR = path.join(__dirname, '..', 'icons');

/**
 * Every icon the site draws, named after its file.
 *
 * Listed rather than read off the directory, so a file that fails to arrive is a startup error
 * naming what is missing rather than a row that silently draws nothing.
 */
const NAMES = [
  'assembly',
  'class',
  'constant',
  'constructor',
  'enum',
  'event',
  'field',
  'interface',
  'method',
  'namespace',
  'property',
  'struct',
];

// Prefixed, because these ids share the document with every anchor on the page.
const ID_PREFIX = 'kind-';

/**
 * One icon's inner markup, with the <svg> wrapper taken off.
 *
 * The wrapper is what the sprite replaces with a <symbol>, and the files are written so nothing on
 * it needs carrying over: the fill, the fill rule and the stroke joins all sit on a group inside.
 */
function readIcon(name) {
  const source = fs.readFileSync(path.join(ICON_DIR, `${name}.svg`), 'utf8');
  const open = source.match(/<svg\b[^>]*>/i);
  const end = source.lastIndexOf('</svg>');

  if (!open || end < 0) throw new Error(`owl-site/icons/${name}.svg is not an <svg> document`);
  return source.slice(open.index + open[0].length, end).trim();
}

// Read once at load, which is all a build needs. serve.js drops lib/ from the require cache when it
// reloads and watches icons/ as well, so editing a drawing comes back on the next request.
const MARKUP = new Map(NAMES.map((name) => [name, readIcon(name)]));

/** Every icon as a <symbol>, for the top of the document. Hidden, and never rendered directly. */
function spriteHtml() {
  const symbols = NAMES.map(
    (name) =>
      `<symbol id="${ID_PREFIX}${name}" viewBox="0 0 16 16">${MARKUP.get(name)}</symbol>`
  ).join('');

  return `<svg class="icon-sprite" aria-hidden="true" focusable="false">${symbols}</svg>`;
}

/**
 * One icon, ready to be dropped into a row.
 *
 * No colour: every kind is drawn in one ink, so the stylesheet paints .kind-icon and none of these
 * carries a colour of its own. No viewBox either - the symbol has one, and a second would scale the
 * drawing twice.
 */
function iconHtml(name) {
  if (!MARKUP.has(name)) return '';

  return (
    '<svg class="kind-icon" aria-hidden="true" focusable="false">' +
    `<use href="#${ID_PREFIX}${name}"/></svg>`
  );
}

module.exports = { NAMES, ID_PREFIX, spriteHtml, iconHtml };
