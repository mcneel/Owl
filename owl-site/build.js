#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { Site } = require('./lib/site');
const { stub: sandcastleStub } = require('./lib/sandcastle');

/**
 * Exports the docs as a static site.
 *
 * Every page is written as <path>/index.html so the output serves from any plain file host with no
 * rewrite rules, alongside sitemap.xml and robots.txt. Nothing is fetched from a network at
 * runtime, so the export also works from a local folder.
 *
 * Usage:
 *   node build.js --json .owl/json --out dist [--base /prefix] [--site-url https://host]
 */

function parseArgs(argv) {
  const options = {
    out: '',
    jsonDir: '',
    apiDir: '',
    siteName: '',
    base: '',
    siteUrl: '',
    sourceRefs: '',
    // Repeatable, since a set can reference more than one documented elsewhere.
    links: [],
    logo: '',
    logoDark: '',
    d2: '',
    skipUndocumented: false,
    sandcastle: false,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--out':
        options.out = path.resolve(argv[++i]);
        break;
      case '--base':
        options.base = argv[++i];
        break;
      case '--site-url':
        options.siteUrl = argv[++i];
        break;
      case '--source-refs':
        options.sourceRefs = argv[++i];
        break;
      case '--link':
        options.links.push(argv[++i]);
        break;
      case '--json':
        options.jsonDir = path.resolve(argv[++i]);
        break;
      case '--docs':
        options.apiDir = path.resolve(argv[++i]);
        break;
      case '--name':
        options.siteName = argv[++i];
        break;
      case '--logo':
        options.logo = path.resolve(argv[++i]);
        break;
      case '--logo-dark':
        options.logoDark = path.resolve(argv[++i]);
        break;
      case '--d2':
        options.d2 = argv[++i];
        break;
      case '--skip-undocumented':
        options.skipUndocumented = true;
        break;
      case '--sandcastle':
        options.sandcastle = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      default:
        throw new Error(`Unknown argument '${argv[i]}'. Try 'owl --help'.`);
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

if (!options.out) {
  console.error("build.js: --out is required. Try 'owl --help'.");
  process.exit(2);
}

let site;
try {
  site = new Site(options);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Loading the model raises most warnings, but not all of them: a diagram is drawn while the page
// that holds it is rendered, so anything d2 has to say arrives during the export below. Reported by
// what has not been reported yet, so the run ends having mentioned everything exactly once.
let warningsReported = 0;

function reportWarnings() {
  for (const warning of site.model.warnings.slice(warningsReported)) {
    console.warn('warning: ' + warning);
  }
  warningsReported = site.model.warnings.length;
}

reportWarnings();

if (options.skipUndocumented && !options.quiet) {
  const { types, members } = site.model.skipped;
  console.log(`skipping ${types} undocumented type(s) and ${members} undocumented member(s)`);
}

/** Maps a site url to the file that should hold it. */
function outputPathFor(url) {
  let relative = url;

  if (site.base && relative.startsWith(site.base)) {
    relative = relative.slice(site.base.length);
  }

  relative = relative.replace(/^\/+/, '');

  // Directory-style urls become <dir>/index.html; anything with an extension stays as-is.
  if (relative === '' || relative.endsWith('/')) {
    return path.join(options.out, relative, 'index.html');
  }

  return path.join(options.out, relative);
}

function write(url, body) {
  const target = outputPathFor(url);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body, 'utf8');
  return target;
}

const started = Date.now();
let pages = 0;
let bytes = 0;

// Static export cannot answer ?q=, so the search page ships the client-side path plus a
// noscript fallback that links into the browse hierarchy.
//
// The mirrors are the namespace-mode copies of the type and example pages. They are files like any
// other - a static host has no way to render one url as another - but they are not in the sitemap,
// so they are written from a list of their own.
const urls = site.renderer.sitemapUrls().concat(site.renderer.mirrorUrls());

for (const url of urls) {
  const result = site.resolve(url, null, false);

  if (result.status !== 200) {
    console.error(`error: ${url} returned ${result.status}`);
    process.exitCode = 1;
    continue;
  }

  const target = write(url, result.body);
  pages++;
  bytes += Buffer.byteLength(result.body, 'utf8');

  if (!options.quiet && pages % 250 === 0) {
    console.log(`  ${pages}/${urls.length} pages`);
  }
}

// The search page is deliberately absent from the sitemap (it is noindex), but the site still
// needs the file. So is the root of a single-assembly site, which is only a redirect to it.
const searchResult = site.resolve(site.routes.search(), null, false);
write(site.routes.search().replace(/\?.*$/, ''), searchResult.body);
pages++;

if (!urls.includes(site.routes.home())) {
  const rootResult = site.resolve(site.routes.home(), null, false);
  write(site.routes.home(), rootResult.body);
  pages++;
}

// The urls this documentation set used to be published at, when it was published by Sandcastle. A
// file host cannot be asked to answer one url with another, so each becomes a page that redirects
// itself; they are not in the sitemap, because the page they point at is.
if (site.sandcastle) {
  let redirects = 0;

  for (const [url, target] of site.sandcastle.stubs()) {
    write(url, sandcastleStub(target));
    redirects++;
  }

  if (!options.quiet) console.log(`  ${redirects} sandcastle redirects`);
  pages += redirects;
}

const trees = site.renderer.treeAssetNames().map((key) => `tree-${key}.json`);

for (const asset of ['app.css', 'app.js', 'search.json', ...trees]) {
  const result = site.asset(asset);
  write(site.routes.asset(asset), result.body);
  bytes += Buffer.byteLength(result.body, 'utf8');
}

write(site.routes.sitemap(), site.renderer.sitemap(new Date().toISOString().slice(0, 10)));
write('/robots.txt', site.renderer.robots());

reportWarnings();

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `exported ${pages} pages (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${options.out} in ${seconds}s`
);
