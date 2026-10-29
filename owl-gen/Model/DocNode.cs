using System.Text.Json.Serialization;

namespace Owl.Gen.Model;

/// <summary>
/// One node of a parsed documentation comment.
/// <para>
/// The point of this type is that doc comments stay <em>structured</em> all
/// the way to the renderer. The compiler's doc XML flattens a
/// &lt;see cref="..."/&gt; down to a display string, which permanently loses
/// the target. Keeping the resolved doc id means the site can render a real
/// anchor instead of styled text.
/// </para>
/// Property names are deliberately short: doc nodes dominate the output size.
/// </summary>
sealed class DocNode
{
  /// <summary>
  /// Discriminator. One of: text, cref, paramref, typeparamref, langword, c,
  /// code, para, list, link, note, br.
  /// </summary>
  [JsonPropertyName("t")] public string Kind { get; set; } = "text";

  /// <summary>Literal value for text, c, code and langword nodes.</summary>
  [JsonPropertyName("v")] public string? Value { get; set; }

  /// <summary>
  /// Resolved documentation comment id for a cref node, null when
  /// unresolvable.
  /// </summary>
  [JsonPropertyName("id")] public string? DocId { get; set; }

  /// <summary>Human-readable label for a cref node.</summary>
  [JsonPropertyName("label")] public string? Label { get; set; }

  /// <summary>
  /// True when a cref points outside the documented assembly set.
  /// </summary>
  [JsonPropertyName("external")] public bool? External { get; set; }

  /// <summary>
  /// Assembly an external cref's target is declared in. See
  /// <see cref="TypeRef.Assembly"/>.
  /// </summary>
  [JsonPropertyName("asm")] public string? Assembly { get; set; }

  /// <summary>
  /// Parameter or type-parameter name for paramref / typeparamref nodes.
  /// </summary>
  [JsonPropertyName("name")] public string? Name { get; set; }

  /// <summary>
  /// Absolute url for a link node, from &lt;see href="..."/&gt;.
  /// </summary>
  [JsonPropertyName("href")] public string? Href { get; set; }

  /// <summary>Language hint for a code node.</summary>
  [JsonPropertyName("lang")] public string? Language { get; set; }

  /// <summary>
  /// The file a code node was read from, as the comment wrote it. Set only for
  /// &lt;code source="..."/&gt;, and kept so a page can say where an example lives rather than
  /// presenting a wall of code from nowhere.
  /// </summary>
  [JsonPropertyName("src")] public string? Source { get; set; }

  /// <summary>List style for a list node: bullet, number or table.</summary>
  [JsonPropertyName("style")] public string? Style { get; set; }

  /// <summary>Note kind for a note node, e.g. warning or caution.</summary>
  [JsonPropertyName("kind")] public string? NoteKind { get; set; }

  /// <summary>
  /// Nested content for container nodes such as para and note.
  /// </summary>
  [JsonPropertyName("children")] public List<DocNode>? Children { get; set; }

  /// <summary>Entries for a list node.</summary>
  [JsonPropertyName("items")] public List<DocListItem>? Items { get; set; }

  /// <summary>Builds a plain text node, the most common kind by far.</summary>
  public static DocNode Text(string value) => new() { Kind = "text", Value = value };
}

/// <summary>One entry of a &lt;list&gt;, as term plus description.</summary>
sealed class DocListItem
{
  /// <summary>
  /// The term, or the row's first cell in a table-style list.
  /// </summary>
  [JsonPropertyName("term")] public List<DocNode>? Term { get; set; }

  /// <summary>The description paired with the term.</summary>
  [JsonPropertyName("description")] public List<DocNode>? Description { get; set; }
}

/// <summary>
/// A &lt;seealso&gt; target, resolved to a link where possible.
/// </summary>
sealed class DocRef
{
  /// <summary>Resolved doc id, null when the cref could not be bound.</summary>
  [JsonPropertyName("id")] public string? DocId { get; set; }

  /// <summary>Human-readable label for the reference.</summary>
  [JsonPropertyName("label")] public string? Label { get; set; }

