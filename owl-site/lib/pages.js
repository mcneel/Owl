'use strict';

const { escape, attr, truncate, markMatch, markMarkup } = require('./html');
const { slugify } = require('./routes');
const { highlight } = require('./highlight');
const { page, filterBar, DEFAULT_SITE_NAME } = require('./layout');
const docnodes = require('./docnodes');
const markdown = require('./markdown');
const theme = require('./theme');

/**
 * Page renderers. Each returns a complete HTML document.
 *
 * Every type gets its own url, every link is a real href, and headings carry the type and member
 * names, so the site works and indexes without JavaScript.
 */

/**
 * The constant behind an enum member, or null when it is not a plain integer.
 *
 * BigInt rather than Number: the model keeps these as strings because a flags enum on a ulong can
 * hold more than a double represents exactly, and two distinct flags must not sort as equal.
 */
function enumValue(member) {
  const raw = member.constantValue;
  if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) return null;

  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/**
 * Arity suffixes written as angle brackets: 'ListAspect`3' reads as 'ListAspect&lt;3&gt;'.
 *
 * A doc id records how many type parameters something has and not what they are called, so the
 * brackets hold the count rather than names the reader would have no way to trust. The count is
 * written as a number instead of as that many empty slots, which stops being legible at about two.
 * Both forms are covered: one backtick for a type's parameters, two for a method's own.
 */
function genericBrackets(name) {
  return String(name).replace(/``?(\d+)/g, (_, count) => `<${count}>`);
}

/**
 * mdi's chevron, pointing down, in a square of its own. The tree's disclosure arrows and the
 * inheritance chain's separators are both this, turned; one shape means one drawing, at one size,
 * however many places point with it.
 */
function chevronHtml(className) {
  return (
    `<span class="${className}">` +
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z"/></svg>' +
    '</span>'
  );
}

/** The last step of a dotted path: 'LibrarySet&lt;T&gt;.EventArgs' is declared by 'EventArgs'. */
function lastSegment(name) {
  return name.slice(name.lastIndexOf('.') + 1);
}

/**
 * What a member is called wherever it is listed.
 *
 * Ordinarily its own name. An explicit interface implementation is named in the model the way the
 * declaration writes it - 'Rhino.Runtime.Code.ICode.Inputs' - and the namespace on the front of
 * that is the type's, not this member's, so it says nothing a reader of this page needs. The
 * interface still does, and keeps its short name.
 */
function memberDisplayName(member) {
  return member.explicitInterface
    ? `${member.explicitInterface.display}.${lastSegment(member.name)}`
    : member.name;
}

/** A display name with its type parameters taken off: 'ListAspect&lt;T, TOut&gt;' becomes 'ListAspect'. */
function stripGenerics(name) {
  let out = name;
  let previous;

  // Innermost first, repeatedly, so a nested list goes with the one that contains it.
  do {
    previous = out;
    out = out.replace(/<[^<>]*>/g, '');
  } while (out !== previous);

  return out;
}

