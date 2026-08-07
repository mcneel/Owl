# Implementation notes

Background on decisions that are not obvious from the code. For what owl is and
how to use it, see the [README](../README.md).

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

One command produces the whole installer payload — a single file in `dist/`:

```
dotnet publish owl/Owl.csproj -c Release -r osx-arm64 --self-contained
```

```
dist/owl    84 MB   everything: the CLI, the extractor, and the site renderer
```

`osx-arm64`, `osx-x64`, `win-x64` and `linux-x64` are pre-listed for restore.
Copy that one file anywhere and owl works.

### One binary, three parts

`owl-gen` is a class library that owl links and calls in-process, not a second
executable it spawns. Both are .NET, so a separate process would have meant a
second copy of the runtime in the shipped payload for nothing. `OwlGen.Run`
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

`owl-site` (14 scripts, about 140 KB) is embedded in owl because node needs real
files to `require`. Those go to a temp directory keyed by owl's version, not
next to the binary, which is usually read-only once installed. They are
rewritten every run for the same reason: at that size, caching would buy nothing
and could serve a stale copy after an upgrade.

### Not compressed

`EnableCompressionInSingleFile` halves the binary, from 84 MB to 38 MB. It is
off because it makes owl crash.

With compression on, documenting a large project set died with a fatal
`AccessViolationException` inside Roslyn's parallel symbol completion
(`SourceMemberContainerTypeSymbol.ComputeInterfaceImplementations` under
`RoslynParallel`) on 7 of 11 runs. The same workload is clean on an uncompressed
single file, on a self-contained non-single-file publish, and on an ordinary
dev build. The crash is a hard SIGABRT, not an exception owl can report.

The size is tempting enough that someone will try turning it back on. Run a
large project set several times before believing it works; a single passing run
proves nothing at that failure rate.

### Not trimmed

Roslyn resolves plenty by reflection, and the model is written by the
reflection-based `JsonSerializer`, which reports IL2026 under `PublishTrimmed`:
the model types' property metadata can be trimmed away. The failure mode is a
smaller binary that quietly writes a wrong model, which is a bad trade against a
larger file. Trimming would first need a source-generated
`JsonSerializerContext`, and Roslyn would still need proving.

### Properties that must stay off the project files

`SelfContained` and `RuntimeIdentifier` belong on the publish command, not in
either `.csproj`. As plain properties they make an *ordinary build* emit
RID-specific output under `bin/Release/net8.0/<rid>/`, which is not where the
solution build expects either project to land.

### Prerequisites the binary does not remove

Shipping a self-contained executable removes the .NET runtime as a
prerequisite, not the rest. owl-gen shells out to `dotnet msbuild`, so a .NET
SDK still has to be on the machine, and `owl serve` and `owl build` still need
`node` on PATH. `owl gen` on its own needs only the SDK.
