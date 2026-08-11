using System.Diagnostics;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Owl.Gen.Emit;
using Owl.Gen.Load;
using Owl.Gen.Model;
using Owl.Gen.Parse;

namespace Owl.Gen;

/// <summary>
/// Compiles a set of projects and writes the documentation model owl-site
/// renders.
/// </summary>
/// <remarks>
/// This exists because the compiler's own doc XML is a flat list of documented
/// members: it cannot say what a type inherits, who inherits from it, whether a
/// member is really public, or where in the source it lives. Compiling gets all
/// of that from the symbols.
/// </remarks>
public static class OwlGen
{
  /// <summary>
  /// Runs owl-gen for one command line and returns the process exit code.
  /// </summary>
  /// <remarks>
  /// Progress goes to standard output and failures to standard error, so this
  /// reads the same whether owl calls it in-process or it is driven directly.
  /// Nothing here throws: a bad command line comes back as an exit code and a
  /// message, because the caller is a CLI either way.
  /// </remarks>
  /// <param name="args">Everything after the command name.</param>
  public static int Run(string[] args)
  {
    CommandLineOptions? options = null;

    try
    {
      options = CommandLineOptions.Parse(args);

      return Generate(options, Console.Out);
    }
    catch (Exception ex)
    {
      Console.Error.WriteLine();

      // Named for the front-end, not this library: owl is the only thing anyone
      // runs, so a failure here is a failure of the command they typed.
      Console.Error.WriteLine("owl: " + ex.Message);

      // Options are null when the command line itself was the problem, in which
      // case the message above is the whole story.
      if (options?.Verbose == true)
      {
        Console.Error.WriteLine(ex);
      }

      return 1;
    }
  }

  static int Generate(CommandLineOptions options, TextWriter log)
  {
    var watch = Stopwatch.StartNew();

    List<string> projects = options.Projects;

    log.WriteLine($"owl: {projects.Count} project(s), {options.TargetFramework}/{options.Configuration}");
    log.WriteLine();

    // Every assembly being documented, known up front so crefs can be marked internal or external
    // before any of them is built.
    var owned = projects
      .Select(Path.GetFileNameWithoutExtension)
      .Where(name => !string.IsNullOrEmpty(name))
      .Select(name => name!)
      .ToHashSet(StringComparer.Ordinal);

    var findings = new DocFindings();
    var assemblies = new List<ApiAssembly>();

    foreach (string project in projects)
    {
      string name = Path.GetFileNameWithoutExtension(project);
      log.WriteLine($"[{name}]");

      ProjectInputs inputs = options.SkipMSBuild
        ? ProjectInputs.Load(Path.Combine(options.InputsDirectory, name + ".owl-inputs.txt"))
        : MSBuildInputCapture.Capture(
            project,
            options.TargetFramework,
            options.Configuration,
            options.InputsDirectory,
            restore: !options.NoRestore,
            log);

      log.WriteLine($"  {inputs.Compile.Count} source files, {inputs.References.Count} references");

      CSharpCompilation compilation = CompilationBuilder.Build(inputs, log);

      Diagnostic[] errors = compilation
        .GetDiagnostics()
        .Where(d => d.Severity == DiagnosticSeverity.Error)
        .ToArray();

      if (errors.Length > 0)
      {
        // Errors mean symbols are missing or wrong, so anything extracted would be misleading.
        // Record and keep going so one broken project does not hide the rest.
        findings.CompilationErrors.Add($"{inputs.AssemblyName}: {errors.Length} compilation error(s)");
        log.WriteLine($"  {errors.Length} compilation error(s):");

        foreach (Diagnostic error in errors.Take(options.Verbose ? errors.Length : 5))
        {
          log.WriteLine("    " + error);
        }

        if (!options.Verbose && errors.Length > 5)
        {
          log.WriteLine($"    ... and {errors.Length - 5} more (rerun with --verbose)");
        }
      }

      var builder = new ApiBuilder(compilation, inputs, options.RepoRoot, owned, findings, options.ExamplesRoot);
      ApiAssembly assembly = builder.Build();
      assemblies.Add(assembly);

      log.WriteLine($"  {assembly.Types.Count} types, {assembly.Types.Sum(t => t.Members.Count)} members");
      log.WriteLine();
    }

    if (assemblies.Count == 0)
    {
      Console.Error.WriteLine("owl: nothing was documented");
      return 1;
    }

    var site = new ApiIndexSite { Name = options.SiteName };

    log.WriteLine($"writing {options.OutputDirectory}");
    JsonEmitter.Write(options.OutputDirectory, assemblies, site, log);

    log.WriteLine();
    PrintWarnings(findings, log);
    log.WriteLine($"done in {watch.Elapsed.TotalSeconds:0.0}s");

    if (options.Verify)
    {
      return VerifyExitCode(findings, log);
    }

    return findings.CompilationErrors.Count > 0 ? 1 : 0;
  }

