#!/usr/bin/env node
'use strict';

const path = require('node:path');

const { Site } = require('./lib/site');
const markdown = require('./lib/markdown');

/**
 * Lists the xref links in the authored pages that lead nowhere, and fails when there are any.
 *
 * owl verify runs this after checking the projects, so a broken xref in a page fails CI the way a
 * broken &lt;see cref&gt; in a doc comment does.
 *
 * Usage:
 *   node verify.js --json .owl/json --docs docs/api [--link <asm>=<url>] [--skip-undocumented]
 */

const args = process.argv.slice(2);
let jsonDir = '';
let apiDir = '';
let skipUndocumented = false;
const links = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') jsonDir = path.resolve(args[++i]);
  else if (args[i] === '--docs') apiDir = args[++i];
  else if (args[i] === '--link') links.push(args[++i]);
  else if (args[i] === '--skip-undocumented') skipUndocumented = true;
  else {
    console.error(`Unknown argument '${args[i]}'`);
    process.exit(2);
  }
}

if (!jsonDir || !apiDir) {
  console.error('verify.js: pass --json <model-dir> and --docs <dir>.');
  process.exit(2);
}

const site = new Site({ jsonDir, apiDir, skipUndocumented, links });
const { model, renderer } = site;
const broken = [];

const docs = [model.siteMain, ...model.assemblyMains.values(), ...model.categoryDocs.values()].filter(Boolean);

for (const doc of docs) {
  // No diagrams: only the links are wanted, and drawing would run d2 for nothing.
  markdown.render(doc.markdown, {
    xref: (target) => {
      const { problem } = renderer.resolveXref(target.trim());
      if (problem) broken.push(`${doc.file}: xref:${target} ${problem}`);
      return '';
    },
  });
}

if (broken.length > 0) {
  console.log(`\n  ${broken.length} broken xref link(s) in authored pages:`);
  for (const line of broken) console.log('    ' + line);
  process.exit(1);
}
