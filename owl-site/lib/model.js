'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { inlineSvg } = require('./html');

/**
 * Loads the generated model and the authored markdown, and builds the lookups the renderers need.
 *
 * The whole model is held in memory, so page rendering is pure computation with no I/O. On a large
 * documented set that is tens of megabytes of JSON, which is fine for a docs tool.
 */

/**
 * Filename, case-insensitive, that supplies a page's own prose rather than a category overview:
 * MAIN.md at the root for the landing page, <AssemblyName>/MAIN.md for an assembly's.
 */
const MAIN_DOC = 'main.md';

/**
 * Filenames, case-insensitive, of the icon shown beside the site name in the header.
 *
 * The dark variant is optional and only needed by a mark that cannot be made to work on both
 * backgrounds; one drawn with currentColor, or with colours that read either way, needs only
 * logo.svg and is used under both themes.
 */
const LOGO_FILE = 'logo.svg';
const LOGO_DARK_FILE = 'logo-dark.svg';

/** Filename, case-insensitive, in an assembly folder listing its categories in sidebar order. */
const SORT_FILE = 'sort.txt';

/**
 * Reads the authored content under the docs directory.
 *
 * Six kinds of file live here:
 *
 *   MAIN.md                        the site landing page
 *   logo.svg                       the header icon
 *   logo-dark.svg                  the header icon under the dark theme
 *   <AssemblyName>/MAIN.md         that assembly's landing page
 *   <AssemblyName>/<Category>.md   a category overview
 *   <AssemblyName>/SORT.txt        category names, one per line, first to last
 *
 * The folder must match an assembly name and the stem must match a <category> tag in the source,
 * both compared case-insensitively, with no front-matter. Category keys are composite because
 * category names repeat across assemblies - Options and Utilities tend to appear in several.
 */
function loadAuthoredDocs(apiDir, warnings) {
  const categories = new Map();
  const mains = new Map();
  const orders = new Map();
  let siteMain = null;
  let siteLogo = '';
  let siteLogoDark = '';

  // No directory named at all is the namespace-mode site, which has no authored pages by
  // definition; a named one that is not there yet is a site whose first page is still to be written.
  if (!apiDir || !fs.existsSync(apiDir)) {
    return { categories, mains, orders, siteMain, siteLogo, siteLogoDark };
  }

  const read = (file) => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      warnings.push(`could not read ${file}: ${err.message}`);
      return null;
    }
  };

  const entries = fs
    .readdirSync(apiDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      const lower = entry.name.toLowerCase();

      if (lower === LOGO_FILE || lower === LOGO_DARK_FILE) {
        const full = path.join(apiDir, entry.name);
        const source = read(full);

        if (source !== null) {
          const svg = inlineSvg(source);
          if (!svg) warnings.push(`ignoring ${full}: not an <svg> document`);
          else if (lower === LOGO_FILE) siteLogo = svg;
          else siteLogoDark = svg;
        }
        continue;
      }

      if (!lower.endsWith('.md')) continue;

      if (lower === MAIN_DOC) {
        const markdown = read(path.join(apiDir, entry.name));
        if (markdown !== null) siteMain = { markdown, file: path.join(apiDir, entry.name) };
      } else {
        warnings.push(
          `ignoring ${path.join(apiDir, entry.name)}: only MAIN.md belongs at the root of the docs ` +
            `directory; category docs go in an assembly folder, e.g. ` +
            path.join(apiDir, '<AssemblyName>', entry.name)
        );
      }
      continue;
    }

    const assemblyDir = path.join(apiDir, entry.name);

    for (const file of fs.readdirSync(assemblyDir).sort()) {
      if (file.toLowerCase() === SORT_FILE) {
        const text = read(path.join(assemblyDir, file));
        if (text !== null) {
          // Blank lines and '#' lines are left out so the list can be spaced and annotated.
          const names = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
          orders.set(entry.name.toLowerCase(), { names, file: path.join(assemblyDir, file) });
        }
        continue;
      }

      if (!file.toLowerCase().endsWith('.md')) continue;

      const full = path.join(assemblyDir, file);
      const markdown = read(full);
      if (markdown === null) continue;

      // MAIN.md is the assembly's own page, not a category called "MAIN".
      if (file.toLowerCase() === MAIN_DOC) {
        mains.set(entry.name.toLowerCase(), { assembly: entry.name, markdown, file: full });
        continue;
      }

      const stem = file.slice(0, -3);
      categories.set(`${entry.name.toLowerCase()}/${stem.toLowerCase()}`, {
        assembly: entry.name,
        category: stem,
        markdown,
        file: full,
      });
    }
  }

  return { categories, mains, orders, siteMain, siteLogo, siteLogoDark };
}

