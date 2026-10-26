# Implementation notes

Background on decisions that are not obvious from the code. For what owl is and
how to use it, see the [README](README.md).

## Asking MSBuild for the compiler inputs

Owl reads source with Roslyn, but Roslyn discovers nothing on its own:
`CSharpCompilation.Create` takes a list of syntax trees and a list of metadata
references, and something has to produce those lists. A `.csproj` does not
contain them. Source files come from the SDK's implicit glob minus its
exclusions, references come from NuGet's transitive graph and the framework
reference pack, and preprocessor constants come from the TFM plus whatever
property sheets the project imports. One real-world project resolves to 6
source files, 180 references and 23 defines, and names none of them.

So `owl-gen` shells out once per project to `dotnet msbuild` with a target of
its own, `WriteOwlInputs` (in `owl-gen/owl.targets`), and asks for the values in
`Load/ProjectInputs.cs`. Most of them shape the compilation — `compile`,
`reference`, `define`, `langVersion`, `nullable`, `allowUnsafe`, `outputType`,
`assemblyName`, `keyFile` — and two more, `targetFramework` and
`assemblyVersion`, are recorded in the model.

`keyFile` is there for reading rather than for signing. A compilation's assembly
identity includes its public key, and identity is what an `InternalsVisibleTo`
in a dependency is matched against, so an unsigned compilation of a signed
assembly loses access to every internal a friend legitimately reaches into.
One real assembly produced thirteen inaccessibility errors from exactly this before
the key was captured, in code that builds without complaint.

`language` is `$(Language)`, and it is what decides which compiler the rest is
handed to. VB disagrees with C# about enough of the answer to need its own
lines: constants come from `FinalDefineConstants` as comma-joined `name=value`
pairs rather than from `DefineConstants` as semicolon-joined names, and they are
passed through verbatim because Roslyn ships the same parser `vbc` uses for that
string. `RootNamespace` stops being an IDE default and becomes a compiler option
that wraps every declaration. `Import` items are namespaces handed to the
compiler on the command line, appearing in no source file at all — the SDK
supplies eight before the project adds any, so a capture without them fails to
bind most of a normal VB assembly. `OptionStrict`, `OptionExplicit`,
`OptionInfer` and `OptionCompare` decide whether the rest binds at all.

The hook is `CustomAfterMicrosoftCommonTargets` rather than
`Microsoft.CSharp.targets`' own, because one target serves both languages.
`--tfm` names a preference rather than an instruction: `TargetFramework` is a
global property, so setting it selects the inner build of a multi-targeting
project but *overrides* a single-target one. A set mixing the two is ordinary —
a `net8.0;net48` library beside a `net48`-only one — so the capture first asks
`-getProperty:TargetFrameworks` and passes `TargetFramework` only where there is
a choice to make.

Shelling out is deliberate. MSBuildLocator and MSBuildWorkspace do the same
evaluation in-process, but couple owl to a particular MSBuild version and
runtime; `dotnet msbuild` asks whichever SDK the user actually has, and every
conditional property in the consuming project is honored for free.

Getting these wrong fails quietly rather than loudly, which is why they are
worth this much trouble. Missing references bind every external symbol to an
error type, so base types render unresolved, crefs go dead, and `<inheritdoc/>`
against a base outside the documented set yields nothing. Wrong defines drop
whole `#if` regions from the output with no diagnostic. The target captures
`ReferencePath` rather than `ReferencePathWithRefAssemblies` for the same
reason: the latter is empty this early in the chain, and points at reference
assemblies, which do not ship the sibling `.xml` files that inheritdoc needs.

The output is a line-based `key=value` file rather than JSON because MSBuild
cannot escape Windows backslashes for JSON without contortions, and repeated
keys accumulate into a list so `DefineConstants` is never split on `;` by
accident.

### What actually gets built

`WriteOwlInputs` depends on `ResolveReferences`, which stops short of
`CoreCompile`. The project being documented is therefore never compiled by
MSBuild — Roslyn compiles it in-process instead. Its `ProjectReference`
dependencies *are* built, because Roslyn loads references as metadata from real
files on disk, so those assemblies have to exist.

That split shows up in how failures behave, and the two halves are currently
inconsistent:

- **The documented project does not compile.** Capture still succeeds. Owl
  builds the compilation, collects the errors itself (`Program.cs:82`), notes
  them so the run exits non-zero, and carries on emitting docs from whatever
  bound.
