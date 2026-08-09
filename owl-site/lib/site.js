'use strict';

const fs = require('node:fs');

const { Model } = require('./model');
const { Routes, slugify } = require('./routes');
const { Renderer } = require('./pages');
const { CSS, JS } = require('./assets');
const { inlineSvg } = require('./html');

/** Matches owl's own default, so the two agree on where authored pages live. */
const DEFAULT_DOCS_DIR = 'docs/api';

/**
 * Wires the model, routes and renderer together, and resolves a request path to a response.
 *
 * All three entry points use this: serve.js calls resolve() per request, build.js walks
 * sitemapUrls() calling the same code, and check.js renders through it too. One rendering path
 * means the dev preview and the exported site cannot drift.
 *
 * @param {object} options
 *   jsonDir   generated model directory (required)
 *   apiDir    authored markdown directory (default docs/api)
 *   siteName  overrides the name recorded in the model
 *   base      path prefix the site is served under
 *   siteUrl   absolute origin for canonical urls and the sitemap
 *   sourceRefs  root the "declared in" references hang from; without it there are none
 *   logo      svg file to show in the header, overriding <docs>/logo.svg
 *   logoDark  svg file to show under the dark theme, overriding <docs>/logo-dark.svg
 *   skipUndocumented  leave out anything with no <summary>
 */
class Site {
  constructor(options = {}) {
    if (!options.jsonDir) {
      throw new Error('Site needs a jsonDir: the directory owl gen wrote the model to.');
    }

    this.jsonDir = options.jsonDir;

    // Defaulted rather than left empty so a missing page can name the file to create.
    this.apiDir = options.apiDir || DEFAULT_DOCS_DIR;
    this.siteName = options.siteName || '';
    this.base = options.base || '';
    this.siteUrl = options.siteUrl || '';
    this.sourceRefs = options.sourceRefs || '';
    this.logoPath = options.logo || '';
    this.logoDarkPath = options.logoDark || '';
    this.skipUndocumented = Boolean(options.skipUndocumented);

    this.reload();
  }

  reload() {
    this.model = new Model({
      jsonDir: this.jsonDir,
      apiDir: this.apiDir,
      skipUndocumented: this.skipUndocumented,
    });
    this.routes = new Routes(this.base);
    this.renderer = new Renderer(this.model, this.routes, {
      siteName: this.siteName,
      siteUrl: this.siteUrl,
      sourceRefs: this.sourceRefs,
      logo: this.readLogo(this.logoPath),
      logoDark: this.readLogo(this.logoDarkPath),
    });
    return this.model.warnings;
  }

  /**
   * Reads an svg named on the command line. Called on every reload, so editing the file it points
   * at shows up the way editing the docs directory does.
   */
  readLogo(file) {
    if (!file) return '';

    let svg;
    try {
      svg = inlineSvg(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      this.model.warnings.push(`could not read ${file}: ${err.message}`);
      return '';
    }

    if (!svg) this.model.warnings.push(`ignoring ${file}: not an <svg> document`);
    return svg;
  }

  /** Slug lookups need the original names, which slugs are lossy about. */
  assemblyBySlug(slug) {
    return this.model.index.assemblies.find((a) => slugify(a.name) === slug) || null;
  }

  namespaceBySlug(slug) {
    if (slug === 'global') return this.model.namespaces.has('') ? '' : null;

    for (const name of this.model.namespaces.keys()) {
      if (slugify(name) === slug) return name;
    }
    return null;
  }

  categoryBySlugs(assemblySlug, categorySlug) {
    for (const bucket of this.model.categories.values()) {
      if (slugify(bucket.assembly) === assemblySlug && slugify(bucket.category) === categorySlug) {
        return bucket;
      }
    }
    return null;
  }

  /**
   * Resolves a request to { status, type, body }.
   * @param {string} pathname
   * @param {URLSearchParams} query
   * @param {boolean} serverSideSearch
   */
  resolve(pathname, query, serverSideSearch = true) {
    const route = this.routes.match(pathname);

    if (!route) {
      return { status: 404, type: 'text/html; charset=utf-8', body: this.renderer.notFound(pathname) };
    }

    switch (route.kind) {
      case 'home':
        return this.html(this.renderer.home());

      case 'search': {
        // ?a= narrows the search to one assembly; an unknown slug widens back to everything
        // rather than returning nothing.
        const scope = query ? this.assemblyBySlug(query.get('a') || '') : null;
        return this.html(
          this.renderer.search(
            query ? query.get('q') || '' : '',
            serverSideSearch,
            scope ? scope.name : ''
          )
        );
      }

      case 'sitemap':
        return { status: 200, type: 'application/xml; charset=utf-8', body: this.renderer.sitemap() };

      case 'robots':
        return { status: 200, type: 'text/plain; charset=utf-8', body: this.renderer.robots() };

      case 'asset':
        return this.asset(route.name);

      case 'type': {
        const html = this.renderer.type(route.slug);
        return html ? this.html(html) : this.notFound(pathname);
      }

      case 'example': {
        const html = this.renderer.example(route.slug, route.anchor);
        return html ? this.html(html) : this.notFound(pathname);
      }

      case 'assembly': {
        const assembly = this.assemblyBySlug(route.slug);
        return assembly ? this.html(this.renderer.assembly(assembly.name)) : this.notFound(pathname);
      }

      case 'namespace': {
        const name = this.namespaceBySlug(route.slug);
        if (name === null) return this.notFound(pathname);
        const html = this.renderer.namespace(name);
        return html ? this.html(html) : this.notFound(pathname);
      }

      case 'category': {
        const bucket = this.categoryBySlugs(route.assembly, route.category);
        if (!bucket) return this.notFound(pathname);
        const html = this.renderer.category(bucket.assembly, bucket.category);
        return html ? this.html(html) : this.notFound(pathname);
      }

      default:
        return this.notFound(pathname);
    }
  }

  asset(name) {
    switch (name) {
      case 'app.css':
        return { status: 200, type: 'text/css; charset=utf-8', body: CSS };
      case 'app.js':
        return { status: 200, type: 'text/javascript; charset=utf-8', body: JS };
      case 'search.json':
        return {
          status: 200,
          type: 'application/json; charset=utf-8',
          body: JSON.stringify(this.renderer.searchAsset()),
        };
      default:
        return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
    }
  }

  html(body) {
    return { status: 200, type: 'text/html; charset=utf-8', body };
  }

  notFound(pathname) {
    return { status: 404, type: 'text/html; charset=utf-8', body: this.renderer.notFound(pathname) };
  }
}

module.exports = { Site };
