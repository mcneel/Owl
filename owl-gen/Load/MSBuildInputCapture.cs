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
  /// <param name="projFile">The project to capture.</param>
  /// <param name="targetFw">
  /// Which framework to capture, when the project multi-targets.
  /// </param>
  /// <param name="configs">Build configuration to evaluate under.</param>
  /// <param name="inputsDir">Where the captured file is written.</param>
  /// <param name="restore">Whether to restore first, as its own pass.</param>
  /// <param name="buildReferences">
  /// Whether referenced projects may be built. False reuses whatever they were
  /// last built to, which is faster and enough when they are already there.
  /// </param>
  /// <param name="log">MSBuild output goes here when a pass fails.</param>
  /// <exception cref="InvalidOperationException">
  /// MSBuild failed, or wrote nothing.
  /// </exception>
  public static ProjectInputs Capture(
      string projFile,
      string targetFw,
      string configs,
      string inputsDir,
      bool restore,
      bool buildReferences,
      TextWriter log)
  {
    Directory.CreateDirectory(inputsDir);

    string targetsFile = WriteTargets(inputsDir);
    string projectName = Path.GetFileNameWithoutExtension(projFile);
    string inputsFile = Path.Combine(inputsDir, projectName + ".owl-inputs.txt");
    string? chosenFw = ChooseFramework(projFile, targetFw, log);

    // Restore runs as its own invocation: combining -t:Restore with a build target in one
    // pass evaluates the project before restore has written the assets file, so the
    // reference list can come back empty.
    if (restore)
    {
      Run(projFile, "Restore", targetsFile, null, configs, inputsFile, buildReferences: true, log);
    }

    Run(projFile, "WriteOwlInputs", targetsFile, chosenFw, configs, inputsFile, buildReferences, log);

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
        ?? throw new InvalidOperationException("owl.targets is missing from this build of owl.");

    using FileStream file = File.Create(path);
    embedded.CopyTo(file);

    return path;
  }

  /// <summary>
  /// Which framework to capture this project for, or null to let the project decide.
  /// </summary>
  /// <remarks>
  /// TargetFramework is a global property, so setting it selects the inner build of a project that
  /// multi-targets - and forces a framework onto one that does not. A set with a mix of the two is
  /// ordinary: a net8.0;net48 library next to a net48-only one, documented together. Passing one
  /// --tfm to both of those breaks the second, so the flag is a preference among what a project
  /// offers rather than an instruction.
  ///
  /// TargetFrameworks (plural) is what tells them apart, and asking for it costs an evaluation with
  /// no build behind it. -getProperty arrived in MSBuild 17.8, which shipped with the 8.0 SDK that
  /// Requirements already insists on.
  /// </remarks>
  static string? ChooseFramework(string projFile, string wanted, TextWriter log)
  {
    string[] offered = ReadProperty(projFile, "TargetFrameworks")
      .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    if (offered.Length == 0)
    {
      return null;
    }

    if (offered.Contains(wanted, StringComparer.OrdinalIgnoreCase))
    {
      return wanted;
    }

    // Said out loud, because documenting a framework nobody asked for is the kind of surprise that
    // otherwise only surfaces as a model full of the wrong platform's types.
    log.WriteLine(
        $"  warning: {Path.GetFileName(projFile)} targets {string.Join(", ", offered)}, " +
        $"not {wanted}; documenting {offered[0]}");

    return offered[0];
  }

  /// <summary>
  /// One evaluated property, or "" when MSBuild would not answer.
  /// </summary>
  /// <remarks>
  /// A single -getProperty prints the bare value rather than the JSON object several of them
  /// produce, which is the whole reason only one is ever asked for at a time. A failure here is not
  /// fatal: the capture that follows will fail with a better message than this could give.
  /// </remarks>
  static string ReadProperty(string projFile, string name)
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
    psi.ArgumentList.Add("-nologo");
    psi.ArgumentList.Add("-getProperty:" + name);

    using var process = Process.Start(psi) ?? throw new InvalidOperationException("Could not start dotnet msbuild");

    string stdout = process.StandardOutput.ReadToEnd();
    process.StandardError.ReadToEnd();
    process.WaitForExit();

    return process.ExitCode == 0 ? stdout.Trim() : "";
  }

  static void Run(
      string projFile,
      string target,
      string targetsFile,
      string? targetFw,
      string configs,
      string inputsFile,
      bool buildReferences,
      TextWriter log)
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

    if (target != "Restore")
    {
      // Null for a project that targets one framework: it has already made the choice, and as a
      // global property TargetFramework would override the answer rather than select it. Restore is
      // never given one either - it propagates to referenced projects, so restoring with
      // TargetFramework=net8.0 also forces net8.0 onto a netstandard2.0 dependency, whose assets
      // file then comes back without a usable target. NuGet's own guidance says the same.
      if (targetFw is not null)
      {
        psi.ArgumentList.Add("-p:TargetFramework=" + targetFw);
      }

      psi.ArgumentList.Add("-p:OwlInputsFile=" + inputsFile);
      psi.ArgumentList.Add("-p:CustomAfterMicrosoftCommonTargets=" + targetsFile);

      if (!buildReferences)
      {
        // ResolveReferences still finds the referenced assemblies; it just will not produce them.
        // Missing ones come back as references that do not exist, which CompilationBuilder reports
        // one by one rather than failing, so a stale tree says which part of it is stale.
        psi.ArgumentList.Add("-p:BuildProjectReferences=false");
      }
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