/** Documented means carrying a &lt;summary&gt;, which is the one thing owl-gen counts. */
function documented(node) {
  return Boolean(node.docs) && node.docs.undocumented !== true;
}

class Model {
  constructor({ jsonDir, apiDir, skipUndocumented = false }) {
    this.jsonDir = jsonDir;
    this.apiDir = apiDir;
    this.skipUndocumented = skipUndocumented;
    this.warnings = [];

    /** What --skip-undocumented left out, for the line the tools print on startup. */
    this.skipped = { types: 0, members: 0 };

    this.load();
  }

  load() {
    const indexPath = path.join(this.jsonDir, 'index.json');

    if (!fs.existsSync(indexPath)) {
      throw new Error(
        `No index.json in ${this.jsonDir}.\n` +
          'Generate the documentation model first:\n' +
          '  owl gen <project.csproj>'
      );
    }

    this.index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

    /** @type {Map<string, object>} assembly name to its full document */
    this.assemblies = new Map();

    /** @type {Map<string, {type: object, assembly: string}>} doc id to type */
    this.typesByDocId = new Map();

    /** @type {Map<string, {type: object, assembly: string}>} slug to type */
    this.typesBySlug = new Map();

    /** @type {Map<string, object>} '<assembly>!<fullName>' to type, for resolving nesting. */
    this.typesByFullName = new Map();

    for (const summary of this.index.assemblies) {
      const file = path.join(this.jsonDir, `${summary.name}.json`);
      if (!fs.existsSync(file)) {
        this.warnings.push(`index lists ${summary.name} but ${file} is missing`);
        continue;
      }

      const document = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (this.skipUndocumented) this.dropUndocumented(document);
      this.assemblies.set(summary.name, document);

      for (const type of document.types) {
        this.typesByDocId.set(type.docId, { type, assembly: summary.name });
        this.typesByFullName.set(`${summary.name}!${type.fullName}`, type);

        // Slugs derive from namespace-qualified doc ids, so a collision needs two assemblies to
        // declare the very same fully-qualified type. Report it rather than silently losing a page.
        if (this.typesBySlug.has(type.slug)) {
          const existing = this.typesBySlug.get(type.slug);
          this.warnings.push(
            `slug collision '${type.slug}': ${existing.assembly}!${existing.type.fullName} ` +
              `and ${summary.name}!${type.fullName}`
          );
          continue;
        }

        this.typesBySlug.set(type.slug, { type, assembly: summary.name });
      }
    }

    if (this.skipUndocumented) this.dropUndocumentedEntries();

    // A second pass, because a nested type's key includes the kind of every type that declares it,
    // and a parent can be loaded after its child.
    for (const [assemblyName, document] of this.assemblies) {
      for (const type of document.types) type.sortKey = this.typeSortKey(type, assemblyName);
    }

    const authored = loadAuthoredDocs(this.apiDir, this.warnings);
    this.categoryDocs = authored.categories;
    this.categoryOrders = authored.orders;

    /** MAIN.md, or null. Drives the site landing page. */
    this.siteMain = authored.siteMain;

    /** logo.svg, ready to inline, or ''. Shown beside the site name in the header. */
    this.siteLogo = authored.siteLogo;

    /** logo-dark.svg, ready to inline, or ''. Optional; without it siteLogo serves both themes. */
    this.siteLogoDark = authored.siteLogoDark;

    /** Assembly name (lowercased) -> <Assembly>/MAIN.md. */
    this.assemblyMains = authored.mains;

    this.buildNamespaceIndex();
    this.buildCategoryIndex();
  }

  /**
   * Removes everything with no &lt;summary&gt; from one assembly's document, in place.
   *
   * A type outlives its own missing summary if any of its members has one: dropping it would take
   * those members with it, and a member has nowhere to be read but its type's page. Enum values go
   * the other way and stay with a type that survived on its own merits - an enum is its list of
   * values, and one rendered without them tells the reader less than no page at all would.
   *
   * The counts are of what a reader will not see, so members that left with a dropped type are not
   * added on top of it.
   */
  dropUndocumented(document) {
    const kept = [];

    for (const type of document.types) {
      const members = type.members || [];
      const documentedMembers = members.filter(documented);

      if (!documented(type) && documentedMembers.length === 0) {
        this.skipped.types++;
        continue;
      }

      type.members = type.kind === 'enum' ? members : documentedMembers;
      this.skipped.members += members.length - type.members.length;
      kept.push(type);
    }

    document.types = kept;
  }

