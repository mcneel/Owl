'use strict';

const { escape, attr, truncate, markMatch, markMarkup } = require('./html');
const { slugify, NAMESPACE_MODE } = require('./routes');
const { highlight } = require('./highlight');
const { page, filterBar, memberFilterBar, versionLabel, DEFAULT_SITE_NAME } = require('./layout');
const docnodes = require('./docnodes');
const icons = require('./icons');
const { Links } = require('./links');
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
 * A written type parameter list counted rather than listed: 'CodeEditor&lt;TDoc, TView, …&gt;'
 * reads as 'CodeEditor&lt;18&gt;'.
 *
 * For the breadcrumbs, where the name is one step of a trail and not a declaration. Eighteen
 * parameter names is a line and a half across the top of the page, pushing the trail it belongs to
 * out of sight, and none of those names is answering a question the reader has at that point - the
 * heading below states them in full, and so does the declaration under that.
 *
 * The same form the site already writes an arity in, from genericBrackets, so a counted name reads
 * the same wherever it came from. Nesting is tracked so only the outermost list is counted.
 */
function countedGenerics(name) {
  let out = '';
  let depth = 0;
  let commas = 0;

  for (const ch of String(name)) {
    if (ch === '<') {
      depth++;
      if (depth === 1) {
        commas = 0;
        continue;
      }
    } else if (ch === '>' && depth > 0) {
      depth--;
      if (depth === 0) {
        out += `<${commas + 1}>`;
        continue;
      }
    } else if (ch === ',' && depth === 1) {
      commas++;
    }

    if (depth === 0) out += ch;
  }

  return out;
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
 * Where a row belongs among the results for a query: the name itself first, then the names that
 * start with it, then the ones that contain it, then the rows that matched on something else - a
 * signature, a summary.
 *
 * The name ranked on is the row's own, without the type a member is declared on. Ranked qualified,
 * every member of Sphere counted as a name starting with 'sphere' and the struct arrived with forty
 * rows behind it; what the reader typed was the type, and the type is one result. A dotted query is
 * asking for the qualified form, so there the whole name is the subject.
 *
 * @param {string}  name       lowercased, as displayed: 'sphere.center' for a member
 * @param {string}  q          lowercased query
 * @param {boolean} qualified  whether the query names something qualified, i.e. has a dot in it
 */
/**
 * Whether a row is a finalizer, which its name says: '~Sphere' is the only member written with one.
 *
 * Read off the name rather than the kind because app.js has to ask the same question of an index
 * entry, where the name is what it has. Both gate on the answer, so the two agree on what a query
 * reaches.
 */
function isFinalizerName(name) {
  return lastSegment(name).charAt(0) === '~';
}

function searchRank(name, q, qualified) {
  const subject = qualified ? name : lastSegment(name);
  if (subject === q) return 0;
  if (subject.indexOf(q) === 0) return 1;
  return subject.indexOf(q) >= 0 ? 2 : 3;
}

/**
 * Which shelf a row sits on: interfaces, then the other types, then members. A word typed into the
 * box is usually a type's name, and the type is the way in - 'Geometry' should offer GeometryBase
 * before the many members also called Geometry, and the interface before the types that implement
 * it. The sort applies the shelf ahead of the rank, so it is what separates them; the rank orders
 * each shelf. app.js shelves the same way, reading a type off flag 2 and an interface off its icon.
 */
function searchGroup(row) {
  if (row.declarationSearched) return 2;
  return row.kind === 'interface' ? 0 : 1;
}

/** The '&lt;T, TOut&gt;' a generic method writes after its name. Empty for everything else. */
function genericSuffix(member) {
  const names = (member.typeParameters || []).map((tp) => tp.name);
  return names.length > 0 ? `<${names.join(', ')}>` : '';
}

/**
 * What a member is called wherever it is listed, and the only place that decides.
 *
 * Ordinarily its own name. An explicit interface implementation is named in the model the way the
 * declaration writes it - 'Rhino.Runtime.Code.ICode.Inputs' - and the namespace on the front of
 * that is the type's, not this member's, so it says nothing a reader of this page needs. The
 * interface still does, and keeps its short name.
 *
 * A generic method's type parameters are not in the name the model records, since the symbol does
 * not carry them, and they are put back: 'Cast&lt;T&gt;' is how the declaration reads and how it is
 * called, and two overloads can differ by nothing else.
 */
function memberDisplayName(member) {
  const name = member.explicitInterface
    ? `${member.explicitInterface.display}.${lastSegment(member.name)}`
    : member.name;

  return name + genericSuffix(member);
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
 * docnodes.writtenArity over a highlighted signature. The highlighter has already cut the
 * argument list into tokens, and a run of punctuation can end up sharing one of them, so the text
 * is read with the tags taken back out rather than trying to walk the markup.
 */
function typeArgumentCount(html) {
  return docnodes.writtenArity(
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  );
}

/** Kinds that take a parameter list, and so can be overloaded on it. */
const CALLABLE_KINDS = new Set(['method', 'constructor', 'destructor', 'operator', 'conversion']);

/** The two kinds the compiler spells `op_`, listed as symbols rather than under those names. */
const OPERATOR_KINDS = new Set(['operator', 'conversion']);

/**
 * The types the C# keywords stand for, so 'string' in a signature leads where System.String does.
 *
 * The highlighter marks these as keywords rather than types, which is what they are to a compiler,
 * but a reader following a parameter's type does not care which of the two the word is.
 *
 * void, var and dynamic are left out: the first names a type nobody looks up, and the other two
 * name no type at all.
 */
const KEYWORD_TYPES = {
  bool: 'T:System.Boolean',
  byte: 'T:System.Byte',
  char: 'T:System.Char',
  decimal: 'T:System.Decimal',
  double: 'T:System.Double',
  float: 'T:System.Single',
  int: 'T:System.Int32',
  long: 'T:System.Int64',
  nint: 'T:System.IntPtr',
  nuint: 'T:System.UIntPtr',
  object: 'T:System.Object',
  sbyte: 'T:System.SByte',
  short: 'T:System.Int16',
  string: 'T:System.String',
  uint: 'T:System.UInt32',
  ulong: 'T:System.UInt64',
  ushort: 'T:System.UInt16',
};

/** What a tab is labelled, for the language hints a doc comment actually writes. */
const LANGUAGE_LABELS = {
  cs: 'C#',
  'c#': 'C#',
  csharp: 'C#',
  vb: 'VB.NET',
  vbnet: 'VB.NET',
  'vb.net': 'VB.NET',
  visualbasic: 'VB.NET',
  py: 'Python',
  py3: 'Python',
  python: 'Python',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  cpp: 'C++',
  'c++': 'C++',
  fs: 'F#',
  'f#': 'F#',
};

function languageLabel(language) {
  const key = String(language || '').toLowerCase().trim();
  if (LANGUAGE_LABELS[key]) return LANGUAGE_LABELS[key];
  return key ? key.replace(/^./, (c) => c.toUpperCase()) : 'Code';
}

/**
 * Tab order: the two languages most of this API's readers write, then whatever else is there.
 *
 * Keyed on the label rather than the hint, so every spelling of a language ranks as one thing.
 */
const LANGUAGE_ORDER = ['C#', 'Python'];

function languageRank(language) {
  const rank = LANGUAGE_ORDER.indexOf(languageLabel(language));
  return rank === -1 ? LANGUAGE_ORDER.length : rank;
}

/**
 * The code blocks inside an <example>, wherever they sit in it. These are what the tabbed page
 * shows, once something has decided the example belongs on one.
 */
function exampleCodeNodes(docs) {
  const found = [];

  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node.t === 'code') found.push(node);
      if (node.children) walk(node.children);
      if (node.items) {
        for (const item of node.items) {
          walk(item.term);
          walk(item.description);
        }
      }
    }
  };

  walk(docs && docs.example);
  return found;
}

/**
 * The code an example pulled out of files, which is what sends it to a page of its own.
 *
 * A block written in the comment is as long as its author was willing to type and belongs on the
 * card, where it can be read against the summary it explains. A file runs to hundreds of lines in
 * three languages, and only that is worth a second page. An example holding both goes whole to the
 * page rather than being split across the two.
 */
function exampleFileNodes(docs) {
  return exampleCodeNodes(docs).filter((node) => Boolean(node.src));
}

/**
 * The symbol a C# operator method stands for, keyed by the name the compiler gave it.
 *
 * Nobody looking for `==` knows to look for `op_Equality`, and a dozen `op_` names sort together
 * into a block that says nothing where a column of symbols says everything.
 */
const OPERATOR_SYMBOLS = {
  op_Addition: '+',
  op_Subtraction: '-',
  op_Multiply: '*',
  op_Division: '/',
  op_Modulus: '%',
  op_BitwiseAnd: '&',
  op_BitwiseOr: '|',
  op_ExclusiveOr: '^',
  op_LeftShift: '<<',
  op_RightShift: '>>',
  op_UnsignedRightShift: '>>>',
  op_Equality: '==',
  op_Inequality: '!=',
  op_LessThan: '<',
  op_GreaterThan: '>',
  op_LessThanOrEqual: '<=',
  op_GreaterThanOrEqual: '>=',
  op_LogicalNot: '!',
  op_OnesComplement: '~',
  op_UnaryPlus: '+',
  op_UnaryNegation: '-',
  op_Increment: '++',
  op_Decrement: '--',
  op_True: 'true',
  op_False: 'false',
  op_Implicit: 'implicit',
  op_Explicit: 'explicit',
};

/**
 * What the operator column prints for a member.
 *
 * A checked operator is the unchecked symbol under another name, so it is derived rather than
 * listed twice. Anything the map has not heard of falls back to the symbol owl-gen already wrote
 * into the signature, and to the metadata name only if that fails too: an `op_` name read badly
 * beats a blank cell.
 */
