# 🦉 Owl

General purpose API documentation generator and website builder for .NET.

Point owl at your projects and get a documentation website: a page per type with its members as
anchored sections, browsable by assembly and category, with search.

## Why

Owl uses semantic analysis so the documentation it writes knows:

- **base types, interfaces and full inheritance chains**, resolved rather than named
- **derived types**, computed across every project you document together
- **real accessibility**, so internal and private API stays out of your published site
- **explicit *and* implicit interface implementations**, taken from the symbol
- **source file and line** for every type and member, linkable to your repository
- **`<inheritdoc/>` resolved** against base types and interfaces, including ones from outside your
  own code
- **doc comments kept structured**, so a `<see cref="..."/>` carries what it points at and renders as
  a working link instead of styled text
- **`<category>` xml tag**, so classes and interfaces can be logically grouped (e.g. `/// <category>Storage</category>`)
- **`<since>` xml tag**, so classes and interfaces mark which API version they were added in (e.g. `/// <since>8.0</since>`)
- **Main Markdown**, so the site and each assembly have a hand-written entry page
- **Category Markdowns**, so each category has a hand-written overview page

## Installing

owl is published from `main` as a .NET tool package — one ~3.5 MB `.nupkg` that serves Linux,
macOS and Windows alike. It is framework-dependent, which costs nothing here: `owl gen` shells out
to `dotnet msbuild`, so any machine able to run owl already has the SDK such a package needs.

The latest build of `main`, from the workflow artifact:

```bash
RUN=$(gh run list -R mcneel/Owl -w build -b main -s success -L1 --json databaseId -q '.[0].databaseId')
gh run download "$RUN" -R mcneel/Owl -n owl-nupkg --dir pkg

dotnet tool install McNeel.Owl --source pkg --tool-path ./bin --prerelease
./bin/owl --version
```

`--source` rather than `--add-source`, because a tool package carries its dependencies: the
install resolves entirely from that folder and never reaches nuget.org. `--prerelease` is required
because every build is versioned `0.1.0-ci.<run>` — the base comes from `owl/Owl.csproj` and CI
appends the run number. Drop `--tool-path` to install it on PATH as an ordinary global tool.

Artifacts are kept for 90 days, so pin by keeping the `.nupkg` rather than by expecting an old
run to still be downloadable.

Working on owl itself, there is nothing to install — run it straight from the tree:

```bash
dotnet run --project owl -- serve --json .owl/json
```

From inside GitHub Actions, reading a private repo needs a token of its own — a fine-grained PAT
with `actions: read` on this repository. A repository's own
`GITHUB_TOKEN` cannot reach another repository.

## Commands

```bash
owl gen   <project.csproj...>   # write the documentation model
owl serve <project.csproj...>   # write it, then serve it locally
owl build <project.csproj...>   # write it, then export a static site
```

Pass several projects to document them as one set. This matters: a `<see cref="..."/>` pointing at
another project in the set becomes a link, derived types are found across the whole set, and anything
outside it is left as plain text rather than a dead link.

```bash
owl gen src/MyLib/MyLib.csproj src/MyLib.Extras/MyLib.Extras.csproj --name "MyLib API"
```

`serve` and `build` regenerate the model first. Point them at an existing one to skip that:

```bash
owl serve --json .owl/json
owl build --json .owl/json --out ./public
```

### Options

```
owl <command> ...
  -h, --help            Show this help
  --version             Print owl's version

owl gen <project.csproj...>
  -o, --out <dir>       Where to write the model (default .owl/json)
  --name <text>         Site name, recorded in the model
  --tfm <tfm>           Target framework to document (default net8.0)
  -c, --configuration   Build configuration MSBuild evaluates under (default Debug)
  --repo-root <dir>     Root that recorded source paths are relative to (default: git root)
  --examples <dir>      Extra root for <code source="..."/> paths, tried before the project
                        directory and the repo root
  --skip-msbuild        Reuse previously captured project inputs
  --no-restore          Skip the restore pass before capturing inputs
  --verify              Report undocumented public API and unresolved crefs
  -v, --verbose         Full diagnostics

owl serve <project.csproj...>
  -o, --out <dir>       Where to write the model (default .owl/json)
  --port <n>            Port to listen on (default 8080)

owl build <project.csproj...>
  -o, --out <dir>       Where to write the site (default .owl/site)
  --quiet               Only print the summary, not per-page progress

owl serve and owl build, both
  --json <dir>          Reuse an existing model instead of generating one
  --docs <dir>          Your hand-written pages (default docs/api, when it exists)
  --name <text>         Site name, overriding the one recorded in the model
  --logo <file>         Header icon, overriding <docs>/logo.svg
  --logo-dark <file>    Header icon for the dark theme; without one, --logo covers both
  --base <path>         Path prefix the site will be served under
  --site-url <url>      Origin for canonical urls and the sitemap
  --source-refs <path>  Root for "declared in" references; without it there are none
  --d2 <path>           The d2 binary that draws diagrams (default: d2 on PATH)
  --skip-undocumented   Leave anything with no <summary> out of the site
```

`serve` and `build` generate first, so they take everything `gen` does. Give them `--json <dir>`
instead of projects to reuse a model.

`--name` is recorded in the model, so you set it once at generation time rather than repeating it
every time you serve or export. Passing it to `serve` or `build` overrides it for that run.

Every member's source file and line is recorded too, but nothing is shown until `--source-refs`
gives a root to hang those paths from — on its own the recorded path is relative to the tree the
projects were built from and means nothing. An `http`/`https` root turns each into a link with a
`#L<line>` anchor; anything else, such as a local checkout, renders as plain text.