- **A dependency does not compile.** MSBuild exits non-zero and writes no
  inputs file, so capture throws and the run aborts — every project, not just
  the one that failed.

The first case is the intended behavior; one broken project should not hide the
rest. The second contradicts it and is worth reconciling, with the caveat that
skipping a project silently removes its types from the documented set, which
degrades cross-assembly derived-type links.

Restore runs as its own invocation before the capture, and deliberately without
a `TargetFramework` — as a global property it propagates to referenced
projects, so restoring with `net8.0` also forces `net8.0` onto a
`netstandard2.0` dependency, whose assets file then comes back with no usable
target. `--no-restore` skips the pass; `--skip-msbuild` skips capture entirely
and reuses the previously written inputs files.

## One parser, two languages

Everything past the compilation works on `ISymbol`, which is language-neutral,
so adding VB touched almost none of it: `ApiBuilder` needed its
`CSharpCompilation` widened to `Compilation` and nothing else.

Syntax is where the two languages genuinely diverge, and they diverge in a
particularly unhelpful way. C# and VB each have their own `XmlElementSyntax`,
`XmlTextSyntax`, `DocumentationCommentTriviaSyntax` and the rest, describing the
same XML, and *neither set derives from the other* — they meet only at
`SyntaxNode`. So `DocCommentParser`, a thousand lines of judgement about what a
doc tag means, could not be shared by widening a type.

It is shared through `IDocXmlReader` (`Parse/DocXmlReader.cs`) instead: eight
questions the parser asks — what kind is this node, what is its tag name, its
content, its `name` attribute, its `cref` — with one implementation per language.
The parser matches no syntax types at all now. The C# reader is a transcription
of the private helpers the parser used to carry, which made the change checkable:
regenerating a real C# assembly's model before and after produced byte-identical
JSON.

Crefs still resolve semantically in both languages, which was not a given.
`VisualBasicExtensions.GetSymbolInfo` has an overload for `CrefReferenceSyntax`,
so a VB `<see cref="..."/>` reaches a real symbol the same way a C# one does,
rather than being reduced to a string.

Declarations needed a second walker rather than an abstraction —
`VisualBasicWalker` beside `CSharpWalker`, both reporting the same
`DeclaredSymbol` list. VB's shape is different enough to be worth stating: every
override is on a *statement* rather than the block around it, because a
`Function` with a body is a `MethodBlock` wrapping a `MethodStatement` while the
same function on an interface is a `MethodStatement` alone. Recording statements
covers both; recording blocks would miss half of them and recording both would
report every implemented member twice.

Two places rendered in the wrong language until told otherwise.
`ISymbol.ToDisplayString` renders in the *symbol's* language, so every signature
went through `Microsoft.CodeAnalysis.CSharp.SymbolDisplay.ToDisplayString`, which
renders any symbol in C# style — the one call the whole "C# signatures" decision
rests on. It is not quite total: a VB `Declare Function` is a `MethodKind` C# has
no name for, and the C# renderer throws rather than guess, so that one is spelled
out from its parts.

## Linking to the set next door

A documentation set covers the assemblies it was generated from, and every type it merely
references belongs to somebody else. On its own that is most of a signature: a plugin SDK's
parameters are its host library's types, and all of it rendered as dead text beside links to
everything the set did document.

`--link` maps an assembly to the site that documents it, and it is an assembly rather than a
namespace on purpose. A namespace is not owned by one assembly — `MyLib.UI` types can be documented
in the MyLib set while MyLib.UI.dll declares more of its own that are documented nowhere — so a
namespace map would send both to the same page and be wrong about half of them. That is why the
model now records the assembly on every external reference, which cost 1% of its size.

The url is computed from the doc id rather than looked up in the other set's model. Both sites are
written by owl, whose type slug is `Slug.Normalize` of the name with `T:` taken off, so the page is
derivable — which means a set can link into one that has not been built yet, and the two builds
need no ordering between them. The cost is that nothing verifies the target exists: an assembly
mapped to a site that does not document a particular type links to a 404. Feeding the other model
in would fix that, at the price of making the sets build in sequence.

External *members* stop at their declaring type's page. Their anchors are derivable too, but only
almost: owl appends a counter where two members normalize alike — six in 19,147 on one large library — and
a computed anchor would land those on the right page beside the wrong card.

