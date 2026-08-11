'use strict';

const { slugify } = require('./routes');

/**
 * Where a type documented by another owl site lives.
 *
 * A set documents the assemblies it was generated from and no others, so everything a referenced
 * assembly declares is a dead name on its pages: RhinoCommon's Curve appears in half of
 * Grasshopper's signatures and led nowhere. This is the map from an assembly to the site that does
 * document it, which is the last thing tried before Microsoft Learn.
 *
 * Keyed by assembly rather than by namespace because a namespace is not owned by one assembly.
 * Rhino.UI types are documented in the RhinoCommon set, and Rhino.UI.dll declares more of its own
 * that are documented nowhere; a namespace map would send both to the same page and be wrong about
 * half of them.
 *
 * Urls are computed rather than looked up. Both sites are written by owl, whose type slug is a
 * pure function of the doc id - Slug.ForType is Slug.Normalize of the name with 'T:' taken off -
 * so '<url>/type/' plus that slug is the page, without the other site's model having to be at hand
 * when this one is built.
 */
class Links {
  /**
   * @param {string[]} entries  '<assembly>=<url>' as given on the command line, where the
   *   assembly may end in '*' to cover a family: 'Rhino.Runtime.Code*=/api/rhinocode'.
   */
  constructor(entries = []) {
    this.exact = new Map();
    this.prefixes = [];

    for (const entry of entries) {
      const at = entry.indexOf('=');
      if (at < 1) {
        throw new Error(`--link ${entry}: expected <assembly>=<url>, such as RhinoCommon=/api/rhinocommon.`);
      }

      const name = entry.slice(0, at).trim();
      const url = entry.slice(at + 1).trim().replace(/\/$/, '');

      if (!url) throw new Error(`--link ${entry}: no url after the '='.`);

      if (name.endsWith('*')) this.prefixes.push({ prefix: name.slice(0, -1), url });
      else this.exact.set(name, url);
    }

    // Longest first, so a family and one of its members can both be named and the more specific
    // of the two answers: 'Rhino.Runtime.Code.Editor' is not what 'Rhino.Runtime.Code*' meant.
    this.prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  get empty() {
    return this.exact.size === 0 && this.prefixes.length === 0;
  }

  /** The site documenting an assembly, or '' when no entry names it. */
  siteFor(assemblyName) {
    if (!assemblyName) return '';

    const exact = this.exact.get(assemblyName);
    if (exact) return exact;

    for (const entry of this.prefixes) {
      if (assemblyName.startsWith(entry.prefix)) return entry.url;
    }

    return '';
  }

  /**
   * The page for one external type, or '' when its assembly is documented nowhere this knows of.
   *
   * A member's doc id is not accepted here. Its anchor is only almost derivable - owl appends a
   * counter where two members normalize alike - so the caller resolves the declaring type instead
   * and the reader lands on the page rather than beside the wrong card on it.
   *
   * @param {string} typeDocId    'T:Rhino.Geometry.Curve'
   * @param {string} assemblyName the assembly the model recorded for the reference
   */
  typeUrl(typeDocId, assemblyName) {
    if (!typeDocId || !typeDocId.startsWith('T:')) return '';

    const site = this.siteFor(assemblyName);
    if (!site) return '';

    // Generic arity is part of the slug, as it is in the documented set: List`1 is 'list-1'.
    return `${site}/type/${slugify(typeDocId.slice(2))}/`;
  }
}

module.exports = { Links };
