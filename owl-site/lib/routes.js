'use strict';

/**
 * URL construction and parsing.
 *
 * All page URLs end in a slash and are written to disk as <path>/index.html, so the static export
 * serves correctly from any plain file host with no rewrite rules. Type and member slugs are read
 * from the model rather than recomputed here, so there is only one slug rule to keep correct.
 */

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
  constructor(base = '') {
    this.base = normalizeBase(base);
  }

  home() {
    return this.base + '/';
  }

  assembly(assemblyName) {
    return `${this.base}/assembly/${slugify(assemblyName)}/`;
  }

  namespace(namespaceName) {
    const slug = namespaceName ? slugify(namespaceName) : 'global';
    return `${this.base}/namespace/${slug}/`;
  }

  category(assemblyName, categoryName) {
    return `${this.base}/category/${slugify(assemblyName)}/${slugify(categoryName)}/`;
  }

  /** Page url for a type, from the slug in the model. */
  type(typeSlug) {
    return `${this.base}/type/${typeSlug}/`;
  }

  /** Url for a member, which lives as a fragment on its type's page. */
  member(typeSlug, anchor) {
    return anchor ? `${this.base}/type/${typeSlug}/#${anchor}` : this.type(typeSlug);
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

    if (parts[0] === 'namespace' && parts.length === 2) {
      return { kind: 'namespace', slug: parts[1] };
    }

    if (parts[0] === 'assembly' && parts.length === 2) {
      return { kind: 'assembly', slug: parts[1] };
    }

    if (parts[0] === 'category' && parts.length === 3) {
      return { kind: 'category', assembly: parts[1], category: parts[2] };
    }

    return null;
  }
}

module.exports = { Routes, slugify, normalizeBase };
