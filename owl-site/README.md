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
| `--docs <dir>` | all | Authored markdown pages. |
| `--name <text>` | serve, build | Site name, overriding the one in the model. |
| `--logo <file>` | serve, build | Header icon, overriding `<docs>/logo.svg`. |
| `--logo-dark <file>` | serve, build | Header icon for the dark theme, overriding `<docs>/logo-dark.svg`. |
| `--port <n>` | serve | Port to listen on, default 8080. |
| `--out <dir>` | build | Where to write the site. Required. |
| `--base <path>` | serve, build | Path prefix the site is served under. |
| `--site-url <url>` | serve, build | Origin for canonical urls, Open Graph tags and the sitemap. |
| `--source-refs <path>` | serve, build | Root the "declared in" references hang from. Without it, none are shown. |
| `--d2 <path>` | serve, build | The `d2` binary that draws diagrams. Defaults to `d2` on `PATH`. |
| `--skip-undocumented` | all | Leave out anything with no `<summary>`. |
| `--dist <dir>` | check | Check an already-exported directory instead of rendering. |

`serve.js` watches the model, the docs directory and `lib/` itself, and reloads on change, so
editing a `MAIN.md`, regenerating the model or adjusting a renderer shows up on the next request.
The `lib/` watch drops those modules from the require cache before rebuilding, which is what makes a
change to the stylesheet — a string inside `lib/assets.js` — appear without restarting the process.
A file named by `--logo` or `--logo-dark` is watched too, since it sits outside those directories.

`--skip-undocumented` renders only what somebody has written a `<summary>` for, which is worth
having while coverage is still low: the alternative is a site whose pages are mostly signatures with
nothing under them. Everything is still generated, so the flag can be turned on and off against one
model without regenerating it.

A type stays even if its own summary is missing, as long as one of its members has one — the member
has nowhere else to be read. Enum values go the other way and stay with an enum that survived on its
own merits, since an enum without its values is not worth a page. References to something that was
left out render as plain text rather than as a link to a page that is not there.

The model records the file and line every member was declared at, but nothing is shown unless
`--source-refs` gives a root to hang those paths from — the recorded path is relative to the tree
the projects were built from and means nothing on its own. An `http`/`https` root turns each into a
link with a `#L<line>` anchor; anything else, such as a local checkout, is rendered as plain text.

A `logo.svg` at the root of the docs directory is inlined into the header, before the site name.
Draw it with `currentColor` and it follows the theme, and the link hover, on its own; give it its own
colours and it keeps them. It is sized by the stylesheet, so the file's own `width` and `height` do
not have to be anything in particular.

A `logo-dark.svg` beside it is optional, and only worth adding for a mark that cannot be made to
read on both backgrounds. Without one, `logo.svg` is used under both themes. With one, both are
inlined and the stylesheet shows whichever matches, so the right mark is painted on the first frame
rather than swapped in afterwards.

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

## URLs

| URL | Page |
|---|---|
| `/` | landing page, plus the assembly list |
| `/assembly/<assembly>/` | that assembly's page, its categories and namespaces |
| `/namespace/<namespace>/` | types in a namespace |
| `/category/<assembly>/<category>/` | category overview plus its types |
| `/type/<type>/` | one type, with its members as `#anchor` sections |
| `/search/` | search; the dev server also answers `?q=` without JavaScript |
| `/sitemap.xml`, `/robots.txt` | |

Every page has its own title, meta description, canonical link, Open Graph tags, breadcrumbs and
JSON-LD, and every link is a real `href`. The site works with JavaScript disabled; JavaScript adds
the theme toggle, the kind filter, the collapsible tree, the resizable sidebar, the assembly
selector and client-side search. Syntax highlighting, diagrams and math all happen at render time
and nothing loads from a CDN, so an exported site works with no network at all.

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
    docnodes.js    structured doc comments -> HTML, including cref links
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
