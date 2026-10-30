using Owl.Gen;

namespace Owl;

/// <summary>
/// The three commands and their arguments.
/// </summary>
/// <remarks>
/// owl only declares the options it has to understand itself. Anything else on a <c>gen</c> command
/// line is forwarded to owl-gen untouched, so <c>--tfm</c>, <c>--verify</c> and friends work without
/// being parsed in two places and drifting apart. owl's help lists them all the same, being the one
/// place any of them is documented.
/// </remarks>
sealed class Command
{
  const string DEFAULT_MODEL_DIR = ".owl/json";
  const string DEFAULT_SITE_DIR = ".owl/site";
  const string DEFAULT_DOCS_DIR = "docs/api";

  /// <summary>The command being run: gen, serve, build or verify.</summary>
  public string Name { get; private set; } = "";

  /// <summary>Projects to document. Empty when <see cref="ModelDir"/> was given instead.</summary>
  public List<string> Projects { get; } = [];

  /// <summary>Where the model lives. Set explicitly to reuse one and skip generating.</summary>
  public string? ModelDir { get; private set; }

  /// <summary>Where an exported site is written. Only build uses it.</summary>
  public string OutDir { get; private set; } = DEFAULT_SITE_DIR;

  /// <summary>
  /// Authored markdown pages the site folds in alongside the generated model, or null when there
  /// are none and the site is an API dump browsed by namespace.
  /// </summary>
  public string? DocsDir { get; private set; }

  /// <summary>Port serve listens on. Only serve uses it.</summary>
  public string Port { get; private set; } = "8080";

  /// <summary>Everything owl does not understand, passed straight to owl-gen.</summary>
  public List<string> GenArgs { get; } = [];

  /// <summary>Site options, passed straight to owl-site.</summary>
  public List<string> SiteArgs { get; } = [];

  /// <summary>True when projects were given, so the model is written before serving or exporting.</summary>
  public bool Generates => Projects.Count > 0;

  /// <summary>Reads one command's arguments into a <see cref="Command"/>.</summary>
  /// <param name="name">The command being run: gen, serve or build.</param>
  /// <param name="args">Everything on the command line after that name.</param>
  /// <exception cref="OwlError">The arguments are unusable, carrying a message meant for the user.</exception>
  public static Command Parse(string name, string[] args)
  {
    var command = new Command { Name = name };
    bool outSet = false;

    for (int i = 0; i < args.Length; i++)
    {
      string arg = args[i];

      switch (arg)
      {
        // Naming an existing model is what lets serve and build skip generation.
        case "--json":
          command.ModelDir = Next(args, ref i, arg);
          break;

        // Read by the site alone; owl-gen never sees the authored pages. Naming a directory is also
        // what asks for the category-and-prose site rather than the namespace dump.
        case "--docs":
          command.DocsDir = Next(args, ref i, arg);
          break;

        // Used by serve; gen and build accept it and ignore it.
        case "--port":
          command.Port = Next(args, ref i, arg);
          break;

        // The site directory for build, which writes one, and the model directory for gen and
        // serve, which do not. Naming the model is the only reading serve has: it generates into
        // that directory and then renders it, so -o pointing anywhere else would name nothing.
        case "-o":
        case "--out":
          if (name == "build")
          {
            command.OutDir = Next(args, ref i, arg);
            outSet = true;
          }
          else
          {
            command.ModelDir = Next(args, ref i, arg);
          }
          break;

        // Recorded in the model, so it is given once at generation time.
        case "--name":
          command.GenArgs.Add(arg);
          command.GenArgs.Add(Next(args, ref i, arg));
          command.SiteArgs.Add(arg);
          command.SiteArgs.Add(args[i]);
          break;

        // Affect how the model is rendered, not what is in it, so the site alone needs them.
        // --link is repeatable, which needs nothing extra: each pair is appended in the order it
        // was given, and the site parses them all.
        case "--base":
        case "--site-url":
        case "--logo":
        case "--logo-dark":
        case "--favicon":
        case "--source-refs":
        case "--api-versions":
        case "--link":
        case "--d2":
          command.SiteArgs.Add(arg);
          command.SiteArgs.Add(Next(args, ref i, arg));
          break;

        // Also the site's, but switches rather than settings: they take no value.
        case "--skip-undocumented":
        case "--sandcastle":
        case "--docify":
          command.SiteArgs.Add(arg);
          break;

        // Only build writes a site to serve, so serve accepts it and ignores it, as it does --quiet.
        case "--server":
          if (name == "build")
          {
            command.SiteArgs.Add(arg);
          }
          break;

        // Only build.js has per-page progress to quieten, and serve.js rejects what it does not
        // know, so this is forwarded for the one command it means something to. gen and serve
        // accept and ignore it, the way they do --port.
        case "--quiet":
          if (name == "build")
          {
            command.SiteArgs.Add(arg);
          }
          break;

        // A project, serve's bare port form, or a flag only owl-gen understands.
        default:
          if (OwlGen.IsProjectPath(arg))
          {
            command.Projects.Add(arg);
          }
          else if (!arg.StartsWith('-') && int.TryParse(arg, out _) && name == "serve")
          {
            // Matches the bare-port form serve.js accepts: owl serve MyLib.csproj 9000
            command.Port = arg;
          }
          else
          {
            command.GenArgs.Add(arg);
          }
          break;
      }
    }

    // verify checks the projects themselves, so a reused model has nothing to offer it.
    if (name == "verify")
    {
      if (command.Projects.Count == 0)
      {
        throw new OwlError("owl verify: pass one or more .csproj or .vbproj paths.");
      }

      command.GenArgs.Add("--verify");
    }

    if (command.Projects.Count == 0 && command.ModelDir is null)
    {
      throw new OwlError(
        $"owl {name}: pass one or more .csproj or .vbproj paths, or --json <dir> to reuse an " +
        "existing model.");
    }

    // A model directory doubles as gen's output and as the site's input, so one default covers both.
    command.ModelDir ??= DEFAULT_MODEL_DIR;

    // The conventional directory counts as naming one, but only if it is there. Whether a site has
    // authored pages is what decides how it is browsed - by category with them, by namespace
    // without - so defaulting to a directory that does not exist would put every project with no
    // prose into the half-empty version of the wrong one.
    if (command.DocsDir is null && Directory.Exists(DEFAULT_DOCS_DIR))
    {
      command.DocsDir = DEFAULT_DOCS_DIR;
    }

    if (name == "build" && !outSet)
    {
      command.OutDir = DEFAULT_SITE_DIR;
    }

    return command;
  }

