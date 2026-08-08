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

const { KIND_COLORS, KIND_PAINTS, BADGE_PAINTS, kindVar } = require('./theme');

/** A palette from lib/theme.js, written out as one custom property per slot. */
function paintCss(prefix, paints) {
  return Object.keys(paints)
    .map((slot) => `  --${prefix}-${slot}: ${paints[slot]};`)
    .join('\n');
}

/** What the client script paints a badge letter with. The properties above, not the colours. */
const KIND_VARS = {};
for (const letter of Object.keys(KIND_COLORS)) KIND_VARS[letter] = kindVar(letter);

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
   come from Tailwind's neutral ramp, which has no hue in it at all. */
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
  --fullname:    #737373;
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
  --bg:          #f8fafc;
  --bg-home:     #ffffff;
  --bg2:         #ffffff;
  --bg3:         #f1f5f9;
  --bg4:         #e8f0fb;
  --border:      #e2e8f0;
  --border2:     #cbd5e1;
  --text:        #1e293b;
  --text2:       #334155;
  --text3:       #64748b;
  --text4:       #94a3b8;
  --card-bg:     #ffffff;
  --card-border: #e2e8f0;
  --card-hover:  #f8fafc;
  --fullname:    #94a3b8;
  --flash:       #0ea5e9;
  --scrollbar:   #cbd5e1;
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
   because a badge means the same thing under either one; move a line into both to split them. */
