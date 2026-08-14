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
const { BADGE_PAINTS, CHIP_PAINTS, NOTE_PAINTS } = require('./theme');

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
  /* The Readonly pill, which is the far end of the page's range: near-white here, where the light
     theme has it near-black, so that under either one it is the strongest filled mark in the row of
     chips and reads as inverted against them. Brighter than --kind, so it is not read as one of the
     drawings beside it. */
  --badge-mod:     var(--oc-gray-2);
  --badge-mod-ink: var(--oc-gray-9);
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
  --badge-mod:     var(--oc-gray-9);
  --badge-mod-ink: var(--oc-white);
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
   because a colour means the same thing under either one. The two that did need saying twice are
   the ones that are not colours but ends of a range - the kind ink and the Readonly pill - and they
   are up there with --flash, where a theme states what its ends are. */
:root {
${paintCss('badge', BADGE_PAINTS)}
${paintCss('chip', CHIP_PAINTS)}
${paintCss('note', NOTE_PAINTS)}
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
#asm-filter, #search, #version-filter, #version-current, #theme-toggle, #sidebar-toggle { height: 30px; }

/* ---- Sidebar toggle ----
   The theme toggle's face, before the title and against the column it shows and hides. */
#sidebar-toggle { display: inline-flex; align-items: center; justify-content: center; width: 30px; padding: 0; border: none; border-radius: 4px; background: var(--nav-field); color: var(--nav-fg); cursor: pointer; flex-shrink: 0; }
#sidebar-toggle:hover { background: var(--nav-focus); }
/* A filled mark, unlike the stroked moon and sun beside it: the path carries its own weight. */
#sidebar-toggle svg { display: block; width: 1.05rem; height: 1.05rem; fill: currentColor; }

/* The magnifier sits inside the field, so the field owns the position it is measured against. */
header form[role="search"] { position: relative; display: flex; align-items: center; flex-shrink: 0; }
#search { width: 16rem; padding: 0 2rem 0 0.7rem; border: none; border-radius: 4px; background: var(--nav-field); color: var(--nav-fg); font-size: 0.85rem; outline: none; }
#search::placeholder { color: var(--nav-dim); }
#search:focus { background: var(--nav-focus); }
/* type=search draws a platform clear button; the magnifier already occupies that corner. */
#search::-webkit-search-cancel-button, #search::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }
/* A filled mark like the sidebar toggle's: the path carries its own weight. */
.nav-search-icon { position: absolute; right: 0.55rem; top: 50%; transform: translateY(-50%); width: 1.05rem; height: 1.05rem; pointer-events: none; fill: var(--nav-dim); }

/* ---- Header search results ----
   Hangs off the form, which is the positioned element, and takes the page's colours rather than
   the header's: it is content the header happens to be pointing at, not part of the bar.

   Anchored to the field's right edge rather than its left. The panel is nearly twice the width of
   the field it drops from, and the field sits at the right end of the header with the selectors and
   the theme toggle after it - so hung off the left, the extra width ran off the right of the site
   and a body that does not scroll sideways cut it off. Rightward there is nothing to grow into;
   leftward there is the whole of the title's slack, which is where the width has to come from. */
.nav-results { position: absolute; top: calc(100% + 0.35rem); right: 0; width: 30rem; max-width: 80vw; max-height: 70vh; overflow-y: auto; z-index: 40; background: var(--bg2); border: 1px solid var(--border2); border-radius: 5px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28); padding: 0.25rem; }
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
   itself is still drawn by the OS, which is the one part a <select> cannot be styled into. */
#asm-filter, #version-filter { appearance: none; -webkit-appearance: none; border: none; border-radius: 4px; padding: 0 1.5rem 0 0.65rem; font-size: 0.82rem; font-weight: 500; cursor: pointer; outline: none; flex-shrink: 0; background-color: var(--accent); color: #ffffff; background-image: var(--nav-chevron); background-repeat: no-repeat; background-position: right 0.4rem center; background-size: 0.75rem; }
#asm-filter { max-width: 18rem; }
#asm-filter:hover, #version-filter:hover { filter: brightness(1.1); }
/* The popup is an OS menu, so its options need colours that do not assume the dark bar. */
#asm-filter option, #version-filter option { background: var(--bg2); color: var(--text); }
/* A site offering one version says so here instead. The same face as the select it stands in for,
   without the chevron or the hover, since there is nothing to open. */
#version-current { display: inline-flex; align-items: center; border-radius: 4px; padding: 0 0.65rem; font-size: 0.82rem; font-weight: 500; flex-shrink: 0; background-color: var(--accent); color: #ffffff; }

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
/* A display of its own outranks the browser's rule for the attribute, so hidden has to be said here
   or the bar the search page hides stays on the page as an empty rule across the column. */
.filter-bar[hidden], .filter-btn[hidden] { display: none; }
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
/* Hidden as a fact about the whole page rather than the column: the attribute lives on the root so
   the head script can put a remembered state back before the sidebar is even parsed, and the handle
   goes with the column it resizes. */
:root[data-sidebar="hidden"] .sidebar,
:root[data-sidebar="hidden"] .resize-handle { display: none; }
/* Pinned, like the rows under it: it acts on the whole tree, so it is no use only while the top of
   the tree is in view. Opaque and above the pinned rows, which pass beneath it. Its height is
   written on rather than left to the contents, because those rows pin against it - see --tree-bar.
   Anything added here that makes the bar taller - a second row of controls, a taller field - is a
   change to --tree-bar and nothing else: the rows read their offsets from it. */
.sidebar-toolbar { position: sticky; top: 0; z-index: 3; height: var(--tree-bar); background: var(--bg2); padding: 0.3rem 0.6rem; display: flex; gap: 0.4rem; align-items: center; }
/* Written the way the group headings under it are: it is one rung further out on the same ladder,
   naming what kind of name the column lists. */
.sidebar-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* At the right end of the bar, and bare until pointed at: the bar is quiet chrome, and a drawn
   face on its one control would be the loudest thing in the column. The border surfacing under
   the pointer is what says it is a button; transparent rather than absent, so nothing shifts. */