  /// <summary>Runs the command and returns the exit code to hand back to the shell.</summary>
  public int Run()
  {
    // Before anything is generated or rendered, so a missing prerequisite is a sentence at the
    // start rather than a failure minutes into a build. What is needed depends on the command:
    // generating asks MSBuild what a project compiles, and only serve and build run the site.
    if (Generates)
    {
      Requirements.Dotnet();
    }

    // verify reads the authored pages too, for xref links, and they are resolved by owl-site.
    bool verifiesPages = Name == "verify" && DocsDir is not null;

    if (Name is "serve" or "build" || verifiesPages)
    {
      Requirements.Node();
    }

    if (Generates)
    {
      int code = Tools.Gen(Projects.Concat(["--out", ModelDir!]).Concat(GenArgs));

      // verify's findings fail the run without spoiling the model, so the pages are still checked.
      if (verifiesPages && File.Exists(Path.Combine(ModelDir!, "index.json")))
      {
        return Math.Max(code, Tools.Site("verify.js", Model().Concat(LinkArgs())));
      }

      // A failed generation leaves no model, or a stale one, so rendering it would be misleading.
      if (code != 0)
      {
        return code;
      }
    }
    else if (!Directory.Exists(ModelDir))
    {
      throw new OwlError($"No model in {ModelDir}. Run 'owl gen <project.csproj>' first.");
    }

    return Name switch
    {
      "gen" or "verify" => 0,
      "serve" => Tools.Site("serve.js", Model().Concat(["--port", Port]).Concat(SiteArgs)),
      "build" => Tools.Site("build.js", Model().Concat(["--out", OutDir]).Concat(SiteArgs)),
      _ => throw new OwlError($"Unknown command '{Name}'."),
    };
  }

  /// <summary>The site options that change where an xref leads, for verify to resolve them as build would.</summary>
  IEnumerable<string> LinkArgs()
  {
    for (int i = 0; i < SiteArgs.Count; i++)
    {
      if (SiteArgs[i] == "--link")
      {
        yield return SiteArgs[i];
        yield return SiteArgs[++i];
      }
      else if (SiteArgs[i] == "--skip-undocumented")
      {
        yield return SiteArgs[i];
      }
    }
  }

  string[] Model() =>
    DocsDir is null ? ["--json", ModelDir!] : ["--json", ModelDir!, "--docs", DocsDir];

  static string Next(string[] args, ref int index, string arg)
  {
    if (index + 1 >= args.Length)
    {
      throw new OwlError($"{arg} needs a value");
    }

    return args[++index];
  }
}