## The tree is sent once, not with every page

The sidebar tree is the same list of types on every page that carries it — what
changes is which group is open and which row is marked — so writing it into each
page wrote the whole API into each page. On one large library that was 1491
types serialized 1881 times: 900 MB of a 944 MB export, 480 KB of a 582 KB type
page whose actual content was 86 KB. The host refused the push, which is how it
was found; the reader was paying for it on every navigation long before that.

So a page is written with the group it is standing in and no other. The rest are
empty containers naming what belongs in them, and `assets/tree-<tree>.json`
holds those rows once — a name, a slug, the mark to draw, and the version the
type arrived in where it has one. The browser fills them on load and the tree is
then exactly the tree that used to be written out, byte for byte, which is what
lets everything downstream of it — the filter, collapse-all, the remembered
expansion — stay as it was. 944 MB becomes 226 MB, and the asset is 107 KB
against the 480 KB each page used to carry.

The rows left out are the ones a reader without JavaScript could never see: a
collapsed group has no way to open without the script that toggles it. What they
keep is the group they are in, every group's heading — a namespace heading is a
link to the namespace's own page — and every category's Overview row, which is
written into the skeleton for exactly that reason. A failed fetch says so in the
tree rather than leaving the groups looking empty.

One asset per tree shape, not one per site: an assembly's categories are a
different list from every namespace, and namespace mode's urls carry its segment
while category mode's do not, so the rows differ by more than what they hold. The
assemblies tree is written out whole — it lists categories rather than types, and
is a few dozen rows.

## Shipping

owl ships as a .NET tool and nothing else. `.github/workflows/test.yml` packs a
prerelease on every push to `main` and keeps it as a workflow artifact, and
`.github/workflows/publish.yml`, run by a version tag, pushes a release to
nuget.org.

```
dotnet pack owl/Owl.csproj -c Release -p:VersionSuffix=ci.<run> -o nupkg
```

```
McNeel.Owl.0.0.0-ci.<run>.nupkg   3.5 MB   tools/net8.0/any, one package for every platform
```

Framework-dependent and RID-agnostic, which is not the compromise it sounds
like: owl-gen shells out to `dotnet msbuild`, so any machine able to run owl
already has an SDK, and bundling a runtime would hand it a second copy of what
it has. One 3.5 MB package covers Linux, macOS and Windows, where self-contained
binaries would have been about 81 MB each and one per platform.

Locally there is nothing to install — `dotnet run --project owl -- <args>` runs
it straight from the tree.

### Versioning

A release's version is its git tag, not a number in the source: `v1.2.3`
publishes `1.2.3`. `publish.yml` passes it as `-p:Version`, which wins outright
over what `owl/Owl.csproj` says, so releasing never needs a commit of its own
and the tag records exactly what shipped. The project file holds
`VersionPrefix` `0.0.0` and `VersionSuffix` `dev`, so anything not built from a
tag says so: `0.0.0-dev` locally, `0.0.0-ci.<run>` from CI, which overrides only
the suffix.

`owl --version` reads `AssemblyInformationalVersionAttribute` rather than the
assembly version, which is four numbers and cannot hold a prerelease suffix —
every `0.0.0-ci.N` build would otherwise report itself as plain `0.0.0`.

`RollForward` is `LatestMajor` because the tool targets `net8.0`: on a machine
whose newest runtime is 9 or 10 it otherwise refuses to start rather than roll
forward to what is there.

### Releasing

1. Merge everything the release needs into `main`.
2. Tag the merge commit and push the tag:

   ```
   git switch main && git pull
   git tag v1.2.3
   git push origin v1.2.3
   ```

3. `publish.yml` runs the tests, refuses a tag that is not on `main`, pushes
   `McNeel.Owl` `1.2.3` to nuget.org, and makes a GitHub release on the tag.

The release notes are GitHub's generated list of PRs merged since the previous
tag, by title, so a PR's title is what a reader of the release sees.

A failed run can be re-run from the Actions tab; a version already on nuget.org,
or a release that already exists, is skipped rather than failing. To fix a bad
release, tag a new version — nuget.org does not take the same version twice.

### One binary, three parts

