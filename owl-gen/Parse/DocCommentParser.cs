using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Owl.Gen.Model;

namespace Owl.Gen.Parse;

/// <summary>
/// Turns a documentation comment into structured <see cref="DocNode"/> content.
/// </summary>
/// <remarks>
/// <para>
/// This is where the pipeline earns its keep. The compiler's doc XML resolves
/// a cref and then hands over a plain string, losing the target. Here the cref
/// goes through the <see cref="SemanticModel"/> to a real
/// <see cref="ISymbol"/>, and the resolved doc id survives into the output so
/// the site can render an anchor.
/// </para>
/// <para>
/// Two input paths produce the same output shape: <see cref="Parse"/> for
/// source declarations, and <see cref="ParseMetadataXml"/> for external
/// symbols reached through <c>GetDocumentationCommentXml()</c>, whose crefs are
/// already doc ids.
/// </para>
/// </remarks>
sealed class DocCommentParser
{
  static readonly SymbolDisplayFormat s_crefLabelFormat = new(
      typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypes,
      genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
      memberOptions: SymbolDisplayMemberOptions.IncludeParameters | SymbolDisplayMemberOptions.IncludeContainingType,
      parameterOptions: SymbolDisplayParameterOptions.IncludeType,
      miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes);

  readonly HashSet<string> _ownedAssemblies;
  readonly List<string> _unresolvedCrefs;
  readonly IReadOnlyList<string> _exampleRoots;
  readonly List<string> _missingExamples;

  /// <summary>
  /// Creates a parser for one documented set.
  /// </summary>
  /// <param name="ownedAssemblies">
  /// Assembly names that count as internal. This is what decides whether a
  /// resolved cref becomes a link or plain text.
  /// </param>
  /// <param name="unresolvedCrefs">
  /// Notes about unbindable crefs accumulate here.
  /// </param>
  /// <param name="exampleRoots">
  /// Directories a &lt;code source="..."/&gt; path is tried against, in order.
  /// The paths are written for a documentation tool that had one configured
  /// base, and which base is not recorded anywhere in the comment, so the
  /// likely ones are tried rather than guessed at.
  /// </param>
  /// <param name="missingExamples">
  /// Paths that no root resolved accumulate here.
  /// </param>
  public DocCommentParser(
      IEnumerable<string> ownedAssemblies,
      List<string> unresolvedCrefs,
      IReadOnlyList<string>? exampleRoots = null,
      List<string>? missingExamples = null)
  {
    _ownedAssemblies = new HashSet<string>(ownedAssemblies, StringComparer.Ordinal);
    _unresolvedCrefs = unresolvedCrefs;
    _exampleRoots = exampleRoots ?? [];
    _missingExamples = missingExamples ?? [];
  }

  // ------------------------------------------------------------------
  // Source path
  // ------------------------------------------------------------------

