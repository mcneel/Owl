# owl-site

Serves and exports the documentation website from a model written by `owl-gen`.

Most people should use the `owl` command rather than this directly — `owl serve` and `owl build`
generate the model and then call these scripts. Use them on their own when you already have a model
and only want to re-render it.

```bash
node serve.js --json .owl/json                  # http://localhost:8080
node serve.js --json .owl/json 9000
node build.js --json .owl/json --out ./site     # static export
node check.js --json .owl/json                  # links, metadata, offline-ness
```

## Options

| Option | Applies to | Meaning |
|---|---|---|
| `--json <dir>` | all | The generated model. Required. |
| `--docs <dir>` | all | Authored markdown pages. Without it the site is browsed by namespace alone — see [Two kinds of site](#two-kinds-of-site). |
| `--name <text>` | serve, build | Site name, overriding the one in the model. |
| `--logo <file>` | serve, build | Header icon, overriding `<docs>/logo.svg`. |
| `--logo-dark <file>` | serve, build | Header icon for the dark theme, overriding `<docs>/logo-dark.svg`. |
| `--favicon <file>` | serve, build | Browser tab icon, as `.svg`, `.png` or `.ico`. Without it the tab shows the logo. |
| `--port <n>` | serve | Port to listen on, default 8080. |
| `--out <dir>` | build | Where to write the site. Required. |
| `--base <path>` | serve, build | Path prefix the site is served under. |
| `--site-url <url>` | serve, build | Origin for canonical urls, Open Graph tags and the sitemap. |
| `--source-refs <path>` | serve, build | Root the "declared in" references hang from. Without it, none are shown. |
| `--api-versions <list>` | serve, build | Versions the header's picker offers, newest first. Without it there is no picker. |
| `--link <asm>=<url>` | serve, build, check | Site documenting a referenced assembly. Repeatable; `<asm>` may end in `*` to cover a family. `check` takes it so those links are counted as leaving rather than as broken. |
| `--d2 <path>` | serve, build | The `d2` binary that draws diagrams. Defaults to `d2` on `PATH`. |
| `--skip-undocumented` | all | Leave out anything with no `<summary>`. |
| `--quiet` | build | Only print the summary, not per-page progress. |
| `--dist <dir>` | check | Check an already-exported directory instead of rendering. |
| `-h`, `--help` | check | Show `check.js`'s usage. `serve.js` and `build.js` print none: `owl --help` is the one place every option is documented, so there is nothing here to drift from it. |

`serve.js` also takes a bare port as a positional argument, so `node serve.js --json .owl/json 9000`
and `--port 9000` are the same thing.

`--d2` names the binary that draws diagram fences. Not having d2 at all is fine — a fence stays the
code block it was written as and the run logs one line — but naming one that is not there is a
mistake, and stops the run rather than quietly producing a site with no diagrams in it.

`serve.js` watches the model, the docs directory and `lib/` itself, and reloads on change, so
editing a `MAIN.md`, regenerating the model or adjusting a renderer shows up on the next request.
The `lib/` watch drops those modules from the require cache before rebuilding, which is what makes a
change to the stylesheet — a string inside `lib/assets.js` — appear without restarting the process.
A file named by `--logo`, `--logo-dark` or `--favicon` is watched too, since it sits outside those directories.

`--skip-undocumented` renders only what somebody has written a `<summary>` for, which is worth
having while coverage is still low: the alternative is a site whose pages are mostly signatures with
nothing under them. Everything is still generated, so the flag can be turned on and off against one
model without regenerating it.

A type stays even if its own summary is missing, as long as one of its members has one — the member
has nowhere else to be read. Enum values go the other way and stay with an enum that survived on its
own merits, since an enum without its values is not worth a page. References to something that was
left out render as plain text rather than as a link to a page that is not there.

A type from outside the set resolves in three steps: the documented set, then whichever site
`--link` names for the assembly it was declared in, then Microsoft Learn for the framework. Both
places a reference can appear go through the same resolution — `crefUrl` in `lib/docnodes.js` for
everything structured, since parameters, interfaces and base types are all rendered as crefs, and
`externalTypeUrl` in `lib/pages.js` for the names in a highlighted signature, which are text and
have to be matched back to a doc id first.

Cross-site urls are computed rather than looked up, from the doc id and owl's slug rule, so nothing
has to be fetched and the other site does not have to exist yet. An external *member* stops at its
declaring type's page: owl appends a counter to disambiguate two members whose anchors normalize
alike, and that counter cannot be derived, so an anchor computed from here would occasionally be
wrong. C# keywords are left to Learn — `string` is `System.String` wherever it is written.

The model records the file and line every member was declared at, but nothing is shown unless
`--source-refs` gives a root to hang those paths from — the recorded path is relative to the tree
the projects were built from and means nothing on its own. An `http`/`https` root turns each into a
link with a `#L<line>` anchor; anything else, such as a local checkout, is rendered as plain text.

`--api-versions 9,8` is what draws the header's version picker, and the only thing that makes a
`<since>` tag do anything. Choosing a version hides every API a `<since>` puts after it — in the
page and in the tree beside it — which is why an untagged API belongs to every version rather than
to none. The list is given newest first and the first entry is what a reader arrives on; their
choice is remembered, and one naming a version a later build no longer offers falls back to that
build's default.

Each entry is the comparison as well as the label. A number is drawn with a `v` in front of it, so
`9,8` reads as `v9` and `v8`; an entry starting with a letter is a spelling somebody chose and is
left as written, so `V9,V8` stays `V9` and `V8` rather than becoming `vV9`. Only the leading number
is compared and only its major part, so a `<since>8.0</since>` belongs to `v8`. That is also why an
entry with no number in it is rejected rather than accepted as a version nothing can be older than.

One version is drawn as a label rather than a menu: a menu of one offers a choice already made.
It still filters, which is what lets a site be pinned to an older version and hide what came after
it, and it keeps the header saying which version is being read. Without the option there is no
picker at all and every API is shown, which is what a library that has never tagged anything wants.

Wherever a `<since>` is set it also shows as a `Since v8.0` chip at the right of that type's or
member's card — on a site with no picker too, since when an API arrived is worth reading either way.

A `logo.svg` at the root of the docs directory is copied into the site and shown in the header,
before the site name. It is sized by the stylesheet, so the file's own `width` and `height` do not
have to be anything in particular.

A `logo-dark.svg` beside it is optional, for a mark that does not read on the dark background.
Without one, `logo.svg` is used under both themes. With one, the stylesheet shows whichever matches,
so the right mark is painted on the first frame rather than swapped in afterwards.

The browser tab shows the logo too, unless `--favicon` names another file. The tab icon follows
the browser's own light or dark setting, never the site's toggle, so with both logos it shows
`logo.svg`. Older Safari ignores an `.svg` tab icon; give a `.png` if that matters.

## Diagrams

A ` ```d2 ` fence in an authored page, or a `<code lang="d2">` in a doc comment, is drawn by
[d2](https://d2lang.com) while the page is rendered and inlined as SVG.

````markdown
```d2
direction: right
Code -> Compile -> Execute -> Result
```
````

d2 rather than Mermaid because Mermaid renders in a browser: as a client bundle it costs about a
megabyte and a visible flash, and as a build step it costs a headless Chrome. d2 is a binary that
answers in milliseconds, so the diagram is in the markup where a crawler can see it, its labels can
be selected and searched, and the export still fetches nothing.

Install it with `brew install d2`, or from d2lang.com. It is **optional**: without it a diagram
fence renders as the code block it was written as, and the build logs one line saying so. The same
line appears if d2 rejects a diagram, along with what it objected to.

Each diagram is drawn once for both themes. d2 is asked for a light and a dark palette together,
which makes it write colours as classes and put the dark set behind a `prefers-color-scheme` query;
that query is rewritten to key on this site's own `data-theme`, so a diagram follows the theme
toggle rather than the operating system. Diagrams are cached by source for the life of the process,
so the dev server redraws only what changed.

d2 has LaTeX of its own for labels inside a diagram, which needs nothing further here:

````markdown
```d2
formula: |latex
  \sum_{i=0}^{n} i^2
|
```
````

## Math

`$...$` in an authored page is typeset inline and `$$...$$` as a display block, by
[Temml](https://temml.org), which is vendored (see `lib/vendor/README.md`). The output is MathML,
which every current browser draws natively: no client library, no webfont, nothing fetched, and an
equation that stays selectable text and scales with the paragraph around it.

```markdown
The energy of a mass is $E = mc^2$, and the sum of the first $n$ squares is

$$
\sum_{i=0}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}
$$
```

Prose that merely contains dollars is left alone: an inline formula may not have a space just
inside either delimiter, and a closing `$` may not be followed by a digit, so `costs $5 and $10`
and `set $PATH and $HOME` are text. A dollar inside a code span is always literal. TeX that does
not parse is left as the author wrote it, with a line in the build log.

Math is not read in doc comments — only in authored markdown. A `$` is too ordinary a character in
API prose to reinterpret across a whole existing corpus.

There are **no npm dependencies**, by design: a docs generator that needs an `npm install` before it
renders anything is harder to adopt than one that does not. Node 18 or newer. The one exception is
`lib/vendor/`, which is checked in rather than installed for exactly that reason; `d2` is an
external binary and entirely optional.

## Two kinds of site

`--docs` decides how the site is browsed, because what it names is what there is to browse: prose
organised into categories, or nothing but the API.

**With authored pages**, the sidebar is the assembly's categories and the reader is in *category
mode*. Namespaces are still there — a type's breadcrumbs name the one it lives in — and following
that crumb switches to *namespace mode*, where the sidebar is a group per namespace holding its
types. The mode rides on the url as a query flag, so a link can still be handed to somebody else
as the thing they will see: `/type/x/` is the category reading and `/type/x/?ns` the namespace
one, and every link a namespace-mode page writes carries the flag. The two readings are one file —
the page carries the other mode's tree in an inert template and its script swaps it in when it
sees the flag — which is what keeps the export from writing a full copy of every type page.

The urls the copies used to be published at, `/namespace/type/x/` and its example twin, are still
written: each is a small stub that forwards to the plain page with the flag on, `noindex`, naming
the plain url as its canonical, and absent from the sitemap.

**Without authored pages** there is only namespace mode, so nothing is marked and the urls stay
plain. Category pages do not exist, the landing page is the namespace index rather than a note
asking for a `MAIN.md`, and the sidebar is the same namespace tree on every page. This is the shape
an API dump wants — a library with no `<category>` tags and no prose would otherwise open on a
single group holding every type it has.

## URLs

| URL | Page |
|---|---|
| `/` | landing page: the authored one, or the namespace index |
| `/assembly/<assembly>/` | that assembly's page, its categories and namespaces |
| `/namespace/<namespace>/` | types in a namespace |
| `/category/<assembly>/<category>/` | category overview plus its types; only with authored pages |
| `/type/<type>/` | one type, with its members as `#anchor` sections; `?ns` reads it in namespace mode |
| `/example/<type>/<member>/` | one member's examples, tabbed by language; `?ns` as above |
| `/namespace/type/<type>/`, `/namespace/example/<type>/<member>/` | stubs forwarding the urls namespace mode used to publish; only on a site that has both modes |
| `/search/` | search; the dev server also answers `?q=` without JavaScript |
| `/sitemap.xml`, `/robots.txt` | |
| `/llms.txt` | for AI agents: each assembly with its categories and namespaces, linking their Markdown copies |
| `<page>.md`, `/index.md` | the Markdown copy of a page, its trailing slash replaced: `/type/<type>.md` |
| `/type/<type>/<member>.md` | every overload of one member name, e.g. `/type/rhino.geometry.curve/offset.md` |

