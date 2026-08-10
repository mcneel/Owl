#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { Site } = require('./lib/site');
const { CSS } = require('./lib/assets');

/**
 * Self-check for the docs site.
 *
 * Renders every page in memory and asserts the things that are easy to break and expensive to
 * notice later: dead internal links, missing or duplicated SEO metadata, and any reference to an
 * external host (which would mean the export is not really offline).
 *
 * Usage:
 *   node check.js --json .owl/json            check the rendered site
 *   node check.js --dist dir                  check an already-exported directory instead
 */

const args = process.argv.slice(2);
let distDir = null;
let jsonDir = '';
let apiDir = '';
let skipUndocumented = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dist') distDir = path.resolve(args[++i]);
  else if (args[i] === '--json') jsonDir = path.resolve(args[++i]);
  else if (args[i] === '--docs') apiDir = path.resolve(args[++i]);
  else if (args[i] === '--skip-undocumented') skipUndocumented = true;
  else if (args[i] === '-h' || args[i] === '--help') {
    console.log('Usage: node check.js --json <model-dir> [--docs <dir>] | --dist <exported-dir>');
    process.exit(0);
  } else {
    console.error(`Unknown argument '${args[i]}'`);
    process.exit(2);
  }
}

if (!distDir && !jsonDir) {
  console.error('check.js: pass --json <model-dir>, or --dist <exported-dir>. Try --help.');
  process.exit(2);
}

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

/** Collects { url -> html } either by rendering or by reading an exported tree. */
function collectPages() {
  const pages = new Map();

  if (distDir) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'index.html') {
          const rel = path.relative(distDir, path.dirname(full)).split(path.sep).filter(Boolean);
          pages.set('/' + (rel.length ? rel.join('/') + '/' : ''), fs.readFileSync(full, 'utf8'));
        }
      }
    };
    walk(distDir);
    return pages;
  }

  const site = new Site({ jsonDir, apiDir, skipUndocumented });

  // The namespace-mode copies too: the namespace pages link at them, so leaving them out would
  // report every one of those links as broken.
  const urls = site.renderer
    .sitemapUrls()
    .concat(site.renderer.mirrorUrls())
    .concat([site.routes.search()]);
  for (const url of urls) {
    const result = site.resolve(url.replace(/\?.*$/, ''), null, false);
    if (result.status !== 200) {
      fail(`${url} returned ${result.status}`);
      continue;
    }
    pages.set(url, result.body);
  }

  // Read after the pages are rendered, not before: a diagram that d2 refused to draw says so while
  // the page holding it is being made, which is after the model has finished loading.
  for (const warning of site.model.warnings) notes.push('model: ' + warning);

  return pages;
}

const pages = collectPages();

if (pages.size === 0) {
  console.error('check: no pages were produced');
  process.exit(1);
}

const titles = new Map();
const descriptions = new Map();
const knownUrls = new Set(pages.keys());

// Assets and non-page files that links may legitimately point at.
for (const extra of ['/assets/app.css', '/assets/app.js', '/assets/search.json', '/sitemap.xml', '/robots.txt']) {
  knownUrls.add(extra);
}

let hrefCount = 0;
const brokenLinks = new Map();
const anchorsByPage = new Map();

for (const [url, html] of pages) {
  const title = (html.match(/<title>(.*?)<\/title>/s) || [])[1];
  const description = (html.match(/<meta name="description" content="(.*?)">/s) || [])[1];

  // Duplicate titles matter because two indexed pages competing for one query is a page wasted.
  // A namespace-mode copy is by design the same page under a second url, and says so: it is
  // noindex and names the plain url as its canonical, so it is not competing with anything.
  const indexable = !/name="robots" content="noindex/.test(html);

  if (!title) fail(`${url}: no <title>`);
  else if (indexable) {
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(url);
  }

  if (!description) fail(`${url}: no meta description`);
  else if (indexable) {
    if (!descriptions.has(description)) descriptions.set(description, []);
    descriptions.get(description).push(url);
  }

  if (!/rel="canonical"/.test(html) && indexable) {
    fail(`${url}: no canonical link`);
  }

  if (!/<h1[\s>]/.test(html)) fail(`${url}: no <h1>`);

  if (/javascript:void/.test(html)) fail(`${url}: uses javascript:void() navigation`);

  const external = html.match(/<(?:script|link|img)[^>]+(?:src|href)="https?:\/\/[^"]+"/g);
  if (external) {
    fail(`${url}: external resource reference (breaks offline use): ${external[0].slice(0, 90)}`);
  }

  anchorsByPage.set(url, new Set((html.match(/\sid="([^"]+)"/g) || []).map((m) => m.slice(5, -1))));
}

// Second pass so fragment targets can be validated against the collected anchor sets.
for (const [url, html] of pages) {
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;

    hrefCount++;

    const [pathPart, fragment] = href.split('#');
    const target = pathPart.split('?')[0];
    if (!target) continue;

    if (!knownUrls.has(target)) {
      brokenLinks.set(target, (brokenLinks.get(target) || 0) + 1);
      continue;
    }

    if (fragment && anchorsByPage.has(target) && !anchorsByPage.get(target).has(fragment)) {
      brokenLinks.set(`${target}#${fragment}`, (brokenLinks.get(`${target}#${fragment}`) || 0) + 1);
    }
  }
}

for (const [target, count] of [...brokenLinks].slice(0, 20)) {
  fail(`broken link (${count} references): ${target}`);
}

/**
 * The stylesheet is a hand-written string, and CSS fails silently: a comment left open, or a close
 * marker sitting outside one, makes the parser swallow the rules that follow rather than report
 * anything. It shows up as a styling bug in the browser and nowhere else, so it is worth checking.
 */
function checkCss(css) {
  let depth = 0;
  let braces = 0;

  for (let i = 0; i < css.length; i++) {
    if (depth === 0 && css.startsWith('/*', i)) {
      depth = 1;
      i++;
    } else if (depth === 1 && css.startsWith('*/', i)) {
      depth = 0;
      i++;
    } else if (depth === 0) {
      if (css[i] === '{') braces++;
      else if (css[i] === '}') braces--;
      // A close marker the loop above did not consume is text the parser will choke on.
      else if (css.startsWith('*/', i)) {
        const line = css.slice(0, i).split('\n').length;
        fail(`app.css line ${line}: '*/' outside a comment; the next rule will be discarded`);
        i++;
      }
    }
  }

  if (depth !== 0) fail('app.css: unterminated /* comment');
  if (braces !== 0) fail(`app.css: ${braces > 0 ? braces + ' unclosed' : -braces + ' extra'} brace(s)`);
}

// The source string, which is what --dist writes out verbatim, so this covers both modes.
checkCss(CSS);

const duplicateTitles = [...titles].filter(([, urls]) => urls.length > 1);
for (const [title, urls] of duplicateTitles.slice(0, 10)) {
  fail(`duplicate <title> "${title}" on ${urls.length} pages, e.g. ${urls[0]}`);
}

console.log(`pages checked        ${pages.size}`);
console.log(`internal links       ${hrefCount}`);
console.log(`distinct titles      ${titles.size}`);
console.log(`distinct descriptions ${descriptions.size}`);

for (const note of notes) console.log('note: ' + note);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures.slice(0, 40)) console.error('  ' + failure);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}

console.log('\nall checks passed');
