namespace Owl.Gen.Load;

/// <summary>
/// The compiler inputs for one project, as captured by the WriteOwlInputs
/// target in owl.targets.
/// </summary>
/// <remarks>
/// The on-disk format is line-based <c>key=value</c>, not JSON: MSBuild cannot
/// escape Windows backslashes for JSON without contortions, whereas file paths
/// can never contain a newline. Only the first '=' separates key from value,
/// and repeated keys accumulate.
/// </remarks>
sealed class ProjectInputs
{
  /// <summary>Full path of the project file these inputs came from.</summary>
  public string ProjectFile { get; private set; } = "";

  /// <summary>Directory holding the project file.</summary>
  public string ProjectDir { get; private set; } = "";

  /// <summary>
  /// Names the compilation, and identifies the documented assembly.
  /// </summary>
  public string AssemblyName { get; private set; } = "";

  /// <summary>The project's default namespace.</summary>
  public string RootNamespace { get; private set; } = "";

  /// <summary>
  /// Framework the project was captured for, recorded in the model.
  /// </summary>
  public string TargetFramework { get; private set; } = "";

  /// <summary>C# version to parse with. Empty means the latest.</summary>
  public string LangVersion { get; private set; } = "";

  /// <summary>
  /// Exe or Library, which decides the compilation's output kind.
  /// </summary>
  public string OutputType { get; private set; } = "";

  /// <summary>Assembly version, recorded in the model.</summary>
  public string? AssemblyVersion { get; private set; }

  /// <summary>Whether unsafe blocks parse.</summary>
  public bool AllowUnsafe { get; private set; }

  /// <summary>
  /// Nullable context: enable, warnings, annotations, or disable.
  /// </summary>
  public string? Nullable { get; private set; }

  /// <summary>
  /// Preprocessor constants. Getting these wrong silently drops whole
  /// <c>#if</c> regions from the output, with no diagnostic.
  /// </summary>
  public List<string> Defines { get; } = [];

  /// <summary>Source files to parse, as full paths.</summary>
  public List<string> Compile { get; } = [];

  /// <summary>
  /// Metadata references, as full paths to implementation assemblies. They
  /// point at implementation rather than reference assemblies so the sibling
  /// .xml doc files are reachable, which is what lets &lt;inheritdoc/&gt;
  /// resolve against bases outside the documented set.
  /// </summary>
  public List<string> References { get; } = [];

  /// <summary>
  /// Reads an inputs file written by the WriteOwlInputs target.
  /// </summary>
  /// <param name="path">The captured <c>.owl-inputs.txt</c> file.</param>
  /// <exception cref="InvalidDataException">
  /// The file carries no assembly name, so the capture did not run properly.
  /// </exception>
  public static ProjectInputs Load(string path)
  {
    var inputs = new ProjectInputs();

    foreach (string raw in File.ReadLines(path))
    {
      string line = raw.Trim();
      if (line.Length == 0)
      {
        continue;
      }

      int eq = line.IndexOf('=');
      if (eq <= 0)
      {
        continue;
      }

      string key = line[..eq];
      string value = line[(eq + 1)..].Trim();
      if (value.Length == 0)
      {
        continue;
      }

      // Unknown keys are ignored, so a newer owl.targets can add lines without
      // breaking an older owl-gen that is reusing captured inputs.
      switch (key)
      {
        case "projectFile": inputs.ProjectFile = value; break;
        case "projectDir": inputs.ProjectDir = value; break;
        case "assemblyName": inputs.AssemblyName = value; break;
        case "rootNamespace": inputs.RootNamespace = value; break;
        case "targetFramework": inputs.TargetFramework = value; break;
        case "langVersion": inputs.LangVersion = value; break;
        case "outputType": inputs.OutputType = value; break;
        case "assemblyVersion": inputs.AssemblyVersion = value; break;
        case "allowUnsafe": inputs.AllowUnsafe = value.Equals("true", StringComparison.OrdinalIgnoreCase); break;
        case "nullable": inputs.Nullable = value; break;
        case "define": inputs.Defines.Add(value); break;
        case "compile": inputs.Compile.Add(value); break;
        case "reference": inputs.References.Add(value); break;
      }
    }

    if (inputs.AssemblyName.Length == 0)
    {
      throw new InvalidDataException(
          $"No assemblyName captured in {path}. The WriteOwlInputs target may have failed.");
    }

    // Duplicate Compile entries are legal in MSBuild (globs plus explicit includes) but
    // would give Roslyn duplicate declarations.
    Dedupe(inputs.Compile);
    Dedupe(inputs.References);

    return inputs;
  }

  static void Dedupe(List<string> items)
  {
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    items.RemoveAll(item => !seen.Add(item));
  }
}
