'use strict';

const { escape, attr } = require('./html');

/**
 * Sandcastle url compatibility.
 *
 * A site moving off Sandcastle Help File Builder arrives carrying years of links into
 * html/T_MyLib_Storage_StorageSite.htm and its neighbours, written into forum posts and code
 * comments nobody can go back and edit. This maps those names onto owl's own urls.
 *
 * The names are generated rather than parsed. Every doc id in the model is put through SHFB's own
 * filename rule and the answer recorded, so the table is exact for everything owl documents and a
 * name absent from it never had a page. Parsing would have to find where a namespace ends and a
 * nested type begins, which the rule makes unknowable: it writes '.' and '`' as '_' along with
 * every other separator, so T_A_B_C is namespace A.B's type C and namespace A's nested B.C alike.
 *
 * What makes the mapping cheap is that owl gives a type one page and hangs its members off it as
 * anchors. Every member url of a type therefore lands on that type's page, and all that separates
 * one from another is the fragment.
 */

/**
 * The characters SHFB replaces with an underscore, from ApiTopicNamer.ToMemberName in
 * SHFB/Source/SandcastleBuilderMSBuild/BuildEngine/ApiTopicNamer.cs.
 */
const INVALID_CHARS = /[ :.`@#{}<>*?|]/g;

/**
 * The per-type member lists Sandcastle gave pages of their own. Owl puts every member on the type's
 * page, so the list a reader asked for is already there when they arrive.
 */
const MEMBER_LISTS = ['AllMembers', 'Methods', 'Properties', 'Fields', 'Events', 'Operators'];

/** A counter Sandcastle appended to make an overloaded member's filename unique. */
const OVERLOAD_COUNTER = /_\d+$/;

/**
 * Sandcastle's MemberName filename for an api member id.
 *
 * Parameters are dropped, which is what makes overloads collide - Sandcastle broke the tie with a
 * counter, and Sandcastle.lookup puts that back.
 */
function topicName(memberId) {
  const params = memberId.indexOf('(');
  const id = params === -1 ? memberId : memberId.slice(0, params);
  return id.replace(INVALID_CHARS, '_');
}

/**
 * The page a sandcastle url is answered with when the site is exported rather than served.
 *
 * A static host has no way to send a 301, so the redirect is written into a page: the canonical
 * link is what a crawler follows, the refresh is what a reader with no javascript follows, and
 * replace() rather than assign() keeps the old url out of the history so Back leaves the site
 * instead of bouncing.
 *
 * The script is in the body, not the head: leaving from the head can report the page loaded with
 * no body yet, and Rhino's script editor styles document.body the moment a page loads, crashing.
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
<script>location.replace(${JSON.stringify(url)})</script>
</body>
</html>
`;
}

class Sandcastle {
  /**
   * @param {object} model    the loaded model, for its doc ids and namespaces
   * @param {object} routes   plain-mode routes; a sandcastle url answers with the site's own url,
   *                          not with a namespace-mode copy of it
   * @param {function} warn   where a name that two symbols both claim is reported
   */
  constructor(model, routes, warn = () => {}) {
    this.routes = routes;

    /**
     * Lowercased topic name to the name as Sandcastle wrote it and the url it moved to.
     *
     * Keyed without case because the prefix an old link was written with is as likely to be
     * /api/MyLib/ as /api/mylib/, and carrying the real spelling because the export writes a file
     * per name and a file host answers the spelling it was given.
     *
     * @type {Map<string, {name: string, url: string, overloads?: number}>}
     */
    this.targets = new Map();

    this.build(model, warn);
  }

