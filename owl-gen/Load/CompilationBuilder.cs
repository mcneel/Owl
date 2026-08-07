using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Text;

namespace Owl.Gen.Load;

/// <summary>
/// Builds a Roslyn <see cref="CSharpCompilation"/> equivalent to what the real
/// build would produce for a project.
/// </summary>
static class CompilationBuilder
{
  /// <summary>
  /// Builds the compilation for one project from its captured inputs. A source
  /// file or reference that has gone missing is reported and skipped rather
  /// than taking the run down.
  /// </summary>
  public static CSharpCompilation Build(ProjectInputs inputs, TextWriter log)
  {
    LanguageVersion langVersion = ParseLangVersion(inputs.LangVersion);

    // DocumentationMode.Parse is what makes doc comments show up as structured trivia
    // instead of ordinary comments, which is the whole point of walking them.
    var parseOptions = new CSharpParseOptions(langVersion, DocumentationMode.Parse)
        .WithPreprocessorSymbols(inputs.Defines);

    var trees = new List<SyntaxTree>(inputs.Compile.Count);
    foreach (string file in inputs.Compile)
    {
      if (!File.Exists(file))
      {
        log.WriteLine($"  warning: source file not found, skipping: {file}");
        continue;
      }

      SourceText text;
      using (var stream = File.OpenRead(file))
      {
        text = SourceText.From(stream, canBeEmbedded: false);
      }

      trees.Add(CSharpSyntaxTree.ParseText(text, parseOptions, path: file));
    }

    var references = new List<MetadataReference>(inputs.References.Count);
    foreach (string path in inputs.References)
    {
      if (!File.Exists(path))
      {
        log.WriteLine($"  warning: reference not found, skipping: {path}");
        continue;
      }

      references.Add(CreateReference(path));
    }

    var options = new CSharpCompilationOptions(
        ParseOutputKind(inputs.OutputType),
        allowUnsafe: inputs.AllowUnsafe,
        nullableContextOptions: ParseNullable(inputs.Nullable),
        // Analysis only, nothing is emitted, so suppress the noise wholesale.
        generalDiagnosticOption: ReportDiagnostic.Suppress,
        assemblyIdentityComparer: DesktopAssemblyIdentityComparer.Default);

    return CSharpCompilation.Create(inputs.AssemblyName, trees, references, options);
  }

  /// <summary>
  /// Attaches the sibling .xml doc file to a metadata reference when one
  /// exists, which is what lets <c>ISymbol.GetDocumentationCommentXml()</c>
  /// return anything for external symbols. Without it, &lt;inheritdoc/&gt;
  /// from a base outside the documented set yields nothing.
  /// </summary>
  static PortableExecutableReference CreateReference(string assemblyPath)
  {
    string xmlPath = Path.ChangeExtension(assemblyPath, ".xml");

    if (File.Exists(xmlPath) && XmlDocFileProvider.TryCreate(xmlPath) is { } documentation)
    {
      return MetadataReference.CreateFromFile(assemblyPath, documentation: documentation);
    }

    return MetadataReference.CreateFromFile(assemblyPath);
  }

  static LanguageVersion ParseLangVersion(string value)
  {
    if (string.IsNullOrWhiteSpace(value))
    {
      return LanguageVersion.Latest;
    }

    return LanguageVersionFacts.TryParse(value, out var parsed)
        ? parsed
        : LanguageVersion.Latest;
  }

  static OutputKind ParseOutputKind(string outputType)
  {
    return outputType.Equals("Exe", StringComparison.OrdinalIgnoreCase) ?
           OutputKind.ConsoleApplication :
           OutputKind.DynamicallyLinkedLibrary;
  }

  static NullableContextOptions ParseNullable(string? value) => value?.ToLowerInvariant() switch
  {
    "enable" => NullableContextOptions.Enable,
    "warnings" => NullableContextOptions.Warnings,
    "annotations" => NullableContextOptions.Annotations,
    _ => NullableContextOptions.Disable,
  };
}