  static void PrintWarnings(DocFindings findings, TextWriter log)
  {
    if (findings.UnresolvedCrefs.Count > 0)
    {
      log.WriteLine($"warning  {findings.UnresolvedCrefs.Count} unresolved cref(s)");
    }

    if (findings.MissingExamples.Count > 0)
    {
      log.WriteLine(
          $"warning  {findings.MissingExamples.Count} example file(s) not found, " +
          $"first: {findings.MissingExamples[0]} (try --examples <dir>)");
    }

    foreach (string error in findings.CompilationErrors)
    {
      log.WriteLine("error    " + error);
    }
  }

  static int VerifyExitCode(DocFindings findings, TextWriter log)
  {
    log.WriteLine();
    log.WriteLine("--verify:");

    // Projects routinely suppress CS1591, so an undocumented public member never shows up in a normal
    // build. This is the only place it surfaces.
    if (findings.Undocumented.Count > 0)
    {
      log.WriteLine($"  {findings.Undocumented.Count} undocumented public API member(s), first 20:");
      foreach (string docId in findings.Undocumented.Take(20))
      {
        log.WriteLine("    " + docId);
      }
    }

    if (findings.UnresolvedCrefs.Count > 0)
    {
      log.WriteLine($"  {findings.UnresolvedCrefs.Count} unresolved cref(s), first 20:");
      foreach (string cref in findings.UnresolvedCrefs.Take(20))
      {
        log.WriteLine("    " + cref);
      }
    }

    if (findings.MissingExamples.Count > 0)
    {
      log.WriteLine($"  {findings.MissingExamples.Count} example file(s) not found, first 20:");
      foreach (string path in findings.MissingExamples.Distinct(StringComparer.OrdinalIgnoreCase).Take(20))
      {
        log.WriteLine("    " + path);
      }
    }

    bool failed = findings.CompilationErrors.Count > 0 || findings.UnresolvedCrefs.Count > 0;

    if (!failed && findings.Undocumented.Count == 0)
    {
      log.WriteLine("  clean");
    }

    // Undocumented API is reported but does not fail the run. Coverage starts well below 100% on any
    // real codebase, and failing here would make --verify useless as a gate for the rest.
    return failed ? 1 : 0;
  }
}

/// <summary>owl-gen's arguments, after parsing and defaulting.</summary>
sealed class CommandLineOptions
{
  /// <summary>
  /// Projects to document as one set. Documenting several together is what
  /// makes crefs between them links, and derived types findable across them.
  /// </summary>
  public List<string> Projects { get; private set; } = [];

  /// <summary>Where the model is written. Required.</summary>
  public string OutputDirectory { get; private set; } = "";

  /// <summary>Root that source paths are made relative to.</summary>
  public string RepoRoot { get; private set; } = "";

  /// <summary>
  /// An extra directory a &lt;code source="..."/&gt; path is tried against, ahead
  /// of the project directory and the repo root. Null is right for most
  /// layouts, which write those paths against one of the two.
  /// </summary>
  public string? ExamplesRoot { get; private set; }

  /// <summary>
  /// Site name, recorded in the model rather than passed at render time.
  /// </summary>
  public string? SiteName { get; private set; }

  /// <summary>
  /// Which framework to document, for a multi-targeting project.
  /// </summary>
  public string TargetFramework { get; private set; } = "net8.0";

  /// <summary>Build configuration MSBuild evaluates under.</summary>
  public string Configuration { get; private set; } = "Debug";

