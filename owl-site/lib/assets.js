'use strict';

/**
 * The site's CSS and client JavaScript, served from /assets/ so the browser caches them once for the
 * whole site instead of paying for them on every navigation.
 *
 * The stylesheet is written entirely in terms of theme variables, so light and dark differ only in
 * the variable block and a new page type cannot drift out of the palette.
 *
 * Nothing loads from a CDN, which is what makes an exported site work with no network at all.
 * Syntax highlighting is done when the page is rendered, not in the browser.
 */

const fs = require('node:fs');
const path = require('node:path');

const { ID_PREFIX: ICON_PREFIX } = require('./icons');
const { BADGE_PAINTS, CHIP_PAINTS } = require('./theme');

/**
 * What MathML needs to draw correctly, from the converter that writes it.
 *
 * Read from the vendored file rather than pasted in here, so updating Temml is a matter of dropping
 * two files in and nothing else. It is browser-correction rules and class names its output uses;
 * the fonts are the reader's own, so this fetches nothing. See lib/vendor/README.md.
 */
const TEMML_CSS = fs.readFileSync(path.join(__dirname, 'vendor', 'temml.css'), 'utf8').trim();

/** A palette from lib/theme.js, written out as one custom property per slot. */
function paintCss(prefix, paints) {
  return Object.keys(paints)
    .map((slot) => `  --${prefix}-${slot}: ${paints[slot]};`)
    .join('\n');
}

