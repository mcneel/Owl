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

  /// <summary>The one build configuration given to -c, or null for owl-gen's default or several builds.</summary>
  public string? Configuration { get; private set; }

  /// <summary>The builds a site picks between, from several -c values; empty for one build.</summary>
  public List<ApiBuild> Builds { get; } = [];

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
    var configurations = new List<string>();

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

        // Takes every value up to the next flag or project, since each value is a build.
        case "-c":
        case "--configuration":
          int before = configurations.Count;
          while (i + 1 < args.Length && IsValue(args[i + 1], name))
          {
            configurations.Add(args[++i]);
          }

          if (configurations.Count == before)
          {
            throw new OwlError($"{arg} needs a value");
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
        case "--site-header":
        case "--site-footer":
        case "--sidebar-toggle":
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

    // One value is a plain configuration, even written as a build, since there is nothing to pick between.
    if (configurations.Count == 1)
    {
      command.Configuration = ApiBuild.TryParse(configurations[0])?.Id ?? configurations[0];
    }
    else
    {
      foreach (string value in configurations)
      {
        ApiBuild build = ApiBuild.TryParse(value) ?? throw new OwlError(
          $"-c {value}: with several builds, write each as <name>:<configuration>:<stub>, " +
          "e.g. \"Revit 2026:Release-2026:2026\".");

        if (command.Builds.Any(b => b.Stub == build.Stub))
        {
          throw new OwlError($"-c {value}: the stub '{build.Stub}' is used by another build.");
        }

        command.Builds.Add(build);
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

    // Said before generating rather than after, as the site would: a one-build site has nothing to fill it with.
    if (command.Builds.Count == 0 && command.LinkArgs().FirstOrDefault(a => a.Contains("{build}")) is string link)
    {
      throw new OwlError($"--link {link}: {{build}} needs several builds, given to -c as <name>:<configuration>:<stub>.");
    }

    foreach (ApiBuild build in command.Builds)
    {
      command.SiteArgs.Add("--build");
      command.SiteArgs.Add($"{build.Stub}={build.Name}");
    }

    return command;
  }

  /// <summary>Whether an argument after -c is another of its values rather than the next option.</summary>
  static bool IsValue(string arg, string command) =>
    !arg.StartsWith('-') &&
    !OwlGen.IsProjectPath(arg) &&
    // serve's bare port form, as in the default branch below.
    !(command == "serve" && int.TryParse(arg, out _));

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

    // Each build is a model of its own, in a directory named by its stub.
    (string Dir, string[] Config, string Label)[] models = Builds.Count == 0
      ? [(ModelDir!, Configuration is null ? [] : ["-c", Configuration], "")]
      : [.. Builds.Select(b => (Path.Combine(ModelDir!, b.Stub), new[] { "-c", b.Id }, $"{b.Name} ({b.Id})"))];

    if (Generates)
    {
      int worst = 0;

      foreach (var (dir, config, label) in models)
      {
        if (label.Length > 0)
        {
          Console.WriteLine($"== {label}");
        }

        int code = Tools.Gen(Projects.Concat(["--out", dir]).Concat(config).Concat(GenArgs));

        // verify's findings fail the run without spoiling the model, so the pages are still checked.
        if (verifiesPages && File.Exists(Path.Combine(dir, "index.json")))
        {
          code = Math.Max(code, Tools.Site("verify.js", Model(dir).Concat(LinkArgs())));
        }
        // A failed generation leaves no model, or a stale one, so rendering it would be misleading.
        else if (code != 0 && Name != "verify")
        {
          return code;
        }

        worst = Math.Max(worst, code);
      }

      if (Name == "verify" || worst != 0)
      {
        return worst;
      }
    }
    else if (models.FirstOrDefault(m => !Directory.Exists(m.Dir)) is { Dir: not null } missing)
    {
      throw new OwlError($"No model in {missing.Dir}. Run 'owl gen <project.csproj>' first.");
    }

    return Name switch
    {
      "gen" or "verify" => 0,
      "serve" => Tools.Site("serve.js", Model(ModelDir!).Concat(["--port", Port]).Concat(SiteArgs)),
      "build" => Tools.Site("build.js", Model(ModelDir!).Concat(["--out", OutDir]).Concat(SiteArgs)),
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

  string[] Model(string dir) =>
    DocsDir is null ? ["--json", dir] : ["--json", dir, "--docs", DocsDir];

  static string Next(string[] args, ref int index, string arg)
  {
    if (index + 1 >= args.Length)
    {
      throw new OwlError($"{arg} needs a value");
    }

    return args[++index];
  }
}

/// <summary>One build a site picks between: what the picker shows, the configuration, and its url folder.</summary>
/// <param name="Name">Shown in the build picker, e.g. "Revit 2026 (Rhino 8)".</param>
/// <param name="Id">The build configuration MSBuild evaluates under, e.g. Release-2026-R8.</param>
/// <param name="Stub">The build's folder in every url, e.g. 2026-r8.</param>
sealed record ApiBuild(string Name, string Id, string Stub)
{
  /// <summary>Reads <c>name:id:stub</c>, or returns null when the value is not written that way.</summary>
  /// <exception cref="OwlError">The value has the shape but an unusable stub.</exception>
  public static ApiBuild? TryParse(string value)
  {
    // From the right, so a name may hold a colon of its own.
    int last = value.LastIndexOf(':');
    int middle = last > 0 ? value.LastIndexOf(':', last - 1) : -1;
    if (middle <= 0)
    {
      return null;
    }

    var build = new ApiBuild(value[..middle].Trim(), value[(middle + 1)..last].Trim(), value[(last + 1)..].Trim());
    if (build.Name.Length == 0 || build.Id.Length == 0)
    {
      return null;
    }

    // Lower case, because hosts and owl's server treat urls by their lower-case spelling.
    if (!System.Text.RegularExpressions.Regex.IsMatch(build.Stub, "^[a-z0-9][a-z0-9._-]*$"))
    {
      throw new OwlError(
        $"-c {value}: the stub '{build.Stub}' is part of every url, so it takes lower-case letters, " +
        "digits, '.', '_' and '-' only.");
    }

    return build;
  }
}
