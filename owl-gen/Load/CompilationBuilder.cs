using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Text;

// Aliased rather than imported: the two language namespaces both spell LanguageVersion and
// LanguageVersionFacts, so importing each would leave every use of them needing a qualifier anyway.
using VB = Microsoft.CodeAnalysis.VisualBasic;

namespace Owl.Gen.Load;

/// <summary>
/// Builds a Roslyn <see cref="Compilation"/> equivalent to what the real build
/// would produce for a project.
/// </summary>
/// <remarks>
/// The two languages diverge only here. Everything downstream works on
/// <see cref="ISymbol"/>, which is language-neutral, so this is the one place
/// that has to know which compiler a project belongs to.
/// </remarks>
static class CompilationBuilder
{
  /// <summary>
  /// Reads a key file so an assembly's identity carries its public key.
  /// </summary>
  /// <remarks>
  /// Stateless and thread-safe, so one instance serves every project. Roslyn leaves
  /// StrongNameProvider null by default, and with no provider a CryptoKeyFile is never opened - the
  /// identity comes back unsigned and the key might as well not have been captured.
  /// </remarks>
  static readonly StrongNameProvider SIGNING_PROVIDER = new DesktopStrongNameProvider();

  /// <summary>
  /// Builds the compilation for one project from its captured inputs. A source
  /// file or reference that has gone missing is reported and skipped rather
  /// than taking the run down.
  /// </summary>
  public static Compilation Build(ProjectInputs inputs, TextWriter log)
  {
    return inputs.IsVisualBasic ? BuildVisualBasic(inputs, log) : BuildCSharp(inputs, log);
  }

  static CSharpCompilation BuildCSharp(ProjectInputs inputs, TextWriter log)
  {
    // DocumentationMode.Parse is what makes doc comments show up as structured trivia
    // instead of ordinary comments, which is the whole point of walking them.
    var parseOptions = new CSharpParseOptions(ParseLangVersion(inputs.LangVersion), DocumentationMode.Parse)
        .WithPreprocessorSymbols(inputs.Defines);

    var options = new CSharpCompilationOptions(
        ParseOutputKind(inputs.OutputType),
        allowUnsafe: inputs.AllowUnsafe,
        nullableContextOptions: ParseNullable(inputs.Nullable),
        // Analysis only, nothing is emitted, so suppress the noise wholesale.
        generalDiagnosticOption: ReportDiagnostic.Suppress,
        assemblyIdentityComparer: DesktopAssemblyIdentityComparer.Default,
        cryptoKeyFile: Signing(inputs, log),
        strongNameProvider: SIGNING_PROVIDER);

    return CSharpCompilation.Create(
        inputs.AssemblyName,
        ReadTrees(inputs, log, (text, path) => CSharpSyntaxTree.ParseText(text, parseOptions, path)),
        ReadReferences(inputs, log),
        options);
  }