/** How many type parameters a type declares, which its doc id records as a `N suffix. */
function declaredArity(docId) {
  const match = /`(\d+)$/.exec(String(docId || ''));
  return match ? Number(match[1]) : 0;
}

/**
 * How many type arguments a highlighted signature writes after a name, or 0 for none.
 *
 * The highlighter has already cut the argument list into tokens, and a run of punctuation can end
 * up sharing one of them, so this reads the text with the tags taken back out rather than trying to
 * walk the markup. Commas at the top level are what count: the two in
 * 'Dictionary&lt;string, List&lt;int, int&gt;&gt;' do not both belong to Dictionary.
 */
function typeArgumentCount(html) {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  if (text[0] !== '<') return 0;

  let depth = 0;
  let count = 1;

  for (const c of text) {
    if (c === '<') depth++;
    else if (c === '>') {
      depth--;
      if (depth === 0) return count;
    } else if (c === ',' && depth === 1) count++;
  }

  // Never closed, so it was not an argument list; say nothing rather than guess a count.
  return 0;
}

/** Kinds that take a parameter list, and so can be overloaded on it. */
const CALLABLE_KINDS = new Set(['method', 'constructor', 'destructor', 'operator', 'conversion']);

/** Member display order: data before behaviour, rather than the order symbols arrive in. */
const MEMBER_ORDER = [
  'enumvalue',
  'field',
  'property',
  'indexer',
  'event',
  'constructor',
  'destructor',
  'method',
  'operator',
  'conversion',
];

class Renderer {
  constructor(model, routes, options = {}) {
    this.model = model;
    this.routes = routes;
    this.siteUrl = options.siteUrl || '';

    const site = model.index.site || {};

    // Named at generation time and recorded in the model, so serving and exporting do not have to
    // repeat it. A command-line value still wins.
    this.siteName = options.siteName || site.name || DEFAULT_SITE_NAME;
    // Source references are off unless --source-refs names a root to hang them from. The model
    // records where a symbol was declared for every member, and printing all of it uninvited put a
    // file path under each one whether or not the reader had any way to open it.
    this.sourceRefs = options.sourceRefs || '';

    // --logo wins over the conventional <docs>/logo.svg, as --name wins over the model's name.
    // The dark variant is optional; the layout falls back to the one logo for both themes.
    this.logo = options.logo || model.siteLogo || '';
    this.logoDark = options.logoDark || model.siteLogoDark || '';
    this.docContext = { model, routes, inline: false };

    // An assembly with nothing in it is not somewhere to send a reader, and --skip-undocumented can
    // empty one out completely. Authored prose counts as something: <Assembly>/MAIN.md is a page
    // worth reaching even with no types under it.
    const names = model.index.assemblies
      .map((a) => a.name)
      .filter((name) => {
        const document = model.assemblies.get(name);
        return (document && document.types.length > 0) || model.assemblyMain(name) !== null;
      });

    this.assemblyNames = names;
    this.multipleAssemblies = names.length > 1;
    this.palette = theme.assemblyPalette(names);
  }

  // ------------------------------------------------------------------
  // Shared fragments
  // ------------------------------------------------------------------

  /** Wraps the layout so the site name, routes and origin are not repeated by every page. */
  shell(options) {
    return page({
      siteName: this.siteName,
      logo: this.logo,
      logoDark: this.logoDark,
      routes: this.routes,
      siteUrl: this.siteUrl,
      ...options,
    });
  }

  /**
   * The root of every breadcrumb trail: a house rather than the word 'API'.
   *
   * The label stays, unrendered - the screen reader and the JSON-LD both want a name where the
   * page shows a picture.
   */
  homeCrumb() {
    return { label: 'API', url: this.routes.home(), icon: 'home' };
  }

  summaryHtml(docs) {
    return docs && docs.summary ? docnodes.render(docs.summary, this.docContext) : '';
  }

  summaryText(docs) {
    return docs && docs.summary
      ? docnodes.toText(docs.summary).replace(/\s+/g, ' ').trim()
      : '';
  }

  /**
   * The version an API arrived in, for the header's version filter to read.
   *
   * Absent when nothing declared a &lt;since&gt;, which is what makes an untagged API belong to
   * every version rather than none.
   */
  sinceAttr(docs) {
    return docs && docs.since ? ` data-since="${attr(docs.since)}"` : '';
  }

  badgeHtml(kind) {
    return (
      `<span class="badge" style="background:${theme.kindColor(kind)}">` +
      `${escape(theme.kindLabel(kind))}</span>`
    );
  }

  /**
   * True when a member offers no way to write it: a property with no setter, or a readonly field.
   *
   * The badge and the sort order both ask this, so neither can end up disagreeing with the other.
   */
  isReadOnlyMember(member) {
    const accessors = member.accessors;
    if (accessors && (accessors.get || accessors.set)) return !accessors.set;
    return member.kind === 'field' && Boolean(member.isReadOnly);
  }

  /**
   * Readonly or SetOnly, ahead of the kind badge.
   *
   * Neither is shown for the ordinary read-write property, which is what makes the badge worth
   * noticing when it does appear.
   */
  accessBadgeHtml(member) {
    const accessors = member.accessors;
    let label = '';

    if (this.isReadOnlyMember(member)) label = 'Readonly';
    else if (accessors && accessors.set && !accessors.get) label = 'SetOnly';

    return label ? `<span class="badge badge-mod">${label}</span>` : '';
  }

  treeBadgeHtml(kind) {
    return (
      `<span class="tree-badge" style="background:${theme.kindColor(kind)}">` +
      `${escape(theme.badgeLetter(kind))}</span>`
    );
  }

  /**
   * The badge on an Overview row: a page, rather than the bars the collapse control uses.
   *
   * It keeps the square the kind badges use so the tree's left edge stays a single column, and
   * inherits the badge's white through currentColor.
   */
  overviewBadgeHtml() {
    return (
      '<span class="tree-badge tree-badge-doc">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<path d="M4 2.5h5.2L12 5.3v8.2H4z"/><path d="M9.2 2.5v2.8h2.8"/>' +
      '</svg></span>'
    );
  }

  assemblyBadgeHtml(assemblyName) {
    if (!this.multipleAssemblies || !assemblyName) return '';
    const colour = theme.assemblyColor(this.palette, assemblyName);
    return (
      `<a class="asm-badge" style="background:${colour}" ` +
      `href="${attr(this.routes.assembly(assemblyName))}">${escape(assemblyName)}</a>`
    );
  }


  /**
   * Documented types by the names a signature spells them with: the name as written and its last
   * segment, so 'Code.ICodeContextTracker' is found either way. Built once, on first use.
   *
   * A generic is declared as 'ListAspect&lt;TList, T, TOut&gt;' and used as 'ListAspect&lt;IGarageTool&gt;',
   * so neither of those keys can match the other. It is therefore also filed under its bare name
   * and its arity - 'ListAspect`3' - which is the pair a use site can work out for itself.
   *
   * A name two types share keeps both, and resolution decides rather than the index.
   */
  typesByName() {
    if (this._typesByName) return this._typesByName;

    const index = new Map();

    for (const entry of this.model.allTypes()) {
      const name = entry.type.name;
      const bare = stripGenerics(name);
      const arity = declaredArity(entry.type.docId);
      // Deliberately not filed under the bare name on its own: 'Language' with no arguments after
      // it is not a use of Language<TLanguage>, and PascalCase member names reach here too.
      const keys = [
        name,
        lastSegment(name),
        `${bare}\`${arity}`,
        `${lastSegment(bare)}\`${arity}`,
      ];

      for (const key of keys) {
        let candidates = index.get(key);
        if (!candidates) index.set(key, (candidates = []));
        if (!candidates.some((c) => c.type.slug === entry.type.slug)) candidates.push(entry);
      }
    }

    this._typesByName = index;
    return index;
  }

  /**
   * Where a bare type name in a signature points, or '' if nowhere.
   *
   * A signature carries no doc ids, only the text a compiler would print, so the name is all there
   * is to go on. When two types answer to it, the one in the assembly being read is taken to be the
   * one meant; if that is still not decisive, it stays unlinked rather than guessing wrong.
   *
   * How many type arguments the use site wrote is part of the name for this purpose: four types are
   * called ListAspect or CodeEventHandler, and only the count tells them apart. Writing none is a
   * count too, and the one that picks the plain type out from its generic namesakes.
   */
  typeUrlByName(name, assemblyName, arity = 0) {
    const index = this.typesByName();
    const candidates = index.get(`${name}\`${arity}`) || index.get(name);
    if (!candidates) return '';
    if (candidates.length === 1) return this.routes.type(candidates[0].type.slug);

    const local = candidates.filter((c) => c.assembly === assemblyName);
    return local.length === 1 ? this.routes.type(local[0].type.slug) : '';
  }

  /**
   * Makes the type tokens in an already-highlighted signature clickable.
   *
   * The highlighter has already picked them out, so this only resolves names. A dotted name arrives
   * as two tokens either side of a punctuation dot, which is why 'Code.Inner' links its halves
   * separately - both lead somewhere worth going.
   */
  linkTypesIn(html, assemblyName, selfUrl) {
    return html.replace(/<span class="tok-type">([^<]*)<\/span>/g, (whole, name, offset) => {
      const url = this.typeUrlByName(
        name,
        assemblyName,
        typeArgumentCount(html.slice(offset + whole.length))
      );
      // A type names itself in its own declaration; linking that goes nowhere.
      if (!url || url === selfUrl) return whole;

      // The captured name is already escaped, having come out of the highlighter.
      return `<span class="tok-type"><a href="${attr(url)}">${name}</a></span>`;
    });
  }

  /** A highlighted, cross-linked signature: the one call every place that shows one makes. */
  signatureHtml(code, assemblyName, selfSlug) {
    return this.linkTypesIn(
      highlight(code, 'csharp'),
      assemblyName,
      selfSlug ? this.routes.type(selfSlug) : ''
    );
  }

  /**
   * The label on an 'Overrides:' link: the declaring type and the member it came from.
   *
   * 'M:System.Object.Equals(System.Object)' reads as 'Object.Equals'. Just the member name would be
   * useless here - which type it came from is the whole point of the link - and the fully qualified
   * one is a mouthful for something sitting inline.
   *
   * A doc id spells generics by arity, so the base of an override lands here as 'ListAspect`3' or
   * 'Reader.Read``1', which is not how any other name on the page reads. The model holds the real
   * display names, so both halves are looked up there; a base outside the documented set falls back
   * to empty brackets, which still says how many parameters there are.
   */
  overrideLabel(docId) {
    const body = String(docId || '')
      .slice(2)
      .replace(/\(.*\)$/, '');

    const cut = body.lastIndexOf('.');
    if (cut <= 0) return genericBrackets(body);

    const declaring = this.model.typeByDocId('T:' + body.slice(0, cut));
    const entry = this.model.entry(docId);

    const type = declaring ? declaring.type.name : genericBrackets(body.slice(0, cut));
    const member = entry ? entry.name : genericBrackets(body.slice(cut + 1));

    return `${lastSegment(type)}.${member}`;
  }

  /**
   * The heading of an explicit interface implementation: 'ICode.Inputs', the interface linked.
   *
   * The model names such a member the way the declaration does, fully qualified -
   * 'Rhino.Runtime.Code.ICode.Inputs' - which spends most of a heading on a namespace. The short
   * name says which contract it came from, and the link answers which one that is when several
   * interfaces share it.
   */
  explicitNameHtml(member) {
    const iface = member.explicitInterface;

    return (
      this.typeRefHtml({ id: iface.id, display: iface.display, external: iface.external }) +
      '.' +
      escape(lastSegment(member.name))
    );
  }

  typeRefHtml(ref) {
    if (!ref) return '';
    return docnodes.render(
      [{ t: 'cref', id: ref.id, label: ref.display, external: ref.external }],
      this.docContext
    );
  }

  /**
   * Where a member was declared, rooted at whatever --source-refs named.
   *
   * The model's path is relative to the tree the projects were built from, so it means nothing on
   * its own; the root is what turns it into somewhere a reader can actually go. An http root makes
   * it a link with a line anchor, anything else stays text, which is what a local checkout wants.
   */
  sourceHtml(source) {
    if (!source || !this.sourceRefs) return '';

    const root = this.sourceRefs.replace(/\/$/, '');
    const path = `${root}/${source.file}`;
    const label = `${path}:${source.line}`;

    if (!/^https?:/i.test(root)) {
      return `<div class="section"><span class="param-type">${escape(label)}</span></div>`;
    }

    return (
      `<div class="section"><a class="param-type" href="${attr(`${path}#L${source.line}`)}" ` +
      `rel="noopener">${escape(label)}</a></div>`
    );
  }

  /**
   * A type rendered as a card: kind badge, name, assembly badge, monospace full name, summary.
   */
  typeCardHtml(type, assemblyName, { linked = true, headingLevel = null, showAssembly = true } = {}) {
    const summary = this.summaryHtml(type.docs);
    const name = escape(type.name);
    const nameHtml = linked
      ? `<a href="${attr(this.routes.type(type.slug))}">${name}</a>`
      : name;

    const heading = headingLevel
      ? `<h${headingLevel} class="member-name">${nameHtml}</h${headingLevel}>`
      : `<span class="member-name">${nameHtml}</span>`;

    return (
      `<div class="member" data-badge="${attr(theme.badgeLetter(type.kind))}" ` +
      `data-kind="${attr(type.kind)}"${this.sinceAttr(type.docs)}>` +
      '<div class="member-header">' +
      this.badgeHtml(type.kind) +
      heading +
      (type.obsolete ? '<span class="explicit-badge">obsolete</span>' : '') +
      // Chipped only when it is not public, the way a member card does it: nested types are
      // commonly protected or internal, and the card is otherwise silent about it.
      (type.accessibility && type.accessibility !== 'public'
        ? `<span class="chip">${escape(type.accessibility)}</span>`
        : '') +
      (showAssembly ? this.assemblyBadgeHtml(assemblyName) : '') +
      '</div>' +
      `<div class="member-fullname">${escape(type.fullName)}</div>` +
      (summary ? `<div class="summary">${summary}</div>` : '') +
      '</div>'
    );
  }

  /**
   * What a member is called in the tree: the bare name, except where overloads make that useless.
   *
   * Five rows all reading 'CreatePathResolverWithStorage' say nothing about which is which. The
   * parameter types are the whole difference between them, so those go in; the parameter names do
   * not, since they distinguish nothing and the column is narrow enough already.
   */
  treeMemberLabelHtml(member) {
    const name = memberDisplayName(member);
    if (!CALLABLE_KINDS.has(member.kind)) return escape(name);

    const types = (member.parameters || [])
      .map((p) => (p.refKind ? `${p.refKind} ` : '') + p.type.display)
      .join(', ');

    // Wrapped together as one flex item: the row is a flex container with a gap, and left as two
    // items the name and its parameter list would be pushed apart by it.
    //
    // The parameters are there to break a tie, not to be read first, so they sit a shade back and
    // leave the name as the thing the eye lands on.
    return (
      `<span class="tree-label">${escape(name)}` +
      `<span class="tree-sig">(${escape(types)})</span></span>`
    );
  }

  /**
   * The picker's entries: the assemblies worth going to, plus wherever the reader already is.
   *
   * An emptied-out assembly still has a page, and landing on it with the picker reading 'Entire
   * API' would say the reader is somewhere they are not. Index order, so adding one back does not
   * shuffle the list.
   */
  assemblyChoices(current) {
    if (!current || this.assemblyNames.includes(current)) return this.assemblyNames;

    return this.model.index.assemblies
      .map((a) => a.name)
      .filter((name) => name === current || this.assemblyNames.includes(name));
  }

  /** The badge letters a list of types or members uses, for a filter bar offering only those. */
  badgeLettersOf(items, pick) {
    return new Set(items.map((item) => theme.badgeLetter(pick(item))));
  }

  typeSectionsHtml(entries, options = {}) {
    if (entries.length === 0) {
      return '<div class="section">No types.</div>';
    }

    return entries
      .map(
        ({ type, assembly }) =>
          `<div class="type-section">${this.typeCardHtml(type, assembly, options)}</div>`
      )
      .join('');
  }

  // ------------------------------------------------------------------
  // Home
  // ------------------------------------------------------------------

  home() {
    const main = this.model.siteMain;

    // The landing page is authored: docs/api/MAIN.md. Without it, fall back to a bare index so
    // the site still works on a fresh checkout.
    //
    // The authored page is the whole body. site-intro drops the card chrome .cat-doc wears on the
    // assembly and category pages, because here the prose is the page rather than a panel on it,
    // and the assemblies are not listed again below it: the header selector already goes there.
    const body = main
      ? `<div class="cat-doc site-intro">${markdown.render(main.markdown)}</div>`
      : `<div class="page-head"><h1 class="page-title">${escape(this.siteName)}</h1>
           <p class="page-intro">Add <code>${escape(this.model.docsPath('MAIN.md'))}</code> to author
           this page.</p></div>`;

    const fallback = `API reference for ${this.assemblyNames.join(', ')}.`;
    const description = main
      ? truncate(markdown.firstParagraph(main.markdown)) || fallback
      : fallback;

    return this.shell({
      // No title of its own: the landing page is the site, so the shell titles it with the site
      // name rather than 'Something | Site Name'.
      title: '',
      description,
      canonical: this.routes.home(),
      breadcrumbs: [],
      body,
      bodyClass: 'home',
      assemblies: this.assemblyNames,
      jsonLd: { '@type': 'WebSite', name: this.siteName, url: this.siteUrl || undefined },
    });
  }

  // ------------------------------------------------------------------
  // Assembly
  // ------------------------------------------------------------------

  assembly(assemblyName) {
    const main = this.model.assemblyMain(assemblyName);
    const namespaces = this.model.namespacesOfAssembly(assemblyName);

    // Authored from docs/api/<AssemblyName>/MAIN.md, with a minimal fallback.
    const intro = main
      ? `<div class="cat-doc">${markdown.render(main.markdown)}</div>`
      : `<div class="page-head">
           <h1 class="page-title">${escape(assemblyName)}<span class="page-kind">assembly</span></h1>
           <p class="page-intro">Add
           <code>${escape(this.model.docsPath(assemblyName + '/MAIN.md'))}</code> to author this
           page.</p>
         </div>`;

    const namespaceList = namespaces
      .map(
        (ns) =>
          `<li><a href="${attr(this.routes.namespace(ns.name))}">` +
          `<span class="tree-badge" style="background:${theme.KIND_COLORS.T}">N</span>` +
          `${escape(ns.name || '(global)')}</a></li>`
      )
      .join('');

    // Categories are not repeated here: the sidebar is a list of them, and this page is reached
    // from that same sidebar's Overview link.
    const body = `
${intro}

<section class="ns-section">
  <h2 class="ns-heading">Namespaces</h2>
  <ul class="plain-list">${namespaceList}</ul>
</section>
`;

    const description = main
      ? truncate(markdown.firstParagraph(main.markdown)) ||
        `${assemblyName} API reference.`
      : `${assemblyName} API reference.`;

    return this.shell({
      title: `${assemblyName} assembly`,
      description,
      canonical: this.routes.assembly(assemblyName),
      breadcrumbs: [
        this.homeCrumb(),
        { label: assemblyName, url: this.routes.assembly(assemblyName) },
      ],
      body,
      sidebar: this.categoryTree(assemblyName, { activeOverview: true }),
      treeKey: slugify(assemblyName),
      assemblies: this.assemblyChoices(assemblyName),
      currentAssembly: assemblyName,
    });
  }

  // ------------------------------------------------------------------
  // Namespace
  // ------------------------------------------------------------------

  namespace(namespaceName) {
    const bucket = this.model.namespaces.get(namespaceName);
    if (!bucket) return null;

    const label = namespaceName || '(global)';
    const assemblies = [...bucket.assemblies].sort();
    const docs = this.namespaceDocs(namespaceName);

    const body = `
<div class="page-head">
  <h1 class="page-title">${escape(label)}<span class="page-kind">namespace</span></h1>
  ${docs && docs.summary ? `<div class="page-intro">${docnodes.render(docs.summary, this.docContext)}</div>` : ''}
  <div class="page-chips">
    ${assemblies
      .map(
        (a) =>
          `<a class="chip" href="${attr(this.routes.assembly(a))}">` +
          `<span class="legend-dot" style="background:${theme.assemblyColor(this.palette, a)}"></span>` +
          `${escape(a)}</a>`
      )
      .join('')}
  </div>
</div>

${docs && docs.remarks ? `<section class="ns-section"><h2 class="ns-heading">Remarks</h2><div class="remarks">${docnodes.render(docs.remarks, this.docContext)}</div></section>` : ''}

<section class="ns-section">
  <h2 class="ns-heading">Types</h2>
  ${this.typeSectionsHtml(bucket.types, { headingLevel: 3 })}
</section>
`;

    const description =
      (docs ? truncate(docnodes.toText(docs.summary)) : '') ||
      truncate(`${label} namespace in the ${this.siteName} reference.`);

    return this.shell({
      title: `${label} namespace`,
      description,
      canonical: this.routes.namespace(namespaceName),
      breadcrumbs: [
        this.homeCrumb(),
        { label, url: this.routes.namespace(namespaceName) },
      ],
      body,
      filterBar: filterBar({ kinds: this.badgeLettersOf(bucket.types, (e) => e.type.kind) }),
      sidebar: this.namespaceTree(namespaceName),
      treeKey: 'namespaces',
      assemblies: this.assemblyChoices(assemblies.length === 1 ? assemblies[0] : ''),
      currentAssembly: assemblies.length === 1 ? assemblies[0] : '',
    });
  }

  namespaceDocs(namespaceName) {
    for (const document of this.model.assemblies.values()) {
      const match = (document.namespaces || []).find((n) => n.name === namespaceName && n.docs);
      if (match) return match.docs;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Category
  // ------------------------------------------------------------------

  category(assemblyName, categoryName) {
    const bucket = this.model.categories.get(`${assemblyName}/${categoryName}`);
    if (!bucket) return null;

    const overview = bucket.doc ? markdown.render(bucket.doc.markdown) : '';

    const body = `
<div class="page-head">
  <h1 class="page-title">${escape(categoryName)}</h1>
</div>

<section class="ns-section">
${overview ? `<div class="cat-doc">${overview}</div>` : ''}
  <h2 class="ns-heading">Types in this category</h2>
  ${
    // No assembly badge: every type here is in the same one, and the full name under each card
    // already carries the namespace, which is the only part that differs.
    this.typeSectionsHtml(bucket.types, { headingLevel: 3, showAssembly: false })
  }
</section>
`;

    const description = bucket.doc
      ? truncate(markdown.firstParagraph(bucket.doc.markdown)) ||
        truncate(`${categoryName} in ${assemblyName}.`)
      : truncate(`${categoryName} category in ${assemblyName}.`);

    return this.shell({
      title: `${categoryName} — ${assemblyName}`,
      description,
      canonical: this.routes.category(assemblyName, categoryName),
      breadcrumbs: [
        this.homeCrumb(),
        { label: categoryName, url: this.routes.category(assemblyName, categoryName) },
      ],
      body,
      filterBar: filterBar({ kinds: this.badgeLettersOf(bucket.types, (e) => e.type.kind) }),
      sidebar: this.categoryTree(assemblyName, { activeCategory: categoryName }),
      treeKey: slugify(assemblyName),
      assemblies: this.assemblyChoices(assemblyName),
      currentAssembly: assemblyName,
      jsonLd: {
        '@type': 'TechArticle',
        headline: `${categoryName} — ${assemblyName}`,
        description,
      },
    });
  }

  // ------------------------------------------------------------------
  // Type
  // ------------------------------------------------------------------

  type(slug) {
    const found = this.model.typeBySlug(slug);
    if (!found) return null;

    const { type, assembly } = found;

    const summaryHtml = this.summaryHtml(type.docs);
    const members = this.sortedMembers(type, true);

    // The same chip a member card wears, and in the same place: after the name, not before it.
    const accessChip =
      type.accessibility && type.accessibility !== 'public'
        ? `<span class="chip">${escape(type.accessibility)}</span>`
        : '';

    // Name, declaration, summary, then where it lives - the order a search result reads in, so
    // arriving from one lands on the same shape rather than a rearranged version of it.
    const body = `
<article>
<div class="page-head sticky-head">
  <div class="page-title-row"><h1 class="page-title">${this.badgeHtml(type.kind)}${escape(type.name)}${accessChip}</h1>${this.inheritanceChainHtml(type)}</div>
  <div class="declaration">${this.signatureHtml(this.declarationOf(type), assembly, type.slug)}</div>
  ${summaryHtml ? `<div class="page-intro">${summaryHtml}</div>` : ''}
  <div class="page-subtitle">${escape(type.fullName)}</div>
</div>

${this.obsoleteHtml(type.obsolete)}

${this.relationsHtml(type)}
${this.typeParamsHtml(type, assembly)}
${this.delegateHtml(type, assembly)}
${type.docs && type.docs.remarks ? `<section class="ns-section"><h2 class="ns-heading">Remarks</h2><div class="remarks">${docnodes.render(type.docs.remarks, this.docContext)}</div></section>` : ''}
${type.docs && type.docs.example ? `<section class="ns-section"><h2 class="ns-heading">Example</h2>${docnodes.render(type.docs.example, this.docContext)}</section>` : ''}
${
  type.kind === 'enum'
    ? this.enumValuesHtml(members)
    : this.membersHtml(members, assembly, type.slug)
}
${this.seeAlsoHtml(type.docs)}
</article>
`;

    const description =
      truncate(this.summaryText(type.docs)) ||
      truncate(`${type.fullName} ${type.kind} in ${assembly}. ${this.siteName} reference.`);

    // No assembly crumb: a namespace is prefixed with its assembly's name, so the two together
    // read as a stutter. The sidebar's Overview row is the way back to the assembly page.
    const breadcrumbs = [this.homeCrumb()];
    if (type.namespace) {
      breadcrumbs.push({ label: type.namespace, url: this.routes.namespace(type.namespace) });
    }
    breadcrumbs.push({ label: type.name, url: this.routes.type(type.slug) });

    return this.shell({
      // Namespace-qualified so titles stay unique: Step exists in both Languages.IronPython2
      // and Languages.PythonNet.
      title: type.namespace
        ? `${type.name} ${type.kind} (${type.namespace})`
        : `${type.name} ${type.kind}`,
      description,
      canonical: this.routes.type(type.slug),
      breadcrumbs,
      body,
      filterBar: filterBar({ kinds: this.badgeLettersOf(members, (m) => m.kind) }),
      sidebar: this.categoryTree(assembly, { activeType: type }),
      treeKey: slugify(assembly),
      assemblies: this.assemblyChoices(assembly),
      currentAssembly: assembly,
      jsonLd: {
        '@type': 'TechArticle',
        headline: `${type.fullName} ${type.kind}`,
        description,
        articleSection: type.category || type.namespace || undefined,
      },
    });
  }

  /**
   * Members by kind, then name.
   *
   * @param {boolean} pageOrder  order the way the page reads rather than the way the tree does:
   *   readonly members ahead of writable ones, and enum values by their value. The tree does
   *   neither, because it shows neither the badge nor the value, so a break in the alphabet there
   *   has no visible cause and just looks mis-sorted.
   */
  sortedMembers(type, pageOrder = false) {
    return type.members.slice().sort((a, b) => {
      const orderA = MEMBER_ORDER.indexOf(a.kind);
      const orderB = MEMBER_ORDER.indexOf(b.kind);
      if (orderA !== orderB) return (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB);

      if (pageOrder) {
        // An enum is a numbered set, and the numbers are on the page beside the names. Reading
        // 0, 1, 2 out of alphabetical order is the one thing an enum listing should not do.
        if (a.kind === 'enumvalue' && b.kind === 'enumvalue') {
          const valueA = enumValue(a);
          const valueB = enumValue(b);
          if (valueA !== null && valueB !== null && valueA !== valueB) {
            return valueA < valueB ? -1 : 1;
          }
        }

        const readOnlyA = this.isReadOnlyMember(a) ? 0 : 1;
        const readOnlyB = this.isReadOnlyMember(b) ? 0 : 1;
        if (readOnlyA !== readOnlyB) return readOnlyA - readOnlyB;
      }

      return a.name.localeCompare(b.name) || a.signature.localeCompare(b.signature);
    });
  }

  declarationOf(type) {
    const parts = [type.accessibility];

    if (type.isStatic) parts.push('static');
    if (type.isAbstract && type.kind !== 'interface') parts.push('abstract');
    if (type.isSealed && type.kind === 'class') parts.push('sealed');
    if (type.isReadOnly) parts.push('readonly');
    if (type.isRefLikeType) parts.push('ref');

    parts.push(type.kind === 'record' ? 'record' : type.kind);
    parts.push(type.name);

    let declaration = parts.filter(Boolean).join(' ');

    const bases = [];
    if (type.baseType) bases.push(type.baseType.display);
    for (const iface of type.interfaces || []) bases.push(iface.display);
    if (bases.length > 0) declaration += ' : ' + bases.join(', ');

    return declaration;
  }

  /**
   * A member's signature written out as it would be declared.
   *
   * The model carries the bare form - 'bool IsComplete' - because the type page puts the modifiers
   * beside it as chips. A search result has no chips, so it spells the whole thing out:
   * 'public bool IsComplete { get; protected set; }'.
   */
  memberDeclaration(member) {
    // An enum member is reported as public static const, none of which anyone writes.
    if (member.kind === 'enumvalue') return member.signature || '';

    const parts = [];
    if (member.accessibility) parts.push(member.accessibility);
    if (member.isStatic) parts.push('static');
    if (member.isConst) parts.push('const');
    if (member.isAbstract) parts.push('abstract');
    if (member.isVirtual) parts.push('virtual');
    if (member.isOverride) parts.push('override');

    // The model leaves the keyword out of an event's signature, as it does the modifiers.
    if (member.kind === 'event') parts.push('event');

    let out = parts.concat(member.signature || '').filter(Boolean).join(' ');

    const accessors = member.accessors;
    if (accessors && (accessors.get || accessors.set)) {
      // A narrower accessor names its own accessibility, the way C# does.
      const part = (visibility, keyword) =>
        (visibility && visibility !== member.accessibility ? `${visibility} ` : '') + keyword + ';';

      const list = [];
      if (accessors.get) list.push(part(accessors.get, 'get'));
      if (accessors.set) list.push(part(accessors.set, accessors.initOnly ? 'init' : 'set'));
      out += ` { ${list.join(' ')} }`;
    }

    return out;
  }

  /**
   * The ancestors a class descends from, running right from its name: '&lsaquo; ExecuteException
   * &lsaquo; CodeException &lsaquo; Exception'.
   *
   * The declaration below names the immediate base and nothing further back, which for a type ten
   * levels deep says very little about where it came from. Nearest ancestor first, each arrow
   * pointing back at what it derives from; the type itself is not repeated, being the name the
   * chain runs out of.
   *
   * It is clipped rather than wrapped, and reading outwards is what makes that safe: what falls off
   * the edge is the most distant ancestor, which is the least of it.
   *
   * Classes only. A struct's chain is 'ValueType' and an enum's is 'ValueType &rsaquo; Enum', which
   * every struct and every enum shares and no reader needed telling.
   *
   * Type arguments are counted rather than written: 'SelectListAspect&lt;2&gt;' for the two-parameter one.
   * Written in full, half of these chains run past 200 characters - one reaches 541 - and a heading
   * is the wrong place to read
   * 'ListProxy&lt;ListAspectList&lt;ProjectPackageServer&gt;, ProjectPackageServer&gt;'; dropped entirely, the
   * three types called ListAspect become three identical steps. The count is what tells them apart,
   * and it costs three characters. The constructed name is on the title.
   */
  inheritanceChainHtml(type) {
    const chain = type.inheritanceChain;
    if (type.kind !== 'class' || !chain || chain.length === 0) return '';

    const separator = chevronHtml('chain-sep');

    // The model records the chain from the immediate base outwards, which is the order it reads in.
    const links = chain
      .map((ref) => {
        const bare = stripGenerics(ref.display || '');
        const arity = declaredArity(ref.id);
        const label = arity > 0 ? genericBrackets(`${bare}\`${arity}`) : bare;

        const entry = this.model.entry(ref.id);
        const url = entry ? this.routes.forEntry(entry) : docnodes.learnUrl(ref.id);

        // Only worth a tooltip when it says something the label does not.
        const title = label === ref.display ? '' : ` title="${attr(ref.display)}"`;

        return url
          ? `<a class="see-ref" href="${attr(url)}"${title}>${escape(label)}</a>`
          : `<span class="see-ref"${title}>${escape(label)}</span>`;
      })
      .join(separator);

    return `<span class="type-chain">${separator}${links}</span>`;
  }

  relationsHtml(type) {
    const rows = [];

    // No 'Inheritance:' row: the chain runs into the page title, where it is read against the name
    // it belongs to rather than a second time further down.

    if (type.interfaces && type.interfaces.length > 0) {
      rows.push(
        '<div class="section"><span class="section-label">Implements:</span> ' +
          type.interfaces.map((r) => this.typeRefHtml(r)).join(', ') +
          '</div>'
      );
    }

    if (type.derivedTypes && type.derivedTypes.length > 0) {
      const links = type.derivedTypes
        .map((docId) => {
          const entry = this.model.entry(docId);
          if (!entry) return null;
          return `<a class="see-ref" href="${attr(this.routes.type(entry.slug))}">${escape(entry.name)}</a>`;
        })
        .filter(Boolean);

      if (links.length > 0) {
        // Comma-separated: one type can be derived from by 75 others here, and a run of names with
        // only spaces between them reads as one long name rather than as a list.
        rows.push(
          '<div class="section"><span class="section-label">Derived:</span> ' +
            links.join(', ') +
            '</div>'
        );
      }
    }

    return rows.length > 0
      ? `<section class="ns-section"><h2 class="ns-heading">Type relationships</h2>${rows.join('')}</section>`
      : '';
  }

  typeParamsHtml(type, assemblyName) {
    if (!type.typeParameters || type.typeParameters.length === 0) return '';

    const rows = type.typeParameters
      .map((tp) => {
        const variance = tp.variance ? `${escape(tp.variance)} ` : '';
        // Constraints are bare names in the model, so they resolve the way a signature's do.
        const constraints = tp.constraints
          ? `<span class="param-type">where ${tp.constraints
              .map((name) => {
                const url = this.typeUrlByName(name, assemblyName);
                return url ? `<a href="${attr(url)}">${escape(name)}</a>` : escape(name);
              })
              .join(', ')}</span>`
          : '';
        return (
          '<tr>' +
          `<td class="param-name">${variance}${escape(tp.name)}</td>` +
          `<td>${tp.doc ? docnodes.render(tp.doc, this.docContext) : ''} ${constraints}</td>` +
          '</tr>'
        );
      })
      .join('');

    return (
      '<section class="ns-section"><h2 class="ns-heading">Type parameters</h2>' +
      `<table class="params"><tbody>${rows}</tbody></table></section>`
    );
  }

  delegateHtml(type, assemblyName) {
    if (type.kind !== 'delegate' || !type.signature) return '';
    return (
      '<section class="ns-section"><h2 class="ns-heading">Signature</h2>' +
      `<div class="declaration">${this.signatureHtml(type.signature, assemblyName, type.slug)}</div>` +
      this.parametersHtml(type.parameters) +
      '</section>'
    );
  }

  seeAlsoHtml(docs) {
    if (!docs || !docs.seeAlso || docs.seeAlso.length === 0) return '';

    const links = docs.seeAlso
      .map((ref) => {
        if (ref.href) {
          return `<a class="see-ref" href="${attr(ref.href)}" rel="noopener">${escape(ref.label || ref.href)}</a>`;
        }
        return this.typeRefHtml({ id: ref.id, display: ref.label, external: ref.external });
      })
      .join(' ');

    return `<section class="ns-section"><h2 class="ns-heading">See also</h2><div class="section">${links}</div></section>`;
  }

  obsoleteHtml(obsolete) {
    if (!obsolete) return '';
    const label = obsolete.isError ? 'removed' : 'obsolete';
    return (
      `<div class="note"><span class="note-label">${escape(label)}</span>` +
      escape(obsolete.message || 'This API is obsolete.') +
      '</div>'
    );
  }

  parametersHtml(parameters) {
    if (!parameters || parameters.length === 0) return '';

    const rows = parameters
      .map((p) => {
        const modifiers = [p.refKind, p.isParams ? 'params' : null].filter(Boolean).join(' ');
        const dflt = p.isOptional ? ` = ${p.defaultValue}` : '';
        // The parameter's type arrives with its doc id, so this one is resolved rather than
        // guessed from the name - and an external type still reaches Microsoft Learn.
        const typeHtml =
          (modifiers ? escape(modifiers) + ' ' : '') + this.typeRefHtml(p.type) + escape(dflt);
        return (
          '<tr>' +
          `<td class="param-name">${escape(p.name)}</td>` +
          `<td class="param-type">${typeHtml}</td>` +
          `<td>${p.doc ? docnodes.render(p.doc, this.docContext) : ''}</td>` +
          '</tr>'
        );
      })
      .join('');

    return (
      '<div class="section"><span class="section-label">Parameters:</span>' +
      `<table class="params"><tbody>${rows}</tbody></table></div>`
    );
  }

  /**
   * Members grouped under .ns-section headings, each card inside .type-children so it picks up the
   * indented, rule-on-the-left styling.
   */
  membersHtml(members, assemblyName, selfSlug) {
    if (members.length === 0) return '';

    const groups = new Map();
    for (const member of members) {
      if (!groups.has(member.kind)) groups.set(member.kind, []);
      groups.get(member.kind).push(member);
    }

    let out = '';
    for (const kind of MEMBER_ORDER) {
      const group = groups.get(kind);
      if (!group) continue;

      out +=
        `<section class="ns-section type-section" id="${attr(kind)}">` +
        `<h2 class="ns-heading">${escape(theme.kindPlural(kind))}</h2>` +
        '<div class="type-children">' +
        group.map((m) => this.memberCardHtml(m, assemblyName, selfSlug)).join('') +
        '</div></section>';
    }

    return out;
  }

  /**
   * An enum's values as a table: name, value, description.
   *
   * A card earns its space for a member with a signature, parameters, returns and exceptions. An
   * enum value has a number and a sentence, and forty of them read as a table where they would
   * read as forty near-empty panels.
   */
  enumValuesHtml(members) {
    const rows = members
      .map(
        (member) =>
          `<tr id="${attr(member.anchor)}" data-badge="${attr(theme.badgeLetter(member.kind))}" ` +
          `data-kind="${attr(member.kind)}"${this.sinceAttr(member.docs)}>` +
          `<td class="enum-name">${escape(member.name)}` +
          (member.obsolete ? ' <span class="explicit-badge">obsolete</span>' : '') +
          '</td>' +
          `<td class="enum-value">${escape(member.constantValue || '')}</td>` +
          `<td>${this.summaryHtml(member.docs)}</td>` +
          '</tr>'
      )
      .join('');

    return (
      '<section class="ns-section type-section" id="enumvalue">' +
      `<h2 class="ns-heading">${escape(theme.kindPlural('enumvalue'))}</h2>` +
      '<div class="table-scroll"><table class="enum-table">' +
      '<thead><tr><th>Name</th><th>Value</th><th>Description</th></tr></thead>' +
      `<tbody>${rows}</tbody></table></div></section>`
    );
  }

  memberCardHtml(member, assemblyName, selfSlug) {
    const explicit = Boolean(member.explicitInterface);
    const badgeLetter = theme.badgeLetter(member.kind);

    const chips = [];
    if (member.isStatic) chips.push('static');
    if (member.isAbstract) chips.push('abstract');
    if (member.isVirtual) chips.push('virtual');
    if (member.isOverride) chips.push('override');
    if (member.isConst) chips.push('const');
    if (member.isExtensionMethod) chips.push('extension');
    if (member.accessibility && member.accessibility !== 'public') chips.unshift(member.accessibility);

    // The get/set chip is gone: what it had to say is now the Readonly or SetOnly badge, and a
    // property with both is the ordinary case that needs no label at all. 'init' stays, being a
    // real restriction on the setter rather than the default.
    if (member.accessors && member.accessors.set && member.accessors.initOnly) {
      chips.push('init');
    }

    const detail = [];

    if (member.docs && member.docs.value) {
      detail.push(
        `<div class="section"><span class="section-label">Value:</span> ${docnodes.render(member.docs.value, this.docContext)}</div>`
      );
    }

    detail.push(this.parametersHtml(member.parameters));

    if (member.docs && member.docs.returns) {
      detail.push(
        `<div class="section"><span class="section-label">Returns:</span> ${docnodes.render(member.docs.returns, this.docContext)}</div>`
      );
    }

    if (member.docs && member.docs.exceptions && member.docs.exceptions.length > 0) {
      const rows = member.docs.exceptions
        .map(
          (ex) =>
            '<tr>' +
            `<td class="param-name">${this.typeRefHtml({ id: ex.id, display: ex.label, external: true })}</td>` +
            `<td>${ex.doc ? docnodes.render(ex.doc, this.docContext) : ''}</td>` +
            '</tr>'
        )
        .join('');
      detail.push(
        '<div class="section"><span class="section-label">Exceptions:</span>' +
          `<table class="params"><tbody>${rows}</tbody></table></div>`
      );
    }

    if (member.overrides) {
      detail.push(
        '<div class="section"><span class="section-label">Overrides:</span> ' +
          this.typeRefHtml({
            id: member.overrides,
            display: this.overrideLabel(member.overrides),
            external: true,
          }) +
          '</div>'
      );
    }

    if (member.implements && member.implements.length > 0) {
      const links = member.implements
        .map((docId) => {
          const entry = this.model.entry(docId);
          if (!entry) return null;
          return `<a class="see-ref" href="${attr(this.routes.forEntry(entry))}">${escape(entry.name)}</a>`;
        })
        .filter(Boolean);
      if (links.length > 0) {
        detail.push(
          `<div class="section"><span class="section-label">Implements:</span> ${links.join(' ')}</div>`
        );
      }
    }

    const summary = this.summaryHtml(member.docs);
    const remarks =
      member.docs && member.docs.remarks
        ? `<div class="remarks"><strong>Remarks:</strong> ${docnodes.render(member.docs.remarks, this.docContext)}</div>`
        : '';
    const example =
      member.docs && member.docs.example
        ? `<div class="section"><span class="section-label">Example:</span>${docnodes.render(member.docs.example, this.docContext)}</div>`
        : '';

    return (
      `<div class="member${explicit ? ' explicit-impl' : ''}" id="${attr(member.anchor)}" ` +
      `data-badge="${attr(badgeLetter)}" data-kind="${attr(member.kind)}"` +
      `${this.sinceAttr(member.docs)}>` +
      '<div class="member-header">' +
      (explicit ? '<span class="explicit-badge">Explicit</span>' : '') +
      this.accessBadgeHtml(member) +
      this.badgeHtml(member.kind) +
      `<h3 class="member-name">${explicit ? this.explicitNameHtml(member) : escape(member.name)}</h3>` +
      (member.obsolete ? '<span class="explicit-badge">obsolete</span>' : '') +
      chips.map((c) => `<span class="chip">${escape(c)}</span>`).join('') +
      `<a class="member-anchor" href="#${attr(member.anchor)}" ` +
      // Named as the heading beside it is, so the two do not read as different members.
      `aria-label="Link to ${attr(memberDisplayName(member))}">#</a>` +
      '</div>' +
      `<div class="declaration">${this.signatureHtml(member.signature, assemblyName, selfSlug)}</div>` +
      this.obsoleteHtml(member.obsolete) +
      (summary ? `<div class="summary">${summary}</div>` : '') +
      remarks +
      detail.filter(Boolean).join('') +
      example +
      this.sourceHtml(member.source) +
      '</div>'
    );
  }

  // ------------------------------------------------------------------
  // Sidebar trees
  // ------------------------------------------------------------------

  /**
   * The disclosure triangle. Drawn rather than typed, so it centres on its own geometry instead of
   * on a text baseline, and so rotating it turns about the middle of a square.
   */
  treeArrowHtml(collapsed) {
    return chevronHtml(`tree-arrow${collapsed ? ' collapsed' : ''}`);
  }

  /** Collapsible sidebar group. */
  treeGroup(id, label, inner, { collapsed = false } = {}) {
    return (
      '<div class="tree-ns">' +
      `<button class="tree-ns-label" type="button" data-target="ns_${attr(id)}" ` +
      `aria-expanded="${collapsed ? 'false' : 'true'}">` +
      this.treeArrowHtml(collapsed) +
      `<span>${escape(label)}</span></button>` +
      `<div class="tree-ns-children${collapsed ? ' collapsed' : ''}" id="ns_${attr(id)}">${inner}</div>` +
      '</div>'
    );
  }

  treeTypeRow(type, { active = false, children = '', childrenId = null } = {}) {
    const hasChildren = Boolean(children);
    const arrow = hasChildren
      ? `<button class="tree-toggle" type="button" data-target="${attr(childrenId)}" aria-label="Toggle members">` +
        this.treeArrowHtml(!active) +
        '</button>'
      : '<span class="tree-arrow-spacer"></span>';

    return (
      `<div class="tree-type"${this.sinceAttr(type.docs)}>` +
      '<div class="tree-type-label">' +
      arrow +
      `<a class="tree-link${active ? ' active' : ''}" href="${attr(this.routes.type(type.slug))}">` +
      this.treeBadgeHtml(type.kind) +
      `${escape(type.name)}</a>` +
      '</div>' +
      (hasChildren
        ? `<div class="tree-type-children${active ? '' : ' collapsed'}" id="${attr(childrenId)}">${children}</div>`
        : '') +
      '</div>'
    );
  }

  /** Top row of an assembly's tree: back to the assembly's own page and its authored MAIN.md. */
  assemblyOverviewRow(assemblyName, active) {
    return (
      '<div class="tree-ns tree-overview"><div class="tree-type-label">' +
      '<span class="tree-arrow-spacer"></span>' +
      `<a class="tree-link${active ? ' active' : ''}" ` +
      `href="${attr(this.routes.assembly(assemblyName))}">` +
      this.overviewBadgeHtml() +
      'Overview</a>' +
      '</div></div>'
    );
  }

  sidebarToolbar() {
    return (
      '<div class="sidebar-toolbar">' +
      '<label class="skip-link" for="tree-search">Filter the tree</label>' +
      '<input type="search" id="tree-search" placeholder="Filter" autocomplete="off">' +
      // Drawn rather than typed: a glyph sits on a baseline and lands low in a square button,
      // while a viewBox centres on the geometry.
      '<button id="collapse-all-btn" type="button" title="Collapse all" aria-label="Collapse all">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></svg></button>' +
      '</div>'
    );
  }

  /**
   * The sidebar used while browsing an assembly: its categories, each expanding to the types it
   * contains. Namespaces are not part of this tree; they have their own pages and their own
   * sidebar. A trailing '(Uncategorized)' group keeps types with no &lt;category&gt; tag reachable.
   *
   * @param {string}  assemblyName
   * @param {object}  options   activeType: the type whose page this is, expanded to show members
   *                            activeCategory: the category whose page this is
   */
  categoryTree(
    assemblyName,
    { activeType = null, activeCategory = null, activeOverview = false } = {}
  ) {
    let out = this.sidebarToolbar();

    // The assembly's own page is the only thing in this tree with nothing above it, so without a
    // row of its own there is no way back to the prose once you have clicked into a type. Marked
    // active only by the assembly page itself - search borrows this tree without being in it.
    out += this.assemblyOverviewRow(assemblyName, activeOverview);

    const groups = this.model.categoryTreeOfAssembly(assemblyName);
    if (groups.length === 0) return out;

    // Open the group holding whatever is being viewed; collapse the rest so the tree is scannable.
    const containsActiveType = (group) =>
      activeType !== null && group.types.some(({ type }) => type.docId === activeType.docId);

    for (const group of groups) {
      const isActiveGroup = group.category === activeCategory || containsActiveType(group);

      const rows = group.types
        .map(({ type }) => {
          const active = activeType !== null && type.docId === activeType.docId;

          // Only the current type lists its members, so a large category stays readable.
          const children = active
            ? this.sortedMembers(type)
                .map(
                  (m) =>
                    `<a class="tree-child-link" href="#${attr(m.anchor)}"${this.sinceAttr(m.docs)}` +
                    // The row truncates, and the part that tells overloads apart is at the end,
                    // so the full signature is on the title where it can still be read.
                    ` title="${attr(m.signature || m.name)}">` +
                    this.treeBadgeHtml(m.kind) +
                    this.treeMemberLabelHtml(m) +
                    (m.explicitInterface ? '<span class="tree-explicit">~</span>' : '') +
                    '</a>'
                )
                .join('')
            : '';

          return this.treeTypeRow(type, { active, children, childrenId: `tc_${type.slug}` });
        })
        .join('');

      // The overview link only exists for real categories, not the synthetic uncategorized group.
      const overview =
        group.url && group.doc
          ? '<div class="tree-type"><div class="tree-type-label">' +
            '<span class="tree-arrow-spacer"></span>' +
            `<a class="tree-link tree-cat-doc-link${group.category === activeCategory ? ' active' : ''}" ` +
            `href="${attr(this.routes.category(assemblyName, group.category))}">` +
            this.overviewBadgeHtml() +
            'Overview</a>' +
            '</div></div>'
          : group.url
            ? '<div class="tree-type"><div class="tree-type-label">' +
              '<span class="tree-arrow-spacer"></span>' +
              `<a class="tree-link${group.category === activeCategory ? ' active' : ''}" ` +
              `href="${attr(this.routes.category(assemblyName, group.category))}">` +
              this.overviewBadgeHtml() +
              'Overview</a>' +
              '</div></div>'
            : '';

      out += this.treeGroup(`cat_${group.category}`, group.category, overview + rows, {
        collapsed: !isActiveGroup,
      });
    }

    return out;
  }

  /**
   * Sidebar for pages that belong to no single assembly, such as search: a group per assembly,
   * holding its overview and its categories.
   *
   * Collapsed to start, so the column reads as a short list of assemblies rather than a wall, and
   * a result page still has somewhere to go next.
   */
  assembliesTree() {
    let out = this.sidebarToolbar();

    const row = (inner) =>
      '<div class="tree-type"><div class="tree-type-label">' +
      '<span class="tree-arrow-spacer"></span>' +
      inner +
      '</div></div>';

    for (const assembly of this.model.index.assemblies) {
      const overview = row(
        `<a class="tree-link" href="${attr(this.routes.assembly(assembly.name))}">` +
          this.overviewBadgeHtml() +
          'Overview</a>'
      );

      const categories = this.model
        .categoriesOfAssembly(assembly.name)
        .map((c) =>
          row(
            `<a class="tree-link" href="${attr(this.routes.category(c.assembly, c.category))}">` +
              `<span class="tree-badge" style="background:${theme.KIND_COLORS.T}">C</span>` +
              `${escape(c.category)}</a>`
          )
        )
        .join('');

      out += this.treeGroup(`asm_${assembly.name}`, assembly.name, overview + categories, {
        collapsed: true,
      });
    }

    return out;
  }

  /** Sidebar for namespace pages: sibling namespaces, then the types in this one. */
  namespaceTree(namespaceName) {
    const bucket = this.model.namespaces.get(namespaceName);
    let out = this.sidebarToolbar();
    if (!bucket) return out;

    const siblings = new Set();
    for (const assemblyName of bucket.assemblies) {
      for (const ns of this.model.namespacesOfAssembly(assemblyName)) siblings.add(ns.name);
    }

    const namespaceLinks = [...siblings]
      .sort()
      .map((name) => {
        const active = name === namespaceName;
        return (
          '<div class="tree-type"><div class="tree-type-label">' +
          '<span class="tree-arrow-spacer"></span>' +
          `<a class="tree-link${active ? ' active' : ''}" href="${attr(this.routes.namespace(name))}">` +
          `<span class="tree-badge" style="background:${theme.KIND_COLORS.T}">N</span>` +
          `${escape(name || '(global)')}</a></div></div>`
        );
      })
      .join('');

    out += this.treeGroup('namespaces', 'Namespaces', namespaceLinks);

    const types = bucket.types.map(({ type }) => this.treeTypeRow(type)).join('');
    out += this.treeGroup('types', namespaceName || '(global)', types);

    return out;
  }

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------

  search(query, serverSide, assemblyName) {
    const trimmed = (query || '').trim();
    const scope = assemblyName || '';
    let resultsHtml = '';
    let statusText = '';

    if (serverSide && trimmed) {
      const matches = this.searchIndexEntries(trimmed, 200, scope);
      // Only the empty result says anything; a hit count is noise above the hits themselves.
      statusText =
        matches.total === 0
          ? `No matches for "${trimmed}"${scope ? ` in ${scope}` : ''}.`
          : '';

      resultsHtml = matches.rows.map((row) => this.searchResultHtml(row, trimmed)).join('');
    }

    // No heading and no field of its own: the header carries a search box on every page, and a
    // second one here was the same control twice. The h1 stays for screen readers and outlines.
    const body = `
<h1 class="skip-link">Search</h1>

<div id="search-status" class="search-status" data-scope="${attr(scope ? slugify(scope) : '')}">${escape(
      statusText ||
        (trimmed ? '' : `Search ${scope || 'the whole API'} from the box in the header.`)
    )}</div>
<ul class="search-results" id="search-results" data-index-url="${attr(this.routes.asset('search.json'))}">${resultsHtml}</ul>

<noscript>
  <section class="ns-section">
    <h2 class="ns-heading">Browse instead</h2>
    <ul class="plain-list">
      ${this.model.index.assemblies
        .map(
          (a) =>
            `<li><a href="${attr(this.routes.assembly(a.name))}">${escape(a.name)}</a></li>`
        )
        .join('')}
    </ul>
  </section>
</noscript>
`;

    return this.shell({
      title: trimmed ? `Search: ${trimmed}` : 'Search',
      description: `Search the ${this.siteName} reference by type or member name.`,
      canonical: this.routes.search(),
      breadcrumbs: [
        this.homeCrumb(),
        { label: 'Search', url: this.routes.search() },
      ],
      body,
      // Every button, unpruned: results are rebuilt in the browser as the query changes, so what
      // is on the page now says nothing about what will be on it next.
      filterBar: filterBar(),
      // The assembly's own tree, the same one its pages carry. Search is a dead end otherwise:
      // the way back into the content is the tree, so it should be the tree you already know.
      // Unscoped there is no single assembly to show, so the list of them stands in.
      sidebar: scope ? this.categoryTree(scope) : this.assembliesTree(),
      // Same key as that assembly's own pages, so an expansion survives the trip through search.
      treeKey: scope ? slugify(scope) : 'assemblies',
      assemblies: this.assemblyChoices(scope),
      currentAssembly: scope,
      // The picker re-runs the query in the chosen assembly instead of leaving the results behind.
      assemblyUrl: (name) => this.routes.search(trimmed, name ? slugify(name) : ''),
      noindex: true,
      currentQuery: trimmed,
    });
  }

  /**
   * One result: badge and name on a line, then the declaration, the summary, and the namespace it
   * lives in.
   *
   * The browser builds the same shape in app.js. Both read the same row fields, so the server's
   * ?q= answer and the client's live one cannot drift apart.
   */
  searchResultHtml(row, query) {
    return (
      // data-badge is what the kind filter above the results matches on.
      `<li data-badge="${attr(theme.badgeLetter(row.kind))}">` +
      '<div class="r-head">' +
      this.treeBadgeHtml(row.kind) +
      `<a class="r-name" href="${attr(row.url)}">${markMatch(row.name, query)}</a>` +
      '</div>' +
      (row.signature
        ? `<div class="r-sig">${markMarkup(
            this.signatureHtml(row.signature, row.assembly),
            query
          )}</div>`
        : '') +
      (row.summary ? `<div class="r-summary">${markMatch(row.summary, query)}</div>` : '') +
      `<div class="r-ns">${escape(row.namespace || '(global)')}</div>` +
      '</li>'
    );
  }

  searchIndexEntries(query, limit, assemblyName) {
    const q = query.toLowerCase();
    const rows = [];
    let total = 0;

    for (const row of this.searchRows()) {
      if (assemblyName && row.assembly !== assemblyName) continue;
      if (row.haystack.indexOf(q) < 0) continue;
      total++;
      if (rows.length < limit) rows.push(row);
    }

    return { rows, total };
  }

  searchRows() {
    if (this._searchRows) return this._searchRows;

    const rows = [];

    for (const [assemblyName, document] of this.model.assemblies) {
      for (const type of document.types) {
        const summary = truncate(this.summaryText(type.docs), 140);
        rows.push({
          name: type.name,
          kind: type.kind,
          url: this.routes.type(type.slug),
          summary,
          // A type's declaration is the closest thing it has to a member's signature.
          signature: this.declarationOf(type),
          assembly: assemblyName,
          namespace: type.namespace || '',
          haystack: `${type.fullName} ${type.name} ${type.category || ''} ${summary}`.toLowerCase(),
        });

        for (const member of type.members) {
          const memberSummary = truncate(this.summaryText(member.docs), 140);
          rows.push({
            // Shortened the way the page shortens it, while the haystack below keeps the qualified
            // form so a search for the interface's namespace still reaches the member.
            name: `${type.name}.${memberDisplayName(member)}`,
            kind: member.kind,
            url: this.routes.member(type.slug, member.anchor),
            summary: memberSummary,
            signature: this.memberDeclaration(member),
            assembly: assemblyName,
            namespace: type.namespace || '',
            haystack: `${type.fullName}.${member.name} ${member.signature} ${memberSummary}`.toLowerCase(),
          });
        }
      }
    }

    this._searchRows = rows;
    return rows;
  }

  /**
   * Compact rows:
   * [name, url, haystack, summary, badgeLetter, signature, nsIndex, badgeColour, asmIndex].
   *
   * Namespace names go in a table the entries index into. There are a few dozen of them against
   * tens of thousands of entries, so repeating the name on every row would cost more than the
   * signatures this index exists to carry.
   *
   * Signatures arrive already highlighted, so the browser needs no highlighter of its own and the
   * live results are marked up exactly as the server's ?q= answer. It costs about 1.5 MB raw and
   * 30 KB gzipped, which is what a host actually ships.
   */
  searchAsset() {
    const rows = this.searchRows();
    const namespaces = [];
    const seen = new Map();

    for (const row of rows) {
      if (seen.has(row.namespace)) continue;
      seen.set(row.namespace, namespaces.length);
      namespaces.push(row.namespace || '(global)');
    }

    // Assembly slugs, so a row can be matched against the ?a= scope without decoding a name.
    const assemblies = this.assemblyNames.map((name) => slugify(name));
    const assemblyIndex = new Map(this.assemblyNames.map((name, i) => [name, i]));

    return {
      schema: 4,
      namespaces,
      assemblies,
      entries: rows.map((r) => [
        r.name,
        r.url,
        r.haystack,
        r.summary,
        theme.badgeLetter(r.kind),
        this.signatureHtml(r.signature, r.assembly),
        seen.get(r.namespace),
        // The letter cannot carry the colour on its own: an enum wears a T badge in the F colour.
        theme.kindColor(r.kind),
        assemblyIndex.get(r.assembly),
      ]),
    };
  }

  // ------------------------------------------------------------------
  // sitemap / robots / 404
  // ------------------------------------------------------------------

  sitemapUrls() {
    const urls = [this.routes.home()];

    for (const assembly of this.model.index.assemblies) urls.push(this.routes.assembly(assembly.name));
    for (const ns of this.model.sortedNamespaces()) urls.push(this.routes.namespace(ns.name));
    for (const c of this.model.allCategories()) urls.push(this.routes.category(c.assembly, c.category));
    for (const { type } of this.model.allTypes()) urls.push(this.routes.type(type.slug));

    return urls;
  }

  sitemap(lastModified) {
    const origin = this.siteUrl ? this.siteUrl.replace(/\/$/, '') : '';
    const stamp = lastModified ? `<lastmod>${lastModified}</lastmod>` : '';

    const entries = this.sitemapUrls()
      .map((url) => `  <url><loc>${escape(origin + url)}</loc>${stamp}</url>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
  }

  robots() {
    const origin = this.siteUrl ? this.siteUrl.replace(/\/$/, '') : '';
    return `User-agent: *
Allow: /
Disallow: ${this.routes.search()}
${origin ? `Sitemap: ${origin}${this.routes.sitemap()}` : ''}
`;
  }

  notFound(pathname) {
    const body = `
<div class="page-head">
  <h1 class="page-title">Not found</h1>
  <p class="page-intro">Nothing is documented at <code>${escape(pathname)}</code>.</p>
</div>
<section class="ns-section">
  <h2 class="ns-heading">Assemblies</h2>
  <ul class="plain-list">
    ${this.model.index.assemblies
      .map(
        (a) =>
          `<li><a href="${attr(this.routes.assembly(a.name))}">${escape(a.name)}</a></li>`
      )
      .join('')}
  </ul>
</section>
`;

    return this.shell({
      title: 'Not found',
      description: 'The requested API documentation page does not exist.',
      canonical: null,
      breadcrumbs: [this.homeCrumb()],
      body,
      noindex: true,
    });
  }
}

module.exports = { Renderer, MEMBER_ORDER };
