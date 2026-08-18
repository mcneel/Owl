'use strict';

const { escape, attr, json } = require('./html');
const icons = require('./icons');
const { slugify } = require('./routes');
const { FILTER_KINDS, memberFilterTabs } = require('./theme');

/**
 * The page shell: a fixed header, the kind filter bar, a resizable tree sidebar and an
 * independently scrolling content pane, themed to follow the system unless the reader has toggled.
 * Every page carries its own title, description and canonical url, plus Open Graph tags,
 * breadcrumbs and JSON-LD.
 */

/** Used when the model carries no site name and none was passed on the command line. */
const DEFAULT_SITE_NAME = 'API Reference';

/**
 * @param {object} options
 *   title        page title, without the site suffix
 *   siteName     site name, used as the title suffix and in the header
 *   logo         inlined SVG shown before the site name, or ''
 *   logoDark     inlined SVG for the dark theme; optional, logo covers both without it
 *   description  meta description, plain text
 *   canonical    root-relative url of this page
 *   breadcrumbs  [{label, url, icon?}] innermost last; icon names a sprite icon worn before the label
 *   body         main content HTML
 *   sidebar      optional sidebar HTML (renders the tree column)
 *   sidebarAlt   the namespace tree this page swaps in when its url carries the mode flag, or ''.
 *                Written into an inert template: a reader in the other mode is the exception, and
 *                a second tree drawn into the page proper would cost every reader its weight
 *   treeKey      identifies the tree, so its expanded groups are remembered per shape rather
 *                than smeared across every assembly's
 *   treeSrc      where the rows this page left out of its tree are fetched from, or '' for a
 *                tree that is written out whole
 *   filterBar    optional filter bar HTML
 *   routes       Routes instance
 *   homeUrl      where the site name points; the root, unless it only redirects
 *   siteUrl      absolute origin, when configured
 *   jsonLd       extra JSON-LD object
 *   noindex      keep this page out of search results
 *   bodyClass    class on <body>, for the few rules that are page-specific
 *   currentQuery prefill for the header search box
 *   assemblies   names for the header's assembly picker; fewer than two draws none
 *   currentAssembly  which of them this page belongs to, or '' for the whole API
 *   assemblyUrl  where choosing an assembly goes, when it is not that assembly's page
 *   versions     versions for the header's API version picker, newest first; none draws no picker
 */
function page(options) {
  const {
    title,
    siteName = DEFAULT_SITE_NAME,
    logo = '',
    logoDark = '',
    description = '',
    canonical,
    breadcrumbs = [],
    body,
    sidebar = null,
    sidebarAlt = '',
    treeKey = '',
    treeSrc = '',
    filterBar = null,
    routes,
    homeUrl = null,
    siteUrl = '',
    jsonLd = null,
    noindex = false,
    bodyClass = '',
    currentQuery = '',
    assemblies = [],
    currentAssembly = '',
    assemblyUrl = null,
    versions = [],
  } = options;

  const stickyTop = renderBreadcrumbs(breadcrumbs) + (filterBar || '');
  const fullTitle = title ? `${title} | ${siteName}` : siteName;
  const absolute = (url) =>
    siteUrl && url && url.startsWith('/') ? siteUrl.replace(/\/$/, '') + url : url;
  const canonicalUrl = absolute(canonical);

  const graph = [];

  if (breadcrumbs.length > 0) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.label,
        item: absolute(crumb.url) || undefined,
      })),
    });
  }

  if (jsonLd) graph.push(jsonLd);

  const structuredData =
    graph.length > 0 ? { '@context': 'https://schema.org', '@graph': graph } : null;

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<!-- The attribute is what a reader with JavaScript off gets, since the script below is what reads
     the system's appearance. Dark, because that is the site's own look. -->
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(fullTitle)}</title>
${description ? `<meta name="description" content="${attr(description)}">` : ''}
${canonicalUrl ? `<link rel="canonical" href="${attr(canonicalUrl)}">` : ''}
<meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow'}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${attr(siteName)}">
<meta property="og:title" content="${attr(title || siteName)}">
${description ? `<meta property="og:description" content="${attr(description)}">` : ''}
${canonicalUrl ? `<meta property="og:url" content="${attr(canonicalUrl)}">` : ''}
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="${attr(routes.asset('app.css'))}">
<link rel="sitemap" type="application/xml" href="${attr(routes.sitemap())}">
${structuredData ? `<script type="application/ld+json">${json(structuredData)}</script>` : ''}
<script>
/* Applied before first paint, so the appearance the site opens as does not flash the other one.
   The session's store, not the origin's: a toggle holds across the links of one read and is gone by
   the next, so the site opens as the system says every time and no choice outlives the tab.
   The sidebar's visibility rides in the same store for the same reason - put back this early, a
   hidden column stays hidden across a navigation instead of flashing in and out. */
