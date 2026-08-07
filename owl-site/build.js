#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { Site } = require('./lib/site');

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
    logo: '',
    logoDark: '',
    skipUndocumented: false,
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
      case '--skip-undocumented':
        options.skipUndocumented = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument '${argv[i]}'. Try --help.`);
    }
  }

  return options;
}

function usage() {
  console.log(`
Export a generated API documentation model as a static site.

Usage:
  node build.js --json <dir> --out <dir> [--base /prefix] [--site-url https://host]

Options:
  --json <dir>      Location of the generated model (required)
  --out <dir>       Output directory (required)
  --docs <dir>      Authored markdown pages
  --name <text>     Site name, overriding the one recorded in the model
  --logo <file>     Header icon, overriding <docs>/logo.svg
  --logo-dark <file>  Header icon for the dark theme; optional, --logo covers both
  --base <path>     Path prefix the site will be served under
  --site-url <url>  Origin for canonical urls, Open Graph tags and the sitemap
  --source-refs <path>  Root for "declared in" references; omitted, there are none
  --skip-undocumented   Leave out anything with no <summary>
  --quiet           Only print the summary
  -h, --help        Show this help
`);
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  usage();
  process.exit(0);
}

if (!options.out) {
  console.error('build.js: --out is required. Try --help.');
  process.exit(2);
}

let site;
try {
  site = new Site(options);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

for (const warning of site.model.warnings) {
  console.warn('warning: ' + warning);
}

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
const urls = site.renderer.sitemapUrls();

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
// needs the file.
const searchResult = site.resolve(site.routes.search(), null, false);
write(site.routes.search().replace(/\?.*$/, ''), searchResult.body);
pages++;

for (const asset of ['app.css', 'app.js', 'search.json']) {
  const result = site.asset(asset);
  write(site.routes.asset(asset), result.body);
  bytes += Buffer.byteLength(result.body, 'utf8');
}

write(site.routes.sitemap(), site.renderer.sitemap(new Date().toISOString().slice(0, 10)));
write('/robots.txt', site.renderer.robots());

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `exported ${pages} pages (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${options.out} in ${seconds}s`
);