:root {
${paintCss('kind', KIND_PAINTS)}
${paintCss('badge', BADGE_PAINTS)}
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
/* Lives in the content column, so it takes that column's width and none of the header's padding. */
.filter-bar { border-bottom: 1px solid var(--border); padding-bottom: 0.6rem; margin-bottom: 1.1rem; display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.filter-bar > span { font-size: 0.82rem; color: var(--text3); }
.filter-btn { padding: 0.25rem 0.65rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg2); color: var(--text2); cursor: pointer; font-size: 0.78rem; font-weight: 500; transition: all 0.15s; }
.filter-btn:hover { background: var(--bg3); }
.filter-btn.active { color: white; border-color: transparent; }
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
.resize-handle { width: 4px; background: var(--border); cursor: col-resize; flex-shrink: 0; transition: background 0.15s; }
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
.tree-badge { display: inline-flex; align-items: center; justify-content: center; width: 1.1rem; height: 1.1rem; border-radius: 3px; font-size: 0.6rem; font-weight: 800; color: white; flex-shrink: 0; }
.tree-badge-doc { background: #475569; }
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

/* ---- Main content ---- */
/* No padding at the top. It sits inside the scrollport, so a sticky child stops below it and
   leaves a gap under the navbar with content scrolling through. The space moves to the first
   child instead, where it scrolls away like everything else. */
.main-content { flex: 1; overflow-y: auto; padding: 0 1.5rem 1.5rem; }
.main-content > :first-child { margin-top: 1.5rem; }
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
   the name, and a deep one must not push the rest of a sticky header down the page. */
.page-title-row { display: flex; align-items: baseline; column-gap: 0.45rem; }
.page-title { flex: 0 1 auto; min-width: 0; }
.type-chain { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 0.78rem; }
/* Dimmer than the name it leads to: this is where the type came from, not what the page is about. */
.type-chain .see-ref { font-family: inherit; color: var(--text3); }
.type-chain .see-ref:hover { color: var(--flash); text-decoration: underline; }
/* The tree's chevron, at the tree's size, turned to point back the way the chain reads. */
.chain-sep { display: inline-flex; align-items: center; justify-content: center; width: 1rem; height: 1rem; vertical-align: -0.2rem; color: var(--text4); transform: rotate(90deg); }
.chain-sep svg { display: block; width: 0.85rem; height: 0.85rem; fill: currentColor; }
.page-title .page-kind { font-size: 0.6em; font-weight: 500; color: var(--text4); margin-left: 0.5rem; }
/* Sized in rem, so both stay badge-sized rather than growing with the heading. */
.page-title .chip { margin-left: 0.5rem; vertical-align: middle; font-weight: 500; }
.page-title .badge { margin-right: 0.5rem; vertical-align: middle; }
.page-subtitle { font-family: monospace; font-size: 0.76rem; color: var(--fullname); margin-top: 0.3rem; word-break: break-all; }
.page-intro { color: var(--text2); font-size: 0.93rem; line-height: 1.6; margin-top: 0.6rem; }
.page-chips { margin-top: 0.7rem; display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
.page-head { margin-bottom: 1.6rem; }
/* The type's identity stays on screen while its members scroll under it. Bled out to the gutters,
   because .main-content is padded and content would otherwise scroll past either side of it. */
.page-head.sticky-head { position: sticky; top: 0; z-index: 5; background: var(--bg); margin: 0 -1.5rem 1.2rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--border2); }

.chip { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: var(--text3); background: var(--bg3); border-radius: 3px; padding: 0.1rem 0.55rem; text-decoration: none; }
a.chip:hover { color: var(--flash); }

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

/* ---- Member cards ---- */
/* No hover state: the card is not a target, only the name and the anchor inside it are. */
.member { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 0.9rem 1.1rem; margin-bottom: 0.6rem; transition: box-shadow 0.15s; scroll-margin-top: var(--anchor-offset, 1rem); }
.member:target { box-shadow: 0 0 0 3px var(--flash); }
/* Bordered in the badge's own colour, so the card and the badge on it read as one mark. */
.member.explicit-impl { border-color: var(--badge-explicit); }
.member-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; flex-wrap: wrap; }
.badge { padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.65rem; font-weight: 700; color: white; letter-spacing: 0.03em; }
/* A modifier rather than a kind, so it stays out of the kind palette. */
.badge-mod { background: var(--badge-mod); }
/* The small pill, worn by Explicit and by obsolete. Its own slot each, so retuning one leaves the
   other where it was; the shape and typography are all they actually share. */
.explicit-badge { padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.62rem; font-weight: 600; color: white; background: var(--badge-explicit); letter-spacing: 0.02em; }
.badge-obsolete { background: var(--badge-obsolete); }
.asm-badge { padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.6rem; font-weight: 600; color: white; margin-left: auto; opacity: 0.85; white-space: nowrap; text-decoration: none; }
.member-name { font-size: 0.97rem; font-weight: 600; color: var(--text); }
/* The interface an explicit implementation came from is a link, but it is also part of a heading. */
.member-name .see-ref { font-family: inherit; }
.member-name .see-ref:hover { text-decoration: underline; }
.member-name a { color: var(--text); text-decoration: none; }
.member-name a:hover { color: var(--flash); }
.member-fullname { font-size: 0.72rem; color: var(--fullname); font-family: monospace; margin-top: 0.4rem; margin-bottom: 0.45rem; word-break: break-all; }
.member-anchor { color: var(--text4); text-decoration: none; font-size: 0.8rem; opacity: 0; transition: opacity 0.12s; }
.member:hover .member-anchor, .member-anchor:focus { opacity: 1; }
.summary { color: var(--text2); line-height: 1.6; font-size: 0.88rem; }
.remarks { color: var(--text3); font-size: 0.83rem; margin-top: 0.4rem; }
.section { margin-top: 0.55rem; font-size: 0.83rem; color: var(--text2); }
.section-label { font-weight: 700; color: var(--text3); }
table.params { margin-top: 0.3rem; border-collapse: collapse; width: 100%; }
table.params td, table.params th { padding: 0.22rem 0.4rem; vertical-align: top; border-bottom: 1px solid var(--border); text-align: left; }
table.params tr:last-child td, table.params tr:last-child th { border-bottom: none; }
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
.see-ref-external::after { content: "\\2197"; font-size: 0.85em; opacity: 0.6; }
.param-ref { font-family: monospace; font-size: 0.82rem; background: var(--bg3); padding: 0.1rem 0.3rem; border-radius: 3px; color: #0ea5e9; font-style: italic; }
.langword-ref { font-family: monospace; font-size: 0.82rem; background: var(--bg3); padding: 0.1rem 0.3rem; border-radius: 3px; color: var(--tok-keyword); }
.hidden { display: none !important; }
[hidden] { display: none !important; }

/* ---- Declarations and code ---- */
.declaration { font-family: monospace; font-size: 0.82rem; color: var(--text2); background: var(--bg3); border-radius: 3px; padding: 0.5rem 0.7rem; margin-top: 1.25rem; margin-bottom: 1rem; overflow-x: auto; white-space: pre; }
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
.table-scroll { overflow-x: auto; margin: 0.6rem 0; }
.table-scroll table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
.table-scroll th, .table-scroll td { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--border); }

/* ---- Enum values and operators ----
   Two tables of members that a card would have padded out rather than filled. */
.enum-table th, .op-table th { color: var(--text3); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.enum-table td, .op-table td { padding: 0.45rem 0.5rem; vertical-align: top; }
.enum-table .enum-name, .op-table .op-symbol { font-family: monospace; font-weight: 600; color: var(--text); white-space: nowrap; }
.enum-table .enum-value { font-family: monospace; color: var(--tok-number); white-space: nowrap; text-align: right; }
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
  // ---- Theme (same storage key as the Python version, so an existing choice carries over) ----
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
      try { localStorage.setItem(KEY, next); } catch (e) {}
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

  // ---- Filter bar ----
  // Custom properties rather than colours, so the button a kind filters by cannot end up a
  // different colour from the badges it is filtering, and both follow a retuned palette live.
  var COLORS = ${JSON.stringify(KIND_VARS)};
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
      filterButtons.forEach(function (b) {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = '';
        b.style.borderColor = '';
      });
      button.classList.add('active');
      var colour = COLORS[button.getAttribute('data-kind')] || '#1e293b';
      button.style.background = colour;
      button.style.color = 'white';
      button.style.borderColor = colour;
      activeKind = button.getAttribute('data-kind');
      applyFilter();
    });
  });

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
        JSON.stringify({ open: open, scroll: treeRoot ? treeRoot.scrollTop : 0 })
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

  if (treeSearch) treeSearch.addEventListener('input', applyTreeFilter);

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

  // ---- Resizable sidebar ----
  var sidebar = document.getElementById('sidebar');
  var handle = document.getElementById('resize-handle');
  if (sidebar && handle) {
    var resizing = false, startX = 0, startWidth = 0;

    try {
      var stored = localStorage.getItem('docs-sidebar-width');
      if (stored) sidebar.style.width = stored + 'px';
    } catch (e) {}

    handle.addEventListener('mousedown', function (event) {
      resizing = true;
      startX = event.clientX;
      startWidth = sidebar.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (event) {
      if (!resizing) return;
      var width = Math.max(150, Math.min(600, startWidth + event.clientX - startX));
      sidebar.style.width = width + 'px';
    });

    document.addEventListener('mouseup', function () {
      if (!resizing) return;
      resizing = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('docs-sidebar-width', String(sidebar.offsetWidth)); } catch (e) {}
    });
  }

  // ---- Sticky type header ----
  // Jumping to a member must land it below the header rather than behind it, and the header is as
  // tall as the summary makes it, so the offset is measured rather than guessed at in the css.
  var stickyHead = document.querySelector('.page-head.sticky-head');
  if (stickyHead) {
    var measureHead = function () {
      document.documentElement.style.setProperty(
        '--anchor-offset',
        stickyHead.offsetHeight + 16 + 'px'
      );
    };

    measureHead();
    window.addEventListener('resize', measureHead);
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

  // Keep the selected tree entry in view on load. With nothing selected - search, most obviously -
  // put the tree back where it was left instead, so returning to it does not start from the top.
  // A member wins over its type: centring on the type would leave the highlight off-screen in a
  // long member list, which is the case the highlight exists for.
  var active =
    document.querySelector('.tree-child-link.active') ||
    document.querySelector('.tree-link.active');
  if (active && active.scrollIntoView) {
    active.scrollIntoView({ block: 'center' });
  } else if (treeRoot) {
    var remembered = readTreeState();
    if (remembered && remembered.scroll) treeRoot.scrollTop = remembered.scroll;
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

  // ---- Search page ----
  // Driven by the header's box, which is the only one now. On any other page there is no results
  // list, so this returns and the box keeps its plain submit-to-/search/ behaviour.
  var input = document.getElementById('search');
  var results = document.getElementById('search-results');
  var status = document.getElementById('search-status');
  if (!input || !results) return;

  // The server put the scope on the status element, which is also where a no-JS render got it.
  function searchScope() {
    return (status && status.getAttribute('data-scope')) || '';
  }

  input.focus();

  var index = null;
  var loading = false;
  var queued = null;

  function ensureIndex(then) {
    if (index) { then(); return; }
    if (loading) { queued = then; return; }

    loading = true;
    if (status) status.textContent = 'Loading search index\\u2026';

    fetch(results.getAttribute('data-index-url'))
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

  function run(query) {
    var q = query.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; if (status) status.textContent = ''; return; }

    ensureIndex(function () {
      // The assembly the header is scoped to, as an index into the table the asset carries. -1
      // means no scope, or a slug this build does not know, which searches everything.
      var scope = (index.assemblies || []).indexOf(searchScope());

      var matches = [];
      for (var i = 0; i < index.entries.length; i++) {
        var e = index.entries[i];
        if (scope >= 0 && e[8] !== scope) continue;
        var pos = e[2].indexOf(q);
        if (pos < 0) continue;
        var name = e[0].toLowerCase();
        var rank = name === q ? 0 : (name.indexOf(q) === 0 ? 1 : (name.indexOf(q) >= 0 ? 2 : 3));
        matches.push([rank, pos, e]);
      }

      matches.sort(function (a, b) {
        return a[0] - b[0] || a[1] - b[1] || a[2][0].localeCompare(b[2][0]);
      });

      // Same shape the server builds in Renderer.searchResultHtml.
      // [name, url, haystack, summary, badgeLetter, signature, nsIndex, badgeColour]
      var shown = matches.slice(0, 200);
      results.innerHTML = shown.map(function (m) {
        var e = m[2];
        // The row carries its own colour, because an enum wears a T badge in the F colour.
        var colour = e[7] || COLORS[e[4]] || 'var(--kind-C)';
        var ns = (index.namespaces || [])[e[6]] || '';
        return '<li data-badge="' + escapeHtml(e[4] || '?') + '">' +
          '<div class="r-head">' +
          '<span class="tree-badge" style="background:' + colour + '">' + escapeHtml(e[4] || '?') + '</span>' +
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
      // The scope rides along, so reloading or sharing the url keeps searching the same assembly.
      var params = [];
      if (value) params.push('q=' + encodeURIComponent(value));
      if (searchScope()) params.push('a=' + encodeURIComponent(searchScope()));
      history.replaceState(null, '', params.length ? '?' + params.join('&') : location.pathname);
    }, 130);
  });

  if (input.value) run(input.value);
})();
`;

module.exports = { CSS, JS };