(function(){try{var d=document.documentElement;var t=sessionStorage.getItem('docs-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');d.setAttribute('data-theme',t);if(sessionStorage.getItem('docs-sidebar')==='hidden')d.setAttribute('data-sidebar','hidden');}catch(e){}})();
</script>
</head>
<body${bodyClass ? ` class="${attr(bodyClass)}"` : ''}>
<!-- The kind drawings, declared once so the rows that wear them are a reference each. First in the
     body, because the search box above the content draws rows the moment it is typed into. -->
${icons.spriteHtml()}
<a class="skip-link" href="#main">Skip to content</a>

<header>
  ${sidebarToggle(sidebar)}<span class="site-title"><a href="${attr(homeUrl || routes.home())}">${siteLogo(logo, logoDark)}<span class="site-name">${escape(siteName)}</span></a></span>
  <form action="${attr(routes.search())}" method="get" role="search">
    <label class="skip-link" for="search">Search the API</label>
    <!-- The index and the scope ride on the box itself, so it can answer as you type on any page
         and not only on the one that happens to carry a results list.

         The scope is the slug, not the name: the index keys its assemblies by slug, and a name here
         matched none of them, so every page but the search page quietly searched the whole API. -->
    <!-- data-ns is what keeps a result opened from a namespace-mode page in that mode: the index is
         built once in the plain shape, and this is the flag put back on the row's url. Absent on
         every other page, where the plain shape is the right one; a page that swaps its tree for
         the mode sets it on itself. -->
    <input type="search" id="search" name="q" placeholder="Search"
           value="${attr(currentQuery)}" autocomplete="off"
           data-index-url="${attr(routes.asset('search.json'))}"
           data-scope="${attr(currentAssembly ? slugify(currentAssembly) : '')}"${
             routes.modeSuffix ? `\n           data-ns="${attr(routes.modeSuffix)}"` : ''
           }>
    ${
      // Carries the assembly being read into the search, so the box searches what the selector
      // beside it says. Nothing on a page that belongs to no assembly, which searches everything.
      currentAssembly
        ? `<input type="hidden" name="a" value="${attr(slugify(currentAssembly))}">`
        : ''
    }
    <svg class="nav-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5l-1.5 1.5l-5-5v-.79l-.27-.27A6.52 6.52 0 0 1 9.5 16A6.5 6.5 0 0 1 3 9.5A6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14S14 12 14 9.5S12 5 9.5 5"/>
    </svg>
    <!-- The magnifier's corner while the box holds anything: pressing it empties the box through
         the same input path a keystroke takes, so the dropdown and the search page's url follow. -->
    <button type="button" class="nav-search-clear" id="nav-search-clear" aria-label="Clear search">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <g transform="matrix(1.0625,0,0,1.0625,4,3)">
          <path fill="currentColor" fill-rule="evenodd" d="M8,16C12.389,16 16,12.389 16,8C16,3.611 12.389,0 8,0C3.611,0 -0,3.611 0,8C0,12.389 3.611,16 8,16M4.22,4.22C4.511,3.929 4.989,3.929 5.28,4.22L8,6.94L10.72,4.22C10.862,4.068 11.061,3.981 11.269,3.981C11.68,3.981 12.019,4.32 12.019,4.731C12.019,4.939 11.932,5.138 11.78,5.28L9.06,8L11.78,10.72C11.932,10.862 12.019,11.061 12.019,11.269C12.019,11.68 11.68,12.019 11.269,12.019C11.061,12.019 10.862,11.932 10.72,11.78L8,9.06L5.28,11.78C5.141,11.909 4.958,11.981 4.769,11.981C4.357,11.981 4.019,11.643 4.019,11.231C4.019,11.042 4.091,10.859 4.22,10.72L6.94,8L4.22,5.28C3.929,4.989 3.929,4.511 4.22,4.22"/>
        </g>
      </svg>
    </button>
    <!-- Filled as you type, on every page but the search page, which shows the full list itself. -->
    <div class="nav-results" id="nav-results" role="listbox" aria-label="Search results" hidden></div>
  </form>
  ${assemblySelector(assemblies, currentAssembly, routes, assemblyUrl)}
  ${versionSelector(versions)}
  <button id="theme-toggle" type="button" aria-label="Switch to light theme">
    <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>
    </svg>
    <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>
    </svg>
  </button>
