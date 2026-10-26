'use strict';

const { escape, attr } = require('./html');

/**
 * Docify url compatibility.
 *
 * Docify published a type at <base>/<namespace.type>/ and each member at <base>/<namespace.type>/<name>,
 * all lower case, with a constructor named after its type. Rhino's script editor builds exactly
 * these, with ?plain=true and ?dark=true on the end, so a site replacing docify has to answer them
 * for editors already shipped.
 *
 * The names are generated from the model, as the Sandcastle ones are, so a path absent from the
 * table never had a page. Overloads share a name, and the first one owl lists answers for all of
 * them; they are on one page either way.
 */

/** owl's own first path segments, which a docify path is never allowed to shadow. */
const RESERVED = new Set(['type', 'namespace', 'assembly', 'category', 'example', 'search', 'assets', 'html']);

/** The docify path for a type's doc id: its full name, lower case. */
function typePath(typeId) {
  return typeId.slice(2).toLowerCase();
}

/**
 * The docify name for a member's doc id: its own name, lower case, with a constructor named after
 * its type and a generic method's arity left off, as the editor names them.
 */
function memberName(memberId, typeName) {
  const params = memberId.indexOf('(');
  const id = params === -1 ? memberId.slice(2) : memberId.slice(2, params);
  const name = id.slice(id.lastIndexOf('.') + 1).replace(/``\d+$/, '');
  if (name === '#ctor' || name === '#cctor') return typeName.replace(/`\d+$/, '').toLowerCase();
  return name.replace(/#/g, '.').toLowerCase();
}

/**
 * The page a docify url is answered with when the site is exported rather than served.
 *
 * As the Sandcastle stub, but the query the old url was asked with is carried across, because it
 * is what asks for the plain page: a static host cannot add it to a redirect of its own. The script
 * is in the body for the same reason the Sandcastle one is.
 */
function stub(url) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved</title>
<link rel="canonical" href="${attr(url)}">
<meta http-equiv="refresh" content="0; url=${attr(url)}">
</head>
<body><p>This page has moved to <a href="${attr(url)}">${escape(url)}</a>.</p>
<script>var u=new URL(${JSON.stringify(url)},location.href);if(location.search)u.search=(u.search?u.search+'&':'?')+location.search.slice(1);location.replace(u.href)</script>
</body>
</html>
`;
}

/** A url with a request's query put on it, after any query of its own and ahead of any fragment. */
function withQuery(url, query) {
  const search = query ? String(query) : '';
  if (!search) return url;
  const hash = url.indexOf('#');
  const head = hash === -1 ? url : url.slice(0, hash);
  const joined = `${head}${head.includes('?') ? '&' : '?'}${search}`;
  return hash === -1 ? joined : joined + url.slice(hash);
}

class Docify {
  /**
   * @param {object} model    the loaded model, for its doc ids
   * @param {object} routes   plain-mode routes; a docify url answers with the site's own url
   * @param {function} warn   where a path that cannot be answered is reported
   */
  constructor(model, routes, warn = () => {}) {
    this.routes = routes;

    /** Lowercased docify path to the url it moved to. @type {Map<string, string>} */
    this.targets = new Map();

    const entries = model.index.entries;
    const types = new Map();

    for (const [docId, entry] of Object.entries(entries)) {
      if (!docId.startsWith('T:')) continue;
      const path = typePath(docId);
      if (RESERVED.has(path.split('/')[0])) {
        warn(`docify url ${path}/: owl uses that path itself, so it is not answered`);
        continue;
      }
      types.set(docId.slice(2), path);
      this.targets.set(path, routes.forEntry(entry));
    }

    for (const [docId, entry] of Object.entries(entries)) {
      if (docId.startsWith('T:') || docId.startsWith('N:') || !entry.anchor) continue;

      const params = docId.indexOf('(');
      const id = params === -1 ? docId.slice(2) : docId.slice(2, params);
      const typeName = id.slice(0, id.lastIndexOf('.'));
      const path = types.get(typeName);
      if (!path) continue;

      const key = `${path}/${memberName(docId, typeName.slice(typeName.lastIndexOf('.') + 1))}`;
      if (!this.targets.has(key)) this.targets.set(key, routes.forEntry(entry, true));
    }
  }

  /** The url a docify path moved to, or null when nothing owl documents ever had it. */
  lookup(path) {
    return this.targets.get(String(path).replace(/^\/+|\/+$/g, '').toLowerCase()) ?? null;
  }

  /** Every docify url the export has to write, as [url, target] pairs. */
  *stubs() {
    for (const [path, url] of this.targets) {
      yield [this.routes.docify(path), url];
    }
  }
}

module.exports = { Docify, stub, withQuery };