`owl-gen` is a class library that owl links and calls in-process, not a second
executable it spawns. Both are .NET, so a separate process would have bought
nothing the shipped payload does not already carry. `OwlGen.Run`
takes a command line and returns an exit code, writing progress to standard
output the way a child process would, so linking changed nothing a user sees.

`owl-site` is JavaScript, so it cannot be linked. It is embedded and unpacked
for node instead.

### What is embedded, and why it has to be unpacked

Neither embedded payload can be used in place; both need a real path on disk.

`owl.targets` is embedded in owl-gen's assembly because MSBuild has to be handed
a file. The capture writes it into the inputs directory each run — a directory
owl-gen already creates and owns, so a run's MSBuild artifacts stay together and
nothing is left in a temp folder. Rewriting it every time means an upgraded owl
never reuses a stale copy. The lookup asks owl-gen's own assembly rather than
the entry assembly, which is what keeps it working once bundled inside owl.

`owl-site` (32 files, about 830 KB) is embedded in owl because node needs real
files to `require`. Those go to a temp directory keyed by owl's version, not
next to the binary, which is usually read-only once installed. They are
rewritten every run for the same reason: at that size, caching would buy nothing
and could serve a stale copy after an upgrade.

Not only the scripts. `icons/` is eleven SVGs read one per kind,
`lib/vendor/temml.cjs` is what `math.js` requires, and `lib/vendor/temml.css` is
read as `assets.js` loads — so a `.js`-only glob produced a binary that died on
the first page it rendered while every dev build kept working, because a dev
build resolves those from the source tree. `VerifySiteEmbedded` in `owl/Owl.csproj`
now fails the build if anything under `owl-site` is outside the embedded set.

### Prerequisites

A .NET SDK has to be on the machine, and not only to run the tool: owl-gen
shells out to `dotnet msbuild` to learn what a project compiles. `owl serve` and
`owl build` additionally need `node` on PATH. `owl gen` on its own needs only
the SDK.

`owl/Requirements.cs` checks both before a command starts, rather than letting
them surface where they bite: a missing `dotnet` otherwise appears as a child
process that would not start, from inside a capture, and a missing `node` only
after `owl build` has spent minutes generating the model it then cannot render.
`--list-sdks` rather than `--version` for dotnet, because a runtime-only install
answers the second and has no msbuild to run.

d2 is deliberately not checked there. It is needed only by a page that actually
holds a diagram, so owl-site probes on meeting the first one and leaves the
fence as a code block otherwise; requiring it up front would stop every project
that has never drawn anything. Naming one with `--d2` is different, and does
stop the run — asking for a particular binary is asking for it to work.

## Owl vs docify

