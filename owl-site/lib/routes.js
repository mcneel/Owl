'use strict';

/**
 * URL construction and parsing.
 *
 * All page URLs end in a slash and are written to disk as <path>/index.html, so the static export
 * serves correctly from any plain file host with no rewrite rules. Type and member slugs are read
 * from the model rather than recomputed here, so there is only one slug rule to keep correct.
 */

/**
 * The path segment under which the namespace-mode copies of the type and example pages used to be
 * published, kept so those urls still land: each is a stub that sends the reader to the plain page.
 *
 * A site with authored pages browses two ways - by category, which is what the prose is organised
 * around, and by namespace, which is the shape the compiler sees - and a type reads the same in
 * both. The mode rides on the url as a query flag: '/type/x/' is the category-mode page and
 * '/type/x/?ns' the namespace-mode reading of it, and every link a namespace-mode page writes
 * carries the flag, so no click falls out of it. A file host serves the two as one file - which is
 * the point, a full copy of every type page cost more than the rest of the site - and the page
 * swaps its own tree when it sees the flag. See the browse-mode section of assets.js.
 *
 * A site with no authored pages has only the one mode, so it needs no flag and gets none.
 */
const NAMESPACE_MODE = 'namespace';

/** The query flag that marks the namespace-mode reading of a page. */
const NS_FLAG = 'ns';

/**
 * The query parameter naming the member a shared type url is about.
 *
 * A link previewer never sees the fragment, so this is what lets a host answer one type page with
 * the preview of the member it was shared for.
 */
const MEMBER_PARAM = 'member';

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
   * What namespace mode hangs on the end of the pages it has a reading of, and '' outside it.
   *
   * Public because the browser needs it too: the search index is built once, in the plain shape,
   * so a result opened from a namespace-mode page has the flag put back on the way out.
   */
  get modeSuffix() {
    return this.mode ? `?${NS_FLAG}` : '';
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
    return `${this.base}/type/${typeSlug}/${this.modeSuffix}`;
  }

  /**
   * What every type url under these routes begins with, for the tree asset: a slug and a slash
   * make the rest. One prefix rather than a url per row, since a tree holds thousands of them.
   * The mode flag is not part of it - it rides behind the slash, as the asset's suffix.
   */
  typePrefix() {
    return `${this.base}/type/`;
  }

  /** Url for a member, which lives as a fragment on its type's page. */
  member(typeSlug, anchor) {
    return anchor ? `${this.type(typeSlug)}#${anchor}` : this.type(typeSlug);
  }

  /**
   * The url a member is shared by: its type page, with the member named where a link previewer
   * can see it as well as in the fragment the page scrolls to.
   */
  sharedMember(typeSlug, anchor) {
    const flag = this.mode ? `${NS_FLAG}&` : '';
    return `${this.base}/type/${typeSlug}/?${flag}${MEMBER_PARAM}=${anchor}#${anchor}`;
  }

  /**
   * A member's examples, which get a page of their own rather than a place on the type page.
   *
   * Examples pulled from files run to hundreds of lines each, and several languages of the same
   * example is the normal case, so inlining them would bury the member list they belong to.
   */
  example(typeSlug, anchor) {
    return `${this.base}/example/${typeSlug}/${anchor}/${this.modeSuffix}`;
  }

  /**
   * Where the namespace-mode copy of a type page used to live, and where the stub that forwards
   * its readers is written now. Mode-independent: the old urls had the one shape.
   */
  typeStub(typeSlug) {
    return `${this.base}/${NAMESPACE_MODE}/type/${typeSlug}/`;
  }

  /** As typeStub, for the example pages that hung off the copied types. */
  exampleStub(typeSlug, anchor) {
    return `${this.base}/${NAMESPACE_MODE}/example/${typeSlug}/${anchor}/`;
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

  /**
   * What changed in a version: '9' is 9 up to the next version listed, and '6.0...9.0' exactly what
   * came after 6.0 up to and including 9.0, older first. Without a spec, the newest listed version.
   */
  whatsNew(spec = '') {
    return `${this.base}/whatsnew/${spec ? `${encodeURIComponent(spec)}/` : ''}`;
  }

  asset(name) {
    return `${this.base}/assets/${name}`;
  }

  /** Where the redirect for one Sandcastle topic lives. */
  sandcastle(name) {
    return `${this.base}/${SANDCASTLE_DIR}/${name}.htm`;
  }

  /** Where the redirect for one docify path lives. */
  docify(path) {
    return `${this.base}/${path}/`;
  }

  sitemap() {
    return `${this.base}/sitemap.xml`;
  }

  /**
   * Resolves an index entry (as emitted in index.json) to a url.
   * Members carry an anchor; types do not. Shared, a member resolves to its sharedMember url.
   */
  forEntry(entry, shared = false) {
    if (!entry) return null;
    if (!entry.anchor) return this.type(entry.slug);
    return shared ? this.sharedMember(entry.slug, entry.anchor) : this.member(entry.slug, entry.anchor);
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

    // The stubs standing where namespace mode's copies used to be, before the namespace page
    // itself. They cannot be confused with it - a namespace page is two segments and these are
    // three and four - so a namespace really called Type still gets its page at /namespace/type/.
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

    // Ahead of docify, whose one-segment paths would otherwise take /whatsnew/ for a type name.
    if (parts[0] === 'whatsnew' && parts.length <= 2) {
      return { kind: 'whatsnew', spec: parts.length === 2 ? safeDecode(parts[1]) : '' };
    }

    if (parts[0] === 'category' && parts.length === 3) {
      return { kind: 'category', assembly: parts[1], category: parts[2] };
    }

    // Sandcastle's own urls, matched last so that nothing owl serves can be shadowed by one.
    const topic = matchSandcastle(parts);
    if (topic) return { kind: 'sandcastle', name: topic };

    // Docify's <type>/ and <type>/<member>, last of all for the same reason.
    if (parts.length === 1 || parts.length === 2) return { kind: 'docify', path: parts.join('/') };

    return null;
  }
}

/** A path segment decoded, or as it came when it is not valid percent-encoding. */
function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
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

module.exports = { Routes, slugify, normalizeBase, NAMESPACE_MODE, NS_FLAG, MEMBER_PARAM, SANDCASTLE_DIR };