</header>

<div class="layout">
${
  sidebar
    ? `  <aside class="sidebar" id="sidebar" aria-label="Navigation" data-tree="${attr(treeKey)}"${
        treeSrc ? ` data-tree-src="${attr(treeSrc)}"` : ''
      }>
${sidebar}
  </aside>
${
  // Inert until the script adopts it, so the second tree costs no drawing and no duplicate ids.
  sidebarAlt
    ? `  <template id="ns-tree" data-tree="namespaces" data-tree-src="${attr(routes.asset('tree-namespaces.json'))}">
${sidebarAlt}
  </template>
`
    : ''
}  <div class="resize-handle" id="resize-handle" role="separator" aria-orientation="vertical"></div>`
    : ''
}
  <main class="main-content" id="main">
${
  // Held together in one block so they stick as one. Both are controls for what is under them -
  // where you are, and what is shown - and neither is any use scrolled off the top.
  stickyTop ? `  <div class="main-sticky">\n${stickyTop}\n  </div>` : ''
}
${body}
  </main>
  <!-- Filled by the script when an Examples link is followed, and left out of the flow until then.
       The link it comes from is a real page, so nothing here is needed for the examples to be
       readable - this only saves the trip. -->
  <aside class="example-dock hidden" id="example-dock" aria-label="Examples" aria-live="polite">
    <div class="example-resize" id="example-resize" role="separator" aria-orientation="vertical"></div>
    <div class="example-dock-head">
      <span class="example-dock-title" id="example-dock-title"></span>
      <a class="example-dock-open" id="example-dock-open" href="#" target="_blank" rel="noopener" title="Open these examples in a new tab">Open Tab</a>
      <button type="button" class="example-dock-close" id="example-dock-close" aria-label="Close examples">&times;</button>
    </div>
    <div class="example-dock-body" id="example-dock-body"></div>
  </aside>
</div>

