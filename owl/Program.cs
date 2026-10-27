using System.Reflection;
using Owl;

// owl: generate API documentation for .NET projects, then serve or export it as a website.
//
// This is a front-end over two independent tools, both sitting next to this binary: owl-gen writes
// the documentation model, and owl-site renders it. The model on disk is the only thing they share.

// Help anywhere on the line, so 'owl gen --help' is answered here too. owl documents every option
// the tools behind it accept, and they print no usage of their own to drift from this one.
if (args.Length == 0 || args[0] is "help" || args.Contains("-h") || args.Contains("--help"))
{
  PrintUsage();
  return 0;
}

if (args[0] is "--version")
{
  // The informational version rather than the assembly one, which is four numbers and cannot hold
  // a prerelease suffix: every 0.1.0-ci.N build would otherwise report itself as plain 0.1.0, and
  // two CI builds would be indistinguishable from the binary alone.
  Assembly owl = typeof(Command).Assembly;
  string version =
    owl.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
    ?? owl.GetName().Version?.ToString(3)
    ?? "0.0.0";

  // A build that knows its commit appends '+<sha>'. That is provenance, not part of the version.
  Console.WriteLine(version.Split('+')[0]);
  return 0;
}

string name = args[0];

if (name is not ("gen" or "serve" or "build" or "verify"))
{
  Console.Error.WriteLine($"owl: unknown command '{name}'. Try --help.");
  return 2;
}

try
{
  return Command.Parse(name, args[1..]).Run();
}
catch (OwlError ex)
{
  Console.Error.WriteLine(ex.Message);
  return 2;
}

static void PrintUsage()
{
  Console.WriteLine(
    """
    owl - API documentation generator and website builder for .NET

    Usage:
      owl gen   <project...>   Write the documentation model
      owl serve <project...>   Write it, then serve it locally
      owl build <project...>   Write it, then export a static site
      owl verify <project...>  Write it, then report undocumented API and broken crefs and xrefs

    A project is a .csproj or a .vbproj. Pass several to document them as one set, so crefs between
    them become links and derived types are found across the whole set.

    Options:
      -o, --out <dir>       Model directory for gen and serve (default .owl/json)
                            Site directory for build (default .owl/site)
      --json <dir>          Reuse an existing model instead of generating one
      --docs <dir>          Authored markdown pages (default docs/api, when it exists)
                            Without them the site is browsed by namespace alone
      --name <text>         Site name
      -h, --help            Show this help
      --version             Print owl's version

    Model options, for what the documentation is generated from:
      --tfm <tfm>           Which framework to document, for a project that multi-targets
                            (default net8.0); a project that targets one is documented as it is
      -c, --configuration   Build configuration MSBuild evaluates under (default Debug)
      --repo-root <dir>     Root that recorded source paths are relative to (default: git root)
      --examples <dir>      Extra root for <code source="..."/> paths, tried before the project
                            directory and the repo root
      --skip-msbuild        Reuse previously captured project inputs
      --no-restore          Skip the restore pass before capturing inputs
      --no-build-refs       Reuse referenced projects as they were last built, rather than
                            building them; much faster where they are already there
      --verify              Report undocumented public API and unresolved crefs; non-zero exit
                            on unresolved crefs or compilation errors
      -v, --verbose         Full diagnostics

    Site options, for serve and build:
      --port <n>            Port for serve (default 8080)
      --base <path>         Path prefix the site will be served under
      --site-url <url>      Origin for canonical urls and the sitemap
      --logo <file>         Header icon, overriding <docs>/logo.svg
      --logo-dark <file>    Header icon for the dark theme; without one, --logo covers both
      --source-refs <path>  Root for "declared in" references; without it there are none
      --api-versions <list> Versions the header's picker offers, newest first, comma separated;
                            without it there is no picker and <since> filters nothing
      --link <asm>=<url>    Site documenting a referenced assembly, so its types link rather than
                            sitting there as text. Repeatable; <asm> may end in '*'
      --d2 <path>           The d2 binary that draws diagrams (default: d2 on PATH)
      --skip-undocumented   Leave anything with no <summary> out of the site
      --sandcastle          Also answer the Sandcastle urls this set was published at
      --docify              Also answer the docify urls this set was published at
      --quiet               Only print the summary, not per-page progress (build)
      --server              Put the site in <out>/site, with a node server beside it that also
                            answers old urls and member link previews (build)

    serve and build generate before they render, so both take the model options too.

    Requires a .NET SDK (8.0 or newer) to generate, and node (18 or newer) to serve or export.
    Diagrams additionally need the d2 binary; without it a diagram fence stays a code block.

    Examples:
      owl serve src/MyLib/MyLib.csproj
      owl verify src/MyLib/MyLib.csproj
      owl gen src/A/A.csproj src/B/B.vbproj
      owl build src/MyLib/MyLib.csproj --out ./public --site-url https://docs.example.com
      owl serve --json .owl/json
    """);
}