  /// <summary>
  /// Parses a source declaration's doc comment. Returns an empty block when
  /// the declaration carries no comment.
  /// </summary>
  /// <param name="trivia">The doc comment, or null.</param>
  /// <param name="model">
  /// The model for the tree the comment was written in, which is what crefs
  /// resolve against.
  /// </param>
  /// <param name="owner">The symbol the comment documents.</param>
  public DocBlock Parse(DocumentationCommentTriviaSyntax? trivia, SemanticModel model, ISymbol owner)
  {
    var block = new DocBlock();
    if (trivia is null)
    {
      return block;
    }

    foreach (XmlNodeSyntax node in trivia.Content)
    {
      string? name = ElementName(node);
      if (name is null)
      {
        continue;
      }

      // <category>, <since> and <deprecated> are owl's own. None is a standard C# doc
      // tag, so they reach us having passed through the compiler untouched.
      switch (name.ToLowerInvariant())
      {
        case "summary":
          block.Summary = Merge(block.Summary, Inline(ContentOf(node), model, owner, keepSpaces: false));
          break;
        case "remarks":
          block.Remarks = Merge(block.Remarks, Inline(ContentOf(node), model, owner, keepSpaces: false));
          break;
        case "returns":
          block.Returns = Merge(block.Returns, Inline(ContentOf(node), model, owner, keepSpaces: false));
          break;
        case "value":
          block.Value = Merge(block.Value, Inline(ContentOf(node), model, owner, keepSpaces: false));
          break;
        case "example":
          block.Example = Merge(block.Example, Inline(ContentOf(node), model, owner, keepSpaces: false));
          break;

        case "param":
        {
          string? paramName = NameAttribute(node);
          if (paramName is not null)
          {
            block.Params ??= [];
            block.Params[paramName] = Inline(ContentOf(node), model, owner, keepSpaces: false);
          }
          break;
        }

        case "typeparam":
        {
          string? typeParamName = NameAttribute(node);
          if (typeParamName is not null)
          {
            block.TypeParams ??= [];
            block.TypeParams[typeParamName] = Inline(ContentOf(node), model, owner, keepSpaces: false);
          }
          break;
        }

        case "exception":
        {
          DocRef reference = ResolveCref(node, model, owner);
          block.Exceptions ??= [];
          block.Exceptions.Add(new DocException
          {
            DocId = reference.DocId,
            Label = reference.Label,
            Doc = Inline(ContentOf(node), model, owner, keepSpaces: false),
          });
          break;
        }

        case "seealso":
        {
          block.SeeAlso ??= [];
          block.SeeAlso.Add(ResolveCref(node, model, owner));
          break;
        }

        case "category":
          block.Category = PlainText(ContentOf(node));
          break;
        case "since":
          block.Since = PlainText(ContentOf(node));
          break;
        case "deprecated":
          block.Deprecated = PlainText(ContentOf(node));
          break;

        case "inheritdoc":
          block.WantsInheritDoc = true;
          break;
      }
    }

    return block;
  }

  List<DocNode> Inline(SyntaxList<XmlNodeSyntax> content, SemanticModel model, ISymbol owner, bool keepSpaces)
  {
    var nodes = new List<DocNode>();

    foreach (XmlNodeSyntax child in content)
    {
      AppendInline(child, nodes, model, owner, keepSpaces);
    }

    return Tidy(nodes, keepSpaces);
  }

  void AppendInline(XmlNodeSyntax node, List<DocNode> output, SemanticModel model, ISymbol owner, bool keepSpaces)
  {
    switch (node)
    {
      case XmlTextSyntax text:
        AppendText(output, TextOf(text));
        return;

      case XmlCDataSectionSyntax cdata:
        AppendText(output, string.Concat(cdata.TextTokens.Select(t => t.ValueText)));
        return;

      case XmlEmptyElementSyntax empty:
        AppendElement(empty.Name.ToString(), empty, default, output, model, owner, keepSpaces);
        return;

      case XmlElementSyntax element:
        AppendElement(
            element.StartTag.Name.ToString(),
            element,
            element.Content,
            output,
            model,
            owner,
            keepSpaces);
        return;
    }
  }

  void AppendElement(string rawName, XmlNodeSyntax node, SyntaxList<XmlNodeSyntax> content, List<DocNode> output, SemanticModel model, ISymbol owner, bool keepSpaces)
  {
    switch (rawName.ToLowerInvariant())
    {
      case "see":
      case "seealso":
      {
        // <see> carries its target in an attribute, never as content. Walking only
        // text and children, as a naive flattener does, loses it completely.
        string? langword = TextAttribute(node, "langword");
        if (langword is not null)
        {
          output.Add(new DocNode { Kind = "langword", Value = langword });
          return;
        }

        string? href = TextAttribute(node, "href");
        if (href is not null)
        {
          output.Add(new DocNode
          {
            Kind = "link",
            Href = href,
            Value = PlainText(content) is { Length: > 0 } label ? label : href,
          });
          return;
        }

        DocRef reference = ResolveCref(node, model, owner);
        string? inner = PlainText(content);
        output.Add(new DocNode
        {
          Kind = "cref",
          DocId = reference.DocId,
          Label = string.IsNullOrWhiteSpace(inner) ? reference.Label : inner,
          External = reference.External,
        });
        return;
      }

      case "paramref":
        output.Add(new DocNode { Kind = "paramref", Name = NameAttribute(node) });
        return;

      case "typeparamref":
        output.Add(new DocNode { Kind = "typeparamref", Name = NameAttribute(node) });
        return;

      case "c":
        output.Add(new DocNode { Kind = "c", Value = PlainText(content) });
        return;

      case "code":
        output.Add(CodeNode(
            TextAttribute(node, "language") ?? TextAttribute(node, "lang"),
            TextAttribute(node, "source"),
            TextAttribute(node, "region"),
            RawText(content)));
        return;

      case "para":
        output.Add(new DocNode
        {
          Kind = "para",
          Children = Inline(content, model, owner, keepSpaces),
        });
        return;

      case "br":
        output.Add(new DocNode { Kind = "br" });
        return;

      case "note":
        output.Add(new DocNode
        {
          Kind = "note",
          NoteKind = TextAttribute(node, "type"),
          Children = Inline(content, model, owner, keepSpaces),
        });
        return;

      case "list":
        output.Add(BuildList(node, content, model, owner));
        return;

      case "para_":
        return;

      default:
        // Unknown or structural tag: recurse so its text is not dropped. This is what
        // keeps a <para> wrapping a <see> from losing everything after the leading text.
        foreach (XmlNodeSyntax child in content)
        {
          AppendInline(child, output, model, owner, keepSpaces);
        }

        return;
    }
  }