<script src="${attr(routes.asset('app.js'))}" defer></script>
</body>
</html>
`;
}

/**
 * The header's sidebar toggle, first in the bar so it sits against the column it acts on.
 *
 * Only on pages that carry a sidebar; anywhere else there is nothing to toggle. aria-expanded is
 * written as shown, which is what a page without the script has; the script corrects it where a
 * hidden column was remembered. The mark is Octicons' three-bars, drawn rather than typed: a glyph
 * sits on a baseline and lands low in a square button, while a viewBox centres on the geometry.
 */
function sidebarToggle(sidebar) {
  if (!sidebar) return '';

  return (
    '<button id="sidebar-toggle" type="button" title="Toggle sidebar" ' +
    'aria-label="Toggle sidebar" aria-controls="sidebar" aria-expanded="true">' +
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z"/></svg></button>'
  );
}

/**
 * The header mark, written out raw: both arrive already run through inlineSvg, which is what makes
 * them the one thing on the page that is not escaped.
 *
 * A dark variant is optional. With one svg it is used under both themes; with two, both are in the
 * markup and CSS shows whichever matches the theme attribute. Choosing in CSS rather than in
 * JavaScript means the right mark is painted the first time, with no swap on load.
 */
function siteLogo(logo, logoDark) {
  if (!logo && !logoDark) return '';
  if (!logo || !logoDark) return `<span class="site-logo">${logo || logoDark}</span>`;

  return (
    `<span class="site-logo site-logo-light">${logo}</span>` +
    `<span class="site-logo site-logo-dark">${logoDark}</span>`
  );
}

/**
 * Tabs that filter a list of types - a namespace, an assembly, a page of search results - by the
 * letter each row filters under.
 *
 * It renders inside the content column rather than in the chrome above it, because it acts on this
 * page and nothing else: the state resets on navigation, and the script it drives only ever looks
 * inside .main-content.
 */
function filterBar({ kinds = null, live = false, extra = '' } = {}) {
  // A bar the script maintains, because what is under it is a query's answer and the next query has
  // a different set of kinds in it. Every button is rendered and the ones this answer has nothing
  // under are marked hidden: a button that has to come back when the query changes has to be in the
  // page to come back, which is the one thing leaving it out would make impossible.
  if (live) return tabsHtml(FILTER_KINDS, extra, kinds || new Set());

  // Only the letters this page actually renders. A namespace holds no methods, so offering every
  // button everywhere means most of them do nothing when pressed.
  const available = FILTER_KINDS.filter((kind) => kind.key === 'all' || !kinds || kinds.has(kind.key));
  return tabsHtml(available, extra);
}

/**
 * The type page's tabs, which narrow one type's members rather than a list of types.
 *
 * The same row in the same script's hands, filtering on the same attribute; what differs is the
 * vocabulary, which is theme's MEMBER_FILTERS rather than its letters. A type page puts the row in
 * its own head, where it ends up sitting on the line the member list starts under.
 *
 * Member kinds go in, not filter keys: which tabs a page offers and how the first of them is worded
 * are both read off what the type actually lists - what it inherits as well as what it declares,
 * since both are listed under it. See memberFilterTabs.
 */
function memberFilterBar({ kinds = new Set(), extra = '' } = {}) {
  return tabsHtml(memberFilterTabs(kinds), extra);
}

/**
 * @param {Array}       tabs     the buttons to write, in the order they are read
 * @param {string}      extra    markup that shares the bar - a legend, a picker
 * @param {Set<string>} offered  which keys have anything under them, where that is not every one
 *                               rendered; the rest are written hidden for a script to reveal
 */
function tabsHtml(tabs, extra, offered = null) {
  // 'All' plus one kind is not a choice, so the tabs are dropped - but a bar something else
  // shares still renders for that something: the toggles at its right end act on the list
  // whatever kinds it holds.
  const withTabs = tabs.length >= 3;
  if (!withTabs && !extra) return '';

  // Nothing is painted here: 'All' opens active, and the stylesheet knows what that looks like.
  // The kinds are coloured by the script, from the same palette their badges are drawn from.
  const buttons = tabs.map((kind) => {
    const active = kind.key === 'all';
    const empty = offered !== null && !active && !offered.has(kind.key);
    return (
      `<button type="button" class="filter-btn${active ? ' active' : ''}"${empty ? ' hidden' : ''} ` +
      `data-kind="${attr(kind.key)}">${escape(kind.label)}</button>`
    );
  }).join('');

  // The same rule as above, applied to what is on the page rather than to what was built: one kind
  // and All narrow to the same list, so the bar waits until there are two to choose between.
  const idle = offered !== null && offered.size < 2;

  return `<div class="filter-bar"${idle ? ' hidden' : ''}>
  ${withTabs ? buttons : ''}
  ${extra}