  /// <summary>
  /// The VB counterpart, which needs three things C# has no equivalent of.
  /// </summary>
  /// <remarks>
  /// <para>
  /// RootNamespace is a compiler option in VB, not an IDE default: it wraps every declaration in
  /// the assembly. Omit it and the model is right about everything except where all of it lives.
  /// </para>
  /// <para>
  /// GlobalImports are namespaces vbc is handed on the command line, appearing in no source file.
  /// The SDK supplies eight before the project adds any, so leaving them out fails to bind most of
  /// a normal VB assembly.
  /// </para>
  /// <para>
  /// Conditional constants are name=value pairs joined by commas rather than bare names joined by
  /// semicolons, and are parsed by the compiler rather than by MSBuild. Roslyn exposes the same
  /// parser vbc uses, so the captured string is handed over whole instead of being taken apart
  /// twice.
  /// </para>
  /// </remarks>
  static VB.VisualBasicCompilation BuildVisualBasic(ProjectInputs inputs, TextWriter log)
  {
    var symbols = VB.VisualBasicCommandLineParser.ParseConditionalCompilationSymbols(
        inputs.VbDefines,
        out IEnumerable<Diagnostic> defineErrors);

    foreach (Diagnostic error in defineErrors)
    {
      log.WriteLine($"  warning: conditional compilation constants: {error.GetMessage()}");
    }

    var parseOptions = new VB.VisualBasicParseOptions(
            ParseVbLangVersion(inputs.LangVersion),
            DocumentationMode.Parse)
        .WithPreprocessorSymbols(symbols);

    var imports = VB.GlobalImport.Parse(inputs.Imports, out var importErrors);

    foreach (Diagnostic error in importErrors)
    {
      log.WriteLine($"  warning: project-level import: {error.GetMessage()}");
    }

    var options = new VB.VisualBasicCompilationOptions(
        ParseOutputKind(inputs.OutputType),
        rootNamespace: inputs.RootNamespace,
        globalImports: imports,
        optionStrict: ParseOptionStrict(inputs.OptionStrict),
        optionExplicit: ParseOnOff(inputs.OptionExplicit, whenEmpty: true),
        optionInfer: ParseOnOff(inputs.OptionInfer, whenEmpty: true),
        optionCompareText: inputs.OptionCompare.Equals("Text", StringComparison.OrdinalIgnoreCase),
        parseOptions: parseOptions,
        // Analysis only, nothing is emitted, so suppress the noise wholesale.
        generalDiagnosticOption: ReportDiagnostic.Suppress,
        assemblyIdentityComparer: DesktopAssemblyIdentityComparer.Default,
        cryptoKeyFile: Signing(inputs, log),
        strongNameProvider: SIGNING_PROVIDER,
        // Below .NET Core 3.0 there is no Microsoft.VisualBasic complete enough to reference, so
        // MSBuild tells the compiler to embed the runtime's core instead of resolving one.
        embedVbCoreRuntime: inputs.VbRuntime.Equals("Embed", StringComparison.OrdinalIgnoreCase));

    return VB.VisualBasicCompilation.Create(
        inputs.AssemblyName,
        ReadTrees(inputs, log, (text, path) => VB.VisualBasicSyntaxTree.ParseText(text, parseOptions, path)),
        ReadReferences(inputs, log),
        options);
  }

  /// <summary>
  /// The key file to compile under, or null when there is none to use.
  /// </summary>
  /// <remarks>
  /// A missing key is a warning rather than a failure: the run still produces a model, just one
  /// where a friend assembly's internals are out of reach. Saying so here is what makes the
  /// inaccessibility errors that follow explicable.
  /// </remarks>
  static string? Signing(ProjectInputs inputs, TextWriter log)
  {
    if (inputs.KeyFile.Length == 0)
    {
      return null;
    }

    if (!File.Exists(inputs.KeyFile))
    {
      log.WriteLine($"  warning: signing key not found, internals of friend assemblies will be " +
                    $"out of reach: {inputs.KeyFile}");
      return null;
    }

    return inputs.KeyFile;
  }

  static List<SyntaxTree> ReadTrees(ProjectInputs inputs, TextWriter log, Func<SourceText, string, SyntaxTree> parse)
  {
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

      trees.Add(parse(text, file));
    }

    return trees;
  }

  static List<MetadataReference> ReadReferences(ProjectInputs inputs, TextWriter log)
  {
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

    return references;
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

  static VB.LanguageVersion ParseVbLangVersion(string value)
  {
    if (string.IsNullOrWhiteSpace(value))
    {
      return VB.LanguageVersion.Latest;
    }

    // 'ref' rather than 'out': the VB overload declares its parameter ByRef, so it wants an
    // initialised variable, unlike the C# one next door.
    var parsed = VB.LanguageVersion.Latest;

    return VB.LanguageVersionFacts.TryParse(value, ref parsed)
        ? parsed
        : VB.LanguageVersion.Latest;
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

  static VB.OptionStrict ParseOptionStrict(string value) => value.ToLowerInvariant() switch
  {
    "on" => VB.OptionStrict.On,
    "custom" => VB.OptionStrict.Custom,
    _ => VB.OptionStrict.Off,
  };

  /// <summary>
  /// An MSBuild On/Off switch, with the compiler's own default when the project
  /// never named one.
  /// </summary>
  static bool ParseOnOff(string value, bool whenEmpty)
  {
    if (value.Length == 0)
    {
      return whenEmpty;
    }

    return value.Equals("On", StringComparison.OrdinalIgnoreCase)
        || value.Equals("true", StringComparison.OrdinalIgnoreCase);
  }
}