  DocNode BuildList(XmlNodeSyntax node, SyntaxList<XmlNodeSyntax> content, SemanticModel model, ISymbol owner)
  {
    string style = TextAttribute(node, "type") ?? "bullet";
    var items = new List<DocListItem>();

    foreach (XmlNodeSyntax child in content)
    {
      string? name = ElementName(child)?.ToLowerInvariant();
      if (name != "item" && name != "listheader")
      {
        continue;
      }

      SyntaxList<XmlNodeSyntax> itemContent = ContentOf(child);
      List<DocNode>? term = null;
      List<DocNode>? description = null;
      var loose = new List<DocNode>();

      foreach (XmlNodeSyntax part in itemContent)
      {
        switch (ElementName(part)?.ToLowerInvariant())
        {
          case "term":
            term = Inline(ContentOf(part), model, owner, keepSpaces: false);
            break;
          case "description":
            description = Inline(ContentOf(part), model, owner, keepSpaces: false);
            break;
          default:
            AppendInline(part, loose, model, owner, keepSpaces: false);
            break;
        }
      }

      // An <item> with bare content and no <description> is common and legal.
      if (description is null)
      {
        List<DocNode> tidied = Tidy(loose, keepSpaces: false);
        if (tidied.Count > 0)
        {
          description = tidied;
        }
      }

      if (term is not null || description is not null)
      {
        items.Add(new DocListItem { Term = term, Description = description });
      }
    }

    return new DocNode
    {
      Kind = "list",
      Style = style,
      Items = items.Count > 0 ? items : null,
    };
  }

  DocRef ResolveCref(XmlNodeSyntax node, SemanticModel model, ISymbol owner)
  {
    CrefSyntax? cref = node switch
    {
      XmlEmptyElementSyntax empty => empty.Attributes.OfType<XmlCrefAttributeSyntax>().FirstOrDefault()?.Cref,
      XmlElementSyntax element => element.StartTag.Attributes.OfType<XmlCrefAttributeSyntax>().FirstOrDefault()?.Cref,
      _ => null,
    };

    if (cref is null)
    {
      string? href = TextAttribute(node, "href");
      return href is not null
          ? new DocRef { Href = href, Label = href }
          : new DocRef { Label = "" };
    }

    SymbolInfo info = model.GetSymbolInfo(cref);
    ISymbol? symbol = info.Symbol ?? info.CandidateSymbols.FirstOrDefault();

    if (symbol is null)
    {
      // Not fatal: report it and fall back to the text the author wrote. This list is
      // useful on its own, which is why --verify surfaces it.
      _unresolvedCrefs.Add($"{owner.ToDisplayString()}: unresolved cref '{cref}'");
      return new DocRef { Label = cref.ToString() };
    }

    string? docId = DocIds.Of(symbol);
    bool external = symbol.ContainingAssembly is null
        || !_ownedAssemblies.Contains(symbol.ContainingAssembly.Name);

    return new DocRef
    {
      DocId = docId,
      Label = symbol.ToDisplayString(s_crefLabelFormat),
      External = external ? true : null,
    };
  }

