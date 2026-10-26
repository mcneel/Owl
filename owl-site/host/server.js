#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Serves an exported site, written next to it by `owl build --server`.
 *
 * Old Sandcastle and docify urls get a real redirect, and a type page asked for with ?member= previews
 * as that member. Listens on PORT, or 3000 without one.
 *
 * Usage:
 *   npm start
 */

// Filled in by build.js with the --base the site was built for.
const BASE = '__OWL_BASE__';
const ROOT = path.join(__dirname, 'site');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const redirectsFile = path.join(ROOT, 'redirects.json');
const moved = fs.existsSync(redirectsFile) ? JSON.parse(fs.readFileSync(redirectsFile, 'utf8')) : {};

/** Turns a page's html back into the text a preview shows, entities kept for the attribute it lands in. */
function text(html) {
  return html.replace(/<[^>]*>/g, '').replace(/"/g, '&quot;').replace(/\s+/g, ' ').trim();
}

/** Cuts a description to what a preview card shows, at a word where it can. */
function truncate(value, limit = 155) {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, '') + '…';
}

/**
 * The member a type page carries under anchor, as { title, description }, or null when the page
 * declares no such member. Inherited cards are skipped: their member previews on another type's page.
 */
function memberPreview(html, anchor) {
  const id = ` id="${anchor.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;

  // A section can share its id with a member's anchor, so only a member card or row counts.
  for (let at = html.indexOf(id); at !== -1; at = html.indexOf(id, at + 1)) {
    const open = html.lastIndexOf('<', at);
    const tag = html.slice(open, html.indexOf('>', at) + 1);
    const card = /^<div class="member[ "]/.test(tag) && !/^<div class="member inherited/.test(tag);
    const row = tag.startsWith('<tr ');
    if (!card && !row) continue;

    const rest = html.slice(at);
    const end = row ? rest.indexOf('</tr>') : rest.search(/<div class="member[ "]/);
    const body = end === -1 ? rest : rest.slice(0, end);
    const kind = (/data-kind="([^"]*)"/.exec(tag) || [])[1] || 'member';

    const heading = /<h1 class="page-title">([\s\S]*?)<\/h1>/.exec(html);
    const type = heading ? text(heading[1]) : '';

    let name;
    let summary;
    if (row) {
      const mark = /<td class="op-mark">([\s\S]*?)<\/td>/.exec(body);
      const value = /<span class="enum-name-row">([\s\S]*?)<\/span>/.exec(body);
      name = mark ? `operator ${text(mark[1])}` : value ? text(value[1]) : '';
      const cells = [...body.matchAll(/<td>([\s\S]*?)<\/td>/g)];
      summary = cells.length ? text(cells[cells.length - 1][1]) : '';
    } else {
      const heading3 = /<h3 class="member-name">([\s\S]*?)<\/h3>/.exec(body);
      name = heading3 ? text(heading3[1]) : '';
      const block = /<div class="summary">([\s\S]*?)<\/div>/.exec(body);
      summary = block ? text(block[1]) : '';
    }

    // An operator reads as the symbol applied to its type, and a constructor as the type itself.
    const label = kind === 'enumvalue' ? 'value' : kind;
    let title;
    if (kind === 'constructor') title = `${type} constructor`;
    else if (kind === 'operator') title = `${type} ${name}`;
    else title = `${type}.${name} ${label}`;

    return { title, description: truncate(summary) || title };
  }

  return null;
}

/** The type page's head, rewritten to preview as member: title, og:title, og:url and both descriptions. */
function previewAs(html, preview, member) {
  const headEnd = html.indexOf('</head>');
  if (headEnd === -1) return html;

  const head = html
    .slice(0, headEnd)
    .replace(/<title>([\s\S]*?)<\/title>/, (all, current) => {
      const suffix = current.lastIndexOf(' | ');
      return `<title>${preview.title}${suffix === -1 ? '' : current.slice(suffix)}</title>`;
    })
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${preview.title}`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${preview.description}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${preview.description}`)
    // The canonical link stays the type's, so search indexes the one page; og:url is what a share names.
    .replace(/(<meta property="og:url" content=")([^"?]*)[^"]*/, `$1$2?member=${encodeURIComponent(member)}`);

  return head + html.slice(headEnd);
}

function send(res, status, headers, body, head) {
  res.writeHead(status, headers);
  res.end(head ? undefined : body);
}

function notFound(res, head) {
  send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found', head);
}

const server = http.createServer((req, res) => {
  const head = req.method === 'HEAD';
  if (req.method !== 'GET' && !head) {
    return send(res, 405, { Allow: 'GET, HEAD' }, '', head);
  }

  const url = new URL(req.url, 'http://host');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return notFound(res, head);
  }

  if (pathname === '/' && BASE) {
    return send(res, 302, { Location: `${BASE}/` }, '', head);
  }
  if (BASE && pathname !== BASE && !pathname.startsWith(`${BASE}/`)) {
    return notFound(res, head);
  }

  // The query goes along, ahead of any fragment: ?plain=true&dark=true is what the editor asked for.
  const target = moved[pathname.toLowerCase().replace(/\/+$/, '')];
  if (target) {
    const hash = target.indexOf('#');
    const location = hash === -1 ? target + url.search : target.slice(0, hash) + url.search + target.slice(hash);
    return send(res, 301, { Location: location }, '', head);
  }

  let relative = pathname.slice(BASE.length);
  // One page answers every comparison; it reads which from the url. Only listed versions were exported.
  if (/^\/whatsnew\/[^/]+\/$/.test(relative) && !fs.existsSync(path.join(ROOT, relative))) {
    relative = '/whatsnew/';
  }
  let file = path.join(ROOT, relative);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return notFound(res, head);
  }

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return notFound(res, head);
  }

  if (stat.isDirectory()) {
    if (!pathname.endsWith('/')) {
      return send(res, 301, { Location: `${url.pathname}/${url.search}` }, '', head);
    }
    file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return notFound(res, head);
  }

  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': 'public, max-age=0' };

  // A link previewer never sees the fragment, so ?member= is how a shared member url names its member.
  const member = url.searchParams.get('member');
  if (member && type.startsWith('text/html')) {
    const html = fs.readFileSync(file, 'utf8');
    const preview = memberPreview(html, member);
    return send(res, 200, headers, preview ? previewAs(html, preview, member) : html, head);
  }

  send(res, 200, headers, fs.readFileSync(file), head);
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`listening on ${server.address().port}`);
});
