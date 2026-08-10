using System.Reflection;
using Owl;

// owl: generate API documentation for .NET projects, then serve or export it as a website.
//
// This is a front-end over two independent tools, both sitting next to this binary: owl-gen writes
// the documentation model, and owl-site renders it. The model on disk is the only thing they share.

if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
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

if (name is not ("gen" or "serve" or "build"))
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
      owl gen   <project.csproj...>   Write the documentation model
      owl serve <project.csproj...>   Write it, then serve it locally
      owl build <project.csproj...>   Write it, then export a static site

    Pass several projects to document them as one set, so crefs between them become links and
    derived types are found across the whole set.

    Options:
      -o, --out <dir>       Model directory for gen and serve (default .owl/json)
                            Site directory for build (default .owl/site)
      --json <dir>          Reuse an existing model instead of generating one
      --docs <dir>          Authored markdown pages (default docs/api, when it exists)
                            Without them the site is browsed by namespace alone
      --name <text>         Site name
      --port <n>            Port for serve (default 8080)
      --base <path>         Path prefix the site will be served under
      --site-url <url>      Origin for canonical urls and the sitemap
      --logo <file>         Header icon, overriding <docs>/logo.svg
      --logo-dark <file>    Header icon for the dark theme; without one, --logo covers both
      --source-refs <path>  Root for "declared in" references; without it there are none
      --d2 <path>           The d2 binary that draws diagrams (default: d2 on PATH)
      --skip-undocumented   Leave anything with no <summary> out of the site
      --quiet               Only print the summary, not per-page progress (build)
      -h, --help            Show this help
      --version             Print owl's version

    serve and build generate first, so they accept everything gen does, including --tfm,
    --configuration, --examples, --verify and --verbose. Run 'owl gen --help' for the full list.

    Requires a .NET SDK (8.0 or newer) to generate, and node (18 or newer) to serve or export.
    Diagrams additionally need the d2 binary; without it a diagram fence stays a code block.

    Examples:
      owl serve src/MyLib/MyLib.csproj
      owl gen src/MyLib/MyLib.csproj --name "MyLib API" --verify
      owl gen src/A/A.csproj src/B/B.csproj
      owl build src/MyLib/MyLib.csproj --out ./public --site-url https://docs.example.com
      owl serve --json .owl/json
    """);
}