  // ------------------------------------------------------------------
  // Metadata path: external symbols, whose crefs are already doc ids
  // ------------------------------------------------------------------

  /// <summary>
  /// Parses the XML string Roslyn returns for a metadata symbol. Used when
  /// &lt;inheritdoc/&gt; points at a base outside the documented set, such as a
  /// BCL interface.
  /// </summary>
  public DocBlock ParseMetadataXml(string? xml)
  {
    var block = new DocBlock();
    if (string.IsNullOrWhiteSpace(xml))
    {
      return block;
    }

    System.Xml.Linq.XElement root;
    try
    {
      root = System.Xml.Linq.XElement.Parse(xml, System.Xml.Linq.LoadOptions.PreserveWhitespace);
    }
    catch (System.Xml.XmlException)
    {
      return block;
    }

    foreach (System.Xml.Linq.XElement element in root.Elements())
    {
      switch (element.Name.LocalName.ToLowerInvariant())
      {
        case "summary": block.Summary = MetadataInline(element); break;
        case "remarks": block.Remarks = MetadataInline(element); break;
        case "returns": block.Returns = MetadataInline(element); break;
        case "value": block.Value = MetadataInline(element); break;
        case "example": block.Example = MetadataInline(element); break;

        case "param":
        {
          string? name = element.Attribute("name")?.Value;
          if (name is not null)
          {
            block.Params ??= [];
            block.Params[name] = MetadataInline(element);
          }
          break;
        }

        case "typeparam":
        {
          string? name = element.Attribute("name")?.Value;
          if (name is not null)
          {
            block.TypeParams ??= [];
            block.TypeParams[name] = MetadataInline(element);
          }
          break;
        }

        case "exception":
        {
          string? cref = element.Attribute("cref")?.Value;
          block.Exceptions ??= [];
          block.Exceptions.Add(new DocException
          {
            DocId = cref,
            Label = cref is null ? null : ShortLabel(cref),
            Doc = MetadataInline(element),
          });
          break;
        }

        case "category": block.Category = Collapse(element.Value); break;
        case "since": block.Since = Collapse(element.Value); break;
        case "deprecated": block.Deprecated = Collapse(element.Value); break;
      }
    }

    return block;
  }

  List<DocNode> MetadataInline(System.Xml.Linq.XElement element)
  {
    var nodes = new List<DocNode>();
    AppendMetadataNodes(element, nodes);
    return Tidy(nodes, keepSpaces: false);
  }

