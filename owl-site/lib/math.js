'use strict';

const temml = require('./vendor/temml.cjs');

/**
 * Math, typeset while the page is built.
 *
 * TeX goes in and MathML comes out, which every current browser draws natively. The reasoning is
 * the highlighter's and the diagram renderer's: nothing is shipped to the reader to do work that
 * was already known here, the export fetches nothing, and an equation stays text - selectable,
 * searchable, and scaling with the paragraph's font rather than pinned to whatever size an image
 * was drawn at.
 *
 * This is why a converter is vendored rather than a client library loaded. See lib/vendor/README.md.
 */

/**
 * An equation as MathML, or null when the TeX does not parse.
 *
 * Null rather than Temml's own error markup: a broken formula in red inside the paragraph tells
 * the reader about a mistake that is not theirs, and the caller has something better to do with it
 * - show what the author wrote, and say so in the build log.
 */
function render(tex, display = false) {
  const source = String(tex || '').trim();
  if (!source) return null;

  try {
    return temml.renderToString(source, {
      displayMode: Boolean(display),
      throwOnError: true,
      // The site is the author's own; a \href in their own prose is theirs to write.
      trust: true,
    });
  } catch {
    return null;
  }
}

module.exports = { render };
