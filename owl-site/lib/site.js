'use strict';

const fs = require('node:fs');

const { Model } = require('./model');
const { Routes, slugify, MEMBER_PARAM } = require('./routes');
const { Renderer } = require('./pages');
const { Diagrams, probe } = require('./diagrams');
const { Sandcastle, stub } = require('./sandcastle');
const { Docify, withQuery } = require('./docify');
const { Links } = require('./links');
const { CSS, JS } = require('./assets');
const { inlineSvg } = require('./html');

/**
 * Wires the model, routes and renderer together, and resolves a request path to a response.
 *
 * All three entry points use this: serve.js calls resolve() per request, build.js walks
 * sitemapUrls() calling the same code, and check.js renders through it too. One rendering path
 * means the dev preview and the exported site cannot drift.
 *
 * @param {object} options
 *   jsonDir   generated model directory (required)
 *   apiDir    authored markdown directory; without one the site is in namespace mode
 *   siteName  overrides the name recorded in the model
 *   base      path prefix the site is served under
 *   siteUrl   absolute origin for canonical urls and the sitemap
 *   sourceRefs  root the "declared in" references hang from; without it there are none
 *   links     '<assembly>=<url>' entries naming the sites that document the assemblies this one
 *             only references; without them those types stay text. See lib/links.js
 *   logo      svg file to show in the header, overriding <docs>/logo.svg
 *   logoDark  svg file to show under the dark theme, overriding <docs>/logo-dark.svg
 *   apiVersions  comma-separated versions the header's picker offers, newest first; without them
 *             there is no picker and every API is shown whatever its <since> says
 *   skipUndocumented  leave out anything with no <summary>
 *   sandcastle  answer the Sandcastle urls this documentation set used to be published at
 *   docify    answer the docify urls this documentation set used to be published at
 *   d2        the d2 binary that draws ```d2 fences, 'd2' from PATH by default
 */
class Site {
  constructor(options = {}) {
    if (!options.jsonDir) {
      throw new Error('Site needs a jsonDir: the directory owl gen wrote the model to.');
    }

    this.jsonDir = options.jsonDir;

    // Left empty when none was named, because that is the whole difference between the two kinds of
    // site: authored pages mean categories, prose and a category tree, and no authored pages mean
    // an API dump browsed by namespace. Defaulting this would make the distinction unaskable.
    this.apiDir = options.apiDir || '';
    this.siteName = options.siteName || '';
    this.base = options.base || '';
    this.siteUrl = options.siteUrl || '';
    this.sourceRefs = options.sourceRefs || '';

    // Parsed once here rather than per reload: a bad --link is a mistake in the command line, and
    // the run should stop on it at the start rather than on the first page that needed it.
    this.links = new Links(options.links || []);
    this.logoPath = options.logo || '';
    this.logoDarkPath = options.logoDark || '';
    this.skipUndocumented = Boolean(options.skipUndocumented);

    // Split here for the same reason --link is: the list is a mistake in the command line or it is
    // not, and either way it is settled before the first page rather than on each reload.
    this.versions = (options.apiVersions || '')
      .split(',')
      .map((version) => version.trim())
      .filter(Boolean);

    // A version with no digit in it is compared as zero, which shows every API rather than filtering
    // any: the picker would be there and do nothing. Worth stopping for, as a missing --d2 is.
    const unnumbered = this.versions.find((version) => !/\d/.test(version));
    if (unnumbered) {
      throw new Error(
        `--api-versions ${unnumbered}: a version needs a number in it to compare against <since>.`
      );
    }

    // Off unless asked for: most sites were never published anywhere else, and one that was would
    // rather say so than have owl guess from the shape of a request that missed.
    this.sandcastleUrls = Boolean(options.sandcastle);
    this.docifyUrls = Boolean(options.docify);

    this.d2 = options.d2 || 'd2';

    // Naming a d2 that is not there is a mistake worth stopping for. The default is what makes
    // diagrams optional - without one installed a fence stays the code block it was written as -
    // but asking for a particular binary is asking for it to work.
    if (options.d2 && !probe(options.d2)) {
      throw new Error(`--d2 ${options.d2}: not found, or it did not answer --version.`);
    }

    this.reload();
  }

  /**
   * True when the site browses by namespace alone: no authored pages were named, so there is no
   * prose to organise, no category to overview, and nothing for a second mode to be about.
   */
  get namespaceMode() {
    return !this.apiDir;
  }