</div>`;
}

/**
 * The header's assembly picker. Changing it goes wherever urlFor says, which is that assembly's
 * page by default; the first entry widens back out to everything.
 *
 * The search page overrides urlFor so the picker re-runs the query in the chosen assembly rather
 * than navigating away from the results.
 */
function assemblySelector(assemblies, currentAssembly, routes, urlFor) {
  // A picker with one assembly in it offers a choice between that assembly and everything, which
  // is the same set. The site title already goes home, so nothing here is otherwise unreachable.
  if (!assemblies || assemblies.length < 2) return '';

  const target = urlFor || ((name) => (name ? routes.assembly(name) : routes.home()));

  // Alphabetical, on a copy: the model's order is the order the projects were named in, which is a
  // fact about the command line rather than anything a reader looking for a name can use. Entire
  // API is prepended after the sort, so it stays at the top where it is the widest choice.
  const sorted = [...assemblies].sort((a, b) => a.localeCompare(b));

  const options = [`<option value="${attr(target(''))}">Entire API</option>`].concat(
    sorted.map((name) => {
      const selected = name === currentAssembly ? ' selected' : '';
      return `<option value="${attr(target(name))}"${selected}>${escape(name)}</option>`;
    })
  );

  return (
    '<label class="skip-link" for="asm-filter">Jump to assembly</label>' +
    `<select id="asm-filter">${options.join('')}</select>`
  );
}

/**
 * A version as the site writes it: 'v' and the number, since a bare 9 in the header reads as a
 * count of something rather than as a version.
 *
 * A version that already starts with a letter is left as it was written - '--api-versions V9' is a
 * deliberate spelling, and prefixing it again would give 'vV9'. Only what is shown changes; what a
 * <since> is compared against is the entry itself.
 */
function versionLabel(version) {
  return /^\d/.test(version) ? `v${version}` : version;
}

/**
 * The header's API version picker: the versions --api-versions named, newest first, the first of
 * them selected. Nothing at all where none were named, which is most sites.
 *
 * Each entry is the label and what a <since> is compared against both, so naming them '9' or '2.1'
 * is a matter of what the reader should see rather than of what owl will accept. Selecting one
 * hides anything a <since> puts after it, which is why an untagged API belongs to every version
 * rather than to none.
 *
 * One version is written as a label rather than a menu. A menu of one offers the reader a choice
 * they have already been given, but dropping it altogether would drop the filtering with it - a
 * site pinned to a single older version still has to hide what came after it - and would leave the
 * header saying nothing about which version is being read.
 *
 * A native select rather than a scripted menu, so it keeps the platform's keyboard and touch
 * behaviour; only the closed control is styled, since the popup belongs to the OS.
 */
function versionSelector(versions) {
  if (versions.length === 0) return '';

  if (versions.length === 1) {
    return (
      `<span id="version-current" title="API version" data-version="${attr(versions[0])}">` +
      `${escape(versionLabel(versions[0]))}</span>`
    );
  }

  const options = versions
    .map(
      (version, i) =>
        `<option value="${attr(version)}"${i === 0 ? ' selected' : ''}>` +
        `${escape(versionLabel(version))}</option>`
    )
    .join('');

  return (
    '<label class="skip-link" for="version-filter">API version</label>' +
    `<select id="version-filter" title="API version">${options}</select>`
  );
}

/* No home crumb at the root of the trail: the site name in the header is the way home, and a
   trail that repeats it spends its first step saying what the header already says. */
function renderBreadcrumbs(breadcrumbs) {
  if (!breadcrumbs || breadcrumbs.length === 0) return '';

  const items = breadcrumbs
    .map((crumb, i) => {
      const last = i === breadcrumbs.length - 1;
      const label = (crumb.icon ? icons.iconHtml(crumb.icon) : '') + escape(crumb.label);
      return last
        ? `<li aria-current="page">${label}</li>`
        : `<li><a href="${attr(crumb.url)}">${label}</a></li>`;
    })
    .join('');

  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

module.exports = {
  page,
  filterBar,
  memberFilterBar,
  assemblySelector,
  versionLabel,
  DEFAULT_SITE_NAME,
};