  void AppendMetadataNodes(System.Xml.Linq.XElement element, List<DocNode> output)
  {
    foreach (System.Xml.Linq.XNode child in element.Nodes())
    {
      if (child is System.Xml.Linq.XText text)
      {
        AppendText(output, text.Value);
        continue;
      }

      if (child is not System.Xml.Linq.XElement el)
      {
        continue;
      }

      string name = el.Name.LocalName.ToLowerInvariant();
      switch (name)
      {
        case "see":
        case "seealso":
        {
          string? langword = el.Attribute("langword")?.Value;
          if (langword is not null)
          {
            output.Add(new DocNode { Kind = "langword", Value = langword });
            break;
          }

          string? href = el.Attribute("href")?.Value;
          if (href is not null)
          {
            string label = Collapse(el.Value) is { Length: > 0 } linkText ? linkText : href;
            output.Add(new DocNode { Kind = "link", Href = href, Value = label });
            break;
          }

          string? cref = el.Attribute("cref")?.Value;
          output.Add(new DocNode
          {
            Kind = "cref",
            DocId = cref,
            Label = Collapse(el.Value) is { Length: > 0 } inner ? inner : (cref is null ? "" : ShortLabel(cref)),
            // Everything on this path is by definition outside the documented set.
            External = true,
          });
          break;
        }

        case "paramref":
          output.Add(new DocNode { Kind = "paramref", Name = el.Attribute("name")?.Value });
          break;

        case "typeparamref":
          output.Add(new DocNode { Kind = "typeparamref", Name = el.Attribute("name")?.Value });
          break;

        case "c":
          output.Add(new DocNode { Kind = "c", Value = Collapse(el.Value) });
          break;

        case "code":
          output.Add(CodeNode(
              el.Attribute("language")?.Value ?? el.Attribute("lang")?.Value,
              el.Attribute("source")?.Value,
              el.Attribute("region")?.Value,
              el.Value));
          break;

        case "para":
        {
          var children = new List<DocNode>();
          AppendMetadataNodes(el, children);
          output.Add(new DocNode { Kind = "para", Children = Tidy(children, keepSpaces: false) });
          break;
        }

        case "br":
          output.Add(new DocNode { Kind = "br" });
          break;

        case "list":
        {
          var items = new List<DocListItem>();
          foreach (System.Xml.Linq.XElement item in el.Elements())
          {
            string itemName = item.Name.LocalName.ToLowerInvariant();
            if (itemName != "item" && itemName != "listheader")
            {
              continue;
            }

            System.Xml.Linq.XElement? term = item.Elements()
                .FirstOrDefault(e => e.Name.LocalName.Equals("term", StringComparison.OrdinalIgnoreCase));
            System.Xml.Linq.XElement? description = item.Elements()
                .FirstOrDefault(e => e.Name.LocalName.Equals("description", StringComparison.OrdinalIgnoreCase));

            items.Add(new DocListItem
            {
              Term = term is null ? null : MetadataInline(term),
              Description = description is null ? MetadataInline(item) : MetadataInline(description),
            });
          }

          output.Add(new DocNode
          {
            Kind = "list",
            Style = el.Attribute("type")?.Value ?? "bullet",
            Items = items.Count > 0 ? items : null,
          });
          break;
        }

        default:
          AppendMetadataNodes(el, output);
          break;
      }
    }
  }

  /// <summary>
  /// Last dotted segment of a doc id, with the kind prefix and arity removed.
  /// </summary>
  static string ShortLabel(string docId)
  {
    string name = Slug.StripPrefix(docId);
    int paren = name.IndexOf('(');
    string basePart = paren >= 0 ? name[..paren] : name;
    int dot = basePart.LastIndexOf('.');
    string last = dot >= 0 ? basePart[(dot + 1)..] : basePart;
    int tick = last.IndexOf('`');
    return tick >= 0 ? last[..tick] : last;
  }

  // ------------------------------------------------------------------
  // Text helpers
  // ------------------------------------------------------------------

  static string? ElementName(XmlNodeSyntax node) => node switch
  {
    XmlElementSyntax element => element.StartTag.Name.ToString(),
    XmlEmptyElementSyntax empty => empty.Name.ToString(),
    _ => null,
  };

  static SyntaxList<XmlNodeSyntax> ContentOf(XmlNodeSyntax node) => node switch
  {
    XmlElementSyntax element => element.Content,
    _ => default,
  };

  static string? NameAttribute(XmlNodeSyntax node)
  {
    SyntaxList<XmlAttributeSyntax> attributes = node switch
    {
      XmlElementSyntax element => element.StartTag.Attributes,
      XmlEmptyElementSyntax empty => empty.Attributes,
      _ => default,
    };

    foreach (XmlAttributeSyntax attribute in attributes)
    {
      if (attribute is XmlNameAttributeSyntax named)
      {
        return named.Identifier.Identifier.ValueText;
      }
    }

    return TextAttribute(node, "name");
  }

  static string? TextAttribute(XmlNodeSyntax node, string attributeName)
  {
    SyntaxList<XmlAttributeSyntax> attributes = node switch
    {
      XmlElementSyntax element => element.StartTag.Attributes,
      XmlEmptyElementSyntax empty => empty.Attributes,
      _ => default,
    };

    foreach (XmlAttributeSyntax attribute in attributes)
    {
      if (attribute is XmlTextAttributeSyntax text &&
          text.Name.ToString().Equals(attributeName, StringComparison.OrdinalIgnoreCase))
      {
        return string.Concat(text.TextTokens.Select(t => t.ValueText)).Trim();
      }
    }

    return null;
  }

