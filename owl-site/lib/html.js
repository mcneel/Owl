'use strict';

/**
 * HTML escaping and small markup helpers.
 *
 * Every string that reaches the page goes through escape() or attr(). The model holds signatures
 * and generic names with real '<' and '>' characters, so nothing here can be trusted raw.
 */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for use in element content. */
function escape(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Escapes text for use inside a double-quoted attribute. */
function attr(value) {
  return escape(value);
}

/**
 * Serializes a value for embedding in a <script> block.
 *
 * JSON.stringify alone is not enough: a '</script>' sequence inside a doc comment would end the
 * block early, and U+2028/U+2029 are literal line terminators in JavaScript.
 */
function json(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Joins class names, dropping empty ones. */
function classes(...names) {
  return names.filter(Boolean).join(' ');
}

/**
 * Escapes text, wrapping every case-insensitive occurrence of a query in a <mark>.
 *
 * The split happens on the raw text and each piece is escaped separately, because escaping first
 * would move the offsets: a single '&' becomes five characters.
 */
function markMatch(text, query) {
  const value = String(text || '');
  const needle = String(query || '').toLowerCase();
  if (!needle) return escape(value);

  const hay = value.toLowerCase();
  let out = '';
  let at = 0;

  for (;;) {
    const found = hay.indexOf(needle, at);
    if (found < 0) break;
    out += escape(value.slice(at, found));
    out += `<mark>${escape(value.slice(found, found + needle.length))}</mark>`;
    at = found + needle.length;
  }

  return out + escape(value.slice(at));
}

/**
 * Marks query matches inside markup that is already escaped and tagged, such as highlighted code.
 *
 * The match runs against the text with the tags taken out, then the marks are cut back in around
 * them. Searching each tag's text on its own would miss anything spanning two of them, and a query
 * like 'T notifier' spans two every time: the highlighter puts 'T' in a token span and leaves
 * ' notifier' outside it.
 *
 * Only text between tags is ever wrapped, so a mark cannot land in a class attribute, and the query
 * is escaped the way the text was, so searching '<' still finds '&lt;'.
 *
 * A lead is text a match must be preceded by to count, and which stays outside the mark. Searching
 * a member name behind a '.' marks the Bake in 'mesh.Bake' and nothing in a local called bake, and
 * leaving the dot unmarked keeps the highlight to one <mark> rather than one either side of the
 * token boundary the highlighter put between them.
 */
function markMarkup(html, query, lead = '') {
  const source = String(html || '');
  const needle = escape(String(query || '')).toLowerCase();
  if (!needle) return source;

  const prefix = escape(String(lead || '')).toLowerCase();
  const search = prefix + needle;

  const parts = source.split(/(<[^>]*>)/);
  const isText = (part) => Boolean(part) && part.charAt(0) !== '<';

  let plain = '';
  for (const part of parts) {
    if (isText(part)) plain += part;
  }

  const hay = plain.toLowerCase();
  const ranges = [];
  for (let at = hay.indexOf(search); at >= 0; at = hay.indexOf(search, at + search.length)) {
    ranges.push([at + prefix.length, at + search.length]);
  }

  if (ranges.length === 0) return source;

  let out = '';
  let offset = 0;

  for (const part of parts) {
    if (!isText(part)) {
      out += part;
      continue;
    }

    const start = offset;
    const stop = offset + part.length;
    offset = stop;

    // Emit this run of text, wrapping whatever slice of it each overlapping match covers.
    let cursor = start;
    for (const [from, to] of ranges) {
      if (to <= cursor || from >= stop) continue;
      const open = Math.max(from, cursor);
      const close = Math.min(to, stop);
      out += part.slice(cursor - start, open - start);
      out += `<mark>${part.slice(open - start, close - start)}</mark>`;
      cursor = close;
    }
    out += part.slice(cursor - start);
  }

  return out;
}

/**
 * Checks an authored SVG and returns it ready to serve as a file, or '' if it is not one.
 *
 * Scripts and event handlers are removed: an <img> would not run them, but the file is also
 * reachable at its own url on the site's origin, where it would.
 */
function cleanSvg(source) {
  if (!source) return '';

  const svg = String(source)
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();

  // The prolog, a doctype and comments may come before the root, and nothing else may.
  const body = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  return /^<svg\b/i.test(body) ? svg : '';
}

/**
 * Truncates plain text to a length suitable for a meta description, breaking on a word
 * boundary rather than mid-word.
 */
function truncate(text, limit = 155) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.]$/, '') + '…';
}

module.exports = { escape, attr, json, classes, truncate, cleanSvg, markMatch, markMarkup };
