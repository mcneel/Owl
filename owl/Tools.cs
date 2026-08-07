using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using Owl.Gen;

namespace Owl;

/// <summary>
/// Runs the two tools owl orchestrates: owl-gen to write the model, and the Node scripts in
/// owl-site to serve or export it.
/// </summary>
/// <remarks>
/// Both are carried inside the owl binary, which is what lets it ship as a single file. owl-gen is
/// .NET, so it is linked and called in-process. owl-site is JavaScript, so it is embedded and
/// unpacked for node when a command actually needs it.
/// </remarks>
static class Tools
{
  /// <summary>Runs owl-gen with the given arguments. Returns its exit code.</summary>
  /// <remarks>
  /// Called in-process rather than spawned. owl-gen writes its own progress and errors to the
  /// console and hands back an exit code, so this reads no differently than a child process would,
  /// without a second copy of the runtime in the shipped binary.
  /// </remarks>
  public static int Gen(IEnumerable<string> args)
  {
    return OwlGen.Run([.. args]);
  }

  /// <summary>Runs one of owl-site's Node scripts. Returns its exit code.</summary>
  public static int Site(string script, IEnumerable<string> args)
  {
    if (FindNode() is null)
    {
      throw new OwlError(
        "Node is required to serve or export the site, and 'node' was not found on PATH.\n" +
        "Install Node 18 or newer, or run 'owl gen' on its own to write the model only.");
    }

    return Run("node", [Path.Combine(UnpackSite(), script), .. args]);
  }

  /// <summary>
  /// Writes the embedded owl-site scripts to a temp directory and returns it.
  /// </summary>
  /// <remarks>
  /// Node needs real files to require, so the embedded copy has to land on disk. It cannot go
  /// beside the binary, which is usually read-only once installed. The directory is keyed by owl's
  /// version and rewritten every run: the scripts total about 140 KB, so caching them would buy
  /// nothing and risk serving a stale copy after an upgrade.
  /// </remarks>
  static string UnpackSite()
  {
    Assembly owl = typeof(Tools).Assembly;
    string dir = Path.Combine(
      Path.GetTempPath(),
      "owl-site-" + (owl.GetName().Version?.ToString(3) ?? "0"));

    foreach (string resource in owl.GetManifestResourceNames())
    {
      // RecursiveDir uses the platform separator, so the name is normalized before matching.
      string relative = resource.Replace('\\', '/');

      if (!relative.StartsWith("site/", StringComparison.Ordinal))
      {
        continue;
      }

      string path = Path.Combine(dir, relative["site/".Length..].Replace('/', Path.DirectorySeparatorChar));
      Directory.CreateDirectory(Path.GetDirectoryName(path)!);

      using Stream embedded = owl.GetManifestResourceStream(resource)!;
      using FileStream file = File.Create(path);
      embedded.CopyTo(file);
    }

    return dir;
  }

  static int Run(string command, IEnumerable<string> args)
  {
    var info = new ProcessStartInfo(command) { UseShellExecute = false };

    foreach (string arg in args)
    {
      info.ArgumentList.Add(arg);
    }

    // Inheriting stdio, so progress from the child appears as it happens and Ctrl+C reaches it.
    using Process process = Process.Start(info)
      ?? throw new OwlError($"Could not start {command}.");

    process.WaitForExit();
    return process.ExitCode;
  }

  static string ExeSuffix => RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? ".exe" : "";

  static string? FindNode()
  {
    string[] names = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
      ? ["node.exe", "node.cmd"]
      : ["node"];

    string paths = Environment.GetEnvironmentVariable("PATH") ?? "";

    foreach (string dir in paths.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
    {
      foreach (string name in names)
      {
        string candidate = Path.Combine(dir.Trim('"'), name);

        if (File.Exists(candidate))
        {
          return candidate;
        }
      }
    }

    return null;
  }
}

/// <summary>An error worth showing the user as a message rather than a stack trace.</summary>
/// <param name="message">Shown to the user verbatim, so it should read as advice.</param>
sealed class OwlError(string message) : Exception(message);
