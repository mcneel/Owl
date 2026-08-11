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
 * Versions the header offers, newest first; the first is the default.
 *
 * Selecting a version hides anything a <since> puts after it, so an untagged API belongs to every
 * version. Adding an older one back is this list plus nothing else.
 */
const VERSIONS = ['9'];

/**
 * @param {object} options
 *   title        page title, without the site suffix
 *   siteName     site name, used as the title suffix and in the header
 *   logo         inlined SVG shown before the site name, or ''
 *   logoDark     inlined SVG for the dark theme; optional, logo covers both without it
 *   description  meta description, plain text
 *   canonical    root-relative url of this page
 *   breadcrumbs  [{label, url}] innermost last
 *   body         main content HTML
 *   sidebar      optional sidebar HTML (renders the tree column)
 *   treeKey      identifies the tree, so its expanded groups are remembered per shape rather
 *                than smeared across every assembly's
 *   filterBar    optional filter bar HTML
 *   routes       Routes instance
 *   homeUrl      where the site name and the home crumb point; the root, unless it only redirects
 *   siteUrl      absolute origin, when configured
 *   jsonLd       extra JSON-LD object
 *   noindex      keep this page out of search results
 *   bodyClass    class on <body>, for the few rules that are page-specific
 *   currentQuery prefill for the header search box
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
    treeKey = '',
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
   the next, so the site opens as the system says every time and no choice outlives the tab. */
(function(){try{var t=sessionStorage.getItem('docs-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
</script>
</head>
<body${bodyClass ? ` class="${attr(bodyClass)}"` : ''}>
<!-- The kind drawings, declared once so the rows that wear them are a reference each. First in the
     body, because the search box above the content draws rows the moment it is typed into. -->
${icons.spriteHtml()}
<a class="skip-link" href="#main">Skip to content</a>

<header>
  <span class="site-title"><a href="${attr(homeUrl || routes.home())}">${siteLogo(logo, logoDark)}<span class="site-name">${escape(siteName)}</span></a></span>
  <form action="${attr(routes.search())}" method="get" role="search">
    <label class="skip-link" for="search">Search the API</label>
    <!-- The index and the scope ride on the box itself, so it can answer as you type on any page
         and not only on the one that happens to carry a results list.

         The scope is the slug, not the name: the index keys its assemblies by slug, and a name here
         matched none of them, so every page but the search page quietly searched the whole API. -->
    <!-- data-ns is what keeps a result opened from a namespace-mode page in that mode: the index is
         built once in the plain shape, and this is the segment put back on the row's url. Absent on
         every other page, where the plain shape is the right one. -->
    <input type="search" id="search" name="q" placeholder="Search"
           value="${attr(currentQuery)}" autocomplete="off"
           data-index-url="${attr(routes.asset('search.json'))}"
           data-scope="${attr(currentAssembly ? slugify(currentAssembly) : '')}"${
             routes.modeInsert ? `\n           data-ns="${attr(routes.modeInsert)}"` : ''
           }>
    ${
      // Carries the assembly being read into the search, so the box searches what the selector
      // beside it says. Nothing on a page that belongs to no assembly, which searches everything.
      currentAssembly
        ? `<input type="hidden" name="a" value="${attr(slugify(currentAssembly))}">`
        : ''
    }
    <svg class="nav-search-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5 14 14"/>
    </svg>
    <!-- Filled as you type, on every page but the search page, which shows the full list itself. -->
    <div class="nav-results" id="nav-results" role="listbox" aria-label="Search results" hidden></div>
  </form>
  ${assemblySelector(assemblies, currentAssembly, routes, assemblyUrl)}
  ${versionSelector()}
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
    ? `  <aside class="sidebar" id="sidebar" aria-label="Navigation" data-tree="${attr(treeKey)}">
${sidebar}
  </aside>
  <div class="resize-handle" id="resize-handle" role="separator" aria-orientation="vertical"></div>`
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
function filterBar({ kinds = null, extra = '' } = {}) {
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

function tabsHtml(tabs, extra) {
  // 'All' plus one kind is not a choice, so there is nothing to put a bar around.
  if (tabs.length < 3) return '';

  // Nothing is painted here: 'All' opens active, and the stylesheet knows what that looks like.
  // The kinds are coloured by the script, from the same palette their badges are drawn from.
  const buttons = tabs.map((kind) => {
    const active = kind.key === 'all';
    return (
      `<button type="button" class="filter-btn${active ? ' active' : ''}" ` +
      `data-kind="${attr(kind.key)}">${escape(kind.label)}</button>`
    );
  }).join('');

  return `<div class="filter-bar">
  ${buttons}
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

  const options = [`<option value="${attr(target(''))}">Entire API</option>`].concat(
    assemblies.map((name) => {
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
 * The header's API version picker.
 *
 * A native select rather than a scripted menu, so it keeps the platform's keyboard and touch
 * behaviour; only the closed control is styled to match docify's, since the popup belongs to the OS.
 */
function versionSelector() {
  if (VERSIONS.length === 0) return '';

  const options = VERSIONS.map(
    (version, i) =>
      `<option value="${attr(version)}"${i === 0 ? ' selected' : ''}>V${escape(version)}</option>`
  ).join('');

  return (
    '<label class="skip-link" for="version-filter">API version</label>' +
    `<select id="version-filter" title="API version">${options}</select>`
  );
}

/** mdi's house, the mark docify uses for the root of a trail. */
const HOME_ICON =
  '<svg class="crumb-home" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>';

function renderBreadcrumbs(breadcrumbs) {
  if (!breadcrumbs || breadcrumbs.length === 0) return '';

  const items = breadcrumbs
    .map((crumb, i) => {
      const last = i === breadcrumbs.length - 1;

      // A crumb can be drawn instead of written. The label still travels with it, as the
      // accessible name and as the name the JSON-LD carries.
      const body = crumb.icon === 'home' ? HOME_ICON : escape(crumb.label);
      const named = crumb.icon ? ` aria-label="${attr(crumb.label)}"` : '';

      return last
        ? `<li aria-current="page"${named}>${body}</li>`
        : `<li><a href="${attr(crumb.url)}"${named}>${body}</a></li>`;
    })
    .join('');

  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

module.exports = { page, filterBar, memberFilterBar, assemblySelector, DEFAULT_SITE_NAME };
