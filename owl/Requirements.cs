using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Owl;

/// <summary>
/// The programs owl needs on the machine, checked before a command starts work.
/// </summary>
/// <remarks>
/// Shipping self-contained removes the .NET runtime as a prerequisite and nothing else. owl-gen
/// asks <c>dotnet msbuild</c> what a project really compiles, and owl-site is JavaScript that node
/// has to run. Unchecked, both fail late and badly: a missing dotnet surfaces from deep inside a
/// capture as a process that would not start, and a missing node only after <c>owl build</c> has
/// spent minutes generating the model it then cannot render. One --version call each buys a
/// sentence at the start naming what to install.
///
/// d2 is deliberately absent: it is needed only by a page that actually holds a diagram, so
/// owl-site probes for it when it meets the first one and leaves the fence as a code block
/// otherwise. Requiring it here would stop every project that has never drawn anything.
/// </remarks>
static class Requirements
{
  /// <summary>The oldest .NET SDK owl claims to work with.</summary>
  const int MIN_DOTNET = 8;

  /// <summary>The oldest node owl-site claims to work with; its package.json says the same.</summary>
  const int MIN_NODE = 18;

  /// <summary>Checks for a .NET SDK, which is where owl-gen learns what a project compiles.</summary>
  /// <exception cref="OwlError">No dotnet on PATH, or nothing behind it that can build.</exception>
  public static void Dotnet()
  {
    if (Find("dotnet") is null)
    {
      throw new OwlError(
        "A .NET SDK is required to read what a project compiles, and 'dotnet' was not found on PATH.\n" +
        $"Install SDK {MIN_DOTNET}.0 or newer from https://dotnet.microsoft.com/download, or pass\n" +
        "'--json <dir>' to render a model that was generated somewhere else.");
    }

    // A dotnet on PATH may be the runtime-only install, which has no msbuild to ask. --list-sdks is
    // the question that tells the two apart, and its answer carries the versions as well.
    int newest = Read("dotnet", "--list-sdks")
      .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
      .Select(Major)
      .DefaultIfEmpty(0)
      .Max();

    if (newest == 0)
    {
      throw new OwlError(
        "'dotnet' is on PATH but reports no installed SDK, so it cannot build the projects owl\n" +
        $"documents. Install .NET SDK {MIN_DOTNET}.0 or newer from https://dotnet.microsoft.com/download.");
    }

    if (newest < MIN_DOTNET)
    {
      throw new OwlError(
        $"owl needs .NET SDK {MIN_DOTNET}.0 or newer; the newest one installed is {newest}.x.\n" +
        "Install a newer SDK from https://dotnet.microsoft.com/download.");
    }
  }

  /// <summary>Checks for node, which runs owl-site's serve and build scripts.</summary>
  /// <exception cref="OwlError">No node on PATH, or one older than owl-site is written for.</exception>
  public static void Node()
  {
    if (Find("node") is null)
    {
      throw new OwlError(
        "Node is required to serve or export the site, and 'node' was not found on PATH.\n" +
        $"Install Node {MIN_NODE} or newer from https://nodejs.org, or run 'owl gen' on its own to\n" +
        "write the model without rendering it.");
    }

    // Nothing is claimed about a node that will not say its version: whatever is wrong with it,
    // running it is about to produce a better message than a guess from here would.
    int major = Major(Read("node", "--version").TrimStart('v', 'V'));

    if (major > 0 && major < MIN_NODE)
    {
      throw new OwlError(
        $"owl-site needs Node {MIN_NODE} or newer; the 'node' on PATH is {major}.x.\n" +
        "Install a newer Node from https://nodejs.org.");
    }
  }

  /// <summary>The full path to a program on PATH, or null when it is not there.</summary>
  public static string? Find(string name)
  {
    // Windows leaves the extension out of the command name, and a version manager or an npm
    // wrapper installs a .cmd rather than an .exe, so all three are worth looking for.
    string[] names = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
      ? [name + ".exe", name + ".cmd", name + ".bat"]
      : [name];

    string paths = Environment.GetEnvironmentVariable("PATH") ?? "";

    foreach (string dir in paths.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
    {
      foreach (string candidate in names)
      {
        string full = Path.Combine(dir.Trim('"'), candidate);

        if (File.Exists(full))
        {
          return full;
        }
      }
    }

    return null;
  }

  /// <summary>What a program prints on standard output, or "" if it would not run or failed.</summary>
  static string Read(string command, string arg)
  {
    var info = new ProcessStartInfo(command)
    {
      RedirectStandardOutput = true,
      RedirectStandardError = true,
      UseShellExecute = false,
    };

    info.ArgumentList.Add(arg);

    try
    {
      using Process? process = Process.Start(info);

      if (process is null)
      {
        return "";
      }

      // Both streams are drained, so a version probe never leaves its complaint on owl's console.
      string output = process.StandardOutput.ReadToEnd();
      process.StandardError.ReadToEnd();
      process.WaitForExit();

      return process.ExitCode == 0 ? output : "";
    }
    catch
    {
      return "";
    }
  }

  /// <summary>The leading version number in a line like "8.0.404 [/usr/share/dotnet/sdk]".</summary>
  static int Major(string line)
  {
    string first = line.Split(' ')[0].Split('.')[0];
    return int.TryParse(first, out int value) ? value : 0;
  }
}
