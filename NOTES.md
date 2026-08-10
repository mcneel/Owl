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
property sheets the project imports. One project in the RhinoCode set resolves
to 6 source files, 180 references and 23 defines, and names none of them.

So `owl-gen` shells out once per project to `dotnet msbuild` with a target of
its own, `WriteOwlInputs` (in `owl-gen/owl.targets`), and asks for the thirteen
values in `Load/ProjectInputs.cs`. Eight of them shape the compilation —
`compile`, `reference`, `define`, `langVersion`, `nullable`, `allowUnsafe`,
`outputType`, `assemblyName` — and two more, `targetFramework` and
`assemblyVersion`, are recorded in the model.

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

## Shipping

owl ships as a .NET tool and nothing else. `.github/workflows/build.yml` packs
one on every push to `main` and keeps it as a workflow artifact; other
repositories install from that.

```
dotnet pack owl/Owl.csproj -c Release -p:VersionSuffix=ci.<run> -o nupkg
```

```
McNeel.Owl.0.1.0-ci.<run>.nupkg   3.5 MB   tools/net8.0/any, one package for every platform
```

Framework-dependent and RID-agnostic, which is not the compromise it sounds
like: owl-gen shells out to `dotnet msbuild`, so any machine able to run owl
already has an SDK, and bundling a runtime would hand it a second copy of what
it has. One 3.5 MB package covers Linux, macOS and Windows, where self-contained
binaries would have been about 81 MB each and one per platform.

Locally there is nothing to install — `dotnet run --project owl -- <args>` runs
it straight from the tree.

### Versioning

The base is `VersionPrefix` in `owl/Owl.csproj`, so the number is owned by the
project rather than by a workflow file, and CI supplies only the suffix.
`VersionPrefix` rather than `Version` because the two differ under a suffix: an
explicit `Version` wins outright and would make `VersionSuffix` do nothing,
while a prefix composes with it. Packing with neither gives a plain `0.1.0`.

`owl --version` reads `AssemblyInformationalVersionAttribute` rather than the
assembly version, which is four numbers and cannot hold a prerelease suffix —
every `0.1.0-ci.N` build would otherwise report itself as plain `0.1.0`.

`RollForward` is `LatestMajor` because the tool targets `net8.0`: on a machine
whose newest runtime is 9 or 10 it otherwise refuses to start rather than roll
forward to what is there.

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