#collapse-all-btn { flex-shrink: 0; margin-left: auto; background: none; border: 1px solid transparent; color: var(--text2); width: 1.5rem; height: 1.5rem; padding: 0; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
#collapse-all-btn:hover:not(:disabled) { border-color: var(--border2); }
/* Still in the bar when everything is shut - a control that vanishes reads as the bar changing
   shape - just drawn back until a group opens and gives it something to do. */
#collapse-all-btn:disabled { opacity: 0.35; cursor: default; }
#collapse-all-btn svg { display: block; width: 1rem; height: 1rem; }
.resize-handle { width: 4px; background: var(--border); cursor: col-resize; flex-shrink: 0; transition: background 0.15s; user-select: none; -webkit-user-select: none; }
.resize-handle:hover, .resize-handle.dragging { background: var(--flash); }

/* ---- Tree ---- */
.tree-ns { border-bottom: 1px solid var(--border); }
/* Sits above the groups rather than inside one, so it gets the group row's padding back. */
.tree-overview .tree-type-label { padding: 0.5rem 0.75rem; }
.tree-ns-label { display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.72rem; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.05em; user-select: none; background: var(--bg2); border: none; width: 100%; text-align: left; font-family: inherit; }
.tree-ns-label:hover { background: var(--bg3); color: var(--text); }
/* A namespace row, which is a step in the nesting rather than a heading over it: written like the
   type rows under it and marked with the namespace drawing, so the tree reads as one tree. The rule
   between groups goes with the heading look - forty of them under a list of rows is a grid, not a
   separation - which leaves category mode's headings as the two modes' visible difference. */
.tree-ns-plain { border-bottom: none; }
/* A square, so the rotation below turns about its centre and the arrow does not drift sideways. */
.tree-arrow { display: inline-flex; align-items: center; justify-content: center; width: 1rem; height: 1rem; flex-shrink: 0; transition: transform 0.15s; }
.tree-arrow svg { display: block; width: 0.85rem; height: 0.85rem; fill: currentColor; }
/* docify swaps a chevron-right for a chevron-down; rotating the one is the same picture. */
.tree-arrow.collapsed { transform: rotate(-90deg); }
.tree-arrow-spacer { display: inline-block; width: 1rem; flex-shrink: 0; }
.tree-ns-children.collapsed { display: none; }
/* Where a group's rows should be, when the fetch that carries them did not arrive. */
.tree-empty { padding: 0.28rem 0.75rem 0.28rem 1.75rem; font-size: 0.78rem; color: var(--text2); }
.tree-type-label { display: flex; align-items: center; padding: 0.28rem 0.75rem; cursor: default; user-select: none; background: var(--bg2); }
.tree-type-label:hover { background: var(--bg3); }
/* A namespace row is a type row with a namespace on it: the same box, the same drawing column, and
   the same split between an arrow that opens it and a name that goes to its page. */