  /// <summary>
  /// Text of an XmlTextSyntax with the '///' exterior trivia already stripped,
  /// which is what ValueText gives us for free.
  /// </summary>
  static string TextOf(XmlTextSyntax text)
  {
    return string.Concat(text.TextTokens.Select(t => t.ValueText));
  }

  static string RawText(SyntaxList<XmlNodeSyntax> content)
  {
    var sb = new StringBuilder();
    foreach (XmlNodeSyntax node in content)
    {
      switch (node)
      {
        case XmlTextSyntax text:
          sb.Append(TextOf(text));
          break;
        case XmlCDataSectionSyntax cdata:
          sb.Append(string.Concat(cdata.TextTokens.Select(t => t.ValueText)));
          break;
        case XmlElementSyntax element:
          sb.Append(RawText(element.Content));
          break;
      }
    }
    return sb.ToString();
  }

  static string PlainText(SyntaxList<XmlNodeSyntax> content) => Collapse(RawText(content));

  /// <summary>
  /// Collapses whitespace runs to single spaces.
  /// </summary>
  /// <param name="value">The text to collapse.</param>
  /// <param name="keepEdges">
  /// When true, leading and trailing whitespace survives as a single space.
  /// Text nodes need this: a summary reading "implementation of
  /// &lt;see cref="IStorage"/&gt; interface" arrives as three nodes, and
  /// trimming each one's edges would weld the words to the link.
  /// </param>
  static string Collapse(string value, bool keepEdges = false)
  {
    var sb = new StringBuilder(value.Length);
    bool inWhitespace = false;

    foreach (char c in value)
    {
      if (char.IsWhiteSpace(c))
      {
        inWhitespace = true;
        continue;
      }

      if (inWhitespace && sb.Length > 0)
      {
        sb.Append(' ');
      }

      inWhitespace = false;
      sb.Append(c);
    }

    if (!keepEdges || value.Length == 0)
    {
      return sb.ToString();
    }

    if (sb.Length == 0)
    {
      return " ";
    }

    if (char.IsWhiteSpace(value[0]))
    {
      sb.Insert(0, ' ');
    }

    if (char.IsWhiteSpace(value[^1]))
    {
      sb.Append(' ');
    }

    return sb.ToString();
  }

  /// <summary>
  /// Builds a code node from either form of <c>&lt;code&gt;</c>: the text
  /// written between the tags, or the contents of the file named by
  /// <c>source</c>, optionally narrowed to one <c>#region</c>.
  /// </summary>
  /// <remarks>
  /// A source that resolves to nothing still produces a node, carrying the
  /// path and no value. The page can then say which example is missing, which
  /// is more use to whoever has to fix it than silently dropping the block.
  /// </remarks>
  DocNode CodeNode(string? language, string? source, string? region, string inlineText)
  {
    if (string.IsNullOrWhiteSpace(source))
    {
      return new DocNode { Kind = "code", Language = language, Value = Dedent(inlineText) };
    }

    string? text = ReadExample(source, region);
    if (text is null)
    {
      _missingExamples.Add(source);
    }

    return new DocNode
    {
      Kind = "code",
      Language = language,
      Source = source,
      Value = text is null ? null : Dedent(text),
    };
  }

  /// <summary>
  /// Reads the file a <c>source</c> attribute names, trying each configured
  /// root in turn. Returns null when none of them holds it.
  /// </summary>
  string? ReadExample(string source, string? region)
  {
    // Written on Windows, for a tool that ran there. Both separators have to work either way.
    string relative = source.Trim()
        .Replace('\\', Path.DirectorySeparatorChar)
        .Replace('/', Path.DirectorySeparatorChar);

    foreach (string root in Path.IsPathRooted(relative) ? [""] : _exampleRoots)
    {
      string full = root.Length == 0 ? relative : Path.Combine(root, relative);

      string text;
      try
      {
        text = File.ReadAllText(full);
      }
      catch (IOException)
      {
        continue;
      }
      catch (UnauthorizedAccessException)
      {
        continue;
      }

      return string.IsNullOrWhiteSpace(region) ? text : ExtractRegion(text, region!);
    }

    return null;
  }