Projects that target several frameworks are documented one framework per run. `--tfm net48` for the
desktop build, `--tfm net8.0` for the modern one.

`--verify` is worth running in CI. Most projects suppress CS1591, so an undocumented public member
never shows up in a normal build; `--verify` is where it surfaces, along with any
`<see cref="..."/>` that does not resolve to a real symbol.

## The site

| URL | Page |
|---|---|
| `/` | landing page and the list of assemblies |
| `/assembly/<assembly>/` | one assembly, with its categories and namespaces |
| `/namespace/<namespace>/` | the types in a namespace |
| `/category/<assembly>/<category>/` | a category overview and its types |
| `/type/<type>/` | one type, its members as `#anchor` sections |
| `/example/<type>/<member>/` | one member's examples, tabbed by language |
| `/namespace/type/<type>/` | the same type page in namespace mode |
| `/search/` | search |

Every page has its own title, meta description, canonical link, Open Graph tags, breadcrumbs and
JSON-LD, and every link is a real `href`. The site works with JavaScript disabled; JavaScript adds
the theme toggle, the kind filter, the collapsible navigation tree, the resizable sidebar, the
assembly selector and client-side search.

Syntax highlighting, diagrams and math all happen when the site is generated and nothing is loaded
from a CDN, so an exported site works with no network at all. Static output is written as
`<path>/index.html`, which serves from any plain file host with no rewrite rules, alongside
`sitemap.xml` and `robots.txt`.

While `owl serve` is running it watches the model and your hand-written pages and picks up changes on
the next request.

## Writing the docs

Ordinary C# documentation comments, plus two tags of owl's own. They are not standard C# doc tags, so
the compiler passes them through untouched:

```csharp
/// <summary>Reads and writes code.</summary>
/// <category>Storage</category>
/// <since>2.1</since>
public interface IStorage { }
```

`<category>` groups types on the site, which is how you get a reading order that isn't just
alphabetical namespaces. `<since>` records the version a type appeared in and shows as a chip on its
page.

### Hand-written pages

Some pages are prose, not generated API. They live under your docs directory (`docs/api` by default)
as plain Markdown with no front-matter:

```
docs/api/MAIN.md                        the site's landing page
docs/api/<AssemblyName>/MAIN.md         an assembly's landing page
docs/api/<AssemblyName>/<Category>.md   a category overview
```

Folder names match your assembly names, and a category file's name matches its `<category>` value,
both compared case-insensitively. `MAIN.md` inside an assembly folder is that assembly's page, never
a category called "MAIN". The category path includes the assembly because category names are only
unique within one — `Options` and `Utilities` tend to show up in several.

The first paragraph of an assembly's `MAIN.md` doubles as its blurb on the landing page and as that
page's meta description.

Any page you don't write falls back to a stub telling you where to add it, so a fresh checkout works
before you have written a word.

Write none at all — no `--docs`, and no `docs/api` directory to default to — and the site becomes an
API dump instead: no category pages, no stubs asking for prose, and a sidebar that is one group per
namespace holding its types, the same on every page. That is the right shape for a library with no
`<category>` tags, which would otherwise open on a single group holding everything it has.

A site that does have hand-written pages offers both ways of reading. The sidebar is the assembly's
categories, and following the namespace in a type's breadcrumbs switches to the namespace tree,
where it stays until you click your way back out. The two are two sets of urls — `/type/x/` and
`/namespace/type/x/` — so a link goes to the reader as the page you were looking at, with no
JavaScript and nothing remembered between visits.

Supported Markdown: headings with anchors, bold, italic, strikethrough, inline code, fenced code
blocks with highlighting, links, images, ordered and unordered lists including nesting, blockquotes,
tables and horizontal rules, plus diagrams and math.

### Diagrams and math

A ` ```d2 ` fence is drawn by [d2](https://d2lang.com) and inlined as SVG, and `$...$` / `$$...$$`
are typeset as MathML:

````markdown
```d2
direction: right
Code -> Compile -> Execute -> Result
```

The sum of the first $n$ squares is $\sum_{i=0}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}$.
````

Both happen while the site is generated, so a diagram is markup a crawler can read rather than a
picture, an equation is text that scales with the paragraph, and neither ships a library to the
reader. A diagram follows the site's theme toggle, light or dark, from a single drawing.

Math needs nothing installed. Diagrams need the `d2` binary (`brew install d2`) and are optional
without it: a diagram fence renders as a code block and the build says so in one line. Fences in
other languages are unaffected either way, and math is read only in these pages, not in doc
comments, where a `$` is too ordinary a character to reinterpret.

## Requirements

| | Needed by | Without it |
|---|---|---|
| .NET SDK 8.0+ | `owl gen`, and `serve`/`build` when they generate | owl stops before starting |
| Node 18+ | `owl serve`, `owl build` | owl stops before generating |
| [d2](https://d2lang.com) | ` ```d2 ` fences only | the fence renders as a code block, and the run says so |

The SDK is not only there to run owl: owl needs to be able to build your projects, since that is
where the extra detail comes from. It runs your build's own configuration, so conditional
compilation, multi-targeting and package references are honoured as your build defines them.

Both hard requirements are checked before a command does any work, so a missing one is a sentence
naming what to install rather than a failure minutes into a build. `d2` is checked when the first
diagram is met, which is why a project that draws nothing never needs it.
