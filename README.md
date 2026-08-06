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
owl gen <project.csproj...>
  -o, --out <dir>     Where to write the model (default .owl/json)
  --name <text>       Site name
  --repo-url <url>    Base url for source links
  --tfm <tfm>         Target framework to document (default net8.0)
  --verify            Report undocumented public API and unresolved crefs
  -v, --verbose       Full diagnostics

owl serve <project.csproj...>
  --port <n>          Port to listen on (default 8080)
  --docs <dir>        Your hand-written pages (default docs/api)

owl build <project.csproj...>
  --out <dir>         Where to write the site (default .owl/site)
  --docs <dir>        Your hand-written pages (default docs/api)
  --base <path>       Path prefix the site will be served under
  --site-url <url>    Origin for canonical urls and the sitemap
```

`serve` and `build` generate first, so they take everything `gen` does. Give them `--json <dir>`
instead of projects to reuse a model.

`--name` and `--repo-url` are recorded in the model, so you set them once at generation time rather
than repeating them every time you serve or export.

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
| `/search/` | search |

Every page has its own title, meta description, canonical link, Open Graph tags, breadcrumbs and
JSON-LD, and every link is a real `href`. The site works with JavaScript disabled; JavaScript adds
the theme toggle, the kind filter, the collapsible navigation tree, the resizable sidebar, the
assembly selector and client-side search.

Syntax highlighting happens when the site is generated and nothing is loaded from a CDN, so an
exported site works with no network at all. Static output is written as `<path>/index.html`, which
serves from any plain file host with no rewrite rules, alongside `sitemap.xml` and `robots.txt`.

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

Supported Markdown: headings with anchors, bold, italic, strikethrough, inline code, fenced code
blocks with highlighting, links, images, ordered and unordered lists including nesting, blockquotes,
tables and horizontal rules.

## Requirements

- .NET SDK 8.0 or newer
- Node 18 or newer, for `owl serve` and `owl build`

Owl needs to be able to build your projects, since that is where the extra detail comes from. It runs
your build's own configuration, so conditional compilation, multi-targeting and package references
are honoured as your build defines them.