## Markdown for Agents

Every page above that documents API has a Markdown copy, written beside it by the export and named
in its head as `<link rel="alternate" type="text/markdown">`. A type's copy lists its members a line
each and links every name to its own page, so an agent after one method reads a few KB, not the
whole type. Links in a copy lead to other copies.

A request that ranks `text/markdown` above `text/html` in its `Accept` header gets the copy at the
page's own address. `serve.js` and the `--server` host answer that; a plain file host serves the
`.md` files but cannot. Search, references and What's New have no copy yet.

Every page has its own title, meta description, canonical link, Open Graph tags, breadcrumbs and
JSON-LD, and every link is a real `href`. Every page reads with JavaScript disabled; JavaScript
adds the theme toggle, the kind filter, the resizable sidebar, the assembly selector, the version
picker where there is one, and client-side search, and is what fills the sidebar tree and switches
the browse mode. Syntax highlighting, diagrams and math all happen at render time and nothing
loads from a CDN, so an exported site works with no network at all.

A page is written with only the tree row it is standing on — the type being read, its member
links under it; the rest arrive from `/assets/tree-<tree>.json`, once per read rather than once
per page. Without JavaScript the reader keeps that row, every group's heading and every category's
Overview link, and the category and namespace pages carry the full lists the tree would have
shown. The tree's rows and the namespace-mode copies were each about half of what an export
weighed, and both are gone from it.

## Layout

```
owl-site/
  package.json     no dependencies; scripts only
  serve.js         dev server
  build.js         static export
  check.js         link and metadata self-check
  lib/
    site.js        wires model + routes + renderer; used by all three entry points
    model.js       loads the generated model and the authored markdown
    pages.js       page renderers
    layout.js      page shell, including all SEO metadata
    docnodes.js    structured doc comments -> HTML and Markdown, including cref links
    mdpages.js     Markdown copies of the pages, and llms.txt
    markdown.js    authored markdown -> HTML
    highlight.js   syntax highlighting at render time
    diagrams.js    ```d2 fences -> inline SVG, drawn by the d2 binary
    math.js        $...$ and $$...$$ -> MathML, typeset by vendored Temml
    theme.js       kind icons, colours and the assembly palette
    icons.js       reads icons/ and writes the per-page sprite
    routes.js      URL construction and matching
    assets.js      CSS and client JavaScript
    html.js        escaping helpers
    vendor/        third-party code, checked in rather than installed
  icons/           one 16x16 svg per kind, drawn in currentColor
```