  reload() {
    this.model = new Model({
      jsonDir: this.jsonDir,
      apiDir: this.apiDir,
      skipUndocumented: this.skipUndocumented,
    });
    this.routes = new Routes(this.base);

    // Built from the model, so what it can answer for is exactly what the site has pages for: a
    // regenerate that drops a type drops the old url that pointed at it in the same pass.
    this.sandcastle = this.sandcastleUrls
      ? new Sandcastle(this.model, this.routes, (message) => this.model.warnings.push(message))
      : null;
    this.docify = this.docifyUrls
      ? new Docify(this.model, this.routes, (message) => this.model.warnings.push(message))
      : null;

    // Rebuilt with the model, so a diagram that failed to draw is reported again on the reload that
    // follows the fix rather than staying quiet about it. What it has already drawn is cached
    // outside the instance, so nothing is redrawn for the sake of a new warning list.
    const diagrams = new Diagrams({
      command: this.d2,
      // Relative sources in a fence resolve against the authored pages that hold them; with none,
      // the only sources are in doc comments and they resolve against wherever owl was run.
      cwd: this.apiDir || process.cwd(),
      warn: (message) => this.model.warnings.push(message),
    });

    this.renderer = new Renderer(this.model, this.routes, {
      namespaceMode: this.namespaceMode,
      siteName: this.siteName,
      siteUrl: this.siteUrl,
      sourceRefs: this.sourceRefs,
      links: this.links,
      logo: this.readLogo(this.logoPath),
      logoDark: this.readLogo(this.logoDarkPath),
      versions: this.versions,
      diagrams,
      // Where a page says something went wrong while it was being made: an equation that would not
      // typeset, alongside the diagrams that would not draw.
      warn: (message) => this.model.warnings.push(message),
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

    // A site that browses by namespace alone has one url per page, so the marked copies are not
    // second names for them - they are nothing at all.
    if (route.mode && this.namespaceMode) return this.notFound(pathname);

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
        // A mode-marked url is where the namespace-mode copy used to be: a stub now, sending the
        // reader to the one page with the mode flag on.
        const html = route.mode
          ? this.renderer.typeStubPage(route.slug)
          : this.renderer.type(route.slug, (query && query.get(MEMBER_PARAM)) || '');
        return html ? this.html(html) : this.notFound(pathname);
      }

      case 'example': {
        const html = route.mode
          ? this.renderer.exampleStubPage(route.slug, route.anchor)
          : this.renderer.example(route.slug, route.anchor);
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

      case 'whatsnew': {
        // Versions are what the page compares, so a site that names none has no such page.
        if (this.versions.length === 0 || !validWhatsNew(route.spec)) return this.notFound(pathname);
        return this.html(this.renderer.whatsNew(route.spec));
      }

      case 'references':
        return this.html(this.renderer.references());

      case 'sandcastle': {
        const url = this.sandcastle ? this.sandcastle.lookup(route.name) : null;
        return url ? this.redirect(url) : this.notFound(pathname);
      }

      case 'docify': {
        // The query goes along: ?plain=true is what the editor asking for this url wants honoured.
        const url = this.docify ? this.docify.lookup(route.path) : null;
        return url ? this.redirect(withQuery(url, query)) : this.notFound(pathname);
      }

      case 'category': {
        // Categories are what the authored pages are organised around, so with none there are no
        // category pages to serve rather than empty ones.
        if (this.namespaceMode) return this.notFound(pathname);

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
      case 'whatsnew.json':
        if (this.versions.length === 0) {
          return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
        }
        return {
          status: 200,
          type: 'application/json; charset=utf-8',
          body: JSON.stringify(this.renderer.whatsNewAsset()),
        };
      case 'references.json':
        return {
          status: 200,
          type: 'application/json; charset=utf-8',
          body: JSON.stringify(this.renderer.referencesAsset()),
        };
      default: {
        // The rows the trees leave out, one asset per tree shape. Answered from the renderer the
        // pages were written by, so a key it has no tree for is a 404 rather than an empty tree.
        const tree = /^tree-(.+)\.json$/.exec(name);
        const rows = tree ? this.renderer.treeAsset(tree[1]) : null;

        if (rows) {
          return {
            status: 200,
            type: 'application/json; charset=utf-8',
            body: JSON.stringify(rows),
          };
        }

        return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
      }
    }
  }

  html(body) {
    return { status: 200, type: 'text/html; charset=utf-8', body };
  }

  /**
   * A permanent move, carrying the same page the export writes as its body.
   *
   * The body of a 301 is rarely read, but writing it here is what keeps the served answer and the
   * exported file the one thing rather than two that have to be kept in step.
   */
  redirect(location) {
    return { status: 301, type: 'text/html; charset=utf-8', location, body: stub(location) };
  }

  notFound(pathname) {
    return { status: 404, type: 'text/html; charset=utf-8', body: this.renderer.notFound(pathname) };
  }
}

/**
 * True for the specs a What's New url can carry: nothing, one version, or 'older...newer'. Any
 * versions will do, listed or not, as long as each has a number to compare.
 */
function validWhatsNew(spec) {
  if (!spec) return true;
  const ends = spec.split('...');
  return ends.length <= 2 && ends.every((end) => /\d/.test(end));
}

module.exports = { Site };