  /// <summary>
  /// The body of one named <c>#region</c>, in either the C# or the Visual
  /// Basic spelling. Returns the whole text when the region is not there, on
  /// the grounds that too much of the right file beats none of it.
  /// </summary>
  static string ExtractRegion(string text, string region)
  {
    string[] lines = text.Replace("\r\n", "\n").Split('\n');
    string wanted = region.Trim().Trim('"');

    var kept = new List<string>();
    int depth = 0;

    foreach (string line in lines)
    {
      string trimmed = line.TrimStart();
      bool starts = trimmed.StartsWith("#region", StringComparison.OrdinalIgnoreCase)
          || trimmed.StartsWith("#Region", StringComparison.Ordinal);

      if (starts)
      {
        if (depth > 0)
        {
          depth++;
          kept.Add(line);
          continue;
        }

        string name = trimmed[(trimmed.IndexOf("egion", StringComparison.OrdinalIgnoreCase) + 5)..]
            .Trim()
            .Trim('"');

        if (string.Equals(name, wanted, StringComparison.OrdinalIgnoreCase))
        {
          depth = 1;
        }

        continue;
      }

      if (depth > 0 && trimmed.StartsWith("#end", StringComparison.OrdinalIgnoreCase))
      {
        depth--;
        if (depth == 0)
        {
          return string.Join('\n', kept);
        }
      }

      if (depth > 0)
      {
        kept.Add(line);
      }
    }

    return kept.Count > 0 ? string.Join('\n', kept) : text;
  }

  /// <summary>
  /// Removes the indentation shared by every non-blank line of a code block,
  /// so <c>&lt;code&gt;</c> inside a doc comment does not render with the
  /// comment's own indent baked in.
  /// </summary>
  static string Dedent(string value)
  {
    string[] lines = value.Replace("\r\n", "\n").Split('\n');

    int common = int.MaxValue;
    foreach (string line in lines)
    {
      if (line.Trim().Length == 0)
      {
        continue;
      }

      int indent = 0;
      while (indent < line.Length && (line[indent] == ' ' || line[indent] == '\t'))
      {
        indent++;
      }

      common = Math.Min(common, indent);
    }

    if (common is int.MaxValue or 0)
    {
      return value.Trim('\n');
    }

    var trimmed = lines.Select(l => l.Length >= common ? l[common..] : l.TrimStart());
    return string.Join("\n", trimmed).Trim('\n');
  }

  static void AppendText(List<DocNode> output, string value)
  {
    if (value.Length == 0)
    {
      return;
    }

    // Merge into the previous text node so collapsing sees whole runs.
    if (output.Count > 0 && output[^1].Kind == "text")
    {
      output[^1].Value += value;
      return;
    }

    output.Add(DocNode.Text(value));
  }

  /// <summary>
  /// Collapses whitespace in text nodes, drops the ones that end up empty, and
  /// trims the leading and trailing edges of the run.
  /// </summary>
  static List<DocNode> Tidy(List<DocNode> nodes, bool keepSpaces)
  {
    if (!keepSpaces)
    {
      for (int i = 0; i < nodes.Count; i++)
      {
        if (nodes[i].Kind != "text")
        {
          continue;
        }

        nodes[i].Value = Collapse(nodes[i].Value ?? "", keepEdges: true);
      }

      if (nodes.Count > 0 && nodes[0].Kind == "text")
      {
        nodes[0].Value = (nodes[0].Value ?? "").TrimStart();
      }

      if (nodes.Count > 0 && nodes[^1].Kind == "text")
      {
        nodes[^1].Value = (nodes[^1].Value ?? "").TrimEnd();
      }

      nodes.RemoveAll(n => n.Kind == "text" && string.IsNullOrEmpty(n.Value));
    }

    return nodes;
  }

  static List<DocNode>? Merge(List<DocNode>? existing, List<DocNode> addition)
  {
    if (addition.Count == 0)
    {
      return existing;
    }

    if (existing is null || existing.Count == 0)
    {
      return addition;
    }

    // Partial types can document the same tag more than once.
    existing.Add(new DocNode { Kind = "br" });
    existing.AddRange(addition);
    return existing;
  }
}