  /// <summary>
  /// Reuse previously captured inputs instead of asking MSBuild again.
  /// </summary>
  public bool SkipMSBuild { get; private set; }

  /// <summary>Skip the restore pass that normally precedes capture.</summary>
  public bool NoRestore { get; private set; }

  /// <summary>Report undocumented public API and unresolved crefs.</summary>
  public bool Verify { get; private set; }

  /// <summary>Print full diagnostic lists rather than the first few.</summary>
  public bool Verbose { get; private set; }

  /// <summary>
  /// The captured MSBuild inputs, kept under the model directory.
  /// </summary>
  /// <remarks>
  /// Inside rather than beside: a sibling is tidier when the model sits at the default .owl/json,
  /// and is somewhere the caller never named for every other --out. Writing outside the one
  /// directory a caller asked for is worse than sharing it, and nothing here reads the model
  /// directory by listing it, so a subdirectory in there is invisible to the site.
  /// </remarks>
  public string InputsDirectory => Path.Combine(OutputDirectory, "inputs");

  /// <summary>
  /// Reads the command line, applying defaults and validating paths.
  /// </summary>
  /// <param name="args">Everything after the executable name.</param>
  /// <exception cref="ArgumentException">
  /// An argument is unrecognised, missing its value, or names a project that
  /// is not an existing .csproj.
  /// </exception>
  public static CommandLineOptions Parse(string[] args)
  {
    var options = new CommandLineOptions();
    string? repoRoot = null;

    for (int i = 0; i < args.Length; i++)
    {
      string arg = args[i];

      switch (arg)
      {
        case "-o":
        case "--out":
          options.OutputDirectory = Path.GetFullPath(Next(args, ref i, arg));
          break;

        case "--name":
          options.SiteName = Next(args, ref i, arg);
          break;

        case "--repo-root":
          repoRoot = Path.GetFullPath(Next(args, ref i, arg));
          break;

        case "--examples":
          options.ExamplesRoot = Path.GetFullPath(Next(args, ref i, arg));
          break;

        case "--tfm":
          options.TargetFramework = Next(args, ref i, arg);
          break;

        case "-c":
        case "--configuration":
          options.Configuration = Next(args, ref i, arg);
          break;

        case "--skip-msbuild":
          options.SkipMSBuild = true;
          break;

        case "--no-restore":
          options.NoRestore = true;
          break;

        case "--verify":
          options.Verify = true;
          break;

        case "-v":
        case "--verbose":
          options.Verbose = true;
          break;

        default:
          if (arg.StartsWith('-'))
          {
            throw new ArgumentException($"Unknown argument '{arg}'. Try 'owl --help'.");
          }

          options.Projects.Add(ResolveProject(arg));
          break;
      }
    }

    if (options.Projects.Count == 0)
    {
      throw new ArgumentException("No project given. Pass one or more .csproj paths. Try 'owl --help'.");
    }

    if (options.OutputDirectory.Length == 0)
    {
      throw new ArgumentException("--out is required.");
    }

    // Source paths are published relative to the repository root so they can be turned into links.
    // Walking up from the project, not from this tool, which may live anywhere.
    options.RepoRoot = repoRoot
      ?? FindRepoRoot(Path.GetDirectoryName(options.Projects[0])!)
      ?? Path.GetDirectoryName(options.Projects[0])!;

    return options;
  }

  static string Next(string[] args, ref int index, string arg)
  {
    if (index + 1 >= args.Length)
    {
      throw new ArgumentException($"{arg} needs a value");
    }

    return args[++index];
  }

  static string ResolveProject(string arg)
  {
    if (!arg.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
    {
      throw new ArgumentException($"'{arg}' is not a .csproj path.");
    }

    string full = Path.GetFullPath(arg);

    if (!File.Exists(full))
    {
      throw new ArgumentException($"Project not found: {full}");
    }

    return full;
  }

  static string? FindRepoRoot(string start)
  {
    var dir = new DirectoryInfo(start);

    while (dir is not null)
    {
      if (Directory.Exists(Path.Combine(dir.FullName, ".git")) ||
          File.Exists(Path.Combine(dir.FullName, ".git")))
      {
        return dir.FullName;
      }

      dir = dir.Parent;
    }

    return null;
  }
}
