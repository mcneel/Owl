namespace Owl;

/// <summary>
/// The three commands and their arguments.
/// </summary>
/// <remarks>
/// owl only declares the options it has to understand itself. Anything else on a <c>gen</c> command
/// line is forwarded to owl-gen untouched, so <c>--tfm</c>, <c>--verify</c> and friends work without
/// being declared in two places and drifting apart.
/// </remarks>
sealed class Command
{
  const string DEFAULT_MODEL_DIR = ".owl/json";
  const string DEFAULT_SITE_DIR = ".owl/site";
  const string DEFAULT_DOCS_DIR = "docs/api";

  /// <summary>The command being run: gen, serve or build.</summary>
  public string Name { get; private set; } = "";

  /// <summary>Projects to document. Empty when <see cref="ModelDir"/> was given instead.</summary>
  public List<string> Projects { get; } = [];

  /// <summary>Where the model lives. Set explicitly to reuse one and skip generating.</summary>
  public string? ModelDir { get; private set; }

  /// <summary>Where an exported site is written. Only build uses it.</summary>
  public string OutDir { get; private set; } = DEFAULT_SITE_DIR;

  /// <summary>Authored markdown pages the site folds in alongside the generated model.</summary>
  public string DocsDir { get; private set; } = DEFAULT_DOCS_DIR;

  /// <summary>Port serve listens on. Only serve uses it.</summary>
  public string Port { get; private set; } = "8080";

  /// <summary>Everything owl does not understand, passed straight to owl-gen.</summary>
  public List<string> GenArgs { get; } = [];

  /// <summary>Site options, passed straight to owl-site.</summary>
  public List<string> SiteArgs { get; } = [];

  /// <summary>Set when the arguments were a request for owl-gen's own help.</summary>
  public bool ForwardsHelp { get; private set; }

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

        // Read by the site alone; owl-gen never sees the authored pages.
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
        case "--base":
        case "--site-url":
        case "--logo":
        case "--logo-dark":
        case "--source-refs":
          command.SiteArgs.Add(arg);
          command.SiteArgs.Add(Next(args, ref i, arg));
          break;

        // Also the site's, but a switch rather than a setting: it takes no value.
        case "--skip-undocumented":
          command.SiteArgs.Add(arg);
          break;

        // A project, serve's bare port form, or a flag only owl-gen understands.
        default:
          if (arg.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
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

    // 'owl gen --help' asks about owl-gen's own options, so let it through to owl-gen unchanged.
    if (command.GenArgs.Contains("-h") || command.GenArgs.Contains("--help"))
    {
      command.ForwardsHelp = true;
      return command;
    }

    if (command.Projects.Count == 0 && command.ModelDir is null)
    {
      throw new OwlError($"owl {name}: pass one or more .csproj paths, or --json <dir> to reuse an existing model.");
    }

    // A model directory doubles as gen's output and as the site's input, so one default covers both.
    command.ModelDir ??= DEFAULT_MODEL_DIR;

    if (name == "build" && !outSet)
    {
      command.OutDir = DEFAULT_SITE_DIR;
    }

    return command;
  }

  /// <summary>Runs the command and returns the exit code to hand back to the shell.</summary>
  public int Run()
  {
    if (ForwardsHelp)
    {
      return Tools.Gen(GenArgs);
    }

    if (Generates)
    {
      int code = Tools.Gen(Projects.Concat(["--out", ModelDir!]).Concat(GenArgs));

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
      "gen" => 0,
      "serve" => Tools.Site("serve.js", Model().Concat(["--port", Port]).Concat(SiteArgs)),
      "build" => Tools.Site("build.js", Model().Concat(["--out", OutDir]).Concat(SiteArgs)),
      _ => throw new OwlError($"Unknown command '{Name}'."),
    };
  }

  string[] Model() => ["--json", ModelDir!, "--docs", DocsDir];

  static string Next(string[] args, ref int index, string arg)
  {
    if (index + 1 >= args.Length)
    {
      throw new OwlError($"{arg} needs a value");
    }

    return args[++index];
  }
}