const CSS = `
/* ---- Open Color (yeun.github.io/open-color) ----
   The whole palette, so a colour is chosen from a scale rather than invented, and so nothing
   below has to carry a raw hex. Not theme-dependent: these are the paints, the two blocks
   underneath decide which ones this site uses where. */
:root {
  --oc-white: #ffffff; --oc-black: #000000;
  --oc-gray-0: #f8f9fa; --oc-gray-1: #f1f3f5; --oc-gray-2: #e9ecef; --oc-gray-3: #dee2e6; --oc-gray-4: #ced4da; --oc-gray-5: #adb5bd; --oc-gray-6: #868e96; --oc-gray-7: #495057; --oc-gray-8: #343a40; --oc-gray-9: #212529;
  --oc-red-0: #fff5f5; --oc-red-1: #ffe3e3; --oc-red-2: #ffc9c9; --oc-red-3: #ffa8a8; --oc-red-4: #ff8787; --oc-red-5: #ff6b6b; --oc-red-6: #fa5252; --oc-red-7: #f03e3e; --oc-red-8: #e03131; --oc-red-9: #c92a2a;
  --oc-pink-0: #fff0f6; --oc-pink-1: #ffdeeb; --oc-pink-2: #fcc2d7; --oc-pink-3: #faa2c1; --oc-pink-4: #f783ac; --oc-pink-5: #f06595; --oc-pink-6: #e64980; --oc-pink-7: #d6336c; --oc-pink-8: #c2255c; --oc-pink-9: #a61e4d;
  --oc-grape-0: #f8f0fc; --oc-grape-1: #f3d9fa; --oc-grape-2: #eebefa; --oc-grape-3: #e599f7; --oc-grape-4: #da77f2; --oc-grape-5: #cc5de8; --oc-grape-6: #be4bdb; --oc-grape-7: #ae3ec9; --oc-grape-8: #9c36b5; --oc-grape-9: #862e9c;
  --oc-violet-0: #f3f0ff; --oc-violet-1: #e5dbff; --oc-violet-2: #d0bfff; --oc-violet-3: #b197fc; --oc-violet-4: #9775fa; --oc-violet-5: #845ef7; --oc-violet-6: #7950f2; --oc-violet-7: #7048e8; --oc-violet-8: #6741d9; --oc-violet-9: #5f3dc4;
  --oc-indigo-0: #edf2ff; --oc-indigo-1: #dbe4ff; --oc-indigo-2: #bac8ff; --oc-indigo-3: #91a7ff; --oc-indigo-4: #748ffc; --oc-indigo-5: #5c7cfa; --oc-indigo-6: #4c6ef5; --oc-indigo-7: #4263eb; --oc-indigo-8: #3b5bdb; --oc-indigo-9: #364fc7;
  --oc-blue-0: #e7f5ff; --oc-blue-1: #d0ebff; --oc-blue-2: #a5d8ff; --oc-blue-3: #74c0fc; --oc-blue-4: #4dabf7; --oc-blue-5: #339af0; --oc-blue-6: #228be6; --oc-blue-7: #1c7ed6; --oc-blue-8: #1971c2; --oc-blue-9: #1864ab;
  --oc-cyan-0: #e3fafc; --oc-cyan-1: #c5f6fa; --oc-cyan-2: #99e9f2; --oc-cyan-3: #66d9e8; --oc-cyan-4: #3bc9db; --oc-cyan-5: #22b8cf; --oc-cyan-6: #15aabf; --oc-cyan-7: #1098ad; --oc-cyan-8: #0c8599; --oc-cyan-9: #0b7285;
  --oc-teal-0: #e6fcf5; --oc-teal-1: #c3fae8; --oc-teal-2: #96f2d7; --oc-teal-3: #63e6be; --oc-teal-4: #38d9a9; --oc-teal-5: #20c997; --oc-teal-6: #12b886; --oc-teal-7: #0ca678; --oc-teal-8: #099268; --oc-teal-9: #087f5b;
  --oc-green-0: #ebfbee; --oc-green-1: #d3f9d8; --oc-green-2: #b2f2bb; --oc-green-3: #8ce99a; --oc-green-4: #69db7c; --oc-green-5: #51cf66; --oc-green-6: #40c057; --oc-green-7: #37b24d; --oc-green-8: #2f9e44; --oc-green-9: #2b8a3e;
  --oc-lime-0: #f4fce3; --oc-lime-1: #e9fac8; --oc-lime-2: #d8f5a2; --oc-lime-3: #c0eb75; --oc-lime-4: #a9e34b; --oc-lime-5: #94d82d; --oc-lime-6: #82c91e; --oc-lime-7: #74b816; --oc-lime-8: #66a80f; --oc-lime-9: #5c940d;
  --oc-yellow-0: #fff9db; --oc-yellow-1: #fff3bf; --oc-yellow-2: #ffec99; --oc-yellow-3: #ffe066; --oc-yellow-4: #ffd43b; --oc-yellow-5: #fcc419; --oc-yellow-6: #fab005; --oc-yellow-7: #f59f00; --oc-yellow-8: #f08c00; --oc-yellow-9: #e67700;
  --oc-orange-0: #fff4e6; --oc-orange-1: #ffe8cc; --oc-orange-2: #ffd8a8; --oc-orange-3: #ffc078; --oc-orange-4: #ffa94d; --oc-orange-5: #ff922b; --oc-orange-6: #fd7e14; --oc-orange-7: #f76707; --oc-orange-8: #e8590c; --oc-orange-9: #d9480f;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- Theme variables: the only place a colour is chosen ---- */
/* The greys are docify's dark palette: its page is #1d1d1d and its surfaces, borders and muted text
   come from Tailwind's neutral ramp, which has no hue in it at all. The light theme is the same ramp
   read from the other end, for the same reason: the site's own colours are few and they say
   something, so a page that carried a tint of its own would be saying something too. */
:root[data-theme="dark"] {
  --bg:          #1d1d1d;
  --bg-home:     #1d1d1d;
  --bg2:         #262626;
  --bg3:         #333333;
  --bg4:         #3d3d3d;
  --border:      #333333;
  --border2:     #404040;
  --text:        #e6e6e6;
  --text2:       #d4d4d4;
  --text3:       #a3a3a3;
  --text4:       #737373;
  --card-bg:     #262626;
  --card-border: #333333;
  --card-hover:  #2e2e2e;
  --card-detail: #1b1b1b;
  --card-split:  #2b2b2b;
  --fullname:    #737373;
  /* Light against a dark page, where the light theme's kind ink is dark against a light one: a
     drawing has to sit above its ground either way. Its text goes the other way for the same
     reason - see --kind-ink. */
  --kind:        var(--oc-gray-4);
  --kind-ink:    var(--oc-gray-9);
  --flash:       #2196f3;
  --scrollbar:   #404040;
  --tok-keyword: #c4a7fd;
  --tok-string:  #7ee2b0;
  --tok-comment: #8a8a8a;
  --tok-number:  #fbbf77;
  --tok-meta:    #d8b4fe;
  --tok-type:    #7dd3fc;
  --tok-func:    #dcdcaa;
  --tok-punct:   #9e9e9e;
  --ext-ref:     #9a9a9a;
  --mark-bg:     var(--oc-yellow-4);
  --mark-fg:     var(--oc-gray-9);
  --accent:      #2196f3;
}
:root[data-theme="light"] {
  --bg:          #f8f8f8;
  --bg-home:     #ffffff;
  --bg2:         #ffffff;
  --bg3:         #f1f1f1;
  --bg4:         #e8e8e8;
  --border:      #e5e5e5;
  --border2:     #d4d4d4;
  --text:        #262626;
  --text2:       #3d3d3d;
  --text3:       #737373;
  --text4:       #a3a3a3;
  --card-bg:     #ffffff;
  --card-border: #e5e5e5;
  --card-hover:  #f8f8f8;
  --card-detail: #fbfbfb;
  --card-split:  #efefef;
  --fullname:    #a3a3a3;
  --kind:        var(--oc-gray-7);
  --kind-ink:    var(--oc-white);
  --flash:       #0ea5e9;
  --scrollbar:   #d4d4d4;
  --tok-keyword: #7c3aed;
  --tok-string:  #0a7c52;
  --tok-comment: #64748b;
  --tok-number:  #b45309;
  --tok-meta:    #9333ea;
  --tok-type:    #0369a1;
  --tok-func:    #795e26;
  --tok-punct:   #64748b;
  --ext-ref:     #5b7086;
  --mark-bg:     var(--oc-yellow-2);
  --mark-fg:     var(--oc-gray-9);
  --accent:      #1364c4;
}

/* ---- Badge colours ----
   Written from lib/theme.js, so the palette is stated once and every badge, filter pill and search
   row reads it from here rather than carrying a colour of its own. Outside the two theme blocks
   because a badge means the same thing under either one; the kind ink is the one that needed saying
   twice, and it is up there with --flash. */
:root {
${paintCss('badge', BADGE_PAINTS)}
${paintCss('chip', CHIP_PAINTS)}
}

/* The header keeps one colour under both themes: it is chrome rather than content, and holding it
   fixed is what makes the light and dark pages read as the same site. Taken from docify. */
:root {
  --nav-bg:      #353535;
  --nav-fg:      #ffffff;
  --nav-field:   rgba(255, 255, 255, 0.15);
  --nav-focus:   rgba(255, 255, 255, 0.25);
  --nav-hover:   rgba(255, 255, 255, 0.10);
  --nav-dim:     rgba(255, 255, 255, 0.60);
  --nav-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
}

body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); display: flex; flex-direction: column; height: 100vh; overflow: hidden; transition: background 0.2s, color 0.2s; }
/* The landing page is a sheet of prose with no cards or panels on it, so it does without the faint
   tint the other pages need to hold theirs. --bg-home matches --bg under the dark theme. */
body.home { background: var(--bg-home); }

.skip-link { position: absolute; left: -9999px; top: 0; z-index: 100; background: var(--bg2); color: var(--text); padding: 0.5rem 1rem; border: 1px solid var(--border2); }
.skip-link:focus { left: 0; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--flash); outline-offset: 2px; }

/* ---- Header ---- */
header { background: var(--nav-bg); color: var(--nav-fg); padding: 0.6rem 0.9rem; display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; z-index: 20; }
header h1, header .site-title { font-size: 1.05rem; font-weight: 500; flex: 1; min-width: 0; }
header .site-title a { display: flex; align-items: center; gap: 0.5rem; min-width: 0; padding: 0.2rem 0.4rem; border-radius: 4px; color: var(--nav-fg); text-decoration: none; }
header .site-title a:hover { background: var(--nav-hover); color: var(--nav-fg); }
header .site-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Sized here rather than trusted from the file, so any logo.svg lands at the same height. An SVG
   drawn with currentColor inherits the header colour, including the hover. */
.site-logo { display: inline-flex; align-items: center; flex-shrink: 0; }
.site-logo svg { display: block; width: 1.4rem; height: 1.4rem; }
/* Both variants ship in the markup when a dark one was given; only one is ever laid out, so the
   hidden one costs no gap in the flex row. */
:root[data-theme="dark"] .site-logo-light, :root[data-theme="light"] .site-logo-dark { display: none; }
/* One height for the whole header row. Set here rather than left to each control's own padding,
   because a select, an input and a button each size themselves differently. Vertical padding is
   dropped in favour of centring, so the height is exactly what it says. */
#asm-filter, #search, #version-filter, #theme-toggle { height: 30px; }

/* The magnifier sits inside the field, so the field owns the position it is measured against. */
header form[role="search"] { position: relative; display: flex; align-items: center; flex-shrink: 0; }
#search { width: 16rem; padding: 0 2rem 0 0.7rem; border: none; border-radius: 4px; background: var(--nav-field); color: var(--nav-fg); font-size: 0.85rem; outline: none; }
#search::placeholder { color: var(--nav-dim); }
#search:focus { background: var(--nav-focus); }
/* type=search draws a platform clear button; the magnifier already occupies that corner. */
#search::-webkit-search-cancel-button, #search::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
.nav-search-icon { position: absolute; right: 0.55rem; top: 50%; transform: translateY(-50%); width: 0.95rem; height: 0.95rem; pointer-events: none; fill: none; stroke: var(--nav-dim); stroke-width: 2; stroke-linecap: round; }

/* ---- Header search results ----
   Hangs off the form, which is the positioned element, and takes the page's colours rather than
   the header's: it is content the header happens to be pointing at, not part of the bar. */
.nav-results { position: absolute; top: calc(100% + 0.35rem); left: 0; width: 30rem; max-width: 80vw; max-height: 70vh; overflow-y: auto; z-index: 40; background: var(--bg2); border: 1px solid var(--border2); border-radius: 5px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28); padding: 0.25rem; }
.nav-results[hidden] { display: none; }
.nav-result { display: flex; align-items: center; gap: 0.45rem; padding: 0.35rem 0.5rem; border-radius: 4px; font-size: 0.82rem; color: var(--text); text-decoration: none; }
.nav-result:hover, .nav-result.active { background: var(--bg3); }
.nav-result-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Pushed to the far end and allowed to shrink first, so a long namespace never crowds the name. */
.nav-result-ns { margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 0.7rem; color: var(--text4); }
.nav-results-more { display: block; margin-top: 0.15rem; padding: 0.4rem 0.5rem; border-top: 1px solid var(--border); font-size: 0.76rem; color: var(--text3); text-decoration: none; }
.nav-results-more:hover { color: var(--flash); }
.nav-empty { padding: 0.5rem; font-size: 0.82rem; color: var(--text3); }

/* ---- Header selects ---- */
/* appearance:none drops the platform arrow so both selects can carry the same chevron; the popup
   itself is still drawn by the OS, which is the one part of docify's menu a <select> cannot copy. */
#asm-filter, #version-filter { appearance: none; -webkit-appearance: none; border: none; border-radius: 4px; padding: 0 1.5rem 0 0.65rem; font-size: 0.82rem; font-weight: 500; cursor: pointer; outline: none; flex-shrink: 0; background-color: var(--accent); color: #ffffff; background-image: var(--nav-chevron); background-repeat: no-repeat; background-position: right 0.4rem center; background-size: 0.75rem; }
#asm-filter { max-width: 18rem; }
#asm-filter:hover, #version-filter:hover { filter: brightness(1.1); }
/* The popup is an OS menu, so its options need colours that do not assume the dark bar. */
#asm-filter option, #version-filter option { background: var(--bg2); color: var(--text); }

/* ---- Theme toggle ---- */
/* Given the same face as the search field, so it reads as a control rather than a loose glyph. */
#theme-toggle { display: inline-flex; align-items: center; justify-content: center; width: 30px; padding: 0; border: none; border-radius: 4px; background: var(--nav-field); color: var(--nav-fg); cursor: pointer; flex-shrink: 0; }
#theme-toggle:hover { background: var(--nav-focus); }
#theme-toggle svg { display: block; width: 1.05rem; height: 1.05rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
/* Both icons ship; CSS picks by theme, so the button is right on the first frame with no swap.
   The id has to be repeated here: without it #theme-toggle svg outranks this and shows both. */
:root[data-theme="dark"] #theme-toggle .icon-sun,
:root[data-theme="light"] #theme-toggle .icon-moon { display: none; }

/* ---- Filter bar ---- */
/* Lives in the content column, so it takes that column's width and none of the header's padding.
   Drawn as the tabs the example panel uses for its languages: both rows say what the block under
   them shows, and one shape for the two is one thing to learn. The kind's colour goes on the marker
   rather than the label, because a constructor's grey reads as a marker and not as legible text. */
.filter-bar { margin-bottom: 1.1rem; display: flex; gap: 0.25rem; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.filter-btn { appearance: none; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 0.4rem 0.8rem; font: inherit; font-size: 0.82rem; font-weight: 500; color: var(--text3); cursor: pointer; }
.filter-btn:hover { color: var(--text); }
/* A kind's tab is underlined in the ink the marks it filters are drawn in, so the tab and its rows
   read as one thing and follow a retuned palette together. All filters nothing in particular and
   keeps the accent. */
.filter-btn.active { color: var(--text); border-bottom-color: var(--kind); }
.filter-btn.active[data-kind="all"] { border-bottom-color: var(--flash); }
.asm-legend { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-left: 0.5rem; }
.legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: var(--text3); white-space: nowrap; text-decoration: none; }
.legend-item:hover { color: var(--text); }
.legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* ---- Layout ---- */
.layout { display: flex; flex: 1; overflow: hidden; }

/* ---- Sidebar ---- */
/* Scrolls, but never draws a bar: the tree is a narrow column and a gutter inside it costs more
   than it tells you. The three properties cover Firefox, old Edge and the WebKit/Blink family. */
.sidebar { width: 280px; min-width: 150px; max-width: 600px; background: var(--bg2); overflow-y: auto; overflow-x: hidden; scrollbar-width: none; -ms-overflow-style: none; flex-shrink: 0; }
.sidebar::-webkit-scrollbar { display: none; }
.sidebar-toolbar { padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--border); display: flex; gap: 0.4rem; align-items: center; }
#tree-search { flex: 1; min-width: 0; padding: 0.35rem 0.6rem; border-radius: 5px; border: 1px solid var(--border2); background: var(--bg); color: var(--text); font-size: 0.8rem; outline: none; }
#tree-search::placeholder { color: var(--text4); }
#collapse-all-btn { flex-shrink: 0; background: var(--bg3); border: 1px solid var(--border2); color: var(--text2); width: 1.8rem; height: 1.8rem; padding: 0; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
#collapse-all-btn:hover { background: var(--bg4); }
#collapse-all-btn svg { display: block; width: 0.9rem; height: 0.9rem; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
.resize-handle { width: 4px; background: var(--border); cursor: col-resize; flex-shrink: 0; transition: background 0.15s; user-select: none; -webkit-user-select: none; }
.resize-handle:hover, .resize-handle.dragging { background: var(--flash); }

/* ---- Tree ---- */
.tree-ns { border-bottom: 1px solid var(--border); }
/* Sits above the groups rather than inside one, so it gets the group row's padding back. */
.tree-overview .tree-type-label { padding: 0.5rem 0.75rem; }
.tree-ns-label { display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.72rem; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.05em; user-select: none; background: none; border: none; width: 100%; text-align: left; font-family: inherit; }
.tree-ns-label:hover { background: var(--bg3); color: var(--text); }
/* A square, so the rotation below turns about its centre and the arrow does not drift sideways. */
.tree-arrow { display: inline-flex; align-items: center; justify-content: center; width: 1rem; height: 1rem; flex-shrink: 0; transition: transform 0.15s; }
.tree-arrow svg { display: block; width: 0.85rem; height: 0.85rem; fill: currentColor; }
/* docify swaps a chevron-right for a chevron-down; rotating the one is the same picture. */
.tree-arrow.collapsed { transform: rotate(-90deg); }
.tree-arrow-spacer { display: inline-block; width: 1rem; flex-shrink: 0; }
.tree-ns-children.collapsed { display: none; }
.tree-type-label { display: flex; align-items: center; padding: 0.28rem 0.75rem; cursor: default; user-select: none; }
.tree-type-label:hover { background: var(--bg3); }
.tree-link { color: var(--text2); text-decoration: none; font-size: 0.82rem; display: flex; align-items: center; gap: 0.35rem; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tree-link:hover { color: var(--text); }
.tree-link.active { color: var(--flash); font-weight: 600; }
/* The kind drawings, on the column the lettered squares used to hold: the same box, so the tree's
   left edge is one column whether a row wears a drawing, the Overview page's mark or neither.
   Painted here rather than by whatever draws one: every kind is one ink, so a colour written onto
   each of the hundreds of icons a page carries would be the same string a hundred times over. */
.kind-icon { display: block; width: 1.1rem; height: 1.1rem; flex-shrink: 0; color: var(--kind); }
/* A step up on a card, where the name beside it is a heading rather than a row: the drawing holds
   its own against the larger text instead of sitting under it, and lands about where the word it
   replaced did. */
.member-header .kind-icon { width: 1.25rem; height: 1.25rem; }
/* Declared, never drawn. Taken out of the flow rather than hidden with display, which is the one
   thing that has ever stopped a <use> resolving. */
.icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
.tree-badge { display: inline-flex; align-items: center; justify-content: center; width: 1.1rem; height: 1.1rem; border-radius: 3px; font-size: 0.6rem; font-weight: 800; color: white; flex-shrink: 0; }
/* From the same scale as everything else, rather than the one slate left over from before it: the
   Overview mark is filled where the kinds are drawn, and that is the whole of what sets it apart. */
.tree-badge-doc { background: var(--oc-gray-8); }
/* A lettered square rather than a drawing, there being no drawing for a category: on the kind ink,
   with the ink's own text, so it sits with the marks below it under either theme. */
.tree-badge-cat { background: var(--kind); color: var(--kind-ink); }
/* The static mark: the badge's shape drawn rather than filled, so it reads as something said about
   the kind badge beside it and never as a kind of its own. */
.tree-badge-static { background: none; border: 1px solid var(--text4); color: var(--text3); }
.tree-badge svg { display: block; width: 0.72rem; height: 0.72rem; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.tree-type-children { padding-left: 0.25rem; }
.tree-type-children.collapsed { display: none; }
.tree-child-link { display: flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.75rem 0.2rem 1.75rem; color: var(--text3); text-decoration: none; font-size: 0.77rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tree-child-link:hover { background: var(--bg3); color: var(--text); }
.tree-child-link.active { color: var(--flash); }
/* One flex item holding both, so the row's gap does not open between the name and its '('. */
.tree-child-link .tree-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* A shade back from the name, so an overload's parameters read as the tiebreaker they are, with
   a hair of space in front - the row's own 0.35rem gap was far too much. */
.tree-child-link .tree-sig { color: var(--text4); margin-left: 0.12rem; }
.tree-toggle { background: none; border: none; padding: 0; cursor: pointer; color: inherit; display: inline-flex; align-items: center; }
/* Inherited rows sit in the list in their alphabetical place, drawn back to the shade the parameter
   types beside them use: there, and plainly not what this type declares. Not drawn at all until the
   arrow at the end of the type's row asks for them. */
.tree-child-inherited { display: none; color: var(--text4); }
.tree-type-children.show-inherited .tree-child-inherited { display: flex; }
/* Drawn well back, the way the row's text is: a drawing holds its own against a dimmed name far
   better than a filled square did, so what read as inherited at 0.6 now needs 0.3. */
.tree-child-inherited .kind-icon, .tree-child-inherited .tree-badge { opacity: 0.3; }
.tree-child-inherited:hover { color: var(--text2); }
/* At the end of the row, where it cannot be mistaken for the arrow that opens the type's members. */
.tree-inherited-toggle { background: none; border: none; padding: 0 0.15rem; cursor: pointer; color: var(--text4); display: inline-flex; align-items: center; flex-shrink: 0; }
.tree-inherited-toggle:hover { color: var(--text); }
.tree-inherited-toggle[aria-pressed="true"] { color: var(--text2); }

/* ---- Main content ---- */
/* No padding at the top. It sits inside the scrollport, so a sticky child stops below it and
   leaves a gap under the navbar with content scrolling through. The space moves to the first
   child instead, where it scrolls away like everything else. */
.main-content { flex: 1; overflow-y: auto; padding: 0 1.5rem 1.5rem; }
.main-content > :first-child { margin-top: 1.5rem; }
/* The breadcrumbs and the filter bar, pinned while the page scrolls under them.

   Spacing is padding rather than margin throughout: a margin on a sticky box is a transparent
   strip that content shows through on its way past, and the negative side margins are what let the
   background reach the edges of a column that is otherwise padded. */
.main-content > .main-sticky { position: sticky; top: 0; z-index: 6; background: var(--bg); margin: 0 -1.5rem; padding: 1.5rem 1.5rem 0.7rem; }
.main-sticky > :last-child { margin-bottom: 0; }
.main-content::-webkit-scrollbar { width: 6px; }
.main-content::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
.ns-section { margin-bottom: 2.5rem; }
.ns-heading { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); margin-bottom: 1rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--border); }
.type-section { margin-bottom: 1.25rem; }
/* No rule down the left and no indent to hold one: the heading already groups these. */
.type-children { margin-top: 0.4rem; }

/* ---- Breadcrumbs ---- */
.breadcrumbs { font-size: 0.78rem; color: var(--text4); margin-bottom: 1rem; }
.breadcrumbs ol { list-style: none; display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0; }
.breadcrumbs a { color: var(--text3); text-decoration: none; }
.breadcrumbs a:hover { color: var(--flash); }
.breadcrumbs li::after { content: "/"; margin-left: 0.3rem; color: var(--border2); }
.breadcrumbs li:last-child::after { content: ""; }
.breadcrumbs .crumb-home { display: block; width: 0.95rem; height: 0.95rem; fill: currentColor; }
.breadcrumbs li:has(.crumb-home) { display: flex; align-items: center; }

/* ---- Page heading ---- */
.page-title { font-size: 1.45rem; font-weight: 650; color: var(--text); letter-spacing: -0.01em; word-break: break-word; }
/* Ancestors run off the right of the title rather than wrapping under it: the chain is context for
   the name, and a deep one must not push the rest of a sticky header down the page.

   Centred rather than sat on the title's baseline, because the title is a row of its own now and a
   row's baseline is whatever its first item's happens to be - here a drawing, whose baseline is its
   bottom edge, and not agreed on between browsers. Centring asks nothing of either box. */
.page-title-row { display: flex; align-items: center; column-gap: 0.45rem; }
.page-title { flex: 0 1 auto; min-width: 0; }
/* Nudged onto the name's baseline. Centring the row put the chain's own middle level with the
   title's, and small text centred against large reads high - the two sit on a line together only
   once the smaller one comes down. An offset rather than baseline alignment, since the title is a
   row whose baseline browsers do not agree on; relative, so it moves without moving anything else. */
.type-chain { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 0.78rem; position: relative; top: 0.2rem; }
/* Dimmer than the name it leads to: this is where the type came from, not what the page is about. */
.type-chain .see-ref { font-family: inherit; color: var(--text3); }
.type-chain .see-ref:hover { color: var(--flash); text-decoration: underline; }
/* The tree's chevron, at the tree's size, turned to point back the way the chain reads. */
.chain-sep { display: inline-flex; align-items: center; justify-content: center; width: 1rem; height: 1rem; vertical-align: -0.2rem; color: var(--text4); transform: rotate(90deg); }
.chain-sep svg { display: block; width: 0.85rem; height: 0.85rem; fill: currentColor; }
.page-title .page-kind { font-size: 0.6em; font-weight: 500; color: var(--text4); margin-left: 0.5rem; }
/* Sized in rem, so it stays chip-sized rather than growing with the heading. */
.page-title .chip { margin-left: 0.5rem; vertical-align: middle; font-weight: 500; }
/* The drawing at its largest, since this is the one place a page says what it is about rather than
   listing things.

   Its title becomes a row to carry it, rather than the drawing sitting in a line of text: at this
   size it is taller than the letters, so aligning it by their baseline both leaves it low and
   stretches the line box under it. A row centres the two against each other and neither has to know
   the other's size. Only the titles that carry a drawing - a type's and a member's - are rows; the
   rest are a name and a small word after it, which reads as the line it is. */
.page-title:has(.kind-icon) { display: flex; align-items: center; gap: 0.5rem; }
/* The row's gap is the space now, so the chip drops the margin it used in a line of text. */
.page-title:has(.kind-icon) .chip { margin-left: 0; }
.page-title .kind-icon { width: 1.75rem; height: 1.75rem; }
.page-subtitle { font-family: monospace; font-size: 0.76rem; color: var(--fullname); margin-top: 0.3rem; word-break: break-all; }
.page-intro { color: var(--text2); font-size: 0.93rem; line-height: 1.6; margin-top: 0.6rem; }
.page-chips { margin-top: 0.7rem; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
.page-head { margin-bottom: 1.6rem; }
/* The type's identity stays on screen while its members scroll under it. Bled out to the gutters,
   because .main-content is padded and content would otherwise scroll past either side of it. */
/* Sticks under the breadcrumbs and filter rather than at the top of the column, and below them in
   the stack so it slides beneath rather than over. The offset is measured, not written here: the
   block above is as tall as its filter bar wraps to. */
.page-head.sticky-head { position: sticky; top: var(--sticky-top, 0px); z-index: 5; background: var(--bg); margin: 0 -1.5rem 1.2rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--border2); display: flex; flex-direction: column; max-height: 55vh; }
/* Everything above the members rides here - what the type relates to, what it is parameterised on,
   what it says about itself - so it holds still while they scroll under it. Capped, because a type
   with six paragraphs of remarks would otherwise pin a headerful of prose over the viewport and
   leave the list nowhere to go; past the cap the head scrolls within itself. */
.page-head-body { min-height: 0; padding-top: 0.5rem; overflow-y: auto; scrollbar-width: thin; }
/* The head is a card the width of the column: the name, the declaration and the description on the
   card's own ground, and everything that details the type - what it relates to, what it is
   parameterised on, its remarks - under a hairline on the page's, exactly as a member card splits.
   The negative margins are the head's padding given back, so the ground reaches its edges.

   Outside the scrolling part, both because the identity is what the head is for and because a
   block reaching past its container's edges is a horizontal scrollbar the moment that container
   is the thing that scrolls. */
.page-head-brief { flex-shrink: 0; background: var(--card-bg); border-bottom: 1px solid var(--card-split); margin: -0.75rem -1.5rem 0; padding: 0.35rem 1.5rem 0.75rem; }
/* The one part of the brief with no length of its own: a summary written as three paragraphs would
   carry the tabs, and with them the members, off the bottom of the screen - and the brief cannot
   shrink, because the name and the declaration are what the head is for. Five lines, then it
   scrolls in place, so the head is the same height whatever the type says about itself. */
.page-head-brief .page-intro { max-height: calc(1.6em * 5); overflow-y: auto; scrollbar-width: thin; }
/* Five lines is right for prose and wrong for a summary that draws a diagram, so the cap comes off
   on request. Opening it unpins the whole head as well: a full-height description held over the
   viewport would leave the members nowhere to go, so an opened head scrolls away like any other
   block and the members follow it. */
.page-head.sticky-head.intro-open { position: static; max-height: none; }
.page-head.sticky-head.intro-open .page-head-brief .page-intro { max-height: none; overflow: visible; }
/* At the description's top-right corner rather than under it, and the corner is the one edge of the
   box that opening it does not move: the text grows downwards, so the pointer is still on the
   button afterwards and closing it again is a second click in the same place. The room it sits in
   is a row of its own above it, at the right: over the text it covered a word, and beside the text
   it cost every line the width of a label.

   The row is above rather than below because that is the edge of the box that opening it does not
   move - the text grows downwards - and it is anchored right, so 'Show all' becoming the longer
   'Show less' grows leftwards. Between them the pointer does not have to follow the button
   anywhere: closing it again is a second click where the first one landed.

   It takes the gap the description was leaving under the declaration rather than adding a row to a
   head whose height is the whole point of the cap. */
.page-head-intro { display: flex; flex-direction: column; }
.page-head-intro:has(.intro-more:not([hidden])) .page-intro { margin-top: 0.1rem; }
.intro-more { align-self: flex-end; margin-top: 0.35rem; display: inline-flex; align-items: center; gap: 0.15rem; padding: 0; background: none; border: none; cursor: pointer; font: inherit; font-size: 0.75rem; white-space: nowrap; color: var(--text4); }
.intro-more[hidden] { display: none; }
.intro-more:hover { color: var(--flash); }
.intro-more-arrow { display: inline-flex; width: 1rem; height: 1rem; transition: transform 0.15s; }
.intro-more-arrow svg { display: block; width: 0.85rem; height: 0.85rem; fill: currentColor; }
.intro-open .intro-more-arrow { transform: rotate(180deg); }
/* The breadcrumbs are the top of that card rather than a strip above it, so they take the same
   ground - but only where there is a head to belong to, which is a type page.

   Closed up against the title too: the gap under them was holding two blocks apart, and now that
   the trail and the name are on one ground it was only pushing the name down the page. */
.main-content:has(.page-head-brief) > .main-sticky { background: var(--card-bg); padding-bottom: 0.3rem; }
.page-head.sticky-head .declaration { margin-top: 0.6rem; margin-bottom: 0; }
/* The kinds sit on the head's own rule rather than above it, so the tabs and the members they
   filter are the two sides of one line. The pull is the head's bottom padding, plus the pixel that
   puts the marker over that rule instead of under it. Outside the scrolling part, so a long head
   cannot carry the tabs off with it. */
.page-head.sticky-head .filter-bar { flex-shrink: 0; margin: 0.7rem 0 calc(-0.75rem - 1px); border-bottom: none; }

.chip { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: var(--text3); background: var(--bg3); border-radius: 3px; padding: 0.1rem 0.55rem; text-decoration: none; }
a.chip:hover { color: var(--flash); }
/* The modifiers worth telling apart at a glance: what a member is bound to, and whether it is yours
   to override. Painted like the Readonly pill beside them, from lib/theme.js, so a chip that means
   something and a chip that is just a word are not the same shape in a different colour. */
.chip-static { background: var(--chip-static); color: var(--oc-white); }
.chip-const { background: var(--chip-const); color: var(--oc-white); }
.chip-abstract { background: var(--chip-abstract); color: var(--oc-white); }
.chip-virtual { background: var(--chip-virtual); color: var(--oc-white); }
/* A chip like the rest of them rather than a pill of its own size: it sits in the same run, and a
   label a size smaller or larger than the ones either side of it reads as an afterthought. */
.chip-obsolete { background: var(--chip-obsolete); color: var(--oc-white); }

/* ---- Category overview doc ---- */
.cat-doc { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 1.1rem 1.4rem; margin-bottom: 1.25rem; line-height: 1.7; font-size: 0.88rem; color: var(--text2); scroll-margin-top: 1rem; }
.cat-doc h1,.cat-doc h2,.cat-doc h3,.cat-doc h4 { color: var(--text); margin: 0.9rem 0 0.4rem; font-size: 1rem; }
.cat-doc h1 { font-size: 1.15rem; }
.cat-doc h1:first-child, .cat-doc h2:first-child { margin-top: 0; }
.cat-doc p { margin: 0.4rem 0; }
.cat-doc ul, .cat-doc ol { margin: 0.4rem 0 0.4rem 1.25rem; }
.cat-doc li { margin: 0.2rem 0; }
.cat-doc code { font-family: monospace; font-size: 0.82rem; background: var(--bg3); padding: 0.1rem 0.3rem; border-radius: 3px; }
.cat-doc pre { background: var(--bg3); border-radius: 6px; padding: 0.75rem 1rem; overflow-x: auto; margin: 0.6rem 0; }
.cat-doc pre code { background: none; padding: 0; }
.cat-doc a { color: var(--flash); text-decoration: none; }
.cat-doc a:hover { text-decoration: underline; }
.cat-doc blockquote { border-left: 3px solid var(--border2); padding-left: 0.9rem; color: var(--text3); margin: 0.6rem 0; }
.cat-doc hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.cat-doc img { max-width: 100%; height: auto; }
/* The landing page's authored prose: the same typography, without the card around it. */
.cat-doc.site-intro { background: none; border: none; border-radius: 0; padding: 0; margin-bottom: 0; }
.tree-cat-doc-link { font-style: italic; }

/* ---- Diagrams ---- */
/* Drawn by d2 at build time, so what lands here is an svg carrying its own palette for both
   themes. Nothing is coloured from this end; the only job is fitting it to the column.

   The svg keeps the size it was drawn at rather than filling the width, since a diagram of three
   boxes blown up to the width of the page reads as a poster. max-width brings the other case back
   in, and the scroll is for a diagram too wide to shrink legibly. */
.diagram { margin: 0.9rem 0; overflow-x: auto; }
.diagram svg { max-width: 100%; height: auto; }

/* ---- Math ---- */
/* Typeset to MathML at build time, so what follows is the browser's own rendering of it and the
   only work left is placing the block and letting a long equation scroll rather than overflow.
   Temml's stylesheet, below, is the part that corrects for how each engine draws it. */
.math-display { margin: 0.9rem 0; overflow-x: auto; }
${TEMML_CSS}

/* ---- Member cards ---- */
/* No hover state: the card is not a target, only the name and the anchor inside it are.
   Clipped, so the half below can reach the border on three sides and still take the corners. */
.member { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 0.9rem 1.1rem; margin-bottom: 0.6rem; overflow: hidden; transition: box-shadow 0.15s; scroll-margin-top: var(--anchor-offset, 1rem); }
.member:target { box-shadow: 0 0 0 3px var(--flash); }
/* Two grounds inside the one border: what identifies the member on the card, and everything that
   details it a shade off it under a rule. A reader running down a list reads the name, the
   declaration and the sentence under it, so the parameters and returns are given a shade to be
   skipped by until the reader has stopped at the one they were looking for. A slot of its own
   rather than the page's --bg, since how far it steps off the card is the whole of its job.

   The negative margins are the card's padding given back, so the ground reaches the border rather
   than floating inside it as a second panel. */
.member-detail { background: var(--card-detail); border-top: 1px solid var(--card-split); margin: 0.85rem -1.1rem -0.9rem; padding: 0.7rem 1.1rem 0.85rem; }
.member-detail > :first-child { margin-top: 0; }
/* Bordered in the badge's own colour, so the card and the badge on it read as one mark. */
.member.explicit-impl { border-color: var(--badge-explicit); }
/* An inherited member is a line, not a card: it is documented on the type that declares it, and
   what it owes this page is a name to find and a way through to the rest. Held to one line, so a
   hundred of them stay a list the reader can run an eye down rather than a second page of cards.
   The whole row is the link, since going to where it is written is the only thing to do with it. */
.member.inherited { display: flex; align-items: baseline; gap: 0.5rem; background: none; border-color: transparent; border-radius: 6px; padding: 0.3rem 0.7rem; margin-bottom: 0.1rem; text-decoration: none; }
.member.inherited:hover { background: var(--card-bg); border-color: var(--card-border); }
.member.inherited:hover .inherited-sig { color: var(--text); }
.member.inherited .kind-icon { align-self: center; }
.inherited-sig { flex: 1; min-width: 0; font-family: monospace; font-size: 0.78rem; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Dimmer than the signature: which base it came from answers a question the reader only asks once
   they have found the name they were looking for. */
.inherited-from { flex-shrink: 0; font-size: 0.72rem; color: var(--text4); white-space: nowrap; }
.member-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; flex-wrap: wrap; }
/* Every badge and chip is a mark rather than words: double-clicking the name beside one is a reader
   picking up that name to paste somewhere, and 'class' riding along with it is never what they
   meant. */
.badge, .explicit-badge, .tree-badge, .asm-badge, .chip { user-select: none; -webkit-user-select: none; }
/* The pill shape, worn by Readonly and SetOnly alone now that a kind is drawn rather than spelled:
   what is left of it says how a property may be used, which is not a kind and takes no part in the
   kind palette. Its ink is the darkest on the page under either theme, hence the white. */
.badge { padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.03em; }
.badge-mod { background: var(--badge-mod); color: var(--oc-white); }
/* The small pill, worn by Explicit alone. */
.explicit-badge { padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.62rem; font-weight: 600; color: white; background: var(--badge-explicit); letter-spacing: 0.02em; }
.asm-badge { padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.6rem; font-weight: 600; color: white; margin-left: auto; opacity: 0.85; white-space: nowrap; text-decoration: none; }
.member-name { font-size: 0.97rem; font-weight: 600; color: var(--text); }
/* The interface an explicit implementation came from is a link, but it is also part of a heading. */
.member-name .see-ref { font-family: inherit; }
.member-name .see-ref:hover { text-decoration: underline; }
.member-name a { color: var(--text); text-decoration: none; }
.member-name a:hover { color: var(--flash); }
/* The permalink, kept out of sight until the card is pointed at: a column of hashes down a list of
   sixty members is noise, and the only one worth drawing is the one being read. Focus shows it too,
   so it is reachable by keyboard rather than by cursor alone. */
.member-anchor { color: var(--text4); text-decoration: none; font-size: 0.8rem; opacity: 0; transition: opacity 0.12s; }
/* focus-visible, not focus: clicking the mark focuses it, and on plain :focus it then stayed drawn
   on a card the pointer had long since left - one # lit up somewhere down the page for no reason a
   reader could see. Keyboard focus still shows it, which is the case the rule is here for: it is the
   one way to reach a control that is otherwise invisible until hovered. */
.member:hover .member-anchor, .member-anchor:focus-visible { opacity: 1; }
.member-anchor:hover { color: var(--flash); }
.member-fullname { font-size: 0.72rem; color: var(--fullname); font-family: monospace; margin-top: 0.4rem; margin-bottom: 0.45rem; word-break: break-all; }
.summary { color: var(--text2); line-height: 1.6; font-size: 0.88rem; }
.remarks { color: var(--text3); font-size: 0.83rem; margin-top: 0.4rem; }
.section { margin-top: 0.55rem; font-size: 0.83rem; color: var(--text2); }
.section-label { font-weight: 700; color: var(--text3); }
/* No rule under each row: a parameter list runs to three or four short lines, and ruling them turns
   a small table into a grid to be read across rather than a set of names to be scanned down. */
table.params { margin-top: 0.3rem; border-collapse: collapse; width: 100%; }
table.params td, table.params th { padding: 0.22rem 0.4rem; vertical-align: top; text-align: left; }
/* The name and the type take what they need and nothing more - 1% is shorthand for shrink-to-fit
   against the nowrap below - so what is left goes to the description, which is what runs out of
   room first and is the only column with anything to wrap. */
table.params td.param-name, table.params td.param-type { width: 1%; }
/* Body colour, not the link blue it used to borrow: a parameter name is not a link. */
.param-name { font-family: monospace; font-size: 0.8rem; color: var(--text); white-space: nowrap; padding-right: 0.75rem; }
.param-type { font-family: monospace; font-size: 0.78rem; color: var(--text3); white-space: nowrap; padding-right: 0.75rem; }
/* Types inside a signature underline on hover rather than recolouring, so the token keeps its
   syntax colour and the declaration does not turn into a row of links. */
.declaration a, .r-sig a { color: inherit; text-decoration: none; }
.declaration a:hover, .r-sig a:hover { text-decoration: underline; }
/* A type reference is a link, not a code chip: no panel behind it, and it takes the size of
   whatever it sits in, so the same type reads the same in a table, a Remarks paragraph and an
   Implements row. */
.see-ref { font-family: monospace; color: var(--flash); text-decoration: none; }
a.see-ref:hover { text-decoration: underline; }
/* A framework type on Microsoft Learn: blue-grey, so it sits behind the links into this site. */
.see-ref-out { color: var(--ext-ref); }
/* A type from a package that is neither documented here nor part of the framework: nowhere to send
   a reader, so it is greyed to the back of the three - a name being reported, not offered. */
.see-ref-none { color: var(--text4); }
.see-ref-external::after { content: "\\2197"; font-size: 0.85em; opacity: 0.6; }
.param-ref { font-family: monospace; font-size: 0.82rem; background: var(--bg3); padding: 0.1rem 0.3rem; border-radius: 3px; color: #0ea5e9; font-style: italic; }
.langword-ref { font-family: monospace; font-size: 0.82rem; background: var(--bg3); padding: 0.1rem 0.3rem; border-radius: 3px; color: var(--tok-keyword); }
.hidden { display: none !important; }
[hidden] { display: none !important; }

/* ---- Declarations and code ---- */
/* No panel behind it: the monospace and the token colours already say this is code, and a filled
   box on every card turned a list of members into a list of boxes inside boxes. */
/* A long signature still scrolls sideways, but nothing is drawn to say so: the block is one or two
   lines tall, and a bar under it is a third of its height spent on furniture. Wheel, trackpad,
   touch and a keyboard all still reach the rest of it. */
.declaration { font-family: monospace; font-size: 0.82rem; color: var(--text2); margin-top: 1rem; margin-bottom: 0.75rem; overflow-x: auto; white-space: pre; scrollbar-width: none; -ms-overflow-style: none; }
.declaration::-webkit-scrollbar { display: none; }
.member .declaration { font-size: 0.78rem; }
pre { background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem 1rem; overflow-x: auto; margin: 0.6rem 0; }
pre code { font-family: monospace; font-size: 0.8rem; line-height: 1.55; background: none; padding: 0; }
code { font-family: monospace; }
.tok-keyword { color: var(--tok-keyword); }
.tok-string { color: var(--tok-string); }
.tok-comment { color: var(--tok-comment); font-style: italic; }
.tok-number { color: var(--tok-number); }
.tok-meta, .tok-decorator { color: var(--tok-meta); }
.tok-type { color: var(--tok-type); }
.tok-func { color: var(--tok-func); }
.tok-punct { color: var(--tok-punct); }

/* ---- Notes, tables, lists in doc content ---- */
.note { border-left: 3px solid var(--flash); background: var(--bg3); padding: 0.5rem 0.8rem; border-radius: 0 6px 6px 0; margin: 0.6rem 0; font-size: 0.85rem; }
.note-label { display: block; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--flash); margin-bottom: 0.15rem; }
/* The one note that is a warning rather than an aside, in the colour its chip is painted from, so
   the pill on the card and the reason spelled out here are one mark. Removed is obsolete with the
   compiler's answer changed from a warning to an error, not a different fact, so it reads the same. */
.note-obsolete, .note-removed { border-left-color: var(--chip-obsolete); }
.note-obsolete .note-label, .note-removed .note-label { color: var(--chip-obsolete); }
.table-scroll { overflow-x: auto; margin: 0.6rem 0; }
.table-scroll table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
.table-scroll th, .table-scroll td { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--border); }

/* ---- Examples ----
   Tabs rather than one block after another: the same example in three languages is three ways of
   saying one thing, and stacking them makes a reader scroll past two of them to reach theirs. */
/* Pushed to the far end of the header row, away from the name and badges that identify the member
   and out of the way of the chips that qualify it.

   Painted and hovered as the header's own buttons are, because it is the same kind of thing: the
   one control on a card otherwise made entirely of description. Set a size up from the chips it
   sits among, which are labels rather than things to press. */
.chip-action { background: var(--accent); color: var(--oc-white); font-size: 0.82rem; font-weight: 500; padding: 0.18rem 0.65rem; margin-left: auto; }
a.chip-action:hover { background: var(--accent); color: var(--oc-white); filter: brightness(1.1); }
.example-tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; border-bottom: 1px solid var(--border); margin: 0.8rem 0 0; }
.example-tab { appearance: none; border: none; background: none; cursor: pointer; font: inherit; font-size: 0.82rem; font-weight: 500; color: var(--text3); padding: 0.4rem 0.8rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.example-tab:hover { color: var(--text); }
.example-tab.active { color: var(--flash); border-bottom-color: var(--flash); }
.example-panel { margin-top: 0.8rem; }

/* ---- Examples dock ----
   A column of the layout rather than a thing floating over it, so opening an example narrows the
   member list instead of hiding it and the two can be read against each other. */
/* Width comes from a custom property rather than an inline style, so dragging it cannot outrank
   the narrow-screen rule below that turns the dock into a full-screen overlay. */
.example-dock { position: relative; width: var(--example-dock-width, 42%); min-width: 320px; max-width: 900px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--bg2); border-left: 1px solid var(--border); overflow: hidden; }
/* Straddles the dock's own left edge instead of taking a column of its own, so it appears and
   disappears with the dock and costs the layout nothing while closed. */
.example-resize { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 1; user-select: none; -webkit-user-select: none; }
.example-resize:hover, .example-resize.dragging { background: var(--flash); }
.example-dock-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.9rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.example-dock-title { display: flex; align-items: center; gap: 0.4rem; min-width: 0; font-size: 0.85rem; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The dock's title is the example page's heading, moved: the drawing comes with it and has to come
   down to the size of a strip this shallow, rather than the title-sized one it arrives at. */
.example-dock-title .kind-icon { width: 1.1rem; height: 1.1rem; flex-shrink: 0; }
/* The member the example is for, wherever the code calls it. */
.example-panel mark { padding: 0 0.1rem; }
.example-dock-open { margin-left: auto; font-size: 0.74rem; color: var(--text3); text-decoration: none; flex-shrink: 0; }
.example-dock-open:hover { color: var(--flash); }
.example-dock-close { appearance: none; border: none; background: none; cursor: pointer; font-size: 1.6rem; line-height: 1; color: var(--text3); padding: 0 0.3rem; flex-shrink: 0; }
.example-dock-close:hover { color: var(--text); }
.example-dock-body { overflow: auto; padding: 0 0.9rem 1.2rem; }
.example-dock-body .ns-heading { display: none; }
.example-dock-body .example-panel { margin-top: 0; }
/* Too narrow to give away 42% of it, so the dock takes the width and the content waits behind. */
@media (max-width: 900px) {
  .example-dock { position: fixed; inset: 0; width: auto; min-width: 0; max-width: none; z-index: 30; border-left: none; }
  /* Nothing to drag when it covers the window. */
  .example-resize { display: none; }
}
.example-missing { font-size: 0.85rem; color: var(--text3); font-style: italic; }

/* ---- Enum values and operators ----
   Two tables of members that a card would have padded out rather than filled. */
.enum-table th, .op-table th { color: var(--text3); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.enum-table td, .op-table td { padding: 0.45rem 0.5rem; vertical-align: top; }
/* In the body font, like every other member name on the page: the monospace it wore said 'code' a
   second time, when the row it heads is already a value and a number. */
.enum-table .enum-name { font-weight: 600; color: var(--text); white-space: nowrap; }
/* The expression is the row's identity, so it carries the weight. It is split across three cells
   and closed in on the symbol from both sides, which is what puts every symbol in the table on one
   vertical line; the padding is tightened so the three still read as one expression. */
.op-table .op-left, .op-table .op-mark, .op-table .op-right { font-family: monospace; font-weight: 600; color: var(--text); white-space: nowrap; }
.op-table .op-left { text-align: right; padding-right: 0.1rem; }
.op-table .op-mark { text-align: center; padding-left: 0.3rem; padding-right: 0.3rem; color: var(--tok-keyword); }
.op-table .op-right { text-align: left; padding-left: 0.1rem; }
.enum-table .enum-value { font-family: monospace; white-space: nowrap; text-align: right; }
/* The operand and result columns are types, and read as the signatures they came out of. */
.op-table .op-types { font-family: monospace; font-size: 0.8rem; color: var(--text2); }
/* Rows are what the sidebar links at, so a jumped-to value marks itself the way a card does. */
.enum-table tbody tr, .op-table tbody tr { scroll-margin-top: var(--anchor-offset, 1rem); }
.enum-table tbody tr:target, .op-table tbody tr:target { background: var(--bg3); }
.summary ul, .summary ol, .remarks ul, .remarks ol, .section ul, .section ol { margin: 0.3rem 0 0.3rem 1.25rem; }
dl { margin: 0.3rem 0; }
dt { font-weight: 650; color: var(--text2); margin-top: 0.35rem; }
dd { margin-left: 1rem; color: var(--text3); }

/* ---- Cards grid (home / assembly pages) ---- */
.card-grid { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); }
.nav-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 0.8rem 1rem; text-decoration: none; display: block; transition: background 0.15s, border-color 0.15s; }
.nav-card:hover { background: var(--card-hover); border-color: var(--border2); }
.nav-card-title { font-size: 0.92rem; font-weight: 600; color: var(--text); word-break: break-word; }
.nav-card-meta { font-size: 0.76rem; color: var(--text3); margin-top: 0.25rem; }
.plain-list { list-style: none; padding: 0; }
.plain-list li { border-bottom: 1px solid var(--border); }
.plain-list li:last-child { border-bottom: none; }
.plain-list a { display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.2rem; color: var(--text2); text-decoration: none; font-size: 0.86rem; }
.plain-list a:hover { color: var(--flash); }
.plain-list .count { margin-left: auto; font-size: 0.74rem; color: var(--text4); }

/* ---- Search ---- */
#search-page-input { width: 100%; max-width: 32rem; padding: 0.5rem 0.8rem; font-size: 0.95rem; background: var(--bg2); color: var(--text); border: 1px solid var(--border2); border-radius: 6px; outline: none; }
#search-page-input:focus { border-color: var(--flash); }
.search-results { list-style: none; padding: 0; margin-top: 1rem; }
.search-results li { padding: 0.7rem 0; border-bottom: 1px solid var(--border); }
/* The badge centres against the name rather than sitting on its baseline. */
.search-results .r-head { display: flex; align-items: center; gap: 0.4rem; }
.search-results .r-name { font-weight: 600; color: var(--text); text-decoration: none; }
.search-results .r-name:hover { color: var(--flash); }
.search-results .r-sig { font-family: monospace; font-size: 0.78rem; color: var(--text2); margin: 0.5rem 0; word-break: break-word; }
.search-results .r-summary { font-size: 0.84rem; color: var(--text3); margin-top: 0.25rem; }
.search-results .r-ns { font-family: monospace; font-size: 0.74rem; color: var(--fullname); margin-top: 0.45rem; word-break: break-all; }
/* Open Color yellow, on gray 9: yellow 4 under the dark theme, the lighter yellow 2 under light.
   Opaque, and it sets its own foreground rather than inheriting. A match inside a signature lands
   within a .tok-* span, so 'color: inherit' would leave a saturated token colour sitting on the
   mark - legible on plain text, invisible on a keyword.
   No padding: a match crossing a token boundary is emitted as two adjacent marks, and side padding
   would open a seam in the middle of what should read as one run. */
mark { background: var(--mark-bg); color: var(--mark-fg); border-radius: 2px; }
.search-status { color: var(--text3); font-size: 0.84rem; margin-top: 0.8rem; }

@media (max-width: 800px) {
  .sidebar { display: none; }
  .resize-handle { display: none; }
  #search { width: 150px; }
}
`;

