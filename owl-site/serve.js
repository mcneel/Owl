#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Development server for the generated API docs.
 *
 * Watches the model, the authored markdown and the renderer's own source, so editing any of them
 * shows up on the next request. lib/ is deliberately not required at the top of this file: it is
 * loaded through rebuild(), which is what lets an edit to it be picked up without a restart.
 *
 * Usage:
 *   node serve.js --json .owl/json [port]
 *   node serve.js --json .owl/json --docs docs/api --port 8080
 *   node serve.js --json .owl/json --api-versions 9,8
 */

/** The renderer's source, watched alongside the content it renders. */
const LIB_DIR = path.join(__dirname, 'lib');

/** The kind drawings, which are source too. */
const ICON_DIR = path.join(__dirname, 'icons');

function parseArgs(argv) {
  const options = {
    port: 8080,
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
    favicon: '',
    apiVersions: '',
    d2: '',
    skipUndocumented: false,
    sandcastle: false,
    docify: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (/^\d+$/.test(arg)) {
      options.port = Number(arg);
      continue;
    }

    switch (arg) {
      case '--port':
        options.port = Number(argv[++i]);
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
      case '--api-versions':
        options.apiVersions = argv[++i];
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
      case '--favicon':
        options.favicon = path.resolve(argv[++i]);
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
      case '--docify':
        options.docify = true;
        break;
      default:
        throw new Error(`Unknown argument '${arg}'. Try 'owl --help'.`);
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

let site;

// Whatever loading the model had to say, and then whatever rendering a page has to say: a diagram
// is drawn when the page holding it is asked for, so d2's complaint about one arrives mid-serve.
// A rebuild starts a new list, and this starts over with it.
let warningsReported = 0;

function reportWarnings() {
  for (const warning of site.model.warnings.slice(warningsReported)) {
    console.warn('warning: ' + warning);
  }
  warningsReported = site.model.warnings.length;
}

/**
 * Builds everything the next request will use, from source.
 *
 * lib/ is dropped from the require cache first. The stylesheet and the client script are strings
 * inside lib/assets.js and the page renderers are plain modules, so all of it is frozen at first
 * require; re-reading the model alone would keep serving the old markup and the old CSS. Clearing
 * the cache is what makes a change to the site's own code behave like a change to a MAIN.md.
 */
function rebuild() {
  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(LIB_DIR + path.sep)) delete require.cache[file];
  }

  const { Site } = require('./lib/site');
  site = new Site(options);
  warningsReported = 0;
}

try {
  rebuild();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

reportWarnings();

if (options.skipUndocumented) {
  const { types, members } = site.model.skipped;
  console.log(`skipping ${types} undocumented type(s) and ${members} undocumented member(s)`);
}

// Reload on change so editing an authored page, regenerating the model or adjusting the renderer
// shows up on the next request.
let reloadTimer = null;
function watch(target) {
  if (!fs.existsSync(target)) return;

  // Directories are watched through their whole tree; a --logo points at a single file.
  const recursive = fs.statSync(target).isDirectory();

  try {
    fs.watch(target, { recursive }, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        try {
          // A syntax error in a half-saved edit must not take the server down: the previous build
          // stays in place and the next save gets another go.
          rebuild();
          // console.log('reloaded');
        } catch (err) {
          console.error('reload failed: ' + err.message);
        }
      }, 150);
    });
  } catch (err) {
    // Recursive watch is not available everywhere; the site still works, just without reload.
    console.warn(`warning: not watching ${target}: ${err.message}`);
  }
}

watch(site.jsonDir);
watch(site.apiDir);
watch(LIB_DIR);
// The kind drawings are read when lib/icons.js loads, and the rebuild above drops it from the cache,
// so editing one shows up the way editing the stylesheet does.
watch(ICON_DIR);

// Named on the command line, so they sit outside the watched directories.
watch(options.logo);
watch(options.logoDark);
watch(options.favicon);

const server = http.createServer((request, response) => {
  let parsed;
  try {
    parsed = new URL(request.url, 'http://localhost');
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  let result;
  try {
    const { prefersMarkdown } = require('./lib/mdpages');
    const markdown = prefersMarkdown(request.headers.accept);
    result = site.resolve(decodeURIComponent(parsed.pathname), parsed.searchParams, true, markdown);
  } catch (err) {
    console.error(err);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Internal error: ' + err.message);
    return;
  }

  reportWarnings();

  const body = Buffer.from(result.body, 'utf8');
  response.writeHead(result.status, {
    'Content-Type': result.type,
    'Content-Length': body.length,
    ...(result.location ? { Location: result.location } : {}),
    // no-store, not no-cache: app.css and app.js live at fixed urls with no digest in them, and
    // no-cache only asks the browser to revalidate - with no ETag or Last-Modified to revalidate
    // against, a memory-cached stylesheet can survive an edit and a restart. This is the dev
    // server; an exported site is plain files and its host sets its own policy.
    'Cache-Control': 'no-store, must-revalidate',
    // One url answers as HTML or Markdown depending on Accept.
    Vary: 'Accept',
  });

  response.end(request.method === 'HEAD' ? undefined : body);
});

server.listen(options.port, () => {
  const assemblies = site.model.index.assemblies;
  const sum = (key) => assemblies.reduce((total, a) => total + (a[key] || 0), 0);

  console.log(site.renderer.siteName);
  console.log(
    `  ${assemblies.length} assemblies, ` +
      `${sum('typeCount')} types, ${sum('memberCount')} members`
  );
  console.log(`  http://localhost:${options.port}${site.routes.home()}`);
  console.log('Press Ctrl+C to stop.');
});

process.on('SIGINT', () => {
  console.log('\nStopped.');
  process.exit(0);
});