.tree-link, .tree-ns-link { color: var(--text2); text-decoration: none; font-size: 0.82rem; display: flex; align-items: center; gap: 0.35rem; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tree-link:hover, .tree-ns-link:hover { color: var(--text); }
.tree-link.active, .tree-ns-link.active { color: var(--flash); font-weight: 600; }
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
/* The member rows hang off the arrow that opened them, which is the one thing left on screen saying
   where the list came from once its type has scrolled away. Drawn once from the container rather
   than a segment per row: the rows are a single run and the line through them is a single line.
   Placed on the arrow's centre - the row's 0.75rem edge plus half the 1rem arrow column - which is
   0.75rem clear of where the names start. */
.tree-type-children { position: relative; padding-left: 0.25rem; }
.tree-type-children::before { content: ''; position: absolute; left: 1.25rem; top: 0; bottom: 0; border-left: 1px solid var(--border2); }
.tree-type-children.collapsed { display: none; }
/* The tree's own ink, the same one the type rows above them are written in: a member row is a row
   like any other, and dimming the whole list said 'less important' about every member there is.
   What dimming is for here is the inherited rows, which are a second list drawn into the first. */
.tree-child-link { display: flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.75rem 0.2rem 1.75rem; color: var(--text2); text-decoration: none; font-size: 0.77rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tree-child-link:hover { background: var(--bg3); color: var(--text); }
.tree-child-link.active { color: var(--flash); }
/* One flex item holding both, so the row's gap does not open between the name and its '('. */
.tree-child-link .tree-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* A shade back from the name, so an overload's parameters read as the tiebreaker they are, with
   a hair of space in front - the row's own 0.35rem gap was far too much. */
.tree-child-link .tree-sig { color: var(--text4); margin-left: 0.12rem; }
.tree-toggle, .tree-ns-toggle { background: none; border: none; padding: 0; cursor: pointer; color: inherit; display: inline-flex; align-items: center; }
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

/* ---- Tree: a branch names itself while you are inside it ---- */
/* A namespace of a few hundred types, or a type of a few hundred members, is taller than the column
   it is read in, so the row naming it is off screen for most of the scrolling. Both rows hold their
   place instead - the namespace or category at the top, the type on the line under it - and each
   only for as long as its own contents are on screen, so passing out of a branch hands the two
   slots to the next one.
   Where the type row pins is where the group row ends, so the two are one number. The two group
   shapes are not the same height - a category heading is text and an arrow at 0.5rem padding, a
   namespace row is a kind drawing at 0.28rem - so the number is written per shape, and written onto
   the row as a height as well, which is what keeps the offset and the height from drifting apart
   into a gap or an overlap. The toolbar is the first of the pinned slots and stacks the same way,
   so both offsets are measured from the bottom of it. --tree-bar carries a little slack over what
   the button needs, since a clipped control costs more than a hair of extra bar. */
.sidebar { --tree-bar: 2.2rem; --tree-head: 2rem; }
.tree-ns-plain { --tree-head: 1.66rem; }
.tree-ns-label { min-height: var(--tree-head); }
.tree-ns-plain > .tree-type-label { min-height: var(--tree-head); }
/* Stacked, so the outer row covers the inner one and both cover the guide line running past them.
   The Overview row is left out: it is a group of one row with nothing under it, so pinning it buys
   no name and only puts it over the row below. */
.tree-ns > .tree-ns-label,
.tree-ns:not(.tree-overview) > .tree-type-label { position: sticky; top: var(--tree-bar); z-index: 2; }
.tree-type > .tree-type-label { position: sticky; top: calc(var(--tree-bar) + var(--tree-head)); z-index: 1; }

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
/* A type's name is one thing however long it runs - 'CodeEditor<TDoc, TView, …>' names one type -
   so it goes off the side rather than down the page: wrapping it would take the declaration and
   the description with it, and this line is the top of a header that has a height to keep.

   Scrolled without a bar, because the bar would sit under a heading it is nothing to do with and
   be visible on every page to serve the few that overflow. The end of a name is decoration
   compared with its beginning; anyone who wants it can drag the line or shift-wheel it.

   Held to seven tenths of the row, so what the name overruns is its own box and never the chain
   beside it: a long one starts scrolling at that mark instead of taking the width and leaving the
   type's ancestry a stub. */
.page-title-row .page-title { max-width: 70%; white-space: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -ms-overflow-style: none; }
.page-title-row .page-title::-webkit-scrollbar { width: 0; height: 0; }
/* The edge a long name runs past, faded rather than marked with an ellipsis: an ellipsis says the
   rest was cut off, and here the rest is a drag away. Worn only while something is actually past
   the edge - the script takes it off at the end of the run, and never puts it on a name that fits,
   where a fade over the last letters would read as a defect. */
.page-title-row .page-title.title-clipped { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent); }
/* Nudged onto the name's baseline. Centring the row put the chain's own middle level with the
   title's, and small text centred against large reads high - the two sit on a line together only
   once the smaller one comes down. An offset rather than baseline alignment, since the title is a
   row whose baseline browsers do not agree on; relative, so it moves without moving anything else. */
/* Ellipsised where it runs out of room: the chain has nowhere to scroll to, so a deep one was
   being cut mid-word with nothing to say it had been. The mark is the whole difference between a
   name that ends there and a name that carries on. */
.type-chain { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; position: relative; top: 0.2rem; }
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
/* A cap of its own, not just the head's: the head's 55vh is shared with the brief, so a detail
   block long enough to claim what the brief does not - eighteen type parameters, or relations on a
   type deep in a hierarchy - could still stand half a screen tall before anything stopped it, which
   is a headerful of context over a list the reader came to read. Past this it scrolls in place. */
.page-head-body { min-height: 0; max-height: 20vh; padding-top: 0.5rem; overflow-y: auto; scrollbar-width: thin; }
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
/* The detail comes off its cap with it. Nothing is being held over the viewport once the head has
   been unpinned, so a second scrolling box inside a block that now scrolls with the page is only a
   second place to have to scroll. */
.page-head.sticky-head.intro-open .page-head-body { max-height: none; overflow: visible; }
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
/* When an API arrived, at the far end of the row rather than in the run of modifiers: it says
   something about the API's history rather than about how it is written, and the left of the row is
   where a reader scanning down a list of members is already looking. The same chip closes a type
   page's title row, so the fact is in the same place whether the type is being read or listed.

   Quieter than the chips it shares a row with, in the grey the assembly name and the anchor use:
   the modifiers beside it say how a member is written and are read down the column, while this is
   a fact to be looked up on the one row that raised the question. Never shrunk: it is a handful of
   characters, and a long chain or signature beside it has somewhere else to give. Where something
   already claims the end of the row
   - the assembly name on a type card, the Examples button on a member's - it sits beside that
   instead, because two auto margins in one row split the free space between them and leave both
   adrift. */
.chip-since { margin-left: auto; flex-shrink: 0; color: var(--text4); background: transparent; }
.asm-name ~ .chip-since, .chip-action ~ .chip-since { margin-left: 0; }

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
.badge, .explicit-badge, .tree-badge, .chip { user-select: none; -webkit-user-select: none; }
/* The pill shape, worn by Readonly and SetOnly alone now that a kind is drawn rather than spelled:
   what is left of it says how a property may be used, which is not a kind and takes no part in the
   kind palette. Ground and ink swap ends with the theme - dark on light, light on dark - so that it
   stays the most contrasted mark in the row either way. See --badge-mod. */
.badge { padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.03em; }
.badge-mod { background: var(--badge-mod); color: var(--badge-mod-ink); }
/* The small pill, worn by Explicit alone. */
.explicit-badge { padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.62rem; font-weight: 600; color: white; background: var(--badge-explicit); letter-spacing: 0.02em; }
/* Which assembly a card's type came from, pushed to the far end of its header. Grey and unadorned:
   it is there to be looked up rather than looked at, and it shares the row with a name that is the
   point of the card. It brightens on hover, since it does lead somewhere. */
.asm-name { margin-left: auto; padding-left: 0.5rem; font-size: 0.7rem; color: var(--text4); white-space: nowrap; text-decoration: none; }
.asm-name:hover { color: var(--text2); }
.member-name { font-size: 0.97rem; font-weight: 600; color: var(--text); }
/* The interface an explicit implementation came from is a link, but it is also part of a heading. */
.member-name .see-ref { font-family: inherit; }
.member-name .see-ref:hover { text-decoration: underline; }
.member-name a { color: var(--text); text-decoration: none; }
.member-name a:hover { color: var(--flash); }
/* The permalink, kept out of sight until the card is pointed at: a column of hashes down a list of
   sixty members is noise, and the only one worth drawing is the one being read. */
.member-anchor { color: var(--text4); text-decoration: none; font-size: 0.8rem; opacity: 0; }
/* Drawn outright rather than faded, and drawn by hover alone. Both are the same symptom: a # left
   lit on a card the pointer had long since left, somewhere down the page, for no reason a reader
   could see. The fade was what Safari kept - it went on painting a faded-in mark after the hover it
   belonged to had gone, where a plain repaint goes when the hover does. Focus was the rest of it:
   clicking the mark leaves it focused, and :focus-visible still counts a click that follows any
   keyboard use, so the reveal is the pointer's alone and the mark is out of the tab order to match.
   Anything put back here has to be checked in Safari, which is the one that let it show. */
.member:hover .member-anchor { opacity: 1; }
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
/* The one note that is a warning rather than an aside, and the one mark the page gives the fact.
   Removed is obsolete with the compiler's answer changed from a warning to an error, not a
   different fact, so it reads the same. */
.note-obsolete, .note-removed { border-left-color: var(--note-obsolete); }
.note-obsolete .note-label, .note-removed .note-label { color: var(--note-obsolete); }
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
/* Name and mark on one line, hung from the top of the cell so they sit with the first line of the
   description beside them rather than in the middle of it. The drawing is a shade under the one the
   member cards wear, which keeps a row the height of its text. */
.enum-table .enum-name-row { display: inline-flex; align-items: center; gap: 0.4rem; vertical-align: top; }
.enum-table .enum-name-row .kind-icon { width: 0.95rem; height: 0.95rem; }
/* The expression is the row's identity, so it carries the weight. It is split across three cells
   and closed in on the symbol from both sides, which is what puts every symbol in the table on one
   vertical line; the padding is tightened so the three still read as one expression. */
.op-table .op-left, .op-table .op-mark, .op-table .op-right { font-family: monospace; font-weight: 600; color: var(--text); white-space: nowrap; }
.op-table .op-left { text-align: right; padding-right: 0.1rem; }
.op-table .op-mark { text-align: center; padding-left: 0.3rem; padding-right: 0.3rem; color: var(--tok-keyword); }
.op-table .op-right { text-align: left; padding-left: 0.1rem; }
.enum-table .enum-value { font-family: monospace; white-space: nowrap; text-align: right; }
/* The operand and result columns are types, and read as the signatures they came out of. Kept on
   one line like the operand cells beside them: a generic broken at its comma reads as two types. */
.op-table .op-types { font-family: monospace; font-size: 0.8rem; color: var(--text2); white-space: nowrap; }
/* Both tables end in the description, which is the only column with prose to wrap, so every column
   before it is shrunk to what it holds - 1% against the nowrap above, the way table.params does it.
   Left to share the width evenly, five columns of short strings take most of the row and the one
   column that had something to say gets what is left. A type too long for the room scrolls, which
   is what the .table-scroll around it is for. */
.enum-table .enum-name, .enum-table .enum-value { width: 1%; }
.op-table .op-left, .op-table .op-mark, .op-table .op-right, .op-table .op-types { width: 1%; }
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
/* The end of what is drawn. Not a result, so it carries neither a result's rule nor its padding. */
.search-results li.search-more { padding: 1rem 0 0; border-bottom: none; text-align: center; }
.search-more-btn { font: inherit; font-size: 0.84rem; color: var(--text2); background: var(--bg2); border: 1px solid var(--border2); border-radius: 6px; padding: 0.45rem 1rem; cursor: pointer; transition: color 0.15s, border-color 0.15s; }
.search-more-btn:hover { color: var(--text); border-color: var(--flash); }
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
 * kind filter bar, collapsible tree, resizable sidebar - plus client-side search.
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

  // ---- Sidebar visibility ----
  // Kept as an attribute on the root, like the theme and for the same reason: the head script puts
  // a remembered state back before first paint, when the sidebar itself is not parsed yet. The same
  // session store too - a column hidden mid-read stays hidden for the read, not for next week.
  var SIDEBAR_KEY = 'docs-sidebar';
  var sidebarToggleBtn = document.getElementById('sidebar-toggle');
  if (sidebarToggleBtn) {
    var sidebarShown = function () { return root.getAttribute('data-sidebar') !== 'hidden'; };

    // The markup says expanded, which is true everywhere except where the head script hid it.
    sidebarToggleBtn.setAttribute('aria-expanded', String(sidebarShown()));

    sidebarToggleBtn.addEventListener('click', function () {
      if (sidebarShown()) root.setAttribute('data-sidebar', 'hidden');
      else root.removeAttribute('data-sidebar');

      sidebarToggleBtn.setAttribute('aria-expanded', String(sidebarShown()));
      try {
        sessionStorage.setItem(SIDEBAR_KEY, sidebarShown() ? '' : 'hidden');
      } catch (e) {}
    });
  }

  // ---- Version filter ----
  // An API belongs to a version unless a <since> puts it after that version. Untagged means it
  // predates every version on the list, which is why the absence of the attribute shows it.
  var VERSION_KEY = 'docs-version';
  var versionSelect = document.getElementById('version-filter');
  // A site offering one version writes it as a label rather than a menu. There is nothing to
  // choose, but the page is still filtered to it, so the version is read off the label instead.
  var versionFixed = document.getElementById('version-current');
  var activeVersion = '';
  if (versionSelect) activeVersion = versionSelect.value;
  else if (versionFixed) activeVersion = versionFixed.getAttribute('data-version') || '';

  // A leading prefix is dropped before the number is read, since a version offered as 'V9' is
  // labelled the way the reader knows it while a <since> is written as the bare 8.0.
  function majorOf(value) {
    var n = parseInt(String(value || '').replace(/^[^0-9]*/, '').split('.')[0], 10);
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

  // ---- The url as view state ----
  // What the reader has narrowed the page to belongs in the address bar: a filtered page survives a
  // reload that way, and a link to one arrives filtered rather than whole. The kind tab writes k
  // here; the search box writes q and a.
  //
  // Merged into whatever is already in the url rather than rebuilt from the writer's own fields,
  // because two writers share it - a keystroke in the search box must not drop the tab's k, and a
  // press on a tab must not drop the query.
  //
  // replaceState, not push: a filter is an adjustment to one view rather than a place of its own, and
  // an entry per press would make Back walk the tabs one at a time instead of leaving the page. The
  // hash is carried across, since on a type page it is the member being read.
  function urlParams() {
    return new URLSearchParams(location.search);
  }

  function writeParams(params) {
    var query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
  }

  function setParam(name, value) {
    var params = urlParams();
    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }
    writeParams(params);
  }

  // ---- Filter bar ----
  // Nothing here paints anything: the marker under a kind's tab is the stylesheet's business, drawn
  // from the same property as the marks that tab filters, so the two cannot end up disagreeing.
  var filterButtons = document.querySelectorAll('.filter-btn');
  var activeKind = 'all';

  // The key is whatever the page that drew the row filters by - a kind letter over a list of types,
  // a member tab on a type page - and this never needs to know which: the buttons and the rows on
  // any one page are written from the same vocabulary, and a url asking for a key this page has no
  // button for is dropped below rather than matched.
  //
  // Taken on the key rather than the element, because the search page filters entries in its match
  // list - rows that are not in the page yet, and may never be - by the same rule.
  function matchesFilter(key) {
    return activeKind === 'all' || key === activeKind;
  }

  function matchesKind(el) {
    return matchesFilter(el.getAttribute('data-filter'));
  }

  // How the search page narrows its results, set by the search section below once it has a match
  // list to narrow - that list is what the page is a window onto. Null until then, and on every
  // page with no results to narrow at all. See applyFilter.
  var filterSearchResults = null;

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

    // Search results are the same filter over a different shape, but the rows in the page are only
    // as far as the reader has read: narrowing them by hiding what is drawn would filter the first
    // page of matches and present that as the whole answer. So the list is narrowed and redrawn
    // instead. The pass over the page is for the rows a server-rendered ?q= put there, which is all
    // there is until the index lands.
    if (filterSearchResults) {
      filterSearchResults();
    } else {
      document.querySelectorAll('.search-results li[data-filter]').forEach(function (el) {
        el.classList.toggle('hidden', !(matchesKind(el) && withinVersion(el)));
      });
    }

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

  // The one way the active kind changes, so the buttons, the page and the url cannot end up
  // disagreeing about which it is. All leaves no mark: a bare address is the unfiltered page.
  function selectKind(kind) {
    filterButtons.forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-kind') === kind);
    });
    activeKind = kind;
    setParam('k', kind === 'all' ? '' : kind);
    applyFilter();
  }

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      selectKind(button.getAttribute('data-kind'));
    });
  });

  /**
   * The bar, narrowed to what a query actually found: a button that would take nothing out of the
   * list is a button with nothing to say, and on the search page the list is a different one every
   * few keystrokes. Only the search page calls this - every other bar is written for a list that was
   * built with the page and cannot change under it.
   *
   * Two kinds is where a bar starts being worth its line: All and the single kind present are the
   * same list under two names. Same rule tabsHtml applies in lib/layout.js when it builds one.
   *
   * @param {object} keys  the letters present, as a lookup
   */
  function offerKinds(keys) {
    if (filterButtons.length === 0) return;

    var offered = 0;
    filterButtons.forEach(function (button) {
      var key = button.getAttribute('data-kind');
      if (key === 'all') return;

      var has = Boolean(keys[key]);
      button.hidden = !has;
      if (has) offered++;
    });

    var bar = filterButtons[0].closest('.filter-bar');
    if (bar) bar.hidden = offered < 2;

    // A tab whose rows are gone would otherwise stay pressed over an empty list, which reads as a
    // query that found nothing.
    if (activeKind !== 'all' && !keys[activeKind]) selectKind('all');
  }

  // The tab the url asks for, restored before anything else reads the page - revealTarget below
  // decides what to do about a hidden anchor and needs the filter already settled to see one.
  //
  // A letter this page has no tab for is not worth showing an empty page over: a member kind on a
  // list of types, or one a build has since stopped offering, falls back to All and the url is
  // corrected to say so rather than left claiming a filter that is not on. Compared against the
  // buttons rather than looked up as a selector, because this value comes out of a shared link.
  if (filterButtons.length > 0) {
    var askedKind = urlParams().get('k');
    if (askedKind && askedKind !== 'all') {
      var wanted = null;
      filterButtons.forEach(function (b) {
        if (b.getAttribute('data-kind') === askedKind) wanted = b;
      });

      if (wanted) {
        selectKind(askedKind);
      } else {
        setParam('k', '');
      }
    }
  }

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

  // What opens and closes a group. A group that names no page of its own is one button - the whole
  // row - and one that does is an arrow beside a link, since the row cannot both open and navigate.
  var GROUP_CONTROLS = 'button.tree-ns-label, .tree-ns-toggle';

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

    document.querySelectorAll(GROUP_CONTROLS).forEach(function (label) {
      var children = document.getElementById(label.getAttribute('data-target'));
      if (!children) return;

      // The group holding the current page opens regardless: landing on a type inside a collapsed
      // group would hide the very thing being read. A namespace page is its group's own page, so
      // the same goes for arriving at one - the tree answers it with the list it holds.
      var group = label.closest('.tree-ns');
      var holdsActive =
        children.querySelector('.tree-link.active, .tree-child-link.active') ||
        (group && group.querySelector('.tree-ns-link.active'));
      var expanded = Boolean(holdsActive) || open[children.id] === true;

      children.classList.toggle('collapsed', !expanded);
      var arrow = label.querySelector('.tree-arrow');
      if (arrow) arrow.classList.toggle('collapsed', !expanded);
      label.setAttribute('aria-expanded', String(expanded));
    });
  }

  restoreTreeState();
  // What was restored may not match what the page was written with, and the collapse button's
  // visibility follows the groups. Hoisted, from where the button and its logic live below.
  syncCollapseAll();

  // ---- Tree: the rows the page left out ----
  // A tree is the same list of types on every page that carries it - what changes is which group
  // is open and which row is marked - so the page is written with only the group being read in it,
  // and the rest arrive once from an asset the browser then has cached for the whole read. See
  // treeGroup and treeAsset in lib/pages.js, which decide what is left out and write what fills it.
  var lazyGroups = [].slice.call(document.querySelectorAll('.tree-ns-children[data-lazy]'));
  var treeSrc = treeRoot ? treeRoot.getAttribute('data-tree-src') : '';

  // Where the column was left by the last thing that placed it, so that the rows arriving under a
  // reader who has scrolled in the meantime do not pull the tree out from under them.
  var placedScroll = 0;

  // Mirrors treeTypeRow in lib/pages.js, for the rows that have no members listed under them,
  // which is every row but the one being read. The mark references the sprite already on the page.
  function treeRowHtml(row, prefix) {
    var since = row.length > 3 && row[3] ? ' data-since="' + escapeHtml(row[3]) + '"' : '';

    return (
      '<div class="tree-type"' + since + '><div class="tree-type-label">' +
      '<span class="tree-arrow-spacer"></span>' +
      '<a class="tree-link" href="' + escapeHtml(prefix + row[1] + '/') + '">' +
      '<svg class="kind-icon" aria-hidden="true" focusable="false"><use href="#${ICON_PREFIX}' +
      escapeHtml(row[2] || 'class') + '"/></svg>' +
      escapeHtml(row[0]) +
      '</a></div></div>'
    );
  }

  function fillTree(asset) {
    var prefix = (asset && asset.prefix) || '';
    var groups = (asset && asset.groups) || {};

    lazyGroups.forEach(function (container) {
      var rows = groups[container.getAttribute('data-lazy')];
      if (!rows) return;

      var html = '';
      for (var i = 0; i < rows.length; i++) html += treeRowHtml(rows[i], prefix);

      // Appended rather than written over: a category group already holds its Overview row, which
      // is in the page so that it is there with the script off as well.
      container.insertAdjacentHTML('beforeend', html);
      container.removeAttribute('data-lazy');
    });
  }

  if (treeSrc && lazyGroups.length > 0) {
    fetch(treeSrc)
      .then(function (response) { return response.json(); })
      .then(function (asset) {
        fillTree(asset);
        // Over the whole tree this time: what was remembered may name a group that was empty until
        // now, and the version menu has rows to hide that were not there when it last ran.
        restoreTreeState();
        applyTreeVersion();
        syncCollapseAll();
        if (!treeRoot || treeRoot.scrollTop === placedScroll) placeTree();
      })
      .catch(function () {
        // Said rather than left blank. A group that opens onto nothing reads as a group with
        // nothing in it, and there is no way for the reader to tell that from a fetch that failed.
        lazyGroups.forEach(function (container) {
          container.insertAdjacentHTML(
            'beforeend',
            '<div class="tree-empty">Could not load the rest of the tree.</div>'
          );
        });
      });
  }

  // ---- Tree: collapse and expand ----
  document.querySelectorAll(GROUP_CONTROLS).forEach(function (label) {
    label.addEventListener('click', function () {
      var id = label.getAttribute('data-target');
      var children = document.getElementById(id);
      var arrow = label.querySelector('.tree-arrow');
      if (children) children.classList.toggle('collapsed');
      if (arrow) arrow.classList.toggle('collapsed');
      label.setAttribute('aria-expanded', String(children && !children.classList.contains('collapsed')));
      syncCollapseAll();
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
      var row = button.closest('.tree-type');
      var children = row && row.querySelector('.tree-type-children');
      if (!children) return;

      var shown = !children.classList.contains('show-inherited');
      children.classList.toggle('show-inherited', shown);
      button.setAttribute('aria-pressed', String(shown));

      var arrow = button.querySelector('.tree-arrow');
      if (arrow) arrow.classList.toggle('collapsed', !shown);
    });
  });

  // The toolbar button collapses every group at once, and that is all it does: a reader expands
  // the one branch they are after, so the other direction is never worth a click. With only one
  // thing to do, it sits disabled - dimmed by the stylesheet - while there is nothing to do it to.
  function syncCollapseAll() {
    var button = document.getElementById('collapse-all-btn');
    if (!button) return;

    var anyOpen = [].slice.call(document.querySelectorAll('.tree-ns-children')).some(function (g) {
      return !g.classList.contains('collapsed');
    });
    button.disabled = !anyOpen;
  }

  var treeToggleAll = document.getElementById('collapse-all-btn');
  if (treeToggleAll) {
    treeToggleAll.addEventListener('click', function () {
      document.querySelectorAll('.tree-ns-children').forEach(function (g) {
        g.classList.add('collapsed');
      });
      document.querySelectorAll(GROUP_CONTROLS).forEach(function (el) {
        el.setAttribute('aria-expanded', 'false');
        var arrow = el.querySelector('.tree-arrow');
        if (arrow) arrow.classList.add('collapsed');
      });

      syncCollapseAll();
      saveTreeState();
    });
  }

  // The tree's side of the version menu: rows for API that arrived after the chosen version are
  // hidden, and a group left holding nothing visible goes with them rather than opening onto an
  // empty list.
  function applyTreeVersion() {
    document.querySelectorAll('.tree-type').forEach(function (el) {
      el.querySelectorAll('.tree-child-link').forEach(function (row) {
        row.classList.toggle('hidden', !withinVersion(row));
      });
      el.classList.toggle('hidden', !withinVersion(el));
    });

    document.querySelectorAll('.tree-ns:not(.tree-overview)').forEach(function (ns) {
      var any = [].slice.call(ns.querySelectorAll('.tree-type')).some(function (t) {
        return !t.classList.contains('hidden');
      });
      ns.classList.toggle('hidden', !any);
    });
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
      applyTreeVersion();
    });

    applyFilter();
    applyTreeVersion();
  } else if (activeVersion) {
    // The one-version label: nothing to remember and nothing to listen to, but what came after that
    // version is hidden here exactly as the menu would hide it.
    applyFilter();
    applyTreeVersion();
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

  // ---- Page head: a name wider than its box ----
  // The title scrolls sideways rather than wrapping, and a box that scrolls with no bar on it says
  // nothing about what is off the end. This asks the box itself, so the fade goes on the names that
  // overrun and on no others, and comes off again once the end of one has been scrolled to.
  var pageTitle = stickyHead && stickyHead.querySelector('.page-title');

  if (pageTitle) {
    var syncTitleFade = function () {
      var over = pageTitle.scrollWidth > pageTitle.clientWidth + 1;
      var atEnd = pageTitle.scrollLeft + pageTitle.clientWidth >= pageTitle.scrollWidth - 1;
      pageTitle.classList.toggle('title-clipped', over && !atEnd);
    };

    syncTitleFade();
    pageTitle.addEventListener('scroll', syncTitleFade);
    // The font lands after this runs, so the name is not its final width yet.
    window.addEventListener('load', syncTitleFade);

    // The box itself, not the window: the column this sits in is what is left over once the
    // sidebar has been dragged to wherever the reader wants it, and dragging it fires nothing.
    if (window.ResizeObserver) {
      new ResizeObserver(syncTitleFade).observe(pageTitle);
    } else {
      window.addEventListener('resize', syncTitleFade);
    }
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
  //
  // Run again once the groups the page left out have been filled in: rows landing above the one
  // being read move it down the column, so a position measured against the skeleton is no longer
  // where the reader was. Where they have scrolled since, it is left alone - see placedScroll.
  function placeTree() {
    var active =
      document.querySelector('.tree-child-link.active') ||
      document.querySelector('.tree-link.active') ||
      document.querySelector('.tree-ns-link.active');

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

    placedScroll = treeRoot ? treeRoot.scrollTop : 0;
  }

  placeTree();

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

  // ...but Ctrl/Cmd+K asks for it from anywhere, which is the one shortcut a reader arriving from
  // any other docs site already has in their hands. Both modifiers rather than the platform's own,
  // since either is what somebody's fingers expect and neither means anything else here.
  //
  // Shift and Alt are let through untouched: Cmd+Shift+K and friends belong to the browser's own
  // tools, and a docs page taking them would be taking something it cannot give back. The default
  // is stopped only for the bare chord, where the browser would otherwise open its address bar.
  //
  // select() rather than a bare focus, so the chord pressed over a query already in the box starts
  // the next search instead of appending to the last one.
  var shortcutHint = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent || '')
    ? '⌘K'
    : 'Ctrl K';

  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
    if ((e.key || '').toLowerCase() !== 'k') return;

    e.preventDefault();
    input.focus();
    input.select();
  });

  // Said in the box itself, because a shortcut nobody is told about is a shortcut nobody presses.
  // In the placeholder rather than as a mark of its own: it is worth a glance on an empty box and
  // nothing at all once there is a query to read, which is exactly when a placeholder leaves.
  //
  // Written here rather than into the HTML because it names a key that depends on the machine, and
  // the page it is written into is built once for every reader.
  if (!input.value) input.placeholder = input.placeholder + '  ' + shortcutHint;

  // Namespace mode is a url shape, and the index is built once in the plain one. A result opened
  // from a namespace-mode page therefore has the segment put back, so following it keeps the mode
  // the way every other link on the page does. Empty everywhere else, where plain is the shape.
  var nsInsert = input.getAttribute('data-ns') || '';

  function rowUrl(url) {
    if (!nsInsert) return url;

    // From the right, so a site served under a prefix that happens to contain /type/ is not cut
    // at the prefix instead of at the page.
    var at = url.lastIndexOf('/type/');
    if (at < 0) at = url.lastIndexOf('/example/');
    return at < 0 ? url : url.slice(0, at) + nsInsert + url.slice(at);
  }

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

    // A dotted query is a qualified one, so it is matched against the displayed name as well: a
    // member's haystack holds the member alone, and 'sphere.center' names the type it is declared
    // on. Mirrors searchIndexEntries in lib/pages.js, which answers the ?q= form of the same search.
    var qualified = q.indexOf('.') >= 0;

    // A finalizer answers only a query written the way its name is. Constructors are not in the index
    // at all, having no name but their type's; a finalizer has one, and this keeps it from answering
    // for the type the way they did. See isFinalizerName in lib/pages.js.
    var finalizers = q.charAt(0) === '~';

    var matches = [];
    for (var i = 0; i < index.entries.length; i++) {
      var e = index.entries[i];
      if (scope >= 0 && e[7] !== scope) continue;
      var name = e[0].toLowerCase();
      if (!finalizers && name.charAt(name.lastIndexOf('.') + 1) === '~') continue;
      var pos = e[2].indexOf(q);
      if (pos < 0) {
        if (!qualified) continue;
        pos = name.indexOf(q);
        if (pos < 0) continue;
      }
      // Ranked on the name that was searched, which for a member is its own: see searchRank in
      // lib/pages.js, which ranks the server's answer to the same query the same way.
      var subject = qualified ? name : name.slice(name.lastIndexOf('.') + 1);
      var rank = subject === q ? 0 : (subject.indexOf(q) === 0 ? 1 : (subject.indexOf(q) >= 0 ? 2 : 3));
      matches.push([rank, pos, e]);
    }

    // Rank, then the earliest match, then the shortest name - the row with the least around what was
    // matched. The same order searchIndexEntries puts the ?q= answer in.
    matches.sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1] ||
        a[2][0].length - b[2][0].length || a[2][0].localeCompare(b[2][0]);
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

  // Rank 3 is the row the query was never found in the name of - see findMatches, which ranks on the
  // name it searched. Those are the rows matched through a summary or a parameter type, and the
  // dropdown leaves them to the results page: eight rows is a shortcut to the thing you have named,
  // and a name typed into the box is the reader saying they know what it is called. 'point' returned
  // eight summaries mentioning points ahead of Point3d, which is the one row the eight were for.
  var NAMELESS_RANK = 3;

  function renderNav(matches, q) {
    if (!navResults) return;

    if (matches.length === 0) {
      navResults.innerHTML = '<div class="nav-empty">No matches</div>';
      navResults.hidden = false;
      return;
    }

    // Sorted by rank, so the name matches are already the front of the list; the scan is what stops
    // once there are enough of them.
    var named = [];
    for (var i = 0; i < matches.length && named.length < NAV_LIMIT; i++) {
      if (matches[i][0] < NAMELESS_RANK) named.push(matches[i]);
    }

    var rows = named.map(function (m) {
      var e = m[2];
      var ns = (index.namespaces || [])[e[6]] || '';
      // The same outlined mark the tree puts beside a static member. The row has no signature on it
      // to say so in words, which is what the full results page has and this does not.
      var staticMark = e[9] & 1 ? '<span class="tree-badge tree-badge-static">S</span>' : '';

      return '<a class="nav-result" href="' + escapeHtml(rowUrl(e[1])) + '" role="option">' +
        kindIcon(e) +
        staticMark +
        '<span class="nav-result-name">' + markMatch(e[0], q) + '</span>' +
        '<span class="nav-result-ns">' + escapeHtml(ns) + '</span></a>';
    });

    // Counted over every match rather than the named ones, because that is what the page it opens
    // lists. With nothing named it is the only row there, and says so first: a query answered only by
    // summaries is still answered, and the dropdown should not read as though it found nothing.
    if (matches.length > rows.length) {
      if (rows.length === 0) rows.push('<div class="nav-empty">No name matches</div>');
      rows.push(
        '<a class="nav-results-more" href="' + escapeHtml(searchUrl()) + '">' +
          'Show all ' + matches.length + ' matches' + '</a>'
      );
    }

    navResults.innerHTML = rows.join('');
    navResults.hidden = false;
  }

  // ---- The results page ----
  // Every match is in the answer, a page of them at a time in the document. A bare query against a
  // large assembly matches thousands of rows, and building all of them at once is a freeze the
  // reader watches; a page is more than fills a window, so the next one is asked for well before
  // this one is read to the end.
  var PAGE_SIZE = 100;

  // What the query found, what the kind filter lets through, and how much of that is drawn. Held
  // rather than found again: filtering and reaching the end of the page both work from this, and
  // neither is a reason to search the index a second time.
  var matched = [];
  var listed = [];
  var listedQuery = '';
  var drawn = 0;
  var more = null;
  var watcher = null;

  // One result. Same shape the server builds in Renderer.searchResultHtml.
  // [name, url, haystack, summary, filterLetter, signature, nsIndex, asmIndex, icon, flags]
  function resultRow(m, q) {
    var e = m[2];
    var ns = (index.namespaces || [])[e[6]] || '';

    // One mark to a row, in the first line of it the word appears in: the name, then the summary, then
    // the declaration, each a better answer to why this row is listed than the one under it. Flag 2
    // says the declaration was never searched - a type's - so it is never the answer there. The same
    // rule searchResultHtml applies in lib/pages.js, which answers the ?q= form of this list.
    var summary = String(e[3] || '');
    var inName = e[0].toLowerCase().indexOf(q) >= 0;
    var inSummary = !inName && summary.toLowerCase().indexOf(q) >= 0;
    var inSig = e[5] && !(e[9] & 2) && !inName && !inSummary;

    return '<li data-filter="' + escapeHtml(e[4] || '?') + '">' +
      '<div class="r-head">' +
      kindIcon(e) +
      '<a class="r-name" href="' + escapeHtml(rowUrl(e[1])) + '">' + markMatch(e[0], q) + '</a>' +
      '</div>' +
      // Already highlighted markup, built by the same highlighter the server uses, which
      // escaped the code on the way in. Escaping it again would print the spans.
      (e[5]
        ? '<div class="r-sig">' + (inSig ? markMarkup(e[5], escapeHtml(q).toLowerCase()) : e[5]) + '</div>'
        : '') +
      (summary
        ? '<div class="r-summary">' + (inSummary ? markMatch(summary, q) : escapeHtml(summary)) + '</div>'
        : '') +
      '<div class="r-ns">' + escapeHtml(ns) + '</div>' +
      '</li>';
  }

  // Draws the next page, keeping the row that asks for the one after it at the end of the list for
  // as long as there is one to ask for.
  function drawPage() {
    var next = listed.slice(drawn, drawn + PAGE_SIZE);
    if (next.length === 0) return;

    var html = '';
    for (var i = 0; i < next.length; i++) html += resultRow(next[i], listedQuery);
    drawn += next.length;

    // Before the asking row rather than at the end of the list, so it stays the last thing in it
    // and the observer watching it does not have to be rebound to a new one every page.
    if (more) {
      more.insertAdjacentHTML('beforebegin', html);
    } else {
      results.insertAdjacentHTML('beforeend', html);
    }

    if (drawn >= listed.length) {
      // Nothing left to ask for, so nothing should be offering.
      if (watcher) watcher.disconnect();
      if (more) results.removeChild(more);
      more = null;
      return;
    }

    if (!more) {
      results.insertAdjacentHTML(
        'beforeend',
        '<li class="search-more"><button type="button" class="search-more-btn">Show more results</button></li>'
      );
      more = results.lastElementChild;
      more.querySelector('.search-more-btn').addEventListener('click', drawPage);
      if (watcher) watcher.observe(more);
    }
  }

  // Narrows the matches to the kind the filter bar is set to and draws the first page of them. This
  // is what the bar calls, so a kind selects over every match rather than over the drawn ones.
  function showResults() {
    listed = matched.filter(function (m) { return matchesFilter(m[2][4] || '?'); });

    if (watcher) watcher.disconnect();
    more = null;
    drawn = 0;
    results.innerHTML = '';

    drawPage();
  }

  // Reaching the end of the drawn rows asks for the next page, so a long list fills itself in as it
  // is read. The margin asks while the end is still below the fold, and .main-content is the element
  // that scrolls here rather than the document. The button on the row is what answers where there is
  // no observer to notice the end arriving.
  if (onSearchPage && window.IntersectionObserver) {
    watcher = new window.IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            drawPage();
            return;
          }
        }
      },
      { root: document.querySelector('.main-content'), rootMargin: '600px' }
    );
  }

  function run(query) {
    var q = query.trim().toLowerCase();
    if (!q) {
      if (results) {
        matched = [];
        showResults();
      }
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

      // The kind buttons keep whatever they were set to across a re-render, which showResults
      // applies on the way to drawing - there is no separate pass over the rows to hide any.
      matched = matches;
      listedQuery = q;

      // Which kinds this answer has, for the bar to offer. Read off the rows rather than counted per
      // button, so one pass over the matches answers for all of them. Null-prototype, so a letter is
      // never confused with something every object already has.
      var kinds = Object.create(null);
      for (var i = 0; i < matches.length; i++) kinds[matches[i][2][4] || '?'] = true;

      // Before the draw: a tab this answer has nothing under is widened back first, so the rows that
      // arrive are the ones the bar now claims to be showing.
      offerKinds(kinds);
      showResults();

      // Only now, with a list to narrow. Handing the filter bar this any earlier would have it
      // clear a server-rendered ?q= and draw an empty match list over it.
      filterSearchResults = showResults;

      // Only the empty result says anything; a hit count is noise above the hits themselves, and
      // the list is no longer clipped for a count to be the only warning of.
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
      // Set on what is already there rather than built from these two alone, which would drop the
      // kind tab's k on every keystroke - see writeParams.
      var params = urlParams();
      if (value) { params.set('q', value); } else { params.delete('q'); }
      if (searchScope()) { params.set('a', searchScope()); } else { params.delete('a'); }
      writeParams(params);
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

  // A static export serves the same prebuilt page for every ?q=, so the query lives only in
  // the url; the dev server renders it into the box, so an already-filled value wins.
  if (onSearchPage && !input.value) {
    var boot = urlParams();
    input.value = boot.get('q') || '';
    if (status && !status.getAttribute('data-scope') && boot.get('a')) {
      status.setAttribute('data-scope', boot.get('a'));
    }
  }

  if (input.value && onSearchPage) run(input.value);
})();
`;

module.exports = { CSS, JS };
