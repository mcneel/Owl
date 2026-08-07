using System.Globalization;
using System.Runtime.CompilerServices;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;

namespace Owl.Gen.Load;

/// <summary>
/// Serves documentation from an assembly's sibling .xml file, so
/// <c>ISymbol.GetDocumentationCommentXml()</c> returns content for metadata
/// symbols.
/// </summary>
/// <remarks>
/// Roslyn ships <c>XmlDocumentationProvider</c>, but only in
/// Microsoft.CodeAnalysis.Workspaces. Taking the whole Workspaces dependency
/// for one class is not worth it when the contract is a single lookup method,
/// so this reads the file up front and answers from a dictionary.
/// </remarks>
sealed class XmlDocFileProvider : DocumentationProvider
{
  readonly Dictionary<string, string> _byDocId;

  XmlDocFileProvider(Dictionary<string, string> byDocId)
  {
    _byDocId = byDocId;
  }

  /// <summary>
  /// Reads a doc XML file, returning null when it is missing or unusable. A
  /// malformed doc file shipped alongside some dependency must never take a
  /// whole run down.
  /// </summary>
  public static XmlDocFileProvider? TryCreate(string xmlPath)
  {
    try
    {
      XDocument document = XDocument.Load(xmlPath, LoadOptions.PreserveWhitespace);

      var byDocId = new Dictionary<string, string>(StringComparer.Ordinal);

      foreach (XElement member in document.Descendants("member"))
      {
        string? name = member.Attribute("name")?.Value;
        if (string.IsNullOrEmpty(name))
        {
          continue;
        }

        // Roslyn expects the full <member> element, which is also what
        // DocCommentParser.ParseMetadataXml is written to consume.
        byDocId[name] = member.ToString(SaveOptions.DisableFormatting);
      }

      return byDocId.Count == 0 ? null : new XmlDocFileProvider(byDocId);
    }
    catch (Exception)
    {
      return null;
    }
  }

  /// <summary>Looks up the doc XML recorded for a doc id.</summary>
  protected override string? GetDocumentationForSymbol(string docId, CultureInfo _1, CancellationToken _2 = default)
  {
    return _byDocId.TryGetValue(docId, out string? xml) ? xml : null;
  }

  /// <summary>
  /// Reference equality: one provider per doc file, held by Roslyn.
  /// </summary>
  public override bool Equals(object? obj) => ReferenceEquals(this, obj);

  /// <inheritdoc/>
  public override int GetHashCode() => RuntimeHelpers.GetHashCode(this);
}