  /**
   * Drops the index entries of everything the prune removed, so a &lt;see cref&gt; pointing at it
   * resolves to nothing and renders as plain text rather than as a link to a page that is gone.
   */
  dropUndocumentedEntries() {
    const alive = new Set();

    for (const document of this.assemblies.values()) {
      for (const type of document.types) {
        alive.add(type.docId);
        for (const member of type.members || []) alive.add(member.docId);
      }
    }

    const entries = {};
    for (const docId of Object.keys(this.index.entries)) {
      if (alive.has(docId)) entries[docId] = this.index.entries[docId];
    }

    this.index.entries = entries;
  }

  buildNamespaceIndex() {
    /** @type {Map<string, {name: string, types: object[], assemblies: Set<string>}>} */
    this.namespaces = new Map();

    for (const [assemblyName, document] of this.assemblies) {
      for (const type of document.types) {
        const name = type.namespace || '';
        let bucket = this.namespaces.get(name);

        if (!bucket) {
          bucket = { name, types: [], assemblies: new Set() };
          this.namespaces.set(name, bucket);
        }

        bucket.types.push({ type, assembly: assemblyName });
        bucket.assemblies.add(assemblyName);
      }
    }

    for (const bucket of this.namespaces.values()) {
      bucket.types.sort((a, b) => compareTypes(a.type, b.type));
    }
  }

  buildCategoryIndex() {
    /** @type {Map<string, {assembly: string, category: string, types: object[], doc: object|null}>} */
    this.categories = new Map();

    for (const [assemblyName, document] of this.assemblies) {
      for (const type of document.types) {
        if (!type.category) continue;

        const key = `${assemblyName}/${type.category}`;
        let bucket = this.categories.get(key);

        if (!bucket) {
          bucket = {
            assembly: assemblyName,
            category: type.category,
            types: [],
            doc: this.categoryDocs.get(`${assemblyName.toLowerCase()}/${type.category.toLowerCase()}`) || null,
          };
          this.categories.set(key, bucket);
        }

        bucket.types.push({ type, assembly: assemblyName });
      }
    }

    // A category can have an overview markdown but no type carrying the tag yet.
    for (const [key, doc] of this.categoryDocs) {
      const realKey = `${doc.assembly}/${doc.category}`;
      if (!this.categories.has(realKey)) {
        this.categories.set(realKey, {
          assembly: doc.assembly,
          category: doc.category,
          types: [],
          doc,
        });
      }
    }

    for (const bucket of this.categories.values()) {
      bucket.types.sort((a, b) => compareTypes(a.type, b.type));
    }

    this.checkCategoryOrders();
  }

  /** Warns about SORT.txt lines naming no category, which would otherwise be silently ignored. */
  checkCategoryOrders() {
    for (const [assemblyKey, { names, file }] of this.categoryOrders) {
      const known = new Set(
        [...this.categories.values()]
          .filter((c) => c.assembly.toLowerCase() === assemblyKey)
          .map((c) => c.category.toLowerCase())
      );
      for (const name of names) {
        if (!known.has(name.toLowerCase())) this.warnings.push(`${file}: no category named '${name}'`);
      }
    }
  }

  /** An assembly's SORT.txt as a rank per lowercased category name; empty without one. */
  categoryRanks(assemblyName) {
    const order = this.categoryOrders.get(assemblyName.toLowerCase());
    const ranks = new Map();
    if (!order) return ranks;
    for (const name of order.names) {
      const key = name.toLowerCase();
      if (!ranks.has(key)) ranks.set(key, ranks.size);
    }
    return ranks;
  }

  /**
   * The key a type is sorted by: one [interfacesFirst, name] pair per step of its declaring chain.
   *
   * A type's name is already its path within the namespace, so a nested one reads 'Outer.Inner'.
   * Giving each step its own pair keeps interfaces ahead of everything else at that step only,
   * which is what puts Outer.IInner under Outer instead of hoisting it into the namespace's own
   * block of interfaces. A parent's key is a prefix of its children's, so it sorts just above them.
   */
  typeSortKey(type, assemblyName) {
    const namespace = type.namespace || '';
    const key = [];
    let full = namespace;

    for (const segment of String(type.name).split('.')) {
      full = full ? `${full}.${segment}` : segment;
      const declaring = this.typesByFullName.get(`${assemblyName}!${full}`);
      key.push(declaring && declaring.kind === 'interface' ? 0 : 1, segment);
    }

    return key;
  }

