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
 */
function markMarkup(html, query) {
  const source = String(html || '');
  const needle = escape(String(query || '')).toLowerCase();
  if (!needle) return source;

  const parts = source.split(/(<[^>]*>)/);
  const isText = (part) => Boolean(part) && part.charAt(0) !== '<';

  let plain = '';
  for (const part of parts) {
    if (isText(part)) plain += part;
  }

  const hay = plain.toLowerCase();
  const ranges = [];
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
    ranges.push([at, at + needle.length]);
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
 * Prepares an authored SVG for inlining in a page, or returns '' if it is not one.
 *
 * The file goes in raw rather than escaped, which is the point: an inlined logo drawn with
 * currentColor follows the theme, and one drawn with its own colours still costs no extra request.
 * What is removed is what cannot survive being pasted mid-document - the XML prolog and a doctype -
 * and what has no business in a logo: scripts and event handlers.
 */
function inlineSvg(source) {
  if (!source) return '';

  let svg = String(source)
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();

  const open = svg.match(/^<svg\b[^>]*>/i);
  if (!open) return '';

  // Decorative: the site name sits beside it as real text.
  if (!/\saria-hidden\s*=/i.test(open[0])) {
    svg = svg.replace(/^<svg\b/i, '<svg aria-hidden="true" focusable="false"');
  }

  return svg;
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

module.exports = { escape, attr, json, classes, truncate, inlineSvg, markMatch, markMarkup };
