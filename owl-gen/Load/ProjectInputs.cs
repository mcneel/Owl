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
  /// <summary>
  /// The language MSBuild compiles this project with: "C#" or "VB".
  /// </summary>
  /// <remarks>
  /// Read from $(Language) rather than the project's extension, so it is the build's own answer and
  /// not a guess from a file name.
  /// </remarks>
  public string Language { get; private set; } = "";

  /// <summary>Whether this project is Visual Basic.</summary>
  public bool IsVisualBasic => Language.Equals("VB", StringComparison.OrdinalIgnoreCase);

  /// <summary>Full path of the project file these inputs came from.</summary>
  public string ProjectFile { get; private set; } = "";

  /// <summary>Directory holding the project file.</summary>
  public string ProjectDir { get; private set; } = "";

  /// <summary>
  /// Names the compilation, and identifies the documented assembly.
  /// </summary>
  public string AssemblyName { get; private set; } = "";

  /// <summary>
  /// The project's default namespace.
  /// </summary>
  /// <remarks>
  /// Only C# treats this as a default. In VB it is a compiler option that wraps every declaration in
  /// the assembly, so dropping it there does not lose a fallback - it renames every namespace in the
  /// model.
  /// </remarks>
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

  /// <summary>
  /// Full path of the strong-name key this assembly is signed with, or "" when
  /// it is not signed.
  /// </summary>
  /// <remarks>
  /// Needed for reading, not for emitting: the key decides the compilation's
  /// assembly identity, and identity is what an
  /// <c>InternalsVisibleTo</c> in a dependency is matched against. Without it,
  /// every internal a friend assembly legitimately reaches into comes back
  /// inaccessible.
  /// </remarks>
  public string KeyFile { get; private set; } = "";

  /// <summary>Whether unsafe blocks parse.</summary>
  public bool AllowUnsafe { get; private set; }

  /// <summary>
  /// Nullable context: enable, warnings, annotations, or disable.
  /// </summary>
  public string? Nullable { get; private set; }

  /// <summary>
  /// Preprocessor constants, for C#. Getting these wrong silently drops whole
  /// <c>#if</c> regions from the output, with no diagnostic.
  /// </summary>
  public List<string> Defines { get; } = [];

  /// <summary>
  /// The same thing for VB, still in the form vbc is handed: name=value pairs
  /// joined by commas.
  /// </summary>
  /// <remarks>
  /// Left unparsed on purpose. VB constants carry values - <c>DEBUG=-1</c>,
  /// <c>_MyType="Empty"</c> - and Roslyn exposes the very parser vbc uses for
  /// this string, so splitting it here would only be a second, worse
  /// implementation of it. See <see cref="CompilationBuilder"/>.
  /// </remarks>
  public string VbDefines { get; private set; } = "";

  /// <summary>
  /// Namespaces vbc is told to import for every file, from the project's
  /// <c>Import</c> items.
  /// </summary>
  /// <remarks>
  /// These appear in no source file, so without them a VB project that leans on
  /// them - which is most of them, since the SDK supplies eight by default -
  /// fails to bind almost everything.
  /// </remarks>
  public List<string> Imports { get; } = [];

  /// <summary>Off, On, or Custom. Empty means the compiler's default.</summary>
  public string OptionStrict { get; private set; } = "";

  /// <summary>Whether undeclared locals are an error. Default On.</summary>
  public string OptionExplicit { get; private set; } = "";

  /// <summary>Whether local types are inferred. Default On.</summary>
  public string OptionInfer { get; private set; } = "";

  /// <summary>Binary or Text, for how strings compare. Default Binary.</summary>
  public string OptionCompare { get; private set; } = "";

  /// <summary>
  /// How the VB runtime is supplied: "Embed", a path, or empty for the one among
  /// the references.
  /// </summary>
  public string VbRuntime { get; private set; } = "";

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
        case "language": inputs.Language = value; break;
        case "projectFile": inputs.ProjectFile = value; break;
        case "projectDir": inputs.ProjectDir = value; break;
        case "assemblyName": inputs.AssemblyName = value; break;
        case "rootNamespace": inputs.RootNamespace = value; break;
        case "targetFramework": inputs.TargetFramework = value; break;
        case "langVersion": inputs.LangVersion = value; break;
        case "outputType": inputs.OutputType = value; break;
        case "assemblyVersion": inputs.AssemblyVersion = value; break;
        case "keyFile": inputs.KeyFile = value; break;
        case "allowUnsafe": inputs.AllowUnsafe = value.Equals("true", StringComparison.OrdinalIgnoreCase); break;
        case "nullable": inputs.Nullable = value; break;
        case "define": inputs.Defines.Add(value); break;
        case "compile": inputs.Compile.Add(value); break;
        case "reference": inputs.References.Add(value); break;
        case "vbDefines": inputs.VbDefines = value; break;
        case "import": inputs.Imports.Add(value); break;
        case "optionStrict": inputs.OptionStrict = value; break;
        case "optionExplicit": inputs.OptionExplicit = value; break;
        case "optionInfer": inputs.OptionInfer = value; break;
        case "optionCompare": inputs.OptionCompare = value; break;
        case "vbRuntime": inputs.VbRuntime = value; break;
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

    // The SDK supplies its own Import items on top of the project's, so a project that spells out one
    // of the eight it already gets lists it twice.
    Dedupe(inputs.Imports);

    return inputs;
  }

  static void Dedupe(List<string> items)
  {
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    items.RemoveAll(item => !seen.Add(item));
  }
}