  /**
   * Records a name, keeping the first symbol to claim it.
   *
   * Overloads claim one name between them by design - Sandcastle dropped parameters from the
   * filename too - and they share a page, so the second and later ones are not a clash and the
   * overload list page is what the name really meant. A name claimed by two different pages is a
   * clash, and a rare one: it takes the flattening to erase a real difference, as it does between
   * namespace A.B's type C and namespace A's nested type B.C.
   */
  add(name, url, warn) {
    const key = name.toLowerCase();
    const held = this.targets.get(key);

    if (held === undefined) {
      this.targets.set(key, { name, url });
      return;
    }

    if (samePage(held.url, url)) {
      // Counted so the export can write the _1, _2... names Sandcastle gave the later overloads.
      held.overloads = (held.overloads || 1) + 1;

      // The overload list page, which only exists once a member turns out to have overloads.
      const overload = overloadName(held.name);
      if (!this.targets.has(overload.toLowerCase())) {
        this.targets.set(overload.toLowerCase(), { name: overload, url: held.url });
      }
      return;
    }

    warn(`sandcastle url ${name}.htm: claimed by ${held.url} and ${url}, keeping the first`);
  }

  build(model, warn) {
    // Namespaces first, so a type never loses its name to one. It cannot happen - the prefixes
    // differ - but the order is what makes that true rather than lucky.
    for (const name of model.namespaces.keys()) {
      if (!name) continue;
      this.add(topicName(`N:${name}`), this.routes.namespace(name), warn);
    }

    for (const [docId, entry] of Object.entries(model.index.entries)) {
      const url = this.routes.forEntry(entry, true);
      if (!url) continue;

      const name = topicName(docId);
      this.add(name, url, warn);

      if (docId.startsWith('T:')) {
        for (const list of MEMBER_LISTS) {
          this.add(`${list}_${name}`, url, warn);
        }
      }
    }
  }

  /**
   * The url a topic name moved to, or null when nothing owl documents ever had that name.
   */
  lookup(name) {
    let key = String(name).toLowerCase();

    const exact = this.targets.get(key);
    if (exact !== undefined) return exact.url;

    // R_Project_<HtmlHelpName> was the root listing every namespace. The name was the help file's,
    // which is not in the model, so the shape is what identifies it.
    if (key.startsWith('r_project_')) return this.routes.home();

    // What is left is the counter Sandcastle appended to tell overloads apart, assigned in the
    // order that build happened to reach them and recorded nowhere the model can see. The counter
    // only ever separated overloads of one member, so dropping it answers with the right page -
    // and with the first overload's anchor, which is the nearest thing to the one that was asked
    // for. Tried only after an exact match fails, so T_MyLib_StorageSite_1, where the 1 is generic
    // arity rather than a counter, is answered by its own page.
    while (OVERLOAD_COUNTER.test(key)) {
      key = key.replace(OVERLOAD_COUNTER, '');
      const shorter = this.targets.get(key);
      if (shorter !== undefined) return shorter.url;
    }

    return null;
  }

  /** Every sandcastle url the export has to write, as [url, target] pairs. */
  *stubs() {
    for (const { name, url, overloads } of this.targets.values()) {
      yield [this.routes.sandcastle(name), url];

      // A static host cannot drop the counter the way lookup does, so each counted name gets a file
      // of its own, answered as lookup answers it. A real topic of that name keeps its own.
      for (let i = 1; i < (overloads || 1); i++) {
        const counted = `${name}_${i}`;
        if (!this.targets.has(counted.toLowerCase())) {
          yield [this.routes.sandcastle(counted), url];
        }
      }
    }
  }

  get size() {
    return this.targets.size;
  }
}

/** Two urls are the same page when they differ only in the query or the fragment. */
function samePage(a, b) {
  return a.split(/[?#]/)[0] === b.split(/[?#]/)[0];
}

/**
 * The overload list's name for a member's, which is its kind prefix swapped for 'Overload'.
 *
 * Spelled the way Sandcastle spelled it, because the export writes a file per name and a file host
 * is within its rights to answer only the spelling it was given.
 */
function overloadName(name) {
  return 'Overload' + name.slice(name.indexOf('_'));
}

module.exports = { Sandcastle, topicName, stub };
