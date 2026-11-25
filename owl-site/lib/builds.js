'use strict';

const path = require('node:path');

const { Site } = require('./site');
const { Routes } = require('./routes');
const { escape, attr } = require('./html');

/** Reads '<stub>=<name>' entries, as owl passes one per build. */
function parseBuilds(entries) {
  const builds = [];

  for (const entry of entries || []) {
    const at = entry.indexOf('=');
    const stub = at > 0 ? entry.slice(0, at) : '';
    const name = at > 0 ? entry.slice(at + 1).trim() : '';

    if (!/^[a-z0-9][a-z0-9._-]*$/.test(stub) || !name) {
      throw new Error(`--build ${entry}: expected <stub>=<name>, with a lower-case stub.`);
    }
    if (builds.some((b) => b.stub === stub)) {
      throw new Error(`--build ${entry}: the stub '${stub}' is used by another build.`);
    }
    builds.push({ stub, name });
  }

  return builds;
}

/**
 * Several builds of one library as one site, each a whole Site under <base>/<stub>/.
 *
 * A build's pages, search and tree are its own, because the builds differ in what was compiled
 * rather than in what a filter hides. The root forwards to the first build listed.
 *
 * @param {object} options  as Site takes them, plus
 *   builds   '<stub>=<name>' entries, first is the default; jsonDir holds one model per stub
 */
class Builds {
  constructor(options = {}) {
    this.list = parseBuilds(options.builds);
    if (this.list.length < 2) {
      throw new Error('--build: name two or more builds, or none for a site of one.');
    }

    this.routes = new Routes(options.base || '');
    this.base = this.routes.base;
    this.jsonDir = options.jsonDir;
    this.apiDir = options.apiDir || '';

    // Page lists by renderer, so a reload of one build is seen by every other build's picker.
    this.pageSets = new WeakMap();

    this.sites = this.list.map(
      (build) =>
        new Site({
          ...options,
          jsonDir: path.join(options.jsonDir, build.stub),
          base: `${this.base}/${build.stub}`,
          build: {
            stub: build.stub,
            name: build.name,
            picker: (canonical) => this.picker(build.stub, canonical),
          },
        })
    );
  }

  /** Every build's warnings, each named by the build it came from. */
  get warnings() {
    return this.sites.flatMap((site, i) => site.model.warnings.map((w) => `${this.list[i].name}: ${w}`));
  }

  reload() {
    for (const site of this.sites) site.reload();
    return this.warnings;
  }

  /** Where the root forwards to: the first build's home. */
  homeUrl() {
    return this.sites[0].renderer.homeUrl();
  }

  /** The urls a build has a page at, for the picker to tell where another build's reader lands. */
  pages(site) {
    let set = this.pageSets.get(site.renderer);
    if (!set) {
      set = new Set(site.renderer.sitemapUrls());
      for (const url of [site.routes.home(), site.routes.search(), site.routes.references(), site.renderer.homeUrl()]) {
        set.add(url);
      }
      this.pageSets.set(site.renderer, set);
    }
    return set;
  }

  /**
   * The header's build picker for one page: { name, url, current, missing } per build.
   *
   * Each build leads to the same page in it; a build without that page is marked missing. A page
   * with no address of its own, such as Not Found, leads to each build's home.
   */
  picker(currentStub, canonical) {
    const from = `${this.base}/${currentStub}/`;
    const own = typeof canonical === 'string' && canonical.startsWith(from);

    return this.list.map((build, i) => {
      const site = this.sites[i];
      if (!own) {
        return { name: build.name, url: site.renderer.homeUrl(), current: build.stub === currentStub, missing: false };
      }

      const url = `${this.base}/${build.stub}/${canonical.slice(from.length)}`;
      const missing = build.stub !== currentStub && !this.pages(site).has(url);
      return { name: build.name, url, current: build.stub === currentStub, missing };
    });
  }

  /** Resolves a request as Site.resolve does, by the build its first path segment names. */
  resolve(pathname, query, serverSideSearch = true, preferMarkdown = false) {
    const relative = pathname.startsWith(this.base) ? pathname.slice(this.base.length) : null;

    // A redirect that may change when a newer build is added, so it is never a permanent one.
    if (relative === '' || relative === '/') {
      const location = this.homeUrl();
      return { status: 302, type: 'text/html; charset=utf-8', location, body: this.rootHtml(location) };
    }

    if (relative === '/robots.txt') {
      return { status: 200, type: 'text/plain; charset=utf-8', body: this.robots() };
    }

    const stub = relative === null ? '' : relative.split('/')[1];
    const index = this.list.findIndex((build) => build.stub === stub);
    if (index === -1) return this.sites[0].notFound(pathname);

    return this.sites[index].resolve(pathname, query, serverSideSearch, preferMarkdown);
  }

  /** The root's page for a file host, which cannot redirect: it forwards to the first build. */
  rootHtml(location) {
    const name = this.sites[0].renderer.siteName;
    const title = `${name} (${this.list[0].name})`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(name)}</title>
<meta name="description" content="${attr(`The ${name} reference, for ${this.list.map((b) => b.name).join(', ')}.`)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${attr(location)}">
<meta http-equiv="refresh" content="0; url=${attr(location)}">
<script>location.replace(${JSON.stringify(location)})</script>
</head>
<body><h1>${escape(name)}</h1><p>Opening <a href="${attr(location)}">${escape(title)}</a>.</p></body>
</html>
`;
  }

  /** One robots.txt for the whole site, naming each build's search and sitemap. */
  robots() {
    const lines = ['User-agent: *', 'Allow: /'];
    for (const site of this.sites) lines.push(`Disallow: ${site.routes.search()}`);

    const origin = this.sites[0].siteUrl.replace(/\/$/, '');
    if (origin) {
      for (const site of this.sites) lines.push(`Sitemap: ${origin}${site.routes.sitemap()}`);
    }
    return lines.join('\n') + '\n';
  }
}

module.exports = { Builds, parseBuilds };