const JS = `
'use strict';

/*
 * Progressive enhancement only. Every link is a real href and every page renders without
 * JavaScript; this restores the interactive behaviour the Python server had - theme toggle, the
 * kind filter bar, collapsible tree, tree search, resizable sidebar - plus client-side search.
 */

(function () {
  // ---- Theme ----
  // The theme is already on the page: the head script read the session's key, or the system when
  // that was empty. Written here in the same store, which is what keeps a toggle whole across a
  // read of several pages without letting it decide how the site opens tomorrow.
  var KEY = 'docs-theme';
  var root = document.documentElement;

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    var button = document.getElementById('theme-toggle');
    // The sun and the moon are both in the button and chosen by CSS, so only the label changes.
    if (button) {
      button.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme');
    }
  }

  function currentTheme() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    applyTheme(currentTheme());
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { sessionStorage.setItem(KEY, next); } catch (e) {}
    });
  }

  // ---- Version filter ----
  // An API belongs to a version unless a <since> puts it after that version. Untagged means it
  // predates every version on the list, which is why the absence of the attribute shows it.
  var VERSION_KEY = 'docs-version';
  var versionSelect = document.getElementById('version-filter');
  var activeVersion = versionSelect ? versionSelect.value : '';

  function majorOf(value) {
    var n = parseInt(String(value || '').split('.')[0], 10);
    return isNaN(n) ? 0 : n;
  }

  function withinVersion(el) {
    var since = el.getAttribute('data-since');
    if (!since || !activeVersion) return true;
    return majorOf(since) <= majorOf(activeVersion);
  }

  // ---- Example tabs ----
  // The panels are all in the page and all but one carry 'hidden', so the example is readable
  // with no script at all - this only moves which one that is.
  //
  // Delegated rather than bound, because the dock below injects tabs long after this runs, and
  // scoped to the clicked tab's own set so a docked example and a page showing one at the same
  // time do not switch each other.
  document.addEventListener('click', function (e) {
    var tab = e.target.closest && e.target.closest('.example-tab');
    if (!tab) return;

    var set = tab.closest('.example-set') || document;
    var chosen = tab.getAttribute('data-panel');

    set.querySelectorAll('.example-tab').forEach(function (other) {
      var on = other.getAttribute('data-panel') === chosen;
      other.classList.toggle('active', on);
      other.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    set.querySelectorAll('.example-panel').forEach(function (panel, i) {
      panel.classList.toggle('hidden', String(i) !== chosen);
    });
  });

  // ---- Examples dock ----
  // The Examples chip is a link to a real page. This opens that page's examples in a column
  // beside the member instead, so the two can be read together - and anything that stops it
  // working falls back to following the link, which is the whole feature minus the convenience.
  var dock = document.getElementById('example-dock');
  var dockBody = document.getElementById('example-dock-body');
  var dockTitle = document.getElementById('example-dock-title');
  var dockOpen = document.getElementById('example-dock-open');

  function closeDock() {
    if (!dock) return;
    dock.classList.add('hidden');
    dockBody.innerHTML = '';
  }

  var dockClose = document.getElementById('example-dock-close');
  if (dockClose) dockClose.addEventListener('click', closeDock);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dock && !dock.classList.contains('hidden')) closeDock();
  });

  if (dock && window.fetch && window.DOMParser) {
    document.addEventListener('click', function (e) {
      // Anything that asks for a new tab or window is left alone to do that.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      var link = e.target.closest && e.target.closest('.chip-action');
      if (!link) return;

      var href = link.getAttribute('href');
      e.preventDefault();

      fetch(href)
        .then(function (r) { return r.ok ? r.text() : Promise.reject(new Error('status')); })
        .then(function (text) {
          var parsed = new DOMParser().parseFromString(text, 'text/html');
          var set = parsed.querySelector('.example-set');
          if (!set) throw new Error('no examples in that page');

          // The heading's nodes rather than its text: the kind is drawn in front of the name, and
          // textContent would take the name and leave the drawing behind.
          var heading = parsed.querySelector('.page-title');
          dockBody.innerHTML = '';
          dockBody.appendChild(set);
          if (heading) {
            dockTitle.replaceChildren.apply(dockTitle, heading.childNodes);
          } else {
            dockTitle.textContent = 'Examples';
          }
          dockOpen.setAttribute('href', href);
          dock.classList.remove('hidden');
          dockBody.scrollTop = 0;
        })
        .catch(function () {
          window.location.href = href;
        });
    });
  }

  // ---- Filter bar ----
  // Nothing here paints anything: the marker under a kind's tab is the stylesheet's business, drawn
  // from the same property as the marks that tab filters, so the two cannot end up disagreeing.
  var filterButtons = document.querySelectorAll('.filter-btn');
  var activeKind = 'all';

  function matchesKind(el) {
    return activeKind === 'all' || el.getAttribute('data-badge') === activeKind;
  }

  // Enum values and operators are listed as table rows rather than cards, so every shape is
  // filtered and counted together - counting only cards would empty those sections and hide the
  // whole table.
  var LISTED = '.member, .enum-table tbody tr, .op-table tbody tr';

  // The same shapes, scoped to the content column. Derived rather than written out again, so a new
  // listed shape cannot be filtered in one place and forgotten in the other.
  var MAIN_LISTED = LISTED.split(', ')
    .map(function (part) { return '.main-content ' + part; })
    .join(', ');

  function anyVisible(root) {
    return [].slice.call(root.querySelectorAll(LISTED)).some(function (el) {
      return !el.classList.contains('hidden');
    });
  }

  function applyFilter() {
    // Kind and version both hide entries, so they resolve to one class rather than fighting.
    document.querySelectorAll(MAIN_LISTED)
      .forEach(function (el) {
        el.classList.toggle('hidden', !(matchesKind(el) && withinVersion(el)));
      });

    // Search results are the same filter over a different shape.
    document.querySelectorAll('.search-results li[data-badge]').forEach(function (el) {
      el.classList.toggle('hidden', !(matchesKind(el) && withinVersion(el)));
    });

    document.querySelectorAll('.main-content .type-section').forEach(function (section) {
      section.classList.toggle('hidden', !anyVisible(section));
    });

    document.querySelectorAll('.main-content .ns-section').forEach(function (section) {
      // A section the filter has no say over - Remarks, Type parameters, Type relationships - holds
      // nothing a kind selects on, so there is no state in which all of its contents are hidden.
      // Without this it disappears on load for containing no matches, having never held any.
      var filterable =
        section.querySelectorAll(LISTED).length > 0 ||
        section.querySelectorAll('.type-section').length > 0;

      if (!filterable) {
        section.classList.remove('hidden');
        return;
      }

      var anyTypes = [].slice.call(section.querySelectorAll('.type-section')).some(function (s) {
        return !s.classList.contains('hidden');
      });
      var hasDoc = section.querySelector('.cat-doc') !== null;
      section.classList.toggle('hidden', !anyTypes && !anyVisible(section) && !hasDoc);
    });
  }

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      filterButtons.forEach(function (b) { b.classList.remove('active'); });
      button.classList.add('active');
      activeKind = button.getAttribute('data-kind');
      applyFilter();
    });
  });

  // Following a link to something the filter is hiding widens back to All.
  //
  // The filter narrows what the list shows; it was never meant to say what you are allowed to link
  // to. Clicking a property in the tree while the page is filtered to Methods would otherwise jump
  // to a card that is not being drawn, which reads as the page having gone blank.
  function revealTarget() {
    var hash = decodeURIComponent((location.hash || '').slice(1));
    if (!hash) return;

    var target = document.getElementById(hash);
    if (!target || !target.classList.contains('hidden')) return;

    var all = document.querySelector('.filter-btn[data-kind="all"]');
    if (!all) return;

    all.click();

    // The browser already tried to scroll here and found nothing drawn, so ask again now that
    // there is. scroll-margin-top puts it below whatever is pinned at the top.
    if (target.scrollIntoView) target.scrollIntoView();
  }

  window.addEventListener('hashchange', revealTarget);
  revealTarget();

  // ---- Assembly selector ----
  var assemblySelect = document.getElementById('asm-filter');
  if (assemblySelect) {
    assemblySelect.addEventListener('change', function () {
      if (assemblySelect.value) location.href = assemblySelect.value;
    });
  }

  // ---- Tree state, carried across navigations ----
  // Every page re-renders the tree from scratch, so an expansion made on one would be undone by
  // the next. Kept per tree shape - data-tree - because an assembly's categories are not another's
  // list, and a scoped search names the same key as the assembly it is searching. sessionStorage
  // rather than local: this is where you are right now, not a preference to keep for next week.
  var treeRoot = document.getElementById('sidebar');
  var treeKey = treeRoot ? 'docs-tree:' + (treeRoot.getAttribute('data-tree') || '') : '';

  function saveTreeState() {
    if (!treeKey) return;

    var open = [];
    document.querySelectorAll('.tree-ns-children').forEach(function (children) {
      if (!children.classList.contains('collapsed')) open.push(children.id);
    });

    try {
      sessionStorage.setItem(
        treeKey,
        JSON.stringify({
          open: open,
          scroll: treeRoot ? treeRoot.scrollTop : 0,
          // What the tree was filtered to is as much a part of where you left it as which groups
          // were open: filtering for something and clicking it should not hand back the whole tree.
          q: treeSearch ? treeSearch.value : '',
        })
      );
    } catch (e) {}
  }

  function readTreeState() {
    if (!treeKey) return null;
    try {
      return JSON.parse(sessionStorage.getItem(treeKey) || 'null');
    } catch (e) {
      return null;
    }
  }

  function restoreTreeState() {
    var state = readTreeState();
    // Nothing remembered yet, so the server's choice of what to open stands.
    if (!state || !state.open) return;

    var open = {};
    state.open.forEach(function (id) { open[id] = true; });

    document.querySelectorAll('.tree-ns-label').forEach(function (label) {
      var children = document.getElementById(label.getAttribute('data-target'));
      if (!children) return;

      // The group holding the current page opens regardless: landing on a type inside a collapsed
      // group would hide the very thing being read.
      var holdsActive = children.querySelector('.tree-link.active, .tree-child-link.active');
      var expanded = Boolean(holdsActive) || open[children.id] === true;

      children.classList.toggle('collapsed', !expanded);
      var arrow = label.querySelector('.tree-arrow');
      if (arrow) arrow.classList.toggle('collapsed', !expanded);
      label.setAttribute('aria-expanded', String(expanded));
    });
  }

  restoreTreeState();

  // ---- Tree: collapse, expand, search ----
  document.querySelectorAll('.tree-ns-label').forEach(function (label) {
    label.addEventListener('click', function () {
      var id = label.getAttribute('data-target');
      var children = document.getElementById(id);
      var arrow = label.querySelector('.tree-arrow');
      if (children) children.classList.toggle('collapsed');
      if (arrow) arrow.classList.toggle('collapsed');
      label.setAttribute('aria-expanded', String(children && !children.classList.contains('collapsed')));
      saveTreeState();
    });
  });

  document.querySelectorAll('.tree-toggle').forEach(function (toggleButton) {
    toggleButton.addEventListener('click', function (event) {
      event.preventDefault();
      var id = toggleButton.getAttribute('data-target');
      var children = document.getElementById(id);
      var arrow = toggleButton.querySelector('.tree-arrow');
      if (children) children.classList.toggle('collapsed');
      if (arrow) arrow.classList.toggle('collapsed');
    });
  });

  // ---- Tree: inherited members ----
  // The rows are already in the tree, in their alphabetical place and drawn back. This only says
  // whether they are drawn, and only for the one type whose members are listed.
  document.querySelectorAll('.tree-inherited-toggle').forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.preventDefault();
      var children = document.getElementById(button.getAttribute('data-target'));
      if (!children) return;

      var shown = children.classList.toggle('show-inherited');
      button.setAttribute('aria-pressed', String(shown));

      var arrow = button.querySelector('.tree-arrow');
      if (arrow) arrow.classList.toggle('collapsed', !shown);
    });
  });

  // The burger beside the filter field toggles the whole tree: collapse everything if anything
  // is open, otherwise expand everything.
  var treeToggleAll = document.getElementById('collapse-all-btn');
  if (treeToggleAll) {
    treeToggleAll.addEventListener('click', function () {
      var groups = [].slice.call(document.querySelectorAll('.tree-ns-children'));
      var anyOpen = groups.some(function (g) { return !g.classList.contains('collapsed'); });

      groups.forEach(function (g) { g.classList.toggle('collapsed', anyOpen); });
      document.querySelectorAll('.tree-ns-label .tree-arrow').forEach(function (el) {
        el.classList.toggle('collapsed', anyOpen);
      });
      document.querySelectorAll('.tree-ns-label').forEach(function (el) {
        el.setAttribute('aria-expanded', String(!anyOpen));
      });

      treeToggleAll.setAttribute('aria-expanded', String(!anyOpen));
      treeToggleAll.title = anyOpen ? 'Expand all' : 'Collapse all';
      saveTreeState();
    });
  }

  var treeSearch = document.getElementById('tree-search');

  function applyTreeFilter() {
    var q = treeSearch ? treeSearch.value.toLowerCase().trim() : '';

    document.querySelectorAll('.tree-type').forEach(function (el) {
      var typeText = (el.querySelector('.tree-link') || {}).textContent || '';
      var childTexts = [].slice.call(el.querySelectorAll('.tree-child-link')).map(function (a) {
        return a.textContent.toLowerCase();
      });
      var match = !q || typeText.toLowerCase().indexOf(q) >= 0 || childTexts.some(function (t) {
        return t.indexOf(q) >= 0;
      });
      el.classList.toggle('hidden', !match || !withinVersion(el));
      if (q && match) {
        var parent = el.closest('.tree-ns-children');
        if (parent) parent.classList.remove('collapsed');
      }
    });

    document.querySelectorAll('.tree-child-link').forEach(function (el) {
      el.classList.toggle('hidden', !withinVersion(el));
    });

    // The Overview row holds no types, so it is matched on its own text rather than emptied out.
    document.querySelectorAll('.tree-overview').forEach(function (row) {
      var text = (row.textContent || '').toLowerCase();
      row.classList.toggle('hidden', Boolean(q) && text.indexOf(q) < 0);
    });

    document.querySelectorAll('.tree-ns:not(.tree-overview)').forEach(function (ns) {
      var any = [].slice.call(ns.querySelectorAll('.tree-type')).some(function (t) {
        return !t.classList.contains('hidden');
      });
      ns.classList.toggle('hidden', !any);
    });
  }

  if (treeSearch) {
    var treeSearchTimer = null;
    treeSearch.addEventListener('input', function () {
      applyTreeFilter();
      // Debounced: typing fires this on every keystroke, and only the last one matters.
      if (treeSearchTimer) clearTimeout(treeSearchTimer);
      treeSearchTimer = setTimeout(saveTreeState, 200);
    });

    // Put the filter back before anything measures the tree, so the open groups, the scroll
    // position and the check for whether the active entry is on screen all see the filtered shape
    // rather than the full one.
    var filtered = readTreeState();
    if (filtered && filtered.q) {
      treeSearch.value = filtered.q;
      applyTreeFilter();

      // Unless it hides where you just arrived. A filter that excludes the page being read is
      // worse than none: the tree cannot show you what you are looking at, and looks empty for no
      // reason you can see. Following anything the filter does not match - a link in the page, a
      // breadcrumb, a search result - drops it rather than leaving that.
      var here = document.querySelector('.tree-link.active');
      if (here && here.closest('.hidden')) {
        treeSearch.value = '';
        applyTreeFilter();
        saveTreeState();
      }
    }
  }

  if (versionSelect) {
    try {
      var storedVersion = localStorage.getItem(VERSION_KEY);
      // A stored version this build no longer offers leaves the select on its default.
      if (storedVersion) versionSelect.value = storedVersion;
      if (!versionSelect.value) versionSelect.selectedIndex = 0;
    } catch (e) {}

    activeVersion = versionSelect.value;

    versionSelect.addEventListener('change', function () {
      activeVersion = versionSelect.value;
      try { localStorage.setItem(VERSION_KEY, activeVersion); } catch (e) {}
      applyFilter();
      applyTreeFilter();
    });

    applyFilter();
    applyTreeFilter();
  }

  // ---- Draggable columns ----
  // One routine for the sidebar and the examples dock. They differ only in which way the drag
  // grows them, what they clamp to, and where the width is written; the sidebar opens to the right
  // of its handle and the dock to the left, which is the whole of the sign difference.
  function makeResizable(panel, handle, options) {
    if (!panel || !handle) return;

    var resizing = false, startX = 0, startWidth = 0;

    try {
      var stored = parseInt(localStorage.getItem(options.key), 10);
      if (stored) options.apply(stored);
    } catch (e) {}

    handle.addEventListener('mousedown', function (event) {
      resizing = true;
      startX = event.clientX;
      startWidth = panel.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      // Starting a selection is what a mousedown does by default, and user-select alone does not
      // stop one already under way from extending as the pointer moves. Dragging a divider is not
      // a text gesture, so the default is refused outright.
      event.preventDefault();
    });

    document.addEventListener('mousemove', function (event) {
      if (!resizing) return;
      var next = startWidth + (event.clientX - startX) * options.direction;
      options.apply(Math.max(options.min, Math.min(options.max, next)));
    });

    document.addEventListener('mouseup', function () {
      if (!resizing) return;
      resizing = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      try { localStorage.setItem(options.key, String(panel.offsetWidth)); } catch (e) {}
    });
  }

  var sidebar = document.getElementById('sidebar');
  makeResizable(sidebar, document.getElementById('resize-handle'), {
    direction: 1,
    min: 150,
    max: 600,
    key: 'docs-sidebar-width',
    apply: function (px) { sidebar.style.width = px + 'px'; },
  });

  makeResizable(document.getElementById('example-dock'), document.getElementById('example-resize'), {
    direction: -1,
    min: 320,
    max: 900,
    key: 'docs-example-width',
    apply: function (px) {
      document.documentElement.style.setProperty('--example-dock-width', px + 'px');
    },
  });

  // ---- Sticky top ----
  // Two things pin themselves: the breadcrumbs, then a type page's header under them, kinds row and
  // all. Both are as tall as their contents wrap to, so where the second one sits and where a
  // jumped-to member has to land are measured rather than guessed at in the css.
  var mainSticky = document.querySelector('.main-sticky');
  var stickyHead = document.querySelector('.page-head.sticky-head');

  var measureSticky = function () {
    var top = mainSticky ? mainSticky.offsetHeight : 0;
    // A head opened out to its full height is no longer pinned, so it is no longer standing over
    // the place a jumped-to member lands.
    var pinnedHead = stickyHead && !stickyHead.classList.contains('intro-open');
    var head = pinnedHead ? stickyHead.offsetHeight : 0;
    document.documentElement.style.setProperty('--sticky-top', top + 'px');
    document.documentElement.style.setProperty('--anchor-offset', top + head + 16 + 'px');
  };

  if (mainSticky || stickyHead) {
    measureSticky();
    window.addEventListener('resize', measureSticky);
  }

  // ---- Page head: a description taller than its cap ----
  // The cap holds the head to one height whatever the type says about itself, which costs nothing
  // for a sentence and hides most of an ASCII drawing. This is the way past it.
  var introToggle = document.querySelector('.intro-more');
  var intro = stickyHead && stickyHead.querySelector('.page-intro');

  if (introToggle && intro) {
    var introLabel = introToggle.querySelector('.intro-more-label');

    // Asked of the capped box, so the answer is 'is anything hidden' rather than 'is it tall'.
    // Never asked while open, where the cap is off and the answer would always be no.
    var syncIntroToggle = function () {
      if (stickyHead.classList.contains('intro-open')) return;
      introToggle.hidden = intro.scrollHeight <= intro.clientHeight + 1;
    };

    // The column scrolls, not the window, so this is what the browser corrects when the head above
    // it changes height - and on a page opened at a member, that correction lands on the member.
    // Asking for the rest of a description is not asking to be taken anywhere, so the position is
    // put back: once after the reflow, and once on the next frame, where the correction arrives.
    var scroller = document.querySelector('.main-content');

    introToggle.addEventListener('click', function () {
      var top = scroller ? scroller.scrollTop : 0;
      var keepScroll = function () {
        if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
      };

      var open = stickyHead.classList.toggle('intro-open');
      introToggle.setAttribute('aria-expanded', String(open));
      introLabel.textContent = open ? 'Show less' : 'Show all';
      measureSticky();
      keepScroll();
      requestAnimationFrame(keepScroll);
    });

    syncIntroToggle();
    // A diagram or a formula in the summary is laid out after this script runs, and a narrower
    // column wraps the same text into more lines than it had.
    window.addEventListener('load', syncIntroToggle);
    window.addEventListener('resize', syncIntroToggle);
  }

  // ---- Tree: the member being read ----
  // The server marks the current type, but which member you are on lives in the fragment, and that
  // changes without a page load. So the tree follows the hash from here rather than from the markup.
  function markCurrentMember() {
    var hash = decodeURIComponent(location.hash || '');

    document.querySelectorAll('.tree-child-link').forEach(function (el) {
      var href = decodeURIComponent(el.getAttribute('href') || '');
      el.classList.toggle('active', Boolean(hash) && href === hash);
    });
  }

  markCurrentMember();
  window.addEventListener('hashchange', markCurrentMember);

  // Where the tree sits has to survive a click on it. Scrolling is what moves it, so scrolling is
  // what has to be recorded - saving only on expand left the stored position stale by the time it
  // was read back. Debounced, because a scroll fires continuously; saved again on the way out, so
  // the last position before a navigation is the one that is kept.
  if (treeRoot) {
    var treeScrollTimer = null;
    treeRoot.addEventListener('scroll', function () {
      if (treeScrollTimer) clearTimeout(treeScrollTimer);
      treeScrollTimer = setTimeout(saveTreeState, 120);
    });
    window.addEventListener('pagehide', saveTreeState);
  }

  // Put the tree back where it was left, then move it only if what it points at is off screen.
  //
  // Centring unconditionally is what made it jump: a link you just clicked is on screen by
  // definition, so after a navigation there is nothing to scroll to and every reason not to.
  // Arriving from a search or a deep link is the case that does need it, and there the entry
  // really is somewhere else.
  //
  // A member wins over its type: centring on the type would leave the highlight off-screen in a
  // long member list, which is the case the highlight exists for.
  var active =
    document.querySelector('.tree-child-link.active') ||
    document.querySelector('.tree-link.active');

  if (treeRoot) {
    var remembered = readTreeState();
    if (remembered && remembered.scroll) treeRoot.scrollTop = remembered.scroll;
  }

  if (active && active.scrollIntoView) {
    var onScreen = false;

    if (treeRoot && active.getBoundingClientRect) {
      var entry = active.getBoundingClientRect();
      var pane = treeRoot.getBoundingClientRect();
      onScreen = entry.top >= pane.top && entry.bottom <= pane.bottom;
    }

    if (!onScreen) active.scrollIntoView({ block: 'center' });
  }

  // Scrolling is part of where you were, and cheap enough to record on a timer rather than a
  // listener that fires on every wheel tick.
  if (treeRoot) {
    var scrollTimer = null;
    treeRoot.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(saveTreeState, 200);
    });
  }

  // ---- Search ----
  // One box in the header, answering in two places: the full list on the search page, and a
  // dropdown of the first few anywhere else. Same index and same matcher behind both, so what the
  // dropdown offers is the head of what the page would show.
  var input = document.getElementById('search');
  var results = document.getElementById('search-results');
  var status = document.getElementById('search-status');
  var navResults = document.getElementById('nav-results');
  if (!input) return;

  var onSearchPage = Boolean(results);

  // The search page put the scope on its status element, where a no-JS render also got it. Every
  // other page carries it on the box, as the assembly name the index is keyed by.
  function searchScope() {
    return (
      (status && status.getAttribute('data-scope')) || input.getAttribute('data-scope') || ''
    );
  }

  // Focus belongs to the search page's box alone: taking it on every page would pull the caret out
  // of whatever the reader was doing and swallow their next keystroke.
  if (onSearchPage) input.focus();

  var index = null;
  var loading = false;
  var queued = null;

  function ensureIndex(then) {
    if (index) { then(); return; }
    if (loading) { queued = then; return; }

    loading = true;
    if (status) status.textContent = 'Loading search index\\u2026';

    fetch(input.getAttribute('data-index-url') || results.getAttribute('data-index-url'))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        index = data;
        loading = false;
        then();
        if (queued) { var q = queued; queued = null; q(); }
      })
      .catch(function () {
        loading = false;
        if (status) status.textContent = 'Could not load the search index. Browse by namespace instead.';
      });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Mirrors markMarkup in lib/html.js. The match runs against the text with the tags taken out,
  // then the marks are cut back in around them: 'T notifier' spans a token span and the text after
  // it, so searching each tag's text on its own would find nothing at all.
  function markMarkup(html, needle) {
    var source = String(html || '');
    if (!needle) return source;

    var parts = source.split(/(<[^>]*>)/);
    var isText = function (part) { return Boolean(part) && part.charAt(0) !== '<'; };

    var plain = '';
    parts.forEach(function (part) { if (isText(part)) plain += part; });

    var hay = plain.toLowerCase();
    var ranges = [];
    for (var at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
      ranges.push([at, at + needle.length]);
    }

    if (ranges.length === 0) return source;

    var out = '';
    var offset = 0;

    parts.forEach(function (part) {
      if (!isText(part)) { out += part; return; }

      var start = offset;
      var stop = offset + part.length;
      offset = stop;

      var cursor = start;
      ranges.forEach(function (range) {
        if (range[1] <= cursor || range[0] >= stop) return;
        var open = Math.max(range[0], cursor);
        var close = Math.min(range[1], stop);
        out += part.slice(cursor - start, open - start);
        out += '<mark>' + part.slice(open - start, close - start) + '</mark>';
        cursor = close;
      });
      out += part.slice(cursor - start);
    });

    return out;
  }

  // Mirrors markMatch in lib/html.js, so a live result is marked up like the server's ?q= answer.
  // Splitting on the raw text and escaping the pieces keeps the offsets honest.
  function markMatch(text, needle) {
    var value = String(text || '');
    if (!needle) return escapeHtml(value);

    var hay = value.toLowerCase();
    var out = '';
    var at = 0;

    for (;;) {
      var found = hay.indexOf(needle, at);
      if (found < 0) break;
      out += escapeHtml(value.slice(at, found));
      out += '<mark>' + escapeHtml(value.slice(found, found + needle.length)) + '</mark>';
      at = found + needle.length;
    }

    return out + escapeHtml(value.slice(at));
  }

  /**
   * A row's kind drawing, referencing the sprite the page already carries.
   *
   * Both result lists build the same mark the same way, so the dropdown and the results page cannot
   * end up drawing a row differently. Unnamed drawings fall back to the class, as the server's do.
   */
  function kindIcon(e) {
    return '<svg class="kind-icon" aria-hidden="true" focusable="false">' +
      '<use href="#${ICON_PREFIX}' + escapeHtml(e[8] || 'class') + '"/></svg>';
  }

  function findMatches(q) {
    // The assembly the header is scoped to, as an index into the table the asset carries. -1
    // means no scope, or a name this build does not know, which searches everything.
    var scope = (index.assemblies || []).indexOf(searchScope());

    var matches = [];
    for (var i = 0; i < index.entries.length; i++) {
      var e = index.entries[i];
      if (scope >= 0 && e[7] !== scope) continue;
      var pos = e[2].indexOf(q);
      if (pos < 0) continue;
      var name = e[0].toLowerCase();
      var rank = name === q ? 0 : (name.indexOf(q) === 0 ? 1 : (name.indexOf(q) >= 0 ? 2 : 3));
      matches.push([rank, pos, e]);
    }

    matches.sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1] || a[2][0].localeCompare(b[2][0]);
    });

    return matches;
  }

  function hideNav() {
    if (!navResults) return;
    navResults.hidden = true;
    navResults.innerHTML = '';
  }

  // The url the form would go to, for the row that offers the rest of the results.
  function searchUrl() {
    var action = (input.form && input.form.getAttribute('action')) || '/search/';
    var slug = input.form && input.form.querySelector('input[name="a"]');
    var params = [];
    if (input.value) params.push('q=' + encodeURIComponent(input.value));
    if (slug && slug.value) params.push('a=' + encodeURIComponent(slug.value));
    return action + (params.length ? '?' + params.join('&') : '');
  }

  var NAV_LIMIT = 8;

  function renderNav(matches, q) {
    if (!navResults) return;

    if (matches.length === 0) {
      navResults.innerHTML = '<div class="nav-empty">No matches</div>';
      navResults.hidden = false;
      return;
    }

    var rows = matches.slice(0, NAV_LIMIT).map(function (m) {
      var e = m[2];
      var ns = (index.namespaces || [])[e[6]] || '';
      // The same outlined mark the tree puts beside a static member. The row has no signature on it
      // to say so in words, which is what the full results page has and this does not.
      var staticMark = e[9] ? '<span class="tree-badge tree-badge-static">S</span>' : '';

      return '<a class="nav-result" href="' + escapeHtml(e[1]) + '" role="option">' +
        kindIcon(e) +
        staticMark +
        '<span class="nav-result-name">' + markMatch(e[0], q) + '</span>' +
        '<span class="nav-result-ns">' + escapeHtml(ns) + '</span></a>';
    });

    if (matches.length > NAV_LIMIT) {
      rows.push(
        '<a class="nav-results-more" href="' + escapeHtml(searchUrl()) + '">' +
          'Show all ' + matches.length + ' matches' + '</a>'
      );
    }

    navResults.innerHTML = rows.join('');
    navResults.hidden = false;
  }

  function run(query) {
    var q = query.trim().toLowerCase();
    if (!q) {
      if (results) results.innerHTML = '';
      if (status) status.textContent = '';
      hideNav();
      return;
    }

    ensureIndex(function () {
      var matches = findMatches(q);

      if (!onSearchPage) {
        renderNav(matches, q);
        return;
      }

      // Same shape the server builds in Renderer.searchResultHtml.
      // [name, url, haystack, summary, filterLetter, signature, nsIndex, asmIndex, icon, static]
      var shown = matches.slice(0, 200);
      results.innerHTML = shown.map(function (m) {
        var e = m[2];
        var ns = (index.namespaces || [])[e[6]] || '';
        return '<li data-badge="' + escapeHtml(e[4] || '?') + '">' +
          '<div class="r-head">' +
          kindIcon(e) +
          '<a class="r-name" href="' + escapeHtml(e[1]) + '">' + markMatch(e[0], q) + '</a>' +
          '</div>' +
          // Already highlighted markup, built by the same highlighter the server uses, which
          // escaped the code on the way in. Escaping it again would print the spans.
          (e[5] ? '<div class="r-sig">' + markMarkup(e[5], escapeHtml(q).toLowerCase()) + '</div>' : '') +
          (e[3] ? '<div class="r-summary">' + markMatch(e[3], q) + '</div>' : '') +
          '<div class="r-ns">' + escapeHtml(ns) + '</div>' +
          '</li>';
      }).join('');

      // The kind buttons keep whatever they were set to across a re-render.
      applyFilter();

      // Only the empty result says anything; a hit count is noise above the hits themselves.
      if (status) {
        var where = searchScope() ? ' in ' + searchScope() : '';
        status.textContent = matches.length === 0 ? 'No matches for "' + query + '"' + where + '.' : '';
      }
    });
  }

  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    var value = input.value;
    timer = setTimeout(function () {
      run(value);

      // Only the search page's url describes a query. Rewriting it anywhere else would leave a
      // type page claiming to be a search for whatever was half-typed in the header.
      if (!onSearchPage) return;

      // The scope rides along, so reloading or sharing the url keeps searching the same assembly.
      var params = [];
      if (value) params.push('q=' + encodeURIComponent(value));
      if (searchScope()) params.push('a=' + encodeURIComponent(searchScope()));
      history.replaceState(null, '', params.length ? '?' + params.join('&') : location.pathname);
    }, 130);
  });

  // ---- The header dropdown ----
  if (navResults) {
    // Coming back to a box that still has something in it should show what it found before.
    input.addEventListener('focus', function () {
      if (input.value.trim()) run(input.value);
    });

    document.addEventListener('click', function (event) {
      if (input.form && !input.form.contains(event.target)) hideNav();
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        hideNav();
        return;
      }

      var rows = navResults.hidden ? [] : navResults.querySelectorAll('.nav-result');
      if (rows.length === 0) return;

      var at = -1;
      rows.forEach(function (row, i) {
        if (row.classList.contains('active')) at = i;
      });

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        var next = at + (event.key === 'ArrowDown' ? 1 : -1);
        if (next < 0) next = rows.length - 1;
        if (next >= rows.length) next = 0;
        rows.forEach(function (row, i) { row.classList.toggle('active', i === next); });
        rows[next].scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && at >= 0) {
        // Enter with nothing picked submits the form, which is the whole result list.
        event.preventDefault();
        location.href = rows[at].getAttribute('href');
      }
    });
  }

  if (input.value && onSearchPage) run(input.value);
})();
`;

module.exports = { CSS, JS };
