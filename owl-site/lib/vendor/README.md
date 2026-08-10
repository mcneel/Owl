# Vendored code

owl-site has no npm dependencies, which is the point of it: a docs generator that needs an install
before it can render anything is harder to adopt than one that does not. What lives here is the
exception, checked in rather than installed so that `node build.js` keeps working from a clean
clone with no network.

Nothing here is modified except where noted. To update one, replace the file and record the new
version and checksum below.

## temml.cjs, temml.css, temml.LICENSE

TeX to MathML, used by `lib/math.js` to render `$...$` and `$$...$$` in authored markdown while the
page is built. The reader receives MathML, so there is no client library, no webfont and nothing to
fetch: the same bargain `lib/highlight.js` makes for code.

| | |
| --- | --- |
| Version | 0.13.4 |
| Source | `https://registry.npmjs.org/temml/-/temml-0.13.4.tgz` |
| Tarball sha1 | `31add5b97b5b0653afaf182eaa50526a7daed435` |
| License | MIT, Ron Kok — see temml.LICENSE |

`temml.cjs` is the published `dist/temml.cjs`, byte for byte.

`temml.css` is the published `dist/Temml-Local.css` with its `@font-face` rule removed. That rule
points at a `Temml.woff2` this does not ship, and a stylesheet reaching for a file that is not there
is the one thing an offline export must not contain. The consequence is small and confined to
`\mathscr` and `\mathcal` capitals, which fall back to whatever math font the reader's system has —
Cambria Math on Windows, STIX Two Math on macOS. Everything else is drawn by the system math font
either way.

To ship the font instead: take `dist/Temml.woff2` from the same tarball, put it beside this file,
and restore the `@font-face` rule with the file inlined as a `data:` URI, so the export stays
self-contained.