[docify](https://github.com/mcneel/docify) is the generator owl replaces: a
Roslyn syntax walker over a directory of `.cs` files, feeding a hand-built JSON
string to a Vue app. It works, and it has run RhinoCommon's published API docs
for years. The difference is not that owl parses more carefully — it is that
owl parses a *compilation* and docify parses *text*, and almost everything
below follows from that one choice. File references are `docify/src/Parse/…`
for docify and paths relative to the repo root for owl.

### Symbols instead of syntax

Docify calls `CSharpSyntaxTree.ParseText` on one file at a time, with no
references and no semantic model (`SourceFileWalker.cs:10`). Every question
after that has to be answered from the characters the author typed, and the
answers are approximations:

- **Type names are whatever was written.** `ParsedMember.FullTypeName` maps the
  fourteen C# keywords by hand, then tries three hard-coded assemblies —
  `System.Runtime`, `System.Collections`, `System.Collections.Specialized`
  (`ParsedMember.cs:60`) — and otherwise returns the raw source string.
  `Point3d`, `IEnumerable<Brep>` and any `using`-aliased name come out
  unresolved. Owl gets qualified, generic-aware displays from a
  `SymbolDisplayFormat` (`owl-gen/Parse/DisplayFormats.cs`).
- **Accessibility is string matching.** `modifier.Text == "public"`
  (`CodeAnalysisExtensions.cs:19`), every interface member reported as protected
  (`ParsedMember.cs:199`), no `protected internal` or `private protected`, and
  type filtering that checks only the type's own modifiers
  (`Program.cs:176`) — so `internal class Outer { public class Inner { } }`
  publishes `Inner`. Owl reads `DeclaredAccessibility`, recurses containing
  types (`owl-gen/Parse/ApiBuilder.cs:238`), and deliberately re-surfaces
  explicit interface implementations, which report as private but are part of
  the contract (`ApiBuilder.cs:264`).
- **Signatures are built by slicing.** Hunting `'<'` and `'.'` positions in type
  text (`ParsedMember.cs:316`), `LastIndexOf('\n')` for fields (`:371`),
  `Replace("public ", "")` for operators (`:394`), and a
  `NotImplementedException` for anything unmatched (`:508`). `[Obsolete]`
  messages come from splitting the attribute's source text on `(` and `)` and
  taking element 1 (`CodeAnalysisExtensions.cs:54`), so
  `[Obsolete("Use Bar(int) instead")]` yields `Use Bar`. Owl emits ref kinds,
  `params`, optional flags and default values, generic constraints and variance,
  const values, `init`-only setters, per-accessor accessibility, and structured
  obsolete data with its `isError` (`ApiBuilder.cs:495`, `:759`).
- **Partial types need a merge heuristic.** Docify merges by name, last writer
  wins on documentation, and throws on mismatch (`ParsedType.cs:37`) — so which
  file wins depends on directory enumeration order. One `INamedTypeSymbol`
  already *is* every declaration, so owl needs no merge at all; the walker
  records each declaration and the builder keeps whichever one carries a doc
  comment rather than trusting `DeclaringSyntaxReferences[0]`
  (`ApiBuilder.cs:160`).
- **Whole declaration forms are invisible.** Docify's walker has no override for
  file-scoped namespaces, records, destructors, conversion operators, or the
  individual variables of a multi-declarator field. The first of those is not
  cosmetic: with only `NamespaceDeclarationSyntax` visited, every type in a
  `namespace Foo;` file resolves with an empty namespace and is then dropped
  outright (`JsonBuilder.cs:196`). Owl covers all five
  (`owl-gen/Parse/SourceFileWalker.cs:124`, `:154`, `:191`, `:233`, `:257`).

Source locations are the one piece of the model that only a compilation can
supply, and owl carries a repo-relative file and line for every symbol
(`ApiBuilder.cs:932`). Docify keeps a raw `SpanStart` int.

### The input set is captured, not guessed

The section on `WriteOwlInputs` above covers why owl asks MSBuild. Docify
guesses, in three places that each drop API silently:

- Preprocessor symbols are hard-coded to a single `RHINO_SDK`
  (`SourceFileWalker.cs:12`), so anything behind another `#if` is invisible.
- Sources are every `*.cs` under a directory, filtered by heuristics — including
  `file.Contains("\\obj\\")` (`Program.cs:207`), which never matches on macOS or
  Linux, so build intermediates are parsed there.
- There are no references at all, which is what makes everything in the previous
  section approximate.

### Documentation comments

This is the widest gap. Docify stringifies the comment, strips `///`, and
`LoadXml`s the result (`XmlDocumentedItem.cs:221`):

- Prose is rewritten before parsing: `"null " → "None "`, `"true " → "True "`,
  `"false " → "False "` (`:228`). Every summary in the corpus is edited.
- `LoadXml` is uncaught, so one unescaped `&` or `<` takes the run down. Owl
  reads Roslyn's XML *syntax* and never a raw string; the one string-XML path,
  for metadata symbols, is guarded (`owl-gen/Parse/DocCommentParser.cs:441`).
- Crefs are discarded. `<see>` becomes bold text from `child.Attributes[0]` —
  the first attribute, whatever it happens to be — under a literal
  `// TODO: linkify` (`XmlDocumentedItem.cs:111`). Owl binds the cref through
  the semantic model to a symbol, keeps its doc id, and marks it internal or
  external so the site can render an anchor (`DocCommentParser.cs:382`), with
  the `langword` and `href` forms handled separately (`:234`).
- `inheritdoc`, `paramref`, `typeparamref`, `typeparam`, `exception`, `value`,
  `note` and `br` are not implemented at all — they render as nothing. Owl
  handles each, plus `list`/`listheader`/`term`/`description`, and recurses into
  unknown tags so their text is not dropped (`DocCommentParser.cs:104`).
- Tag lookup is `GetElementsByTagName`, which matches anywhere in the document
  (`XmlDocumentedItem.cs:82`), so a `<returns>` or `<param>` written inside an
  `<example>` can be picked up as the member's own.
- Whitespace is trimmed per fragment (`:180`), which welds words to links. Owl's
  `Collapse(keepEdges: true)` exists precisely to keep
  `implementation of <see cref="IStorage"/> interface` readable
  (`DocCommentParser.cs:733`).
- `<code source="…">` is read, but only as a side channel: a separate pass
  collects the `source` attributes under `<example>`
  (`XmlDocumentedItem.cs:195`) and writes them to a second file, keyed by path,
  with a bare `ReadAllText` and no existence check (`JsonBuilder.cs:662`).
  `region` is not supported anywhere. Owl resolves the path against several
  roots, extracts the named region with nesting handled, dedents, and on failure
  still emits a node carrying the path so the page can name the missing example
  (`DocCommentParser.cs:798`).

`<inheritdoc/>` deserves its own note. Owl resolves it against base types,
overridden members, and both explicit and *implicit* interface implementations,
with cycle and depth guards, preferring blocks parsed in this run so crefs stay
structured, and falling back to `GetDocumentationCommentXml()` only for
genuinely external bases (`ApiBuilder.cs:990`). That fallback is why the capture
insists on `ReferencePath`: implementation assemblies ship the sibling `.xml`
files.

### Relationships and identity

Owl emits the inheritance chain, `Interfaces` and `AllInterfaces`, `Overrides`,
and `Implements` — including implicit interface satisfaction found through
`FindImplementationForInterfaceMember`, which is invisible in the compiler's own
doc XML (`ApiBuilder.cs:376`, `:602`). Derived types are linked across the whole
documented set at emit time, so a type can list subclasses declared in a sibling
project (`owl-gen/Emit/JsonEmitter.cs:77`).

Docify's equivalent is `GetBaseList` returning raw source strings with a
`"Runtime.CommonObject" → "CommonObject"` hack (`ParsedType.cs:233`), and
base-vs-interface classification by naming convention — starts with `I`, next
character uppercase — annotated `// TODO: guessing based on .Net naming
conventions` (`JsonBuilder.cs:236`). Types are keyed by short name, last one
wins across namespaces (`JsonBuilder.cs:59`), and that dictionary is what base
references resolve against. Owl keys everything by ECMA doc id, routed through
`OriginalDefinition` both to dodge a real Roslyn `NullReferenceException` on
constructed generics and because documentation lives on the open definition
(`owl-gen/Model/DocIds.cs:5`), unwraps arrays and pointers so `Brep[]` links to
`Brep` (`:58`), and dedupes page anchors (`ApiBuilder.cs:718`).

The clearest single measure of the gap: because a syntactic parser cannot see
through a BCL base type, docify needed a separate 523-line reflection subsystem
that re-resolves base types out of the reference assemblies and keys them by a
normalized short-name token (`BclMetadata.cs:26`). Owl gets inherited BCL
members from metadata references it has already loaded.

### Failure behavior

Owl accumulates findings — compilation errors, unresolved crefs, missing example
files, undocumented public members — prints them, and turns them into an exit
code under `--verify` (`owl-gen/Program.cs:100`, `:155`). The undocumented list
is the only place that information surfaces at all, since projects routinely
suppress CS1591; it is reported but deliberately does not fail the run, or the
gate would be useless on any real codebase. Docify has no diagnostics path.

Output integrity differs the same way. Owl serializes with `System.Text.Json`
into a temp file and moves it into place, so a crashed run never leaves a
half-written document for the site to choke on (`JsonEmitter.cs:54`). Docify
concatenates JSON — or JS with backtick template literals — by hand, with a
bespoke `JsonQuote` that drops `\r`, trims lines conditionally on whether the
string contains `<pre>`, and never escapes control characters
(`JsonBuilder.cs:97`); comma placement is ten hand-maintained "is any later
section non-null" chains (`:288`).

### What docify buys for that

Worth stating plainly, because it is the one thing owl gives up: docify runs
over any folder of `.cs` with no restore, no references and no build. That is
why it survived on a source tree that cannot always be built. Owl needs the
project to restore and its project references to compile, which costs
wall-clock time per run and makes fidelity depend on a clean build — it reports
errors and carries on rather than stopping, but a project full of them yields
correspondingly less. Docify's own README names the price of the other
approach: some namespaces need `methodgen` run over the source first, and the
BCL subsystem exists only because the parser cannot see inherited members.