  /** <AssemblyName>/MAIN.md for an assembly, or null. */
  assemblyMain(assemblyName) {
    return this.assemblyMains.get(assemblyName.toLowerCase()) || null;
  }

  /**
   * A path inside the docs directory, relative to the working directory, for telling the reader
   * where to add a page they have not written yet.
   */
  docsPath(relative) {
    const dir = path.relative(process.cwd(), this.apiDir) || '.';
    return path.join(dir, relative);
  }

  typeBySlug(slug) {
    return this.typesBySlug.get(slug) || null;
  }

  typeByDocId(docId) {
    return this.typesByDocId.get(docId) || null;
  }

  /** Resolves a doc id to its index entry, which carries slug and anchor. */
  entry(docId) {
    return this.index.entries[docId] || null;
  }

  assemblySummary(name) {
    return this.index.assemblies.find((a) => a.name === name) || null;
  }

  /** Namespaces belonging to one assembly, with their type counts. */
  namespacesOfAssembly(assemblyName) {
    const document = this.assemblies.get(assemblyName);
    if (!document) return [];

    const counts = new Map();
    for (const type of document.types) {
      const name = type.namespace || '';
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  categoriesOfAssembly(assemblyName) {
    const ranks = this.categoryRanks(assemblyName);
    return [...this.categories.values()]
      .filter((c) => c.assembly === assemblyName)
      .sort((a, b) => compareCategories(a.category, b.category, ranks));
  }

  /**
   * The category groups used to build an assembly's sidebar tree: its real categories, plus a
   * trailing '(Uncategorized)' group so types with no &lt;category&gt; tag are still reachable.
   * Tagging is opt-in and usually partial, so without this the tree would hide most of the API.
   */
  categoryTreeOfAssembly(assemblyName) {
    const groups = this.categoriesOfAssembly(assemblyName).map((c) => ({
      category: c.category,
      types: c.types,
      url: true,
      doc: c.doc,
    }));

    const document = this.assemblies.get(assemblyName);
    if (!document) return groups;

    const uncategorized = document.types
      .filter((type) => !type.category)
      .map((type) => ({ type, assembly: assemblyName }))
      .sort((a, b) => compareTypes(a.type, b.type));

    if (uncategorized.length > 0) {
      // No page of its own: '(Uncategorized)' is a tree grouping, not a real category.
      groups.push({ category: '(Uncategorized)', types: uncategorized, url: false, doc: null });
    }

    return groups;
  }

  allCategories() {
    return [...this.categories.values()].sort(
      (a, b) =>
        a.assembly.localeCompare(b.assembly) ||
        compareCategories(a.category, b.category, this.categoryRanks(a.assembly))
    );
  }

  allTypes() {
    const out = [];
    for (const [assemblyName, document] of this.assemblies) {
      for (const type of document.types) out.push({ type, assembly: assemblyName });
    }
    return out;
  }

  sortedNamespaces() {
    return [...this.namespaces.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

/**
 * Interfaces before classes, then alphabetical: the contract reads before its implementations.
 *
 * Both sides carry the key Model.typeSortKey built for them, alternating a rank and a name per
 * level of nesting. Walking the pairs applies that rule at every level rather than only the top,
 * and the shorter key wins a tie because a parent's key is a prefix of the keys of what it
 * declares - which is what lands a nested type directly beneath its parent.
 */
function compareTypes(a, b) {
  const left = a.sortKey || [];
  const right = b.sortKey || [];
  const shared = Math.min(left.length, right.length);

  for (let i = 0; i < shared; i++) {
    if (typeof left[i] === 'number') {
      if (left[i] !== right[i]) return left[i] - right[i];
    } else {
      const order = left[i].localeCompare(right[i]);
      if (order !== 0) return order;
    }
  }

  return left.length - right.length;
}

/**
 * Categories in their SORT.txt order, then the unlisted ones alphabetically, and '(Uncategorized)'
 * always last.
 *
 * @param {Map<string, number>} ranks  from Model.categoryRanks; omit for plain alphabetical order
 */
function compareCategories(a, b, ranks = new Map()) {
  const aLast = a === '(Uncategorized)' ? 1 : 0;
  const bLast = b === '(Uncategorized)' ? 1 : 0;
  if (aLast !== bLast) return aLast - bLast;

  const aRank = ranks.get(a.toLowerCase()) ?? Infinity;
  const bRank = ranks.get(b.toLowerCase()) ?? Infinity;
  if (aRank !== bRank) return aRank < bRank ? -1 : 1;

  return a.localeCompare(b);
}

module.exports = { Model, compareTypes, compareCategories };
