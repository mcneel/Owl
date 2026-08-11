'use strict';

/**
 * URL construction and parsing.
 *
 * All page URLs end in a slash and are written to disk as <path>/index.html, so the static export
 * serves correctly from any plain file host with no rewrite rules. Type and member slugs are read
 * from the model rather than recomputed here, so there is only one slug rule to keep correct.
 */

/**
 * The segment that marks the namespace-mode copy of a page.
 *
 * A site with authored pages browses two ways - by category, which is what the prose is organised
 * around, and by namespace, which is the shape the compiler sees - and a type reads the same in
 * both. Which one a reader is in therefore cannot be a property of the reader, because a static
 * host serves one file per url and that file has to carry a sidebar: it is a property of the url.
 * '/type/x/' is the category-mode page and '/namespace/type/x/' is the namespace-mode one, and
 * every link a page writes is written in its own mode, so no click falls out of it.
 *
 * A site with no authored pages has only the one mode, so it needs no marker and gets none.
 */
const NAMESPACE_MODE = 'namespace';

/**
 * The directory Sandcastle put its topics in, and where owl writes the redirects that replace them.
 *
 * Fixed rather than configurable: it is the folder SHFB's website output has always used, so it is
 * the folder the links owl is answering were written against.
 */
const SANDCASTLE_DIR = 'html';

/** How a Sandcastle topic name begins, which is the kind of api it documented. */
const SANDCASTLE_PREFIX =
  /^(?:T|M|P|F|E|N|R|Overload|Methods|Properties|Fields|Events|Operators|AllMembers)_/i;