function operatorSymbol(member) {
  const name = String(member.name || '');
  const checked = name.startsWith('op_Checked');
  const symbol = OPERATOR_SYMBOLS[checked ? name.replace('op_Checked', 'op_') : name];
  if (symbol) return checked ? `checked ${symbol}` : symbol;

  const match = /\boperator\s+(checked\s+)?(\S+?)\s*\(/.exec(member.signature || '');
  return match ? `${match[1] || ''}${match[2]}` : name;
}

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

/**
 * Kinds a derived type shows as its own.
 *
 * A constructor and a finalizer belong to the type that declares them and to nothing below it.
 * Operators and conversions are static and read as a table of one type's operations, so rolling a
 * base's into a derived type's table would claim they operate on the derived one.
 */
const INHERITED_KINDS = new Set(['field', 'property', 'indexer', 'event', 'method']);

/**
 * How many results a server-rendered ?q= paints.
 *
 * Not a limit on the answer: the browser replaces these rows as soon as the index lands and pages
 * the rest of the matches in as they are read - see the search section of app.js. This is the first
 * page of that same list, so hydrating does not change how long the list looks. A static build
 * renders none of it at all, passing serverSide false.
 */
const FIRST_PAINT_RESULTS = 100;

/**
 * What makes two members the same member, for deciding whether a base's version of one is already
 * answered for further down.
 *
 * Name and parameter types, because that is what C# resolves an override or a `new` declaration on:
 * the return type is not part of it, and neither is what the parameters are called. A generic base
 * declares Compare(T) where the type below overrides Compare(Mesh), which this does not catch;
 * `overrides` does, and the two are used together.
 */
function memberKey(member) {
  const parameters = (member.parameters || [])
    .map((p) => (p.type && p.type.display) || '')
    .join(',');

  return `${member.kind}|${member.name}|${parameters}`;
}

class Renderer {
  constructor(model, routes, options = {}) {
    this.model = model;
    this.routes = routes;
    this.siteUrl = options.siteUrl || '';

    // No authored pages: the site is one long API dump browsed by namespace, with no categories to
    // group by and no prose to open with. See Routes' NAMESPACE_MODE for what the other kind does.
    this.namespaceMode = Boolean(options.namespaceMode);

    // The plain urls, kept aside because this.routes is swapped while a namespace-mode page is
    // being written and that page still has to name its canonical in the shape crawlers index.
    this.baseRoutes = routes;

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

    // The versions the header offers, from --api-versions. Empty unless it named some, which is
    // what leaves a site that has never said what version it is without a picker to answer with.
    this.versions = options.versions || [];

    // Diagrams are drawn by an outside binary, so the one renderer is built by the Site and passed
    // through to wherever a fenced block can appear: authored markdown, and doc comments alike.
    this.diagrams = options.diagrams || null;
    this.warn = typeof options.warn === 'function' ? options.warn : () => {};

    // The sibling sites, for the references this set does not document itself. Empty unless --link
    // named one, which leaves every external name resolving exactly as it did: the documented set,
    // then Microsoft Learn, then nothing.
    this.links = options.links || new Links();

    this.docContext = {
      model,
      routes,
      inline: false,
      diagrams: this.diagrams,
      warn: this.warn,
      links: this.links,
      // Resolution for the names that arrive as text rather than as references - generic
      // arguments, constraints - so a written name leads to the same page wherever it is read.
      typeUrl: (name, arity) => this.spelledTypeUrl(name, arity),
    };
    this.markdownContext = { diagrams: this.diagrams, warn: this.warn };

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
  }

  // ------------------------------------------------------------------
  // Shared fragments
  // ------------------------------------------------------------------

  /**
   * Renders with every url written in `mode`.
   *
   * The mode is a property of the url, so the page has to come out self-consistent: the tree rows,
   * the breadcrumbs, the crefs in the prose and the links in a signature are all written by the one
   * Routes, and there is no link on a namespace-mode page that quietly leads back out of it.
   *
   * Scoped for the length of one render rather than threaded through the hundred places that build
   * a url, the way docContext.selfType is, since a page is finished before the next one starts.
   */
  inMode(mode, render) {
    const routes = this.routes.withMode(mode);
    if (routes === this.routes) return render();

    const previous = this.routes;
    this.routes = routes;
    this.docContext.routes = routes;

    try {
      return render();
    } finally {
      this.routes = previous;
      this.docContext.routes = previous;
    }
  }

  /**
   * True while the page being written browses by namespace: either the whole site does, or this
   * page is the namespace-mode copy of one that reads both ways.
   */
  get browsingNamespaces() {
    return this.namespaceMode || Boolean(this.routes.mode);
  }

  /** Wraps the layout so the site name, routes and origin are not repeated by every page. */
  shell(options) {
    return page({
      siteName: this.siteName,
      logo: this.logo,
      logoDark: this.logoDark,
      routes: this.routes,
      siteUrl: this.siteUrl,
      homeUrl: this.homeUrl(),
      versions: this.versions,
      ...options,
      // Where the rows this page left out of its tree are to be fetched from. Named by the same
      // key the tree's remembered state is kept under, and left off the trees that have no asset -
      // the assemblies tree lists categories rather than types, and is small enough to write out.
      treeSrc: this.treeAssetNames().includes(options.treeKey)
        ? this.routes.asset(`tree-${options.treeKey}.json`)
        : '',
      // No selector while browsing by namespace. A namespace belongs to no one assembly, so the
      // tree beside it is every namespace on the site whatever the header says, and a control that
      // narrows nothing it sits above is one that reads as broken. Which assembly a type ships in
      // is written on its card instead, and that name is the way to the assembly's own page.
      assemblies: this.browsingNamespaces ? [] : options.assemblies,
    });
  }

  /**
   * Where 'home' goes.
   *
   * A landing page whose whole job is to list the assemblies has nothing to list when there is one
   * of them, and the assembly's own page already opens the set. So on a single-assembly site every
   * way back - the site name, the breadcrumb - goes straight there and the root is left as a
   * redirect for anyone who arrives at it directly.
   */
  homeUrl() {
    return this.assemblyNames.length === 1
      ? this.routes.assembly(this.assemblyNames[0])
      : this.routes.home();
  }

  /** True when the root is a redirect rather than a page of its own. */
  get rootRedirects() {
    return this.assemblyNames.length === 1;
  }

  /**
   * The root of every breadcrumb trail: a house rather than the word 'API'.
   *
   * The label stays, unrendered - the screen reader and the JSON-LD both want a name where the
   * page shows a picture.
   */
  homeCrumb() {
    return { label: 'API', url: this.homeUrl(), icon: 'home' };
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

  /**
   * The same version as a chip at the end of a card's header row.
   *
   * Written whether or not the header offers a picker: when an API arrived is worth reading on a
   * site that has no versions to filter by, and on one that has, it says what the filter is acting
   * on. Spelled by the same rule the picker spells its own entries with, so the chip and the
   * control a reader is comparing it against do not name one version two ways.
   */
  sinceChipHtml(docs) {
    if (!docs || !docs.since) return '';
    return `<span class="chip chip-since">Since ${escape(versionLabel(docs.since))}</span>`;
  }

  /**
   * True when a member offers no way to write it: a property with no setter, or a readonly field.
   *
   * What the sort order puts first; the declaration says the same thing in the member's own
   * spelling - '{ get; }', or the readonly keyword.
   */
  isReadOnlyMember(member) {
    const accessors = member.accessors;
    if (accessors && (accessors.get || accessors.set)) return !accessors.set;
    return member.kind === 'field' && Boolean(member.isReadOnly);
  }

  /**
   * The mark for one API's kind: a row's, a card's, or the one at the head of its own page.
   *
   * A drawing everywhere, rather than the letter a row used to wear and the word a title used to. A
   * letter has to be decoded before it says anything, and there were never enough to go round - an
   * enum and an event both start with E. A word said the kind plainly enough, but every title said it
   * the same way, so the pill in front of the name was a shape to read past rather than a thing to
   * read. The stylesheet gives the same drawing three sizes, by where it lands.
   */
  kindIconHtml(kind) {
    return icons.iconHtml(theme.kindIcon(kind));
  }

  /**
   * The mark on an Overview row: a page, rather than the bars the collapse control uses.
   *
   * A filled square where the kinds beside it are drawings, which is the point: what it leads to is
   * something someone wrote, not an API. It sits in the same box they do, so the tree's left edge
   * stays a single column, and inherits its white through currentColor.
   */
  overviewBadgeHtml() {
    return (
      '<span class="tree-badge tree-badge-doc">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<path d="M4 2.5h5.2L12 5.3v8.2H4z"/><path d="M9.2 2.5v2.8h2.8"/>' +
      '</svg></span>'
    );
  }

  /**
   * The assembly a card's type came out of, at the far end of its header.
   *
   * Written rather than badged: a coloured pill is a thing to look at, and this is a thing to look
   * up - the answer to 'where is this one from', asked of one card in a list, not read down the
   * column. So it is the name in the quiet grey the tree's second lines use, and a link, which on a
   * site browsed by namespace is the only way to an assembly's own page.
   */
  assemblyNameHtml(assemblyName) {
    if (!this.multipleAssemblies || !assemblyName) return '';
    return (
      `<a class="asm-name" href="${attr(this.routes.assembly(assemblyName))}">` +
      `${escape(assemblyName)}</a>`
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
   * Types from outside the documented set, by the name a signature spells them with.
   *
   * A signature is text, so 'IDisposable' in one says nothing about which IDisposable it is. The
   * model does know: every parameter, return, base type and interface arrives as a reference
   * carrying the doc id the compiler resolved it to, and that is the fully qualified name a Learn
   * url needs. Collecting those is what lets the text be resolved back.
   *
   * A name two different external types answer to is filed as ambiguous and linked nowhere, since
   * the wrong page is worse than none. Keyed by arity the way typesByName is, so IEnumerable and
   * IEnumerable&lt;T&gt; are not each other.
   *
   * The assembly is kept beside the doc id, because which site documents a type is a fact about
   * the assembly it was declared in and the signature has even less to say about that than it does
   * about the name. See lib/links.js.
   */
  externalTypesByName() {
    if (this._externalTypesByName) return this._externalTypesByName;

    const index = new Map();

    const add = (ref) => {
      if (!ref || !ref.external || !String(ref.id || '').startsWith('T:')) return;

      // The display is how the use site wrote it, so it carries whatever array, nullable or
      // generic decoration that use put on the name. The name underneath is what a token holds.
      const written = /^[A-Za-z_][\w.]*/.exec(stripGenerics(ref.display || ''));
      if (!written) return;

      const name = lastSegment(written[0]);
      const arity = declaredArity(ref.id);
      const keys = arity === 0 ? [name, `${name}\`0`] : [`${name}\`${arity}`];

      for (const key of keys) {
        const seen = index.get(key);
        if (seen === undefined) index.set(key, { id: ref.id, asm: ref.asm || '' });
        else if (seen && seen.id !== ref.id) index.set(key, null);
      }
    };

    for (const entry of this.model.allTypes()) {
      add(entry.type.baseType);
      for (const iface of entry.type.interfaces || []) add(iface);

      for (const member of entry.type.members || []) {
        add(member.returnType);
        add(member.explicitInterface);
        for (const parameter of member.parameters || []) add(parameter.type);
      }
    }

    this._externalTypesByName = index;
    return index;
  }

  /**
   * Where a name no documented type answers to points: a sibling site --link named, or Microsoft
   * Learn when it is a BCL type.
   *
   * Anything else outside the set - a type from a third party package nobody documents - has no
   * page this knows of, and stays text.
   */
  externalTypeUrl(name, arity = 0) {
    const index = this.externalTypesByName();
    const ref = index.get(`${name}\`${arity}`) || index.get(name);
    if (!ref) return '';

    return this.links.typeUrl(ref.id, ref.asm) || docnodes.learnUrl(ref.id) || '';
  }

  /**
   * Where a type name written as text points, or '' for nowhere: the C# keywords first, since
   * 'string' is System.String wherever it is written, then the documented set, then what the
   * framework and the sibling sites declare.
   *
   * The one resolution every written name goes through - a signature's tokens, a generic argument
   * list, a constraint - so 'Point3d' leads to the same page whichever row it is read in. The
   * assembly being read breaks a tie between documented types sharing a name.
   */
  spelledTypeUrl(name, arity = 0, assemblyName = this.docContext.selfAssembly) {
    return (
      docnodes.learnUrl(KEYWORD_TYPES[name]) ||
      this.typeUrlByName(name, assemblyName, arity) ||
      this.externalTypeUrl(name, arity) ||
      ''
    );
  }

  /**
   * Makes the type tokens in an already-highlighted signature clickable.
   *
   * The highlighter has already picked them out, so this only resolves names. A dotted name arrives
   * as two tokens either side of a punctuation dot, which is why 'Code.Inner' links its halves
   * separately - both lead somewhere worth going.
   *
   * A name the documented set does not answer to is tried against what the framework declares, so
   * IDisposable and string lead to Learn rather than sitting there as the only dead words in a line
   * where everything else is a link. The stylesheet leaves all of them their syntax colour, so this
   * costs the declaration nothing to read.
   *
   * @param ownName  the name the signature declares, which is not a reference to anything. The
   *   highlighter cannot tell one from a type: both are capitalised words, and a member is
   *   routinely named after the type it returns, which is how 'MeshingParameters
   *   MeshingParameters' ends up linked twice to the same page. A method's name escapes this by
   *   being followed by '(', which makes it a call rather than a type to the highlighter.
   */
  linkTypesIn(html, assemblyName, ownName) {
    // The last token bearing that name, not every one: in 'Foo Foo' the first is the type being
    // returned and only the second is the thing being declared.
    let declaredAt = -1;
    if (ownName) {
      const token = `<span class="tok-type">${escape(ownName)}</span>`;
      for (let at = html.indexOf(token); at >= 0; at = html.indexOf(token, at + 1)) {
        declaredAt = at;
      }

      // Unless a parameter list follows it. Then the declared name is the one the highlighter
      // marked as a call, and this token is the return type in front of it - which a method named
      // after what it returns would otherwise lose its link to.
      if (declaredAt >= 0 && html.indexOf('(', declaredAt) !== -1) declaredAt = -1;
    }

    return html.replace(/<span class="tok-(type|keyword)">([^<]*)<\/span>/g, (whole, kind, name, offset) => {
      // Most keywords are not types at all, and the ones that are cannot be anything else: 'string'
      // is System.String wherever it is written, so it skips the lookups entirely - including the
      // --link map, which no keyword belongs in. An alias for a framework type is a framework type,
      // and the table below is a table of doc ids with no assembly to match a link entry against.
      if (kind === 'keyword') {
        const url = docnodes.learnUrl(KEYWORD_TYPES[name]);
        return url ? this.linkedToken(kind, name, url) : whole;
      }

      if (offset === declaredAt) return whole;

      const arity = typeArgumentCount(html.slice(offset + whole.length));
      const url = this.spelledTypeUrl(name, arity, assemblyName);
      if (!url) return whole;

      return this.linkedToken(kind, name, url);
    });
  }

  /** One highlighted token, linked. The name is already escaped, having come out of the highlighter. */
  linkedToken(kind, name, url) {
    const external = /^https?:/i.test(url);
    return (
      `<span class="tok-${kind}">` +
      `<a href="${attr(url)}"${external ? ' rel="noopener"' : ''}>${name}</a>` +
      '</span>'
    );
  }

  /** A highlighted, cross-linked signature: the one call every place that shows one makes. */
  signatureHtml(code, assemblyName, ownName) {
    return this.linkTypesIn(highlight(code, 'csharp'), assemblyName, ownName);
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
      this.typeRefHtml({ id: iface.id, display: iface.display, external: iface.external, asm: iface.asm }) +
      '.' +
      escape(lastSegment(member.name) + genericSuffix(member))
    );
  }

  /**
   * One resolved type reference as a link: the call every row that lists a type makes, so the
   * Implements row, a parameter table and a cref in prose all write a reference the same way -
   * including the generic arguments, which docnodes resolves as written names.
   */
  typeRefHtml(ref) {
    if (!ref) return '';
    return docnodes.render(
      [{ t: 'cref', id: ref.id, label: ref.display, external: ref.external, asm: ref.asm }],
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
   * A type rendered as a card: kind badge, name, assembly, monospace full name, summary.
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
      `<div class="member" data-filter="${attr(theme.filterLetter(type.kind))}" ` +
      `data-kind="${attr(type.kind)}"${this.sinceAttr(type.docs)}>` +
      '<div class="member-header">' +
      this.kindIconHtml(type.kind) +
      heading +
      (showAssembly ? this.assemblyNameHtml(assemblyName) : '') +
      this.sinceChipHtml(type.docs) +
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

  /**
   * The letters a list of types filters under, for a filter bar offering only those.
   *
   * Filter letters rather than badge letters, so a page of enums offers the tab that actually shows
   * them rather than the Events tab their badge would ask for.
   */
  filterLettersOf(items, pick) {
    return new Set(items.map((item) => theme.filterLetter(pick(item))));
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

  /**
   * The root of a single-assembly site, which has nothing of its own to say.
   *
   * A page holding a refresh rather than a 302, because an exported site has to work from a plain
   * file host with no rewrite rules: there is nowhere to configure a redirect, so the page has to
   * be one. Kept out of the index, and pointed at the assembly as its canonical, so the two urls
   * do not compete. Nothing inside the site links here - see homeUrl - so this is reached only by
   * a bookmark or a typed address.
   */
  rootRedirect() {
    const url = this.routes.assembly(this.assemblyNames[0]);
    const absolute = this.siteUrl ? this.siteUrl.replace(/\/$/, '') + url : url;
    const label = this.assemblyNames[0];

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${attr(url)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${attr(absolute)}">
<title>${escape(this.siteName)}</title>
</head>
<body>
<p><a href="${attr(url)}">${escape(label)}</a></p>
</body>
</html>
`;
  }

  home() {
    if (this.rootRedirects) return this.rootRedirect();

    const main = this.model.siteMain;

    // The landing page is authored: docs/api/MAIN.md. Without it, fall back to a bare index so
    // the site still works on a fresh checkout.
    //
    // The authored page is the whole body. site-intro drops the card chrome .cat-doc wears on the
    // assembly and category pages, because here the prose is the page rather than a panel on it,
    // and the assemblies are not listed again below it: the header selector already goes there.
    //
    // A namespace-mode site is never going to have that page, so it opens on the namespace index
    // instead of on a note asking for prose nobody named a directory for.
    const heading = `<div class="page-head"><h1 class="page-title">${escape(this.siteName)}</h1>`;

    let body;
    if (main) {
      body = `<div class="cat-doc site-intro">${markdown.render(main.markdown, this.markdownContext)}</div>`;
    } else if (this.namespaceMode) {
      body = `${heading}</div>
${this.namespaceListHtml(this.model.sortedNamespaces().map((ns) => ns.name))}`;
    } else {
      body = `${heading}
           <p class="page-intro">Add <code>${escape(this.model.docsPath('MAIN.md'))}</code> to author
           this page.</p></div>`;
    }

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
      // The dump's landing page carries the tree the rest of it carries; an authored one is prose,
      // and the reader is meant to read it before picking a direction.
      sidebar: this.namespaceMode ? this.namespaceTree() : null,
      treeKey: this.namespaceMode ? 'namespaces' : '',
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

    // Authored from docs/api/<AssemblyName>/MAIN.md, with a minimal fallback. A namespace-mode site
    // has no docs directory to put one in, so it is titled and left at that.
    const title = `<div class="page-head">
           <h1 class="page-title">${escape(assemblyName)}<span class="page-kind">assembly</span></h1>`;

    let intro;
    if (main) {
      intro = `<div class="cat-doc">${markdown.render(main.markdown, this.markdownContext)}</div>`;
    } else if (this.namespaceMode) {
      intro = `${title}</div>`;
    } else {
      intro = `${title}
           <p class="page-intro">Add
           <code>${escape(this.model.docsPath(assemblyName + '/MAIN.md'))}</code> to author this
           page.</p>
         </div>`;
    }

    // Categories are not repeated here: the sidebar is a list of them, and this page is reached
    // from that same sidebar's Overview link.
    const body = `
${intro}

${this.namespaceListHtml(namespaces.map((ns) => ns.name))}
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
      sidebar: this.namespaceMode
        ? this.namespaceTree()
        : this.categoryTree(assemblyName, { activeOverview: true }),
      treeKey: this.namespaceMode ? 'namespaces' : slugify(assemblyName),
      assemblies: this.assemblyChoices(assemblyName),
      currentAssembly: assemblyName,
    });
  }

  /**
   * A list of namespaces, as the assembly page and a dump's landing page both show them.
   *
   * Names only: the counts the model can supply are per assembly, and this list is not always one
   * assembly's, so a number here would sometimes mean 'in this assembly' and sometimes 'in total'.
   */
  namespaceListHtml(names) {
    const items = names
      .map(
        (name) =>
          `<li><a href="${attr(this.routes.namespace(name))}">` +
          icons.iconHtml('namespace') +
          `${escape(name || '(global)')}</a></li>`
      )
      .join('');

    return `<section class="ns-section">
  <h2 class="ns-heading">Namespaces</h2>
  <ul class="plain-list">${items}</ul>
</section>`;
  }

  // ------------------------------------------------------------------
  // Namespace
  // ------------------------------------------------------------------

  namespace(namespaceName) {
    const bucket = this.model.namespaces.get(namespaceName);
    if (!bucket) return null;

    // A namespace page is namespace mode - following one out of a type's breadcrumbs is how a
    // reader enters it - so everything it offers is written in that mode. On a site with no other
    // mode there is nothing to mark, and the urls stay plain.
    return this.inMode(this.namespaceMode ? '' : NAMESPACE_MODE, () =>
      this.namespaceBody(namespaceName, bucket)
    );
  }

  namespaceBody(namespaceName, bucket) {
    const label = namespaceName || '(global)';
    const assemblies = [...bucket.assemblies].sort();
    const docs = this.namespaceDocs(namespaceName);

    const body = `
<div class="page-head">
  <h1 class="page-title">${escape(label)}<span class="page-kind">namespace</span></h1>
  ${docs && docs.summary ? `<div class="page-intro">${docnodes.render(docs.summary, this.docContext)}</div>` : ''}
</div>

${docs && docs.remarks ? `<section class="ns-section"><h2 class="ns-heading">Remarks</h2><div class="remarks">${docnodes.render(docs.remarks, this.docContext)}</div></section>` : ''}

<section class="ns-section">
  <h2 class="ns-heading">Types</h2>
  ${
    // With the assembly named on each card: a namespace is not one assembly's, and with no selector
    // in the header this is what says which one a type came out of.
    this.typeSectionsHtml(bucket.types, { headingLevel: 3 })
  }
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
      filterBar: filterBar({ kinds: this.filterLettersOf(bucket.types, (e) => e.type.kind) }),
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

    const overview = bucket.doc ? markdown.render(bucket.doc.markdown, this.markdownContext) : '';

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
      filterBar: filterBar({ kinds: this.filterLettersOf(bucket.types, (e) => e.type.kind) }),
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

  /**
   * One member's examples, tabbed by language.
   *
   * A page rather than a section on the type: these come out of files that run to hundreds of
   * lines, usually three of them saying the same thing in three languages, and putting that on the
   * type page would bury every member under it.
   */
  example(slug, anchor, mode = '') {
    const found = this.model.typeBySlug(slug);
    if (!found) return null;

    const { type, assembly } = found;
    const member = (type.members || []).find((m) => m.anchor === anchor);
    if (!member) return null;

    // Only a file-backed example gets a page; anything else is on the card already.
    if (exampleFileNodes(member.docs).length === 0) return null;

    return this.inMode(mode, () => this.exampleBody(type, assembly, member));
  }

  exampleBody(type, assembly, member) {
    // Ranked, then by the order the comment listed them, so languages of equal rank keep the
    // sequence the author chose rather than one this decides for them.
    const code = exampleCodeNodes(member.docs)
      .map((node, i) => ({ node, i }))
      .sort(
        (a, b) =>
          languageRank(docnodes.codeLanguage(a.node)) - languageRank(docnodes.codeLanguage(b.node)) || a.i - b.i
      )
      .map((entry) => entry.node);

    const name = memberDisplayName(member);
    const memberUrl = this.routes.member(type.slug, member.anchor);

    // Everything in the example that is not a code block: the prose around it, which is where any
    // explanation of what the example does actually lives.
    const prose = (member.docs.example || []).filter((node) => node.t !== 'code');

    const tabs = code
      .map((node, i) => {
        const label = languageLabel(docnodes.codeLanguage(node));
        return (
          `<button type="button" class="example-tab${i === 0 ? ' active' : ''}" ` +
          `role="tab" aria-selected="${i === 0}" aria-controls="example-panel-${i}" ` +
          `id="example-tab-${i}" data-panel="${i}">${escape(label)}</button>`
        );
      })
      .join('');

    // The member's own name marked wherever the example calls it: these run long and demonstrate a
    // whole workflow, so the line the reader came for needs finding. Only where the code reaches
    // through a dot, so a method named Add does not light up every local called add. A constructor
    // is the exception: it is written as the type name, with 'new' in front of it rather than a dot.
    const needle = lastSegment(member.name);
    const lead = member.kind === 'constructor' ? '' : '.';

    const panels = code
      .map((node, i) => {
        const language = docnodes.codeLanguage(node);

        const rendered =
          typeof node.v === 'string' && node.v.length > 0
            ? markMarkup(highlight(node.v, language), needle, lead)
            : null;

        // A source that resolved to nothing still gets a panel: saying which file is missing is
        // more use than a tab that opens on emptiness.
        const body =
          rendered === null
            ? `<p class="example-missing">This example could not be read from ${escape(node.src || 'its source file')}.</p>`
            : `<pre><code class="language-${attr(language)}">${rendered}</code></pre>`;

        return (
          `<div class="example-panel${i === 0 ? '' : ' hidden'}" role="tabpanel" ` +
          `id="example-panel-${i}" aria-labelledby="example-tab-${i}">` +
          body +
          '</div>'
        );
      })
      .join('');

    const body = `
<article>
<div class="page-head">
  <h1 class="page-title">${this.kindIconHtml(member.kind)}${escape(name)}</h1>
  <div class="page-subtitle">${escape(type.fullName)}</div>
  <p class="page-intro"><a href="${attr(memberUrl)}">Back to ${escape(name)} on ${escape(type.name)}</a></p>
</div>

${prose.length > 0 ? `<div class="summary">${docnodes.render(prose, this.docContext)}</div>` : ''}

<section class="ns-section example-set">
  <h2 class="ns-heading">Examples</h2>
  <div class="example-tabs" role="tablist">${tabs}</div>
  ${panels}
</section>
</article>`;

    const description = `Examples for ${name} in ${type.fullName}.`;

    return this.shell({
      title: `${type.name}.${name} examples`,
      description,
      canonical: this.baseRoutes.example(type.slug, member.anchor),
      noindex: Boolean(this.routes.mode),
      breadcrumbs: [
        this.homeCrumb(),
        ...(type.namespace
          ? [{ label: type.namespace, url: this.routes.namespace(type.namespace) }]
          : []),
        { label: countedGenerics(type.name), url: this.routes.type(type.slug) },
        { label: 'Examples', url: this.routes.example(type.slug, member.anchor) },
      ],
      body,
      sidebar: this.browsingNamespaces
        ? this.namespaceTree(type.namespace || '', { activeType: type })
        : this.categoryTree(assembly, { activeType: type }),
      treeKey: this.browsingNamespaces ? 'namespaces' : slugify(assembly),
      assemblies: this.assemblyChoices(assembly),
      currentAssembly: assembly,
      jsonLd: {
        '@type': 'TechArticle',
        headline: `${type.fullName}.${name} examples`,
        description,
      },
    });
  }

  type(slug, mode = '') {
    const found = this.model.typeBySlug(slug);
    if (!found) return null;

    const { type, assembly } = found;

    // Which type's page this is, for as long as it is being rendered: crefs into it are written
    // by member name alone. Set on the shared context rather than threaded through the fifteen
    // places that render doc nodes, since a page is rendered start to finish before the next one
    // begins. The finally is what keeps a thrown render from leaking it into the page after.
    this.docContext.selfType = type.docId;
    // The assembly being read rides along for the names a type argument list resolves by: two
    // types can answer to one bare name, and the assembly is what breaks the tie.
    this.docContext.selfAssembly = assembly;
    try {
      return this.inMode(mode, () => this.typeBody(type, assembly));
    } finally {
      this.docContext.selfType = null;
      this.docContext.selfAssembly = null;
    }
  }

  typeBody(type, assembly) {
    const summaryHtml = this.summaryHtml(type.docs);
    const members = this.sortedMembers(type, { pageOrder: true });
    const inherited = this.inheritedMembers(type);

    // At the foot of the head rather than in the chrome above it: the row says what the member list
    // shows, so it belongs at the bottom of the block that list scrolls under, not two blocks up
    // beside the breadcrumbs.
    //
    // Inherited members count towards the tabs, since they are listed among the declared ones: a
    // type that declares no events but inherits three still has events to filter to.
    //
    // Its own vocabulary, not the one a list of types filters by: the reader here has already
    // chosen the type and is choosing among its members. See MEMBER_FILTERS.
    const kindTabs = memberFilterBar({
      kinds: new Set(
        members.concat(inherited.map((entry) => entry.member)).map((member) => member.kind)
      ),
    });

    // Everything between the name and the first group of members: what the type relates to, what it
    // is parameterised on, and what it says about itself. All of it is context for the list below,
    // so all of it rides in the head and stays put while that list scrolls under it - as labelled
    // rows, since a run of headings and rules in a header reads as several blocks rather than one.
    const context = [
      this.obsoleteHtml(type.obsolete),
      this.relationsHtml(type),
      this.typeParamsHtml(type),
      this.delegateHtml(type, assembly),
      type.docs && type.docs.example
        ? `<div class="section"><span class="section-label">Example:</span>${docnodes.render(type.docs.example, this.docContext)}</div>`
        : '',
    ]
      .filter(Boolean)
      .join('');

    // Under the description and in the same shape a member card gives it: remarks carry on from the
    // summary rather than opening a subject of their own, and a heading the weight of 'Type
    // relationships' over them would announce them as one.
    const remarksHtml =
      type.docs && type.docs.remarks
        ? `<div class="remarks"><strong>Remarks:</strong> ${docnodes.render(type.docs.remarks, this.docContext)}</div>`
        : '';

    // Name, declaration, summary - the order a search result reads in, so arriving from one lands on
    // the same shape rather than a rearranged version of it. No namespace-qualified name under them:
    // the breadcrumbs above say where the type lives and are the way to the rest of it, so a second
    // copy here is a line that answers a question already answered.
    //
    // The head is in three parts. The brief - what the type is called, how it is declared and what
    // it does - takes the card ground, the way the same three things do on a member card, and holds
    // still. The detail under it reads on the page's own ground like a card's does, and is what
    // scrolls when there is more of it than the cap allows. The kinds row closes the block, outside
    // the scrolling part, on the rule the members start under.
    const body = `
<article>
<div class="page-head sticky-head">
  <div class="page-head-brief">
    <div class="page-title-row"><h1 class="page-title">${this.kindIconHtml(type.kind)}${escape(type.name)}</h1>${this.inheritanceChainHtml(type)}${this.sinceChipHtml(type.docs)}</div>
    <div class="declaration">${this.signatureHtml(this.declarationOf(type), assembly)}</div>
    ${
      summaryHtml
        ? '<div class="page-head-intro">' +
          // Hidden until the script finds something behind the cap: a summary of one sentence has
          // nothing to open out, and a button that says so on every page is a button to ignore.
          '<button class="intro-more" type="button" aria-expanded="false" hidden>' +
          '<span class="intro-more-label">Show all</span>' +
          chevronHtml('intro-more-arrow') +
          '</button>' +
          `<div class="page-intro">${summaryHtml}</div>` +
          '</div>'
        : ''
    }
  </div>
  <div class="page-head-body">
    ${remarksHtml}
    ${context}
  </div>
  ${kindTabs}
</div>

${
  type.kind === 'enum'
    ? this.enumValuesHtml(members)
    : this.membersHtml(members, assembly, type.slug, inherited, type.kind)
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
    breadcrumbs.push({ label: countedGenerics(type.name), url: this.routes.type(type.slug) });

    return this.shell({
      // Namespace-qualified so titles stay unique: Step exists in both Languages.IronPython2
      // and Languages.PythonNet.
      title: type.namespace
        ? `${type.name} ${type.kind} (${type.namespace})`
        : `${type.name} ${type.kind}`,
      description,
      // The plain url, in both modes: the two pages are the same type read two ways, so only one of
      // them is worth indexing and the marked one points at it.
      canonical: this.baseRoutes.type(type.slug),
      noindex: Boolean(this.routes.mode),
      breadcrumbs,
      body,
      sidebar: this.browsingNamespaces
        ? this.namespaceTree(type.namespace || '', { activeType: type })
        : this.categoryTree(assembly, { activeType: type }),
      treeKey: this.browsingNamespaces ? 'namespaces' : slugify(assembly),
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
   * @param {object} options
   *   pageOrder   order the way the page reads rather than the way the tree does: readonly members
   *     ahead of writable ones, and enum values by their value. The tree does neither, because it
   *     shows neither the badge nor the value, so a break in the alphabet there has no visible
   *     cause and just looks mis-sorted.
   *   staticFirst  a kind's statics at the head of its run. The tree does this and the page does
   *     not: the page states every member's modifiers on the card, where the alphabet is the only
   *     order that helps, while the tree is a column of bare names in which what is called on the
   *     type and what is called on an instance are worth separating - and it marks them, so the
   *     break in the alphabet has something visible behind it.
   */
  sortedMembers(type, options = {}) {
    return this.sortMembers(type.members, options);
  }

  /**
   * The same order over any list of members, including one holding members from several types.
   * The tree merges what a type declares with what it inherits and sorts the two as one.
   */
  sortMembers(members, { pageOrder = false, staticFirst = false } = {}) {
    return members.slice().sort((a, b) => {
      const orderA = MEMBER_ORDER.indexOf(a.kind);
      const orderB = MEMBER_ORDER.indexOf(b.kind);
      if (orderA !== orderB) return (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB);

      if (staticFirst && Boolean(a.isStatic) !== Boolean(b.isStatic)) return a.isStatic ? -1 : 1;

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
   * A member's signature written out as it would be declared in source.
   *
   * The model carries the bare form - 'bool IsComplete' - so this spells the whole thing out:
   * 'public bool IsComplete { get; protected set; }'. The member card and the search result both
   * read it, which is what keeps the two from saying one member two ways.
   *
   * The owner's kind is here for the members whose source says less than the compiler does: an
   * interface member is public and abstract to the compiler, and its declaration writes neither.
   */
  memberDeclaration(member, ownerKind = '') {
    // An enum member is reported as public static const, none of which anyone writes.
    if (member.kind === 'enumvalue') return member.signature || '';

    // A finalizer takes no modifiers at all: '~Name()' is the whole declaration.
    if (member.kind === 'destructor') return member.signature || '';

    const iface = ownerKind === 'interface';

    const parts = [];
    // An explicit implementation cannot name an accessibility, however public it is to callers.
    if (member.accessibility && !member.explicitInterface && !(iface && member.accessibility === 'public')) {
      parts.push(member.accessibility);
    }
    // A const is static to the compiler, but 'static const' is not something C# accepts written.
    if (member.isStatic && !member.isConst) parts.push('static');
    if (member.isConst) parts.push('const');
    if (member.kind === 'field' && member.isReadOnly) parts.push('readonly');
    // A static abstract interface member is the one whose source does write the keyword.
    if (member.isAbstract && !(iface && !member.isStatic)) parts.push('abstract');
    if (member.isVirtual) parts.push('virtual');
    if (member.isSealed) parts.push('sealed');
    if (member.isOverride) parts.push('override');

    // The model leaves the keyword out of an event's signature, as it does the modifiers.
    if (member.kind === 'event') parts.push('event');

    const out =
      parts.concat(member.signature || '').filter(Boolean).join(' ') + this.accessorList(member);

    // The value is half the point of a constant, and the declaration is where the source states it.
    return member.isConst && member.constantValue != null ? `${out} = ${member.constantValue}` : out;
  }

  /**
   * What a property offers, written the way it is declared: ' { get; protected set; }'.
   *
   * The model records the two accessors and their visibility but leaves them out of the signature,
   * so a property arrives as 'bool IsComplete' - which does not say whether it can be written, and
   * that is most of what a reader wants from a property. A narrower accessor names its own
   * accessibility, as C# requires; one as visible as the property says nothing and stays bare.
   *
   * Returns '' for everything that has no accessors, which is every member but a property or an
   * indexer.
   */
  accessorList(member) {
    const accessors = member.accessors;
    if (!accessors || !(accessors.get || accessors.set)) return '';

    const part = (visibility, keyword) =>
      (visibility && visibility !== member.accessibility ? `${visibility} ` : '') + keyword + ';';

    const list = [];
    if (accessors.get) list.push(part(accessors.get, 'get'));
    if (accessors.set) list.push(part(accessors.set, accessors.initOnly ? 'init' : 'set'));

    return ` { ${list.join(' ')} }`;
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

        // Only worth a tooltip when it says something the label does not.
        const title = label === ref.display ? '' : ref.display;

        return docnodes.refHtml(docnodes.crefUrl(ref, this.docContext), escape(label), title);
      })
      .join(separator);

    return `<span class="type-chain">${separator}${links}</span>`;
  }

  /**
   * What derives from the type, as a labelled row.
   *
   * A row rather than a group with a heading and a rule over it: it sits in the page head beside
   * the name and the declaration, where a heading the weight of a section would break the block in
   * two. The row says what it is on the left, the way a member card labels its parameters.
   */
  relationsHtml(type) {
    const rows = [];

    // No 'Inheritance:' row: the chain runs into the page title, where it is read against the name
    // it belongs to rather than a second time further down. No 'Implements:' row either - the
    // declaration above already spells out every interface, and the tap-a-name links live there.

    if (type.derivedTypes && type.derivedTypes.length > 0) {
      const links = type.derivedTypes
        .map((docId) => {
          const entry = this.model.entry(docId);
          return entry ? this.typeRefHtml({ id: docId, display: entry.name }) : null;
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

    return rows.join('');
  }

  typeParamsHtml(type) {
    if (!type.typeParameters || type.typeParameters.length === 0) return '';

    const rows = type.typeParameters
      .map((tp) => {
        const variance = tp.variance ? `${escape(tp.variance)} ` : '';
        // Constraints are written names in the model, so they resolve the way a signature's do.
        const constraints = tp.constraints
          ? `<span class="param-type">where ${tp.constraints
              .map((name) => docnodes.writtenTypeHtml(name, this.docContext))
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

    // Labelled and laid out the way a member card gives its own parameters, since that is what
    // these are: the table is the same table, and the label is what says which set it holds.
    return (
      '<div class="section"><span class="section-label">Type parameters:</span>' +
      `<table class="params"><tbody>${rows}</tbody></table></div>`
    );
  }

  delegateHtml(type, assemblyName) {
    if (type.kind !== 'delegate' || !type.signature) return '';
    return (
      '<div class="section"><span class="section-label">Signature:</span>' +
      `<div class="declaration">${this.signatureHtml(type.signature, assemblyName)}</div>` +
      this.parametersHtml(type.parameters) +
      '</div>'
    );
  }

  seeAlsoHtml(docs) {
    if (!docs || !docs.seeAlso || docs.seeAlso.length === 0) return '';

    const links = docs.seeAlso
      .map((ref) => {
        if (ref.href) {
          return `<a class="see-ref" href="${attr(ref.href)}" rel="noopener">${escape(ref.label || ref.href)}</a>`;
        }
        return this.typeRefHtml({ id: ref.id, display: ref.label, external: ref.external, asm: ref.asm });
      })
      .join(' ');

    return `<section class="ns-section"><h2 class="ns-heading">See also</h2><div class="section">${links}</div></section>`;
  }

  /**
   * Why an API is obsolete, as a note under the name: the one mark the page gives the fact.
   *
   * Classed the way &lt;note&gt; in a doc comment is, so the stylesheet paints this one warning
   * without having to tell it apart from the asides it shares a shape with.
   */
  obsoleteHtml(obsolete) {
    if (!obsolete) return '';
    const label = obsolete.isError ? 'removed' : 'obsolete';
    return (
      `<div class="note note-${label}"><span class="note-label">${escape(label)}</span>` +
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
   * The types a type takes its inherited members from, nearest first.
   *
   * A class or a struct has one line of ancestry, which the model records as the inheritance chain.
   * An interface has no base type at all - what it extends are interfaces - so its ancestry is the
   * ones it names, then everything those extend in turn.
   *
   * A class's interfaces are not ancestry: what it gets from one it either declares itself or has
   * from a base class, and both are already here.
   */
  inheritedFrom(type) {
    if (type.kind !== 'interface') {
      return (type.inheritanceChain || []).map((ref) => ref.id);
    }

    // The ones it names first, so a member is credited to the interface this one actually extends
    // rather than to whichever of its ancestors declared it. allInterfaces carries the rest.
    const direct = (type.interfaces || []).map((ref) => ref.id);
    return [...new Set([...direct, ...(type.allInterfaces || [])])].filter(Boolean);
  }

  /**
   * What a type gets from the types above it, as {member, from, assembly}, nearest first.
   *
   * The model records a type's own members and nothing else, so this walks what inheritedFrom
   * gives back and gathers the rest. A type outside the documented set - System.Object, and
   * anything from a package that was not generated - resolves to nothing and contributes nothing,
   * which is why Equals and GetHashCode do not turn up on every page in the site.
   *
   * A member is skipped once something nearer the reader answers for it: an override, a `new`
   * declaration, or a nearer ancestor that had already offered it. Static members are left out for
   * the same reason constructors are - they are called on the type that declares them, and listing
   * them here would say they belong to this one.
   */
  inheritedMembers(type) {
    const sources = this.inheritedFrom(type);
    if (sources.length === 0) return [];

    const seen = new Set((type.members || []).map(memberKey));
    const overridden = new Set((type.members || []).map((m) => m.overrides).filter(Boolean));

    const out = [];

    for (const docId of sources) {
      const found = this.model.typeByDocId(docId);
      if (!found) continue;

      for (const member of found.type.members || []) {
        if (!INHERITED_KINDS.has(member.kind)) continue;
        if (member.isStatic || member.explicitInterface) continue;
        if (member.accessibility === 'private') continue;
        if (overridden.has(member.docId)) continue;

        const key = memberKey(member);
        if (seen.has(key)) continue;

        seen.add(key);
        if (member.overrides) overridden.add(member.overrides);
        out.push({ member, from: found.type, assembly: found.assembly });
      }
    }

    return out;
  }

  /**
   * Members grouped under .ns-section headings, each card inside .type-children so it picks up the
   * indented, rule-on-the-left styling.
   *
   * What the type inherits is merged into each kind's section and sorted with the declared members
   * as one list: the reader is looking a member up by name and does not know which type declared
   * it. An inherited entry wears the full card the declared ones do, with a grey segment down its
   * right edge naming the type it came from, so what this type adds and what it merely carries
   * stay tellable apart at a glance.
   */
  membersHtml(members, assemblyName, selfSlug, inherited = [], ownerKind = '') {
    if (members.length === 0 && inherited.length === 0) return '';

    // Where a member came from, for the ones this type did not declare. Keyed by the member itself,
    // so the merged list sorts as one and each entry still knows which shape to render as.
    const origins = new Map();
    for (const entry of inherited) origins.set(entry.member, entry);

    const merged = this.sortMembers(members.concat([...origins.keys()]), { pageOrder: true });

    const groups = new Map();
    for (const member of merged) {
      if (!groups.has(member.kind)) groups.set(member.kind, []);
      groups.get(member.kind).push(member);
    }

    let out = '';
    for (const kind of MEMBER_ORDER) {
      const group = groups.get(kind);
      if (!group) continue;

      if (OPERATOR_KINDS.has(kind)) {
        out += this.operatorsHtml(group, kind);
        continue;
      }

      out +=
        `<section class="ns-section type-section" id="${attr(kind)}">` +
        `<h2 class="ns-heading">${escape(theme.kindPlural(kind))}</h2>` +
        '<div class="type-children">' +
        group
          .map((m) => {
            // The declaring type's kind and assembly, not this page's: they are what the
            // declaration is written and cross-linked against.
            const origin = origins.get(m);
            return origin
              ? this.memberCardHtml(m, origin.assembly, selfSlug, origin.from.kind, origin.from)
              : this.memberCardHtml(m, assemblyName, selfSlug, ownerKind);
          })
          .join('') +
        '</div></section>';
    }

    return out;
  }

  /**
   * Operators and conversions as a table: the operation, its result, and what it does.
   *
   * The enum table's shape, for the enum table's reason. A card is worth its space for a member
   * whose parameters have names and meanings worth a paragraph each; an operator's operands are
   * its types and nothing else, and a dozen of them read as a table where they read as a dozen
   * near-empty panels. The result column is what makes a conversion legible at all, since which
   * type it converts to is the whole of what it does.
   */
  operatorsHtml(members, kind) {
    const rows = members
      .map((member) => {
        return (
          `<tr id="${attr(member.anchor)}" data-filter="${attr(theme.memberFilterKey(member.kind))}" ` +
          `data-kind="${attr(member.kind)}"${this.sinceAttr(member.docs)}>` +
          this.operationCells(member) +
          `<td class="op-types">${this.typeRefHtml(member.returnType)}</td>` +
          `<td>${this.summaryHtml(member.docs)}</td>` +
          '</tr>'
        );
      })
      .join('');

    return (
      `<section class="ns-section type-section" id="${attr(kind)}">` +
      `<h2 class="ns-heading">${escape(theme.kindPlural(kind))}</h2>` +
      '<div class="table-scroll"><table class="op-table">' +
      // One heading over three cells: the operation is one idea, but splitting it into columns is
      // what makes every symbol in the table land on the same vertical line.
      '<thead><tr><th colspan="3">Operation</th><th>Result</th><th>Description</th></tr></thead>' +
      `<tbody>${rows}</tbody></table></div></section>`
    );
  }

  /**
   * The operator written the way it is used, as three cells: `Point3d | + | Vector3d`.
   *
   * The symbol on its own says which operator and the operand types on their own say which
   * overload, but neither says what you would type. Three cells rather than one string because a
   * column of expressions is only scannable if the symbols line up, which means the operand on
   * each side has to be its own column, closing on the symbol from either direction.
   *
   * A unary operator leaves the left cell empty, so its symbol still lands on the same line as
   * every other, with its one operand where a right-hand operand goes.
   */
  operationCells(member) {
    const operands = (member.parameters || []).map((p) => this.typeRefHtml(p.type));
    const binary = operands.length >= 2;

    const left = binary ? operands[0] : '';
    const right = binary ? operands.slice(1).join(', ') : operands[0] || '';

    return (
      `<td class="op-left">${left}</td>` +
      `<td class="op-mark">${escape(operatorSymbol(member))}</td>` +
      `<td class="op-right">${right}</td>`
    );
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
          `<tr id="${attr(member.anchor)}" data-filter="${attr(theme.memberFilterKey(member.kind))}" ` +
          `data-kind="${attr(member.kind)}"${this.sinceAttr(member.docs)}>` +
          // The mark before the name, as every other member list on the site writes one: the tree
          // no longer carries these rows, so the table is where a reader meets them and it should
          // read like the lists they came from.
          '<td class="enum-name"><span class="enum-name-row">' +
          this.kindIconHtml(member.kind) +
          escape(member.name) +
          '</span></td>' +
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

  /**
   * One member's card: header, declaration, summary, and the detail ground under them.
   *
   * With inheritedFrom set, the card is an inherited member's: the same shape, with the grey
   * provenance segment down its right edge saying which type declared it. The segment is the
   * card's one link through to where the member is documented, and the card carries no id and no
   * # of its own: the anchor belongs to the member's own page, and a second element answering to
   * it here would take links away from the card that documents it.
   */
  memberCardHtml(member, assemblyName, selfSlug, ownerKind = '', inheritedFrom = null) {
    const explicit = Boolean(member.explicitInterface);
    const filterKey = theme.memberFilterKey(member.kind);

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
          return entry ? this.typeRefHtml({ id: docId, display: entry.name }) : null;
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
    // An example that reads from files goes to a page of its own, reached by the button in the
    // header. Anything else - prose, or code written out in the comment - stays on the card, and
    // is rendered plainly there: nothing is marked up, because there is no wall of code to find
    // your way through.
    const exampleFiles = exampleFileNodes(member.docs);
    const example =
      member.docs && member.docs.example && exampleFiles.length === 0
        ? `<div class="section"><span class="section-label">Example:</span>${docnodes.render(member.docs.example, this.docContext)}</div>`
        : '';

    // An inherited member's example page was built under the type that declares it.
    const exampleSlug = inheritedFrom ? inheritedFrom.slug : selfSlug;
    const exampleButton =
      exampleFiles.length > 0
        ? `<a class="chip chip-action" href="${attr(this.routes.example(exampleSlug, member.anchor))}">Example</a>`
        : '';

    // Everything past the description, which the card sets on a dimmer ground of its own. What a
    // reader running down a list of members reads is the name, the declaration and the sentence
    // under it; the parameters, returns and exceptions are for the one they stopped at, and giving
    // them a colour of their own is what lets the eye skip them until then.
    const rest = [remarks, ...detail, example, this.sourceHtml(member.source)]
      .filter(Boolean)
      .join('');

    const body =
      '<div class="member-header">' +
      (explicit ? '<span class="explicit-badge">Explicit</span>' : '') +
      this.kindIconHtml(member.kind) +
      `<h3 class="member-name">${explicit ? this.explicitNameHtml(member) : escape(memberDisplayName(member))}</h3>` +
      // Beside the name it links to, and before the Example button, which the row's own margin
      // holds at the far end: the anchor belongs to the member, not to the action next to it.
      // Out of the tab order, since only the pointer can bring it into view: tabbing onto a mark
      // that stays invisible is worse than not reaching it, and the tree link beside it goes to the
      // same member. A reader on the page still finds it, which is what the label is for.
      (inheritedFrom
        ? ''
        : `<a class="member-anchor" href="#${attr(member.anchor)}" tabindex="-1" ` +
          // Named as the heading beside it is, so the two do not read as different members.
          `aria-label="Link to ${attr(memberDisplayName(member))}">#</a>`) +
      exampleButton +
      // No since chip in an inherited card's header: there it rides atop the provenance segment,
      // with the rest of what the member owes to its declaring type.
      (inheritedFrom ? '' : this.sinceChipHtml(member.docs)) +
      '</div>' +
      // The whole declaration as source writes it, modifiers and all: a reader looking for whether
      // a member is static, sealed or assignable looks where those facts would be declared, and a
      // constant's value rides on the end the way the source states it.
      `<div class="declaration">${this.signatureHtml(this.memberDeclaration(member, ownerKind), assemblyName, lastSegment(member.name))}</div>` +
      this.obsoleteHtml(member.obsolete) +
      (summary ? `<div class="summary">${summary}</div>` : '') +
      (rest ? `<div class="member-detail">${rest}</div>` : '');

    if (inheritedFrom) {
      // The provenance reads as two stacked lines, 'inherited from' over the type it names, with
      // the member's since above the pair when it has one. Each line rides in a span of its own,
      // which is what a name too long for the segment's width ellipsizes in.
      return (
        '<div class="member inherited" ' +
        `data-filter="${attr(filterKey)}" data-kind="${attr(member.kind)}"` +
        `${this.sinceAttr(member.docs)}>` +
        `<div class="member-main">${body}</div>` +
        `<a class="inherited-from" href="${attr(this.routes.member(inheritedFrom.slug, member.anchor))}">` +
        (member.docs && member.docs.since
          ? `<span class="inherited-since">Since ${escape(versionLabel(member.docs.since))}</span>`
          : '') +
        '<span>inherited from</span>' +
        `<span class="inherited-from-type">${escape(inheritedFrom.name)}</span></a>` +
        '</div>'
      );
    }

    return (
      `<div class="member${explicit ? ' explicit-impl' : ''}" id="${attr(member.anchor)}" ` +
      `data-filter="${attr(filterKey)}" data-kind="${attr(member.kind)}"` +
      `${this.sinceAttr(member.docs)}>` +
      body +
      '</div>'
    );
  }

  // ------------------------------------------------------------------
  // Sidebar trees
  // ------------------------------------------------------------------

  /**
   * Whether a type's members belong under it in the tree.
   *
   * An enum's page is one table of its values, read top to bottom, and nothing on it is far enough
   * down to need jumping to - so a row per value only lengthens the tree between the types a reader
   * is moving among.
   */
  treeListsMembers(type) {
    return type.kind !== 'enum';
  }

  /**
   * A type's members under it in the tree, with its operators behind a single row.
   *
   * A type that overloads a dozen operators otherwise spends a dozen rows on `op_` names that all
   * sort together and none of which anyone is looking for, pushing the members they are looking
   * for off the visible tree. The row points at the section, which is one click either way.
   *
   * What the type inherits is merged in and sorted as one list rather than gathered at the end: a
   * reader running an eye down a column of names is reading alphabetically and does not know which
   * type declared what. The rows are drawn back and hidden until the arrow beside the type's name
   * asks for them, which is what keeps a tree of names the type actually declares by default.
   */
  treeMemberLinksHtml(type, inherited = []) {
    // Where a row came from, for the ones this type did not declare. Keyed by the member itself, so
    // the merged list can be sorted as one and each row still knows what it belongs to.
    const from = new Map();
    for (const entry of inherited) from.set(entry.member, entry.from);

    const members = this.sortMembers(type.members.concat([...from.keys()]), { staticFirst: true });

    let out = members
      .filter((m) => !OPERATOR_KINDS.has(m.kind))
      .map((m) => {
        const source = from.get(m);

        // An inherited row leads to the page that documents it; a declared one to the card below.
        const href = source ? this.routes.member(source.slug, m.anchor) : `#${m.anchor}`;

        // The row truncates, and the part that tells overloads apart is at the end, so the full
        // signature is on the title where it can still be read.
        const title = (m.signature || m.name) + (source ? ` - inherited from ${source.name}` : '');

        return (
          `<a class="tree-child-link${source ? ' tree-child-inherited' : ''}" ` +
          `href="${attr(href)}"${this.sinceAttr(m.docs)} title="${attr(title)}">` +
          this.kindIconHtml(m.kind) +
          // Outlined rather than filled, and after the kind rather than instead of it: this is a
          // note on the badge beside it, not a second kind. It is also what the run of statics at
          // the head of each kind is sorted on, so the break in the alphabet is accounted for.
          //
          // Not on an enum value, which has no other way to be: a mark every row in the tree wears
          // distinguishes none of them, and only costs the names beside it the width.
          (m.isStatic && m.kind !== 'enumvalue'
            ? '<span class="tree-badge tree-badge-static">S</span>'
            : '') +
          this.treeMemberLabelHtml(m) +
          '</a>'
        );
      })
      .join('');

    // Ordered by MEMBER_ORDER rather than by the set, so the rows land where their sections do.
    for (const kind of MEMBER_ORDER) {
      if (!OPERATOR_KINDS.has(kind)) continue;
      if (!members.some((m) => m.kind === kind)) continue;

      const label = theme.kindPlural(kind);
      out +=
        `<a class="tree-child-link" href="#${attr(kind)}" title="${attr(label)}">` +
        this.kindIconHtml(kind) +
        `<span class="tree-label">${escape(label)}</span></a>`;
    }

    return out;
  }

  /**
   * The disclosure triangle. Drawn rather than typed, so it centres on its own geometry instead of
   * on a text baseline, and so rotating it turns about the middle of a square.
   */
  treeArrowHtml(collapsed) {
    return chevronHtml(`tree-arrow${collapsed ? ' collapsed' : ''}`);
  }

  /**
   * Collapsible sidebar group.
   *
   * Two looks, for the two things a group can be. A category is a heading over a list - small,
   * bold, upper case - because what it names is a section of the site rather than a page. A
   * namespace is a row like the rows under it, drawn with the namespace mark and written the way a
   * type is written, because in namespace mode the tree is one nesting: namespaces hold types and
   * types hold members, and a heading in the middle of that would read as a break in it.
   *
   * A group that names a page of its own splits the row in two, the way the type rows under it are
   * split: the arrow opens the group and the name goes to the page. One row cannot do both, and of
   * the two the arrow is the one a reader can find no other way.
   *
   * A group the page is not standing in is written without the rows it holds, and marked with the
   * name the browser puts them back under. Nothing is lost by leaving them out: the group is
   * collapsed, so they are not drawn, and the only thing that opens it is the script that fills it.
   * The rows are the whole weight of a tree - every page carried every type in the set, which on a
   * few thousand types is most of what the page weighs - and they are the same rows on every page.
   * See treeAsset.
   *
   * @param {object} options  collapsed: start closed
   *                          icon: kind mark to draw before the label, which also plains the row
   *                          href: the group's own page, which makes the label a link
   *                          active: the reader is on that page
   *                          lazy: the browser fills this one, from the tree asset
   */
  treeGroup(
    id,
    label,
    inner,
    { collapsed = false, icon = '', href = '', active = false, lazy = false } = {}
  ) {
    const children =
      `<div class="tree-ns-children${collapsed ? ' collapsed' : ''}" ` +
      `id="ns_${attr(id)}"${lazy ? ` data-lazy="${attr(id)}"` : ''}>${inner}</div>`;

    const mark = icon ? icons.iconHtml(icon) : '';

    if (href) {
      return (
        `<div class="tree-ns${icon ? ' tree-ns-plain' : ''}">` +
        '<div class="tree-type-label">' +
        `<button class="tree-ns-toggle" type="button" data-target="ns_${attr(id)}" ` +
        `aria-expanded="${collapsed ? 'false' : 'true'}" ` +
        `aria-label="Toggle ${attr(label)}">` +
        this.treeArrowHtml(collapsed) +
        '</button>' +
        `<a class="tree-ns-link${active ? ' active' : ''}" href="${attr(href)}">` +
        mark +
        `<span>${escape(label)}</span></a>` +
        '</div>' +
        children +
        '</div>'
      );
    }

    return (
      `<div class="tree-ns${icon ? ' tree-ns-plain' : ''}">` +
      `<button class="tree-ns-label" type="button" data-target="ns_${attr(id)}" ` +
      `aria-expanded="${collapsed ? 'false' : 'true'}">` +
      this.treeArrowHtml(collapsed) +
      mark +
      `<span>${escape(label)}</span></button>` +
      children +
      '</div>'
    );
  }

  treeTypeRow(type, { active = false, children = '', childrenId = null, inherited = false } = {}) {
    const hasChildren = Boolean(children);
    const arrow = hasChildren
      ? `<button class="tree-toggle" type="button" data-target="${attr(childrenId)}" aria-label="Toggle members">` +
        this.treeArrowHtml(!active) +
        '</button>'
      : '<span class="tree-arrow-spacer"></span>';

    // Its own arrow at the end of the row, for the rows that are in the list but not drawn: what it
    // opens is a second helping of the same list, so it opens the way everything else here does.
    const inheritedArrow = inherited
      ? `<button class="tree-inherited-toggle" type="button" data-target="${attr(childrenId)}" ` +
        'aria-pressed="false" title="Show inherited members" aria-label="Show inherited members">' +
        this.treeArrowHtml(true) +
        '</button>'
      : '';

    return (
      `<div class="tree-type"${this.sinceAttr(type.docs)}>` +
      '<div class="tree-type-label">' +
      arrow +
      `<a class="tree-link${active ? ' active' : ''}" href="${attr(this.routes.type(type.slug))}">` +
      this.kindIconHtml(type.kind) +
      `${escape(type.name)}</a>` +
      inheritedArrow +
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

  /**
   * The bar pinned over the tree: a title saying what the column's groups are, and one button that
   * collapses every group at once.
   *
   * The title names the tree's vocabulary - Topics, Namespaces, Assemblies - which is the one
   * thing the rows below cannot say for themselves, since a list of names does not say what kind
   * of name it lists.
   *
   * The button collapses only. Opening every group at once buys nothing a reader wants, so the
   * other direction is not offered - and with only one thing to do, the button sits disabled and
   * dimmed while every group is shut, rather than gone: a control that vanishes reads as the bar
   * changing shape. anyOpen writes the state the page loads with; the script keeps it current as
   * groups open and close. The mark is a list with one row set in under the others - the tree in
   * miniature.
   */
  sidebarToolbar(label, anyOpen) {
    return (
      '<div class="sidebar-toolbar">' +
      `<span class="sidebar-title">${escape(label)}</span>` +
      `<button id="collapse-all-btn"${anyOpen ? '' : ' disabled'} type="button" ` +
      'title="Collapse all" aria-label="Collapse all">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none">' +
      '<circle cx="4.443" cy="5.081" r="1.331" fill="currentColor"/>' +
      '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.123 5.08h11.765"/>' +
      '<circle cx="4.443" cy="12" r="1.331" fill="currentColor"/>' +
      '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.123 12h11.765"/>' +
      '<circle cx="9.701" cy="18.919" r="1.331" fill="currentColor"/>' +
      '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.38 18.92h6.508"/>' +
      '</g></svg></button>' +
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
    const groups = this.model.categoryTreeOfAssembly(assemblyName);

    // Open the group holding whatever is being viewed; collapse the rest so the tree is scannable.
    const containsActiveType = (group) =>
      activeType !== null && group.types.some(({ type }) => type.docId === activeType.docId);
    const isActiveGroup = (group) =>
      group.category === activeCategory || containsActiveType(group);

    let out = this.sidebarToolbar('Topics', groups.some(isActiveGroup));

    // The assembly's own page is the only thing in this tree with nothing above it, so without a
    // row of its own there is no way back to the prose once you have clicked into a type. Marked
    // active only by the assembly page itself - search borrows this tree without being in it.
    out += this.assemblyOverviewRow(assemblyName, activeOverview);

    if (groups.length === 0) return out;

    for (const group of groups) {
      const activeGroup = isActiveGroup(group);

      // Only the group being read is written out; the browser fills the rest from the tree asset.
      const rows = !activeGroup
        ? ''
        : group.types
            .map(({ type }) => {
              const active = activeType !== null && type.docId === activeType.docId;

              // Only the current type lists its members, so a large category stays readable.
              const lists = active && this.treeListsMembers(type);
              const inherited = lists ? this.inheritedMembers(type) : [];
              const children = lists ? this.treeMemberLinksHtml(type, inherited) : '';

              return this.treeTypeRow(type, {
                active,
                children,
                childrenId: `tc_${type.slug}`,
                inherited: inherited.length > 0,
              });
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

      // The Overview row is written whether or not the group is filled in, so a category's own
      // page is one click away with the script off as well as on.
      out += this.treeGroup(`cat_${group.category}`, group.category, overview + rows, {
        collapsed: !activeGroup,
        lazy: !activeGroup,
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
    // Every group starts shut here, so there is nothing for the collapse button to do yet.
    let out = this.sidebarToolbar('Assemblies', false);

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
              '<span class="tree-badge tree-badge-cat">C</span>' +
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

  /**
   * The sidebar of namespace mode: a group per namespace, holding the types declared in it.
   *
   * Every namespace on the site rather than the current assembly's, because a namespace page is
   * itself the whole site's - Rhino.Geometry is one namespace whichever assemblies contribute to
   * it - and because a tree that is the same on every page is one the reader can leave open.
   *
   * Only the namespace being read is expanded. A dump has a few dozen of them against a few
   * thousand types, so opening them all would bury the list that makes the column navigable.
   *
   * The namespace's own page is the row itself rather than an Overview row under it, since the row
   * is already the name of that page: it opens on the arrow and goes there on the name, which is
   * how every type row below it behaves.
   *
   * @param {string|null} activeNamespace  the namespace being read, expanded
   * @param {object} options   activeType: the type whose page this is, expanded to show members
   */
  namespaceTree(activeNamespace = null, { activeType = null } = {}) {
    const buckets = this.model.sortedNamespaces();
    let out = this.sidebarToolbar(
      'Namespaces',
      buckets.some((bucket) => bucket.name === activeNamespace)
    );

    for (const bucket of buckets) {
      const open = bucket.name === activeNamespace;

      // Members are listed under the type being read and nowhere else, so a namespace the size of
      // Rhino.Geometry stays a list of types. The namespaces that are not open are not written at
      // all - the browser puts their rows back from the tree asset.
      const rows = !open
        ? ''
        : bucket.types
            .map(({ type }) => {
              const active = activeType !== null && type.docId === activeType.docId;
              const lists = active && this.treeListsMembers(type);
              const inherited = lists ? this.inheritedMembers(type) : [];

              return this.treeTypeRow(type, {
                active,
                children: lists ? this.treeMemberLinksHtml(type, inherited) : '',
                childrenId: `tc_${type.slug}`,
                inherited: inherited.length > 0,
              });
            })
            .join('');

      out += this.treeGroup(slugify(bucket.name) || 'global', bucket.name || '(global)', rows, {
        collapsed: !open,
        lazy: !open,
        icon: 'namespace',
        href: this.routes.namespace(bucket.name),
        // Marked only where the namespace itself is what is being read: on a type's page the
        // highlight belongs to the type, and two of them would leave neither meaning anything.
        active: open && activeType === null,
      });
    }

    return out;
  }

  /**
   * The rows the trees leave out, as one asset per tree shape.
   *
   * A tree is the same list on every page that carries it - what changes is which group is open
   * and which row is marked - so writing it into all of them wrote the whole API into each. This
   * is that list, sent once and kept by the browser's cache for the rest of the read: on
   * RhinoCommon it is a tenth of what one page used to carry, against nineteen hundred pages that
   * each carried it. See treeGroup and the tree section of assets.js.
   *
   * Rows are positional, as the search index's are: a name, a slug and the mark to draw, with the
   * version a type arrived in only where it has one. Urls are a prefix and the slug rather than a
   * url each, since every type page under one tree sits under the same path.
   *
   * @param {string} key  'namespaces', or an assembly's slug for one of the category trees
   * @returns {object|null} null when the key names no tree this site has
   */
  treeAsset(key) {
    const groups = {};

    if (key === 'namespaces') {
      // Namespace mode's urls carry its segment, and this tree is only ever rendered under it. A
      // site with no authored pages has the one shape and no segment to insert.
      const routes = this.baseRoutes.withMode(this.namespaceMode ? '' : NAMESPACE_MODE);

      for (const bucket of this.model.sortedNamespaces()) {
        groups[slugify(bucket.name) || 'global'] = bucket.types.map((entry) =>
          this.treeAssetRow(entry.type)
        );
      }

      return { schema: 1, prefix: routes.typePrefix(), groups };
    }

    const assemblyName = this.assemblyNames.find((name) => slugify(name) === key);
    if (!assemblyName) return null;

    for (const group of this.model.categoryTreeOfAssembly(assemblyName)) {
      groups[`cat_${group.category}`] = group.types.map(({ type }) => this.treeAssetRow(type));
    }

    return { schema: 1, prefix: this.baseRoutes.typePrefix(), groups };
  }

  /** One type as the tree asset carries it. Mirrors treeTypeRow, which draws the same row here. */
  treeAssetRow(type) {
    const row = [type.name, type.slug, theme.kindIcon(type.kind)];
    if (type.docs && type.docs.since) row.push(type.docs.since);
    return row;
  }

  /**
   * The trees this site has an asset for, which is what build.js writes and check.js asks for.
   *
   * The namespace tree always, since every site can be browsed that way; a category tree per
   * assembly where there are authored pages to organise, and none where there are not.
   */
  treeAssetNames() {
    const names = ['namespaces'];
    if (!this.namespaceMode) for (const name of this.assemblyNames) names.push(slugify(name));
    return names;
  }

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------

  search(query, serverSide, assemblyName) {
    const trimmed = (query || '').trim();
    const scope = assemblyName || '';
    let resultsHtml = '';
    let statusText = '';

    // The tree the reader already knows, which is the assembly's own where there are categories to
    // browse, and the one tree the whole site carries where there are not.
    let sidebar;
    let treeKey;

    if (this.namespaceMode) {
      sidebar = this.namespaceTree();
      treeKey = 'namespaces';
    } else if (scope) {
      sidebar = this.categoryTree(scope);
      treeKey = slugify(scope);
    } else {
      sidebar = this.assembliesTree();
      treeKey = 'assemblies';
    }

    // Which buttons the bar opens with. Nothing is listed until there is a query, so nothing is
    // offered either; a ?q= knows its answer and says so, and from then on the script keeps the bar
    // to whatever the query in the box has found.
    let kinds = null;

    if (serverSide && trimmed) {
      const matches = this.searchIndexEntries(trimmed, FIRST_PAINT_RESULTS, scope);
      // Only the empty result says anything; a hit count is noise above the hits themselves.
      statusText =
        matches.total === 0
          ? `No matches for "${trimmed}"${scope ? ` in ${scope}` : ''}.`
          : '';

      resultsHtml = matches.rows.map((row) => this.searchResultHtml(row, trimmed)).join('');
      kinds = matches.kinds;
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
      // Every button is written, and the ones this query found nothing of are written hidden: the
      // results are rebuilt in the browser as the query changes, so a button left out of the page
      // could not come back when the next query needed it. See offerKinds in app.js.
      filterBar: filterBar({ kinds, live: true }),
      // Search is a dead end otherwise: the way back into the content is the tree, so it should be
      // the tree you already know. Unscoped and with categories, there is no single assembly to
      // show and the list of them stands in.
      sidebar,
      // Same key as the pages that tree belongs to, so an expansion survives the trip through search.
      treeKey,
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
   *
   * One mark to a row, in the first place the word appears reading down it: the name, then the
   * summary, then the declaration. A mark answers the question of why this row is in the list, and
   * the answer is wanted once - 'sphere' used to come back with the word lit in the name, twice in
   * the summary and three times across the parameters, which is a row shouting a word the reader
   * typed rather than one showing where it was found.
   *
   * The order is what a reader reads first, and each line is a better answer than the one under it: a
   * name is what the thing is called, a summary is what it does, a declaration is what it is made of.
   * So the lines below the answer are drawn plain, and a row whose name matched is a row with one
   * mark on it.
   *
   * A type's declaration is not searched at all - see searchRows - so it is never the answer: marking
   * it made a promise the row could not keep, since 'curve' would light up the base type of every
   * class derived from Curve, none of which was matched against. A member's is searched, and on 655
   * of the rows a search for 'point3d' returns it is the only place the word appears - a parameter
   * type, named nowhere else on the row - which is exactly when it is worth marking.
   */
  searchResultHtml(row, query) {
    const declaration = row.signature
      ? this.signatureHtml(row.signature, row.assembly, lastSegment(row.name))
      : '';

    const needle = (query || '').toLowerCase();
    const inName = row.name.toLowerCase().includes(needle);
    const inSummary = !inName && (row.summary || '').toLowerCase().includes(needle);
    const inDeclaration = row.declarationSearched && !inName && !inSummary;

    return (
      // data-filter is what the kind filter above the results matches on.
      `<li data-filter="${attr(theme.filterLetter(row.kind))}">` +
      '<div class="r-head">' +
      this.kindIconHtml(row.kind) +
      `<a class="r-name" href="${attr(row.url)}">${markMatch(row.name, query)}</a>` +
      '</div>' +
      (declaration
        ? `<div class="r-sig">${inDeclaration ? markMarkup(declaration, query) : declaration}</div>`
        : '') +
      (row.summary
        ? `<div class="r-summary">${
            inSummary ? markMatch(row.summary, query) : escape(row.summary)
          }</div>`
        : '') +
      `<div class="r-ns">${escape(row.namespace || '(global)')}</div>` +
      '</li>'
    );
  }

  searchIndexEntries(query, limit, assemblyName) {
    const q = query.toLowerCase();
    // A query with a dot in it is asking for something qualified - 'sphere.center' is a member of a
    // type, not a word - so that is the one case matched against the displayed name, which is where
    // the type a member belongs to is still written. app.js matches the same way.
    const qualified = q.indexOf('.') >= 0;
    const hits = [];

    // A finalizer is written '~Sphere' and read as part of the type, not looked up beside it, so it
    // answers only a query that starts the way its name does. Its declaration and its summary name
    // the type as well, and without this gate that is enough to put it in front of anyone searching
    // for the type - the same thing dropping the constructors set out to stop. app.js gates the same.
    const finalizers = q.charAt(0) === '~';

    for (const row of this.searchRows()) {
      if (assemblyName && row.assembly !== assemblyName) continue;
      if (!finalizers && isFinalizerName(row.name)) continue;

      const name = row.name.toLowerCase();
      let pos = row.haystack.indexOf(q);

      if (pos < 0) {
        if (!qualified) continue;
        pos = name.indexOf(q);
        if (pos < 0) continue;
      }

      hits.push({ rank: searchRank(name, q, qualified), group: searchGroup(row), pos, row });
    }

    // Ordered rather than handed back in the order the model happens to hold: the first hundred rows
    // of a scan are the first hundred types the assembly declares, which for a common word is a
    // hundred rows nobody asked about. Sorted the way app.js sorts, so the ?q= answer and the list
    // the browser draws over it are the same list in the same order.
    // The rows the query named come ahead of the ones it reached through a summary or a signature -
    // rank 3, the one rank that says the name never matched - and each side is shelved by what a
    // row is before how well its name matched: see searchGroup. Then the rank, the earliest match,
    // and the shortest name, which is the one with the least around the match: 'Sphere' the struct
    // ahead of the enum values also called Sphere. Alphabetical last, so the order is settled and
    // does not depend on where in the model a row was found.
    hits.sort(
      (a, b) =>
        (a.rank === 3 ? 1 : 0) - (b.rank === 3 ? 1 : 0) ||
        a.group - b.group ||
        a.rank - b.rank ||
        a.pos - b.pos ||
        a.row.name.length - b.row.name.length ||
        a.row.name.localeCompare(b.row.name)
    );

    return {
      rows: hits.slice(0, limit).map((hit) => hit.row),
      total: hits.length,
      // Every match, not the page of them handed back: the bar narrows the whole answer, so a kind
      // that only appears past the first hundred rows still has a button worth pressing.
      kinds: this.filterLettersOf(hits, (hit) => hit.row.kind),
    };
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
          // Plain urls, always: the index is one asset shared by every page, and a namespace-mode
          // page puts its own segment back on the row it opens. See modeInsert.
          url: this.baseRoutes.type(type.slug),
          summary,
          // A type's declaration is the closest thing it has to a member's signature. Shown, not
          // searched: what it adds over the name is the base type and the interfaces, and those are
          // rows of their own - a search for an interface should find the interface, not the hundred
          // types that implement it. Which is why nothing in it is ever marked.
          signature: this.declarationOf(type),
          declarationSearched: false,
          assembly: assemblyName,
          namespace: type.namespace || '',
          // Name first, then the qualified form. Both are searched either way; the order is what the
          // position of the match means, and a type whose name is the query should read as a match at
          // the start of its row rather than one twenty characters in behind its namespace.
          haystack: `${type.name} ${type.fullName} ${type.category || ''} ${summary}`.toLowerCase(),
        });

        for (const member of type.members) {
          // A constructor is not searchable, because it has no name of its own to search: it is
          // called what its type is called, so every one of them answered a search for the type and
          // 'Sphere.Sphere' was a result that said nothing the row above it had not. The type is the
          // way in, and its page lists what it can be built from. A finalizer stays - see the gate in
          // searchIndexEntries, which is what keeps it out of the way until it is asked for by name.
          if (member.kind === 'constructor') continue;

          const memberSummary = truncate(this.summaryText(member.docs), 140);
          rows.push({
            // Shown qualified, because a member name on its own does not say whose it is. What is
            // searched is the member alone - see the haystack below.
            name: `${type.name}.${memberDisplayName(member)}`,
            kind: member.kind,
            isStatic: Boolean(member.isStatic),
            url: this.baseRoutes.member(type.slug, member.anchor),
            summary: memberSummary,
            // Searched, unlike a type's: the parameters and the return are what a member is, and the
            // haystack below carries them. The modifiers this puts on the front are the exception -
            // they are not in the haystack, so 'static' can still mark a word it did not match.
            signature: this.memberDeclaration(member, type.kind),
            declarationSearched: true,
            assembly: assemblyName,
            namespace: type.namespace || '',
            // The member alone, without the type it is declared on. Qualified, every one of a type's
            // members answered a search for the type's name: 'sphere' returned the struct and then
            // its forty properties, which is the type page's list reprinted as search results. The
            // type is one row now, and a member earns its own by what it is called, what it takes
            // and what it says. A dotted query is the exception - see searchIndexEntries.
            haystack: `${member.name} ${member.signature} ${memberSummary}`.toLowerCase(),
          });
        }
      }
    }

    this._searchRows = rows;
    return rows;
  }

  /**
   * Compact rows:
   * [name, url, haystack, summary, filterLetter, signature, nsIndex, asmIndex, icon, flags].
   *
   * The letter here is the one the row filters under, not one it shows: what a row shows is its
   * kind's drawing, which is why the icon travels with it and cannot be worked out from the letter -
   * an enum and an event are both filtered from E in this index's terms. No colour, since every kind
   * is drawn in one ink: a property naming it on every row would be the same string tens of thousands
   * of times, and the stylesheet already paints it once.
   *
   * The last is two facts in one number - 1 static, 2 declaration not searched - and is there only on
   * a row with something to say, so it costs two bytes on those and nothing at all on the rest; a row
   * without it simply ends one element short. One slot rather than two, because the alternative is a
   * second flag written on every row in the index to say nothing about most of them.
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
      schema: 6,
      namespaces,
      assemblies,
      entries: rows.map((r) => {
        const entry = [
          r.name,
          r.url,
          r.haystack,
          r.summary,
          theme.filterLetter(r.kind),
          this.signatureHtml(r.signature, r.assembly, lastSegment(r.name)),
          seen.get(r.namespace),
          assemblyIndex.get(r.assembly),
          theme.kindIcon(r.kind),
        ];

        const flags = (r.isStatic ? 1 : 0) | (r.declarationSearched ? 0 : 2);
        if (flags) entry.push(flags);
        return entry;
      }),
    };
  }

  // ------------------------------------------------------------------
  // sitemap / robots / 404
  // ------------------------------------------------------------------

  sitemapUrls() {
    // A root that only redirects is noindex, so it does not belong here. build.js writes it
    // anyway, the way it writes the search page, because the file still has to exist.
    const urls = this.rootRedirects ? [] : [this.routes.home()];

    for (const assembly of this.model.index.assemblies) urls.push(this.routes.assembly(assembly.name));
    for (const ns of this.model.sortedNamespaces()) urls.push(this.routes.namespace(ns.name));

    // A site with no authored pages has no category pages either: the tags are still in the model,
    // but nothing links to them and there is no overview to read on one.
    if (!this.namespaceMode) {
      for (const c of this.model.allCategories()) urls.push(this.routes.category(c.assembly, c.category));
    }

    for (const { type } of this.model.allTypes()) {
      urls.push(this.routes.type(type.slug));

      for (const member of type.members || []) {
        if (exampleFileNodes(member.docs).length > 0) {
          urls.push(this.routes.example(type.slug, member.anchor));
        }
      }
    }

    return urls;
  }

  /**
   * The namespace-mode copies of the pages that read both ways: types, and the example pages
   * hanging off them.
   *
   * Kept apart from sitemapUrls because they are the same content under a second url. They are not
   * in the sitemap and they are not indexed - each names the plain url as its canonical - but the
   * exporter still has to write them, since a static host cannot make one url render as another.
   */
  mirrorUrls() {
    if (this.namespaceMode) return [];

    const routes = this.routes.withMode(NAMESPACE_MODE);
    const urls = [];

    for (const { type } of this.model.allTypes()) {
      urls.push(routes.type(type.slug));

      for (const member of type.members || []) {
        if (exampleFileNodes(member.docs).length > 0) {
          urls.push(routes.example(type.slug, member.anchor));
        }
      }
    }

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