  /// <summary>Absolute url, set instead of a doc id for href form.</summary>
  [JsonPropertyName("href")] public string? Href { get; set; }

  /// <summary>True when the target lives outside the documented set.</summary>
  [JsonPropertyName("external")] public bool? External { get; set; }

  /// <summary>
  /// Assembly an external target is declared in. See
  /// <see cref="TypeRef.Assembly"/>.
  /// </summary>
  [JsonPropertyName("asm")] public string? Assembly { get; set; }
}

/// <summary>One &lt;exception&gt; tag: what is thrown, and when.</summary>
sealed class DocException
{
  /// <summary>Doc id of the exception type, null when unresolvable.</summary>
  [JsonPropertyName("id")] public string? DocId { get; set; }

  /// <summary>Display name of the exception type.</summary>
  [JsonPropertyName("label")] public string? Label { get; set; }

  /// <summary>The condition described in the tag body.</summary>
  [JsonPropertyName("doc")] public List<DocNode>? Doc { get; set; }
}

/// <summary>
/// Everything extracted from one symbol's documentation comment.
/// </summary>
sealed class DocBlock
{
  /// <summary>The &lt;summary&gt; tag.</summary>
  public List<DocNode>? Summary { get; set; }

  /// <summary>The &lt;remarks&gt; tag.</summary>
  public List<DocNode>? Remarks { get; set; }

  /// <summary>The &lt;returns&gt; tag.</summary>
  public List<DocNode>? Returns { get; set; }

  /// <summary>The &lt;value&gt; tag, used on properties.</summary>
  public List<DocNode>? Value { get; set; }

  /// <summary>The &lt;example&gt; tag.</summary>
  public List<DocNode>? Example { get; set; }

  /// <summary>Per-parameter documentation, keyed by parameter name.</summary>
  public Dictionary<string, List<DocNode>>? Params { get; set; }

  /// <summary>
  /// Per-type-parameter documentation, keyed by type parameter name.
  /// </summary>
  public Dictionary<string, List<DocNode>>? TypeParams { get; set; }

  /// <summary>Every &lt;exception&gt; tag, in source order.</summary>
  public List<DocException>? Exceptions { get; set; }

  /// <summary>Every &lt;seealso&gt; tag, in source order.</summary>
  public List<DocRef>? SeeAlso { get; set; }

  /// <summary>
  /// owl's &lt;category&gt; tag, which groups types on the site.
  /// </summary>
  public string? Category { get; set; }

  /// <summary>
  /// owl's &lt;since&gt; tag: the API version this symbol appeared in.
  /// </summary>
  public string? Since { get; set; }

  /// <summary>
  /// owl's &lt;deprecated&gt; tag: the API version this symbol was deprecated in.
  /// </summary>
  public string? Deprecated { get; set; }

  /// <summary>
  /// Doc id the content was pulled from when this symbol used
  /// &lt;inheritdoc/&gt;.
  /// </summary>
  public string? InheritedFrom { get; set; }

  /// <summary>
  /// True when the symbol has no summary from any source. Surfaced because
  /// projects routinely suppress CS1591, so a normal build never reports it.
  /// </summary>
  public bool Undocumented { get; set; }

  /// <summary>
  /// Set while parsing when the comment asked to inherit. Not serialized: by
  /// the time the model is written, inheritance has already been resolved.
  /// </summary>
  [JsonIgnore]
  public bool WantsInheritDoc { get; set; }

  /// <summary>
  /// The symbol named by &lt;inheritdoc cref="..."/&gt;, inherited from in place of the base.
  /// </summary>
  [JsonIgnore]
  public Microsoft.CodeAnalysis.ISymbol? InheritDocCref { get; set; }

  /// <summary>True when no tag carried any content.</summary>
  [JsonIgnore]
  public bool IsEmpty =>
      Summary is null && Remarks is null && Returns is null && Value is null &&
      Example is null && Params is null && TypeParams is null && Exceptions is null &&
      SeeAlso is null && Category is null && Since is null && Deprecated is null;
}
