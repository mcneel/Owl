using System.Diagnostics;

namespace Owl.Gen.Load;

/// <summary>
/// Runs the WriteOwlInputs target from owl.targets to learn a project's real
/// compiler inputs.
/// </summary>
/// <remarks>
/// Shelling out to <c>dotnet msbuild</c> is deliberate. MSBuildLocator /
/// MSBuildWorkspace would have to re-evaluate the consuming project's property
/// sheets in-process, and those can be arbitrarily conditional —
/// multi-targeting, platform defines, per-project overrides. Asking MSBuild
/// itself gets the answer it would actually use, on any platform, with no
/// version coupling.
/// </remarks>
static class MSBuildInputCapture
{
  /// <summary>
  /// Captures one project's compiler inputs and reads them back. The target
  /// depends on ResolveReferences rather than CoreCompile, so the project
  /// itself is never compiled — though its project references are built,
  /// because Roslyn needs those assemblies to exist on disk.
  /// </summary>
  /// <param name="projFile">The .csproj to capture.</param>
  /// <param name="targetFw">
  /// Which framework to capture, when the project multi-targets.
  /// </param>
  /// <param name="configs">Build configuration to evaluate under.</param>
  /// <param name="inputsDir">Where the captured file is written.</param>
  /// <param name="restore">Whether to restore first, as its own pass.</param>
  /// <param name="log">MSBuild output goes here when a pass fails.</param>
  /// <exception cref="InvalidOperationException">
  /// MSBuild failed, or wrote nothing.
  /// </exception>
  public static ProjectInputs Capture(string projFile, string targetFw, string configs, string inputsDir, bool restore, TextWriter log)
  {
    Directory.CreateDirectory(inputsDir);

    string targetsFile = WriteTargets(inputsDir);
    string projectName = Path.GetFileNameWithoutExtension(projFile);
    string inputsFile = Path.Combine(inputsDir, projectName + ".owl-inputs.txt");

    // Restore runs as its own invocation: combining -t:Restore with a build target in one
    // pass evaluates the project before restore has written the assets file, so the
    // reference list can come back empty.
    if (restore)
    {
      Run(projFile, "Restore", targetsFile, targetFw, configs, inputsFile, log);
    }

    Run(projFile, "WriteOwlInputs", targetsFile, targetFw, configs, inputsFile, log);

    if (!File.Exists(inputsFile))
    {
      throw new InvalidOperationException($"WriteOwlInputs did not produce {inputsFile}");
    }

    return ProjectInputs.Load(inputsFile);
  }

  /// <summary>
  /// Unpacks the embedded owl.targets and returns its path.
  /// </summary>
  /// <remarks>
  /// owl.targets is embedded so owl-gen ships as one file, but MSBuild can only
  /// be handed a real path, so it has to land on disk somewhere. It goes beside
  /// the captured inputs: a directory owl-gen already creates and owns, which
  /// keeps every MSBuild artifact of a run in one place and leaves no temp files
  /// behind. Rewritten each run, so an upgraded owl-gen never reuses a stale one.
  /// </remarks>
  static string WriteTargets(string inputsDir)
  {
    string path = Path.Combine(inputsDir, "owl.targets");

    using Stream embedded = typeof(MSBuildInputCapture).Assembly.GetManifestResourceStream("owl.targets")
        ?? throw new InvalidOperationException("owl.targets is missing from this build of owl-gen.");

    using FileStream file = File.Create(path);
    embedded.CopyTo(file);

    return path;
  }

  static void Run(string projFile, string target, string targetsFile, string targetFw, string configs, string inputsFile, TextWriter log)
  {
    var psi = new ProcessStartInfo("dotnet")
    {
      RedirectStandardOutput = true,
      RedirectStandardError = true,
      UseShellExecute = false,
      WorkingDirectory = Path.GetDirectoryName(projFile)!,
    };

    psi.ArgumentList.Add("msbuild");
    psi.ArgumentList.Add(projFile);
    psi.ArgumentList.Add("-t:" + target);
    psi.ArgumentList.Add("-nologo");
    psi.ArgumentList.Add("-v:quiet");
    psi.ArgumentList.Add("-p:Configuration=" + configs);

    if (target == "Restore")
    {
      // Deliberately no TargetFramework here. As a global property it propagates to referenced
      // projects, so restoring with TargetFramework=net8.0 also forces net8.0 onto a
      // netstandard2.0 dependency, whose assets file then comes back without a usable target.
      // NuGet's own guidance is to restore without a TargetFramework.
    }
    else
    {
      psi.ArgumentList.Add("-p:TargetFramework=" + targetFw);
      psi.ArgumentList.Add("-p:OwlInputsFile=" + inputsFile);
      psi.ArgumentList.Add("-p:CustomAfterMicrosoftCSharpTargets=" + targetsFile);
    }

    using var process = Process.Start(psi) ?? throw new InvalidOperationException("Could not start dotnet msbuild");

    string stdout = process.StandardOutput.ReadToEnd();
    string stderr = process.StandardError.ReadToEnd();
    process.WaitForExit();

    if (process.ExitCode != 0)
    {
      log.WriteLine(stdout);
      log.WriteLine(stderr);
      string msg = $"dotnet msbuild -t:{target} failed for {Path.GetFileName(projFile)} (exit {process.ExitCode})";
      throw new InvalidOperationException(msg);
    }
  }
}