/** Normalizes a base path to the form '' or '/prefix'. */
function normalizeBase(base) {
  if (!base || base === '/') return '';
  let value = base.startsWith('/') ? base : '/' + base;
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/** Slugifies an assembly or category name. Must stay in step with Slug.Normalize in owl-gen. */
function slugify(value) {
  let out = '';
  let pending = false;

  for (const ch of String(value || '')) {
    if (/[a-zA-Z0-9.]/.test(ch)) {
      if (pending && out.length > 0) out += '-';
      pending = false;
      out += ch.toLowerCase();
    } else {
      pending = true;
    }
  }

  return out;
}

class Routes {
  /**
   * @param {string} base  path prefix the site is served under
   * @param {string} mode  '' for the plain urls, 'namespace' for the namespace-mode ones
   */
  constructor(base = '', mode = '') {
    this.base = normalizeBase(base);
    this.mode = mode === NAMESPACE_MODE ? NAMESPACE_MODE : '';
  }

  /** The same routes writing urls for another mode. Returns this one when it is already that mode. */
  withMode(mode) {
    const wanted = mode === NAMESPACE_MODE ? NAMESPACE_MODE : '';
    return wanted === this.mode ? this : new Routes(this.base, wanted);
  }

  /**
   * What namespace mode puts in front of the pages it has a copy of, and '' outside it.
   *
   * Public because the browser needs it too: the search index is built once, in the plain shape,
   * so a result opened from a namespace-mode page has the segment put back on the way out.
   */
  get modeInsert() {
    return this.mode ? `/${this.mode}` : '';
  }

  home() {
    return this.base + '/';
  }

  assembly(assemblyName) {
    return `${this.base}/assembly/${slugify(assemblyName)}/`;
  }

  /**
   * A namespace's own page. Unmarked in either mode, because it only exists in the one: a namespace
   * page is namespace mode, and following one is how a reader enters it.
   */
  namespace(namespaceName) {
    const slug = namespaceName ? slugify(namespaceName) : 'global';
    return `${this.base}/${NAMESPACE_MODE}/${slug}/`;
  }

  /** A category's page, which likewise exists in category mode alone. */
  category(assemblyName, categoryName) {
    return `${this.base}/category/${slugify(assemblyName)}/${slugify(categoryName)}/`;
  }

  /** Page url for a type, from the slug in the model. */
  type(typeSlug) {
    return `${this.base}${this.modeInsert}/type/${typeSlug}/`;
  }

  /**
   * What every type url under these routes begins with, for the tree asset: a slug and a slash
   * make the rest. One prefix rather than a url per row, since a tree holds thousands of them.
   */
  typePrefix() {
    return `${this.base}${this.modeInsert}/type/`;
  }

  /** Url for a member, which lives as a fragment on its type's page. */
  member(typeSlug, anchor) {
    return anchor ? `${this.type(typeSlug)}#${anchor}` : this.type(typeSlug);
  }

  /**
   * A member's examples, which get a page of their own rather than a place on the type page.
   *
   * Examples pulled from files run to hundreds of lines each, and several languages of the same
   * example is the normal case, so inlining them would bury the member list they belong to.
   */
  example(typeSlug, anchor) {
    return `${this.base}${this.modeInsert}/example/${typeSlug}/${anchor}/`;
  }

  /**
   * The search page, optionally narrowed to one assembly.
   *
   * @param {string} query
   * @param {string} assemblySlug  scope; omitted, search covers everything
   */
  search(query, assemblySlug) {
    const params = [];
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    if (assemblySlug) params.push(`a=${encodeURIComponent(assemblySlug)}`);

    return `${this.base}/search/${params.length > 0 ? `?${params.join('&')}` : ''}`;
  }

  asset(name) {
    return `${this.base}/assets/${name}`;
  }

  /** Where the redirect for one Sandcastle topic lives. */
  sandcastle(name) {
    return `${this.base}/${SANDCASTLE_DIR}/${name}.htm`;
  }

  sitemap() {
    return `${this.base}/sitemap.xml`;
  }

  /**
   * Resolves an index entry (as emitted in index.json) to a url.
   * Members carry an anchor; types do not.
   */
  forEntry(entry) {
    if (!entry) return null;
    return entry.anchor ? this.member(entry.slug, entry.anchor) : this.type(entry.slug);
  }

  /** Maps a request path to a route descriptor, or null when nothing matches. */
  match(pathname) {
    let path = pathname;

    if (this.base && path.startsWith(this.base)) {
      path = path.slice(this.base.length);
    }

    if (path === '' || path === '/') return { kind: 'home' };
    if (path === '/search' || path === '/search/') return { kind: 'search' };
    if (path === '/sitemap.xml') return { kind: 'sitemap' };
    if (path === '/robots.txt') return { kind: 'robots' };

    const parts = path.split('/').filter(Boolean);

    if (parts[0] === 'assets' && parts.length === 2) {
      return { kind: 'asset', name: parts[1] };
    }

    if (parts[0] === 'type' && parts.length === 2) {
      return { kind: 'type', slug: parts[1] };
    }

    if (parts[0] === 'example' && parts.length === 3) {
      return { kind: 'example', slug: parts[1], anchor: parts[2] };
    }

    // Namespace mode's copies, before the namespace page itself. They cannot be confused with it -
    // a namespace page is two segments and these are three and four - so a namespace really called
    // Type still gets its page at /namespace/type/.
    if (parts[0] === NAMESPACE_MODE && parts[1] === 'type' && parts.length === 3) {
      return { kind: 'type', slug: parts[2], mode: NAMESPACE_MODE };
    }

    if (parts[0] === NAMESPACE_MODE && parts[1] === 'example' && parts.length === 4) {
      return { kind: 'example', slug: parts[2], anchor: parts[3], mode: NAMESPACE_MODE };
    }

    if (parts[0] === NAMESPACE_MODE && parts.length === 2) {
      return { kind: 'namespace', slug: parts[1] };
    }

    if (parts[0] === 'assembly' && parts.length === 2) {
      return { kind: 'assembly', slug: parts[1] };
    }

    if (parts[0] === 'category' && parts.length === 3) {
      return { kind: 'category', assembly: parts[1], category: parts[2] };
    }

    // Sandcastle's own urls, matched last so that nothing owl serves can be shadowed by one.
    const topic = matchSandcastle(parts);
    if (topic) return { kind: 'sandcastle', name: topic };

    return null;
  }
}

/**
 * The topic name in a Sandcastle url, or '' when the path is not one.
 *
 * Inside html/ any name counts, because that folder was Sandcastle's and holds nothing else. At the
 * root a name has to look like a topic, so that an index.html sitting beside the exported site is
 * not read as a request for one.
 */
function matchSandcastle(parts) {
  const file = parts.length > 0 ? parts[parts.length - 1] : '';
  const name = file.replace(/\.html?$/i, '');

  if (name === file || name === '') return '';

  if (parts.length === 2 && parts[0].toLowerCase() === SANDCASTLE_DIR) return name;
  if (parts.length === 1 && SANDCASTLE_PREFIX.test(name)) return name;

  return '';
}

module.exports = { Routes, slugify, normalizeBase, NAMESPACE_MODE, SANDCASTLE_DIR };
