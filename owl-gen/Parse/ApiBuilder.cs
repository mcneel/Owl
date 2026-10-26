using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Owl.Gen.Load;
using Owl.Gen.Model;

namespace Owl.Gen.Parse;

/// <summary>
/// Builds an <see cref="ApiAssembly"/> from a compiled project.
/// </summary>
/// <remarks>
/// <para>
/// The walker harvests doc comments and source spans from syntax; this class
/// drives off <em>symbols</em>. That split is deliberate. Symbol enumeration is
/// authoritative about what a type actually contains, so no declaration form
/// can be missed, and partial types need no merge heuristics: one
/// <see cref="INamedTypeSymbol"/> already represents every declaration.
/// </para>
/// </remarks>
sealed class ApiBuilder
{
  /// <summary>
  /// Attributes that describe compiler plumbing rather than API contract.
  /// </summary>
  static readonly HashSet<string> s_hiddenAttributes = new(StringComparer.Ordinal)
  {
      "System.Runtime.CompilerServices.CompilerGeneratedAttribute",
      "System.Runtime.CompilerServices.IsReadOnlyAttribute",
      "System.Runtime.CompilerServices.IsByRefLikeAttribute",
      "System.Runtime.CompilerServices.ExtensionAttribute",
      "System.Runtime.CompilerServices.NullableAttribute",
      "System.Runtime.CompilerServices.NullableContextAttribute",
      "System.Runtime.CompilerServices.AsyncStateMachineAttribute",
      "System.Runtime.CompilerServices.IteratorStateMachineAttribute",
      "System.Runtime.CompilerServices.TupleElementNamesAttribute",
      "System.Runtime.CompilerServices.DynamicAttribute",
      "System.Diagnostics.DebuggerHiddenAttribute",
      "System.Diagnostics.DebuggerNonUserCodeAttribute",
      "System.Diagnostics.DebuggerStepThroughAttribute",
  };

  readonly Compilation _compilation;
  readonly ProjectInputs _inputs;
  readonly string _repoRoot;
  readonly DocCommentParser _docParser;
  readonly DocFindings _findings;

  readonly Dictionary<ISymbol, DeclaredSymbol> _declarations =
      new(SymbolEqualityComparer.Default);

  readonly Dictionary<ISymbol, DocBlock> _docs =
      new(SymbolEqualityComparer.Default);

  readonly HashSet<ISymbol> _inheritInProgress = new(SymbolEqualityComparer.Default);

  /// <summary>
  /// Creates a builder for one project's compilation.
  /// </summary>
  /// <param name="cmpl">The project, already compiled.</param>
  /// <param name="inputs">Its captured MSBuild inputs.</param>
  /// <param name="root">
  /// Root that source paths are made relative to.
  /// </param>
  /// <param name="apis">
  /// Every assembly in the documented set, which is what makes a cref internal
  /// rather than external.
  /// </param>
  /// <param name="findings">Findings accumulate here across all projects.</param>
  /// <param name="examplesRoot">
  /// An extra root &lt;code source="..."/&gt; paths are tried against before the
  /// project directory and the repo root, when one was given.
  /// </param>
  public ApiBuilder(
      Compilation cmpl,
      ProjectInputs inputs,
      string root,
      IEnumerable<string> apis,
      DocFindings findings,
      string? examplesRoot = null)
  {
    _compilation = cmpl;
    _inputs = inputs;
    _repoRoot = root;
    _findings = findings;

    // The two directories such a path is usually written against, in the order that a narrower
    // guess comes first, with an explicit root ahead of both. Naming one adds a place to look
    // rather than replacing these: a caller reaching for examples kept outside the tree should not
    // thereby lose the ones already resolving beside the project.
    List<string> exampleRoots = examplesRoot is null
        ? [inputs.ProjectDir, root]
        : [examplesRoot, inputs.ProjectDir, root];

    _docParser = new DocCommentParser(
        cmpl.Language,
        apis,
        findings.UnresolvedCrefs,
        exampleRoots.Where(dir => !string.IsNullOrEmpty(dir)).Distinct(StringComparer.Ordinal).ToList(),
        findings.MissingExamples);
  }

  /// <summary>
  /// Builds the assembly model. Documentation for every symbol is parsed
  /// before any &lt;inheritdoc/&gt; is resolved, so a tag pointing at another
  /// type in this same assembly finds real content.
  /// </summary>
  public ApiAssembly Build()
  {
    HarvestDeclarations();

    var assembly = new ApiAssembly
    {
      Name = _inputs.AssemblyName,
      Version = _inputs.AssemblyVersion,
      TargetFramework = _inputs.TargetFramework,
    };

    // Every type is read, so hidden ones such as an internal NamespaceDoc can still lend their docs.
    var all = new List<INamedTypeSymbol>();
    CollectTypes(_compilation.Assembly.GlobalNamespace, all);
    List<INamedTypeSymbol> types = all.Where(IsDocumentableType).ToList();

    // Documentation is parsed for every symbol before any inheritdoc is resolved, so that
    // an <inheritdoc/> pointing at another type in this same assembly finds real content
    // instead of an empty block.
    foreach (INamedTypeSymbol type in types)
    {
      _docs[type] = ParseDocs(type);

      foreach (ISymbol member in DocumentableMembers(type))
      {
        _docs[member] = ParseDocs(member);
      }
    }

    foreach (INamedTypeSymbol type in types)
    {
      assembly.Types.Add(BuildType(type));
    }

    assembly.Types.Sort((a, b) => string.CompareOrdinal(a.FullName, b.FullName));
    assembly.Namespaces = BuildNamespaces(assembly.Types, all);

    return assembly;
  }

  // ------------------------------------------------------------------
  // Harvesting
  // ------------------------------------------------------------------

  void HarvestDeclarations()
  {
    foreach (SyntaxTree tree in _compilation.SyntaxTrees)
    {
      SemanticModel model = _compilation.GetSemanticModel(tree);

      foreach (DeclaredSymbol declaration in SourceFileWalker.Walk(model))
      {
        // Partial types and partial methods declare the same symbol more than once.
        // Prefer whichever declaration actually carries documentation; fall back to the
        // first one seen so there is always a source location.
        if (_declarations.TryGetValue(declaration.Symbol, out DeclaredSymbol? existing))
        {
          if (existing.Doc is null && declaration.Doc is not null)
          {
            _declarations[declaration.Symbol] = declaration;
          }
        }
        else
        {
          _declarations[declaration.Symbol] = declaration;
        }
      }
    }
  }

  void CollectTypes(INamespaceSymbol ns, List<INamedTypeSymbol> output)
  {
    foreach (INamespaceOrTypeSymbol member in ns.GetMembers())
    {
      switch (member)
      {
        case INamespaceSymbol nested:
          CollectTypes(nested, output);
          break;

        case INamedTypeSymbol type:
          CollectTypeTree(type, output);
          break;
      }
    }
  }

  void CollectTypeTree(INamedTypeSymbol type, List<INamedTypeSymbol> output)
  {
    output.Add(type);

    foreach (INamedTypeSymbol nested in type.GetTypeMembers())
    {
      CollectTypeTree(nested, output);
    }
  }

  // ------------------------------------------------------------------
  // Filtering
  // ------------------------------------------------------------------

  static bool IsVisibleAccessibility(Accessibility accessibility)
  {
    return accessibility
        is Accessibility.Public
        or Accessibility.Protected
        or Accessibility.ProtectedOrInternal;
  }

  /// <summary>
  /// Whether a reference may name a type: anything from another assembly, or a
  /// type of this one that gets a page. An internal type of the documented
  /// assembly fails both, and naming it would put a dead, unlinkable entry on
  /// every list the reference reaches.
  /// </summary>
  bool IsPresentableReference(INamedTypeSymbol type)
  {
    return !SymbolEqualityComparer.Default.Equals(type.ContainingAssembly, _compilation.Assembly)
        || IsDocumentableType(type);
  }

  /// <summary>
  /// The interface members a member explicitly implements, empty for everything
  /// else. C# reports such a member as private; VB gives it any accessibility.
  /// </summary>
  static ImmutableArray<ISymbol> ExplicitImplementations(ISymbol member) => member switch
  {
    IMethodSymbol m => ImmutableArray<ISymbol>.CastUp(m.ExplicitInterfaceImplementations),
    IPropertySymbol p => ImmutableArray<ISymbol>.CastUp(p.ExplicitInterfaceImplementations),
    IEventSymbol e => ImmutableArray<ISymbol>.CastUp(e.ExplicitInterfaceImplementations),
    _ => [],
  };

  bool IsDocumentableType(INamedTypeSymbol type)
  {
    if (!IsVisibleAccessibility(type.DeclaredAccessibility))
    {
      return false;
    }

    // Compiler-generated helpers and <PrivateImplementationDetails>.
    if (type.Name.Length == 0 || type.Name.Contains('<'))
    {
      return false;
    }

    if (type.IsImplicitlyDeclared && !IsEventHandler(type))
    {
      return false;
    }

    // Only what this assembly declares in source.
    if (!SymbolEqualityComparer.Default.Equals(type.ContainingAssembly, _compilation.Assembly))
    {
      return false;
    }

    if (type.ContainingType is not null && !IsDocumentableType(type.ContainingType))
    {
      return false;
    }

    return true;
  }

  /// <summary>
  /// Whether an implicitly-declared type is the delegate behind an event
  /// declared with a parameter list.
  /// </summary>
  /// <remarks>
  /// <para>
  /// <c>Public Event Changed(sender As Object)</c> in Visual Basic mints a
  /// nested <c>ChangedEventHandler</c> delegate, which Roslyn reports as
  /// implicitly declared because no source line spells it out. It is public API
  /// all the same: it is the type any handler must have, and the name a C#
  /// caller writes. Excluding it leaves every such event pointing at a type with
  /// no page - 164 of them in Grasshopper alone.
  /// </para>
  /// <para>
  /// Recognised by what it is rather than by the "EventHandler" suffix
  /// convention: the containing type has an event whose type is exactly this
  /// delegate. Compared on original definitions, so a generic container's
  /// constructed event type still matches the nested definition.
  /// </para>
  /// </remarks>
  static bool IsEventHandler(INamedTypeSymbol type)
  {
    if (type.TypeKind != TypeKind.Delegate || type.ContainingType is null)
    {
      return false;
    }

    return type.ContainingType
        .GetMembers()
        .OfType<IEventSymbol>()
        .Any(e => SymbolEqualityComparer.Default.Equals(e.Type.OriginalDefinition, type.OriginalDefinition));
  }

  IEnumerable<ISymbol> DocumentableMembers(INamedTypeSymbol type)
  {
    foreach (ISymbol member in type.GetMembers())
    {
      if (member is INamedTypeSymbol)
      {
        continue; // nested types are emitted as types in their own right
      }

      if (!IsDocumentableMember(member, type))
      {
        continue;
      }

      yield return member;
    }
  }

  bool IsDocumentableMember(ISymbol member, INamedTypeSymbol containingType)
  {
    // Explicit interface implementations report as private but are part of the contract -
    // unless every contract they satisfy is internal, which makes the member internal too.
    if (!IsVisibleAccessibility(member.DeclaredAccessibility)
        && !ExplicitImplementations(member).Any(impl => IsPresentableReference(impl.ContainingType)))
    {
      return false;
    }

    if (member.Name.Length > 0 && member.Name[0] == '<')
    {
      return false;
    }

    if (member is IMethodSymbol method)
    {
      switch (method.MethodKind)
      {
        // Accessors surface through AccessorInfo on their property or event.
        case MethodKind.PropertyGet:
        case MethodKind.PropertySet:
        case MethodKind.EventAdd:
        case MethodKind.EventRemove:
        case MethodKind.EventRaise:
        case MethodKind.StaticConstructor:
          return false;
      }

      // A record's synthesized Equals/GetHashCode/Deconstruct/copy-ctor is noise; its
      // positional properties are not, and those are handled below.
      if (method.IsImplicitlyDeclared)
      {
        return false;
      }
    }

    if (member.IsImplicitlyDeclared)
    {
      // Keep the positional properties a record declares through its parameter list:
      // they are real API with no syntax of their own.
      bool isRecordProperty = member is IPropertySymbol && containingType.IsRecord;
      if (!isRecordProperty)
      {
        return false;
      }
    }

    return true;
  }

  // ------------------------------------------------------------------
  // Types
  // ------------------------------------------------------------------

  ApiType BuildType(INamedTypeSymbol type)
  {
    string docId = DocIds.Of(type) ?? "T:" + CSharpDisplay.Of(type, DisplayFormats.TypeFullName);
    DocBlock docs = ResolveInheritDoc(type, _docs[type]);

    var apiType = new ApiType
    {
      DocId = docId,
      Slug = Slug.ForType(docId),
      Namespace = type.ContainingNamespace.IsGlobalNamespace
            ? ""
            : CSharpDisplay.Of(type.ContainingNamespace),
      Name = CSharpDisplay.Of(type, DisplayFormats.TypeShortName),
      FullName = CSharpDisplay.Of(type, DisplayFormats.TypeFullName),
      Kind = TypeKindOf(type),
      ContainingType = DocIds.Of(type.ContainingType),
      Accessibility = AccessibilityOf(type.DeclaredAccessibility),
      Category = docs.Category,
      IsStatic = type.IsStatic,
      // A Visual Basic Module compiles to a type that is both abstract and sealed, which is how IL
      // spells "no instances of this, ever". Neither word tells a reader anything the keyword has
      // not already said, and "abstract module" says something untrue, so both are dropped the way
      // they already are for a struct or an enum.
      IsAbstract = type.IsAbstract && type.TypeKind is not (TypeKind.Interface or TypeKind.Module),
      IsSealed = type.IsSealed && type.TypeKind is not (TypeKind.Struct or TypeKind.Enum or TypeKind.Module),
      IsReadOnly = type.IsReadOnly,
      IsRefLikeType = type.IsRefLikeType,
      TypeParameters = BuildTypeParameters(type.TypeParameters, docs),
      Attributes = BuildAttributes(type),
      Obsolete = BuildObsolete(type),
      Source = BuildSource(type),
      Docs = docs,
    };

    if (type.TypeKind == TypeKind.Delegate)
    {
      IMethodSymbol? invoke = type.DelegateInvokeMethod;
      if (invoke is not null)
      {
        apiType.ReturnType = BuildTypeRef(invoke.ReturnType);
        apiType.Parameters = BuildParameters(invoke.Parameters, docs);
        string parameters = string.Join(
            ", ",
            invoke.Parameters.Select(ParameterDisplay));

        apiType.Signature =
            $"{apiType.ReturnType.Display} {CSharpDisplay.Of(type, DisplayFormats.TypeShortName)}({parameters})";
      }
    }
    else
    {
      // An internal base has no page and never will, so the nearest presentable ancestor
      // stands in for it wherever the model names a base.
      INamedTypeSymbol? baseType = type.TypeKind is TypeKind.Struct or TypeKind.Enum
          ? null
          : NearestPresentableBase(type);
      apiType.BaseType = baseType is null ? null : BuildTypeRef(baseType);

      apiType.InheritanceChain = BuildInheritanceChain(type);

      List<INamedTypeSymbol> interfaces = PresentableInterfaces(type.Interfaces);
      apiType.Interfaces = interfaces.Count == 0
          ? null
          : interfaces.Select(BuildTypeRef).ToList();

      List<string> allInterfaces = type.AllInterfaces
          .Where(IsPresentableReference)
          .Select(DocIds.Of)
          .Where(id => id is not null)
          .Select(id => id!)
          .Distinct()
          .ToList();
      apiType.AllInterfaces = allInterfaces.Count == 0 ? null : allInterfaces;
    }

    foreach (ISymbol member in DocumentableMembers(type))
    {
      apiType.Members.Add(BuildMember(member, docId));
    }

    SortMembers(apiType.Members);
    DedupeAnchors(apiType.Members);

    if (docs.Summary is not { Count: > 0 })
    {
      docs.Undocumented = true;
      _findings.Undocumented.Add(docId);
    }

    return apiType;
  }

  List<TypeRef>? BuildInheritanceChain(INamedTypeSymbol type)
  {
    var chain = new List<TypeRef>();

    for (INamedTypeSymbol? current = type.BaseType;
         current is not null && current.SpecialType != SpecialType.System_Object;
         current = current.BaseType)
    {
      if (IsPresentableReference(current))
      {
        chain.Add(BuildTypeRef(current));
      }
    }

    return chain.Count == 0 ? null : chain;
  }

  /// <summary>
  /// The nearest ancestor the model may name as the base, or null when nothing
  /// presentable sits between the type and System.Object.
  /// </summary>
  INamedTypeSymbol? NearestPresentableBase(INamedTypeSymbol type)
  {
    for (INamedTypeSymbol? current = type.BaseType;
         current is not null && current.SpecialType != SpecialType.System_Object;
         current = current.BaseType)
    {
      if (IsPresentableReference(current))
      {
        return current;
      }
    }

    return null;
  }

  /// <summary>
  /// The directly declared interfaces, with every internal one replaced by the
  /// presentable interfaces it extends: a type implementing an internal table
  /// contract still visibly implements the IEnumerable behind it.
  /// </summary>
  List<INamedTypeSymbol> PresentableInterfaces(ImmutableArray<INamedTypeSymbol> interfaces)
  {
    var seen = new HashSet<INamedTypeSymbol>(SymbolEqualityComparer.Default);
    var output = new List<INamedTypeSymbol>();

    void Walk(ImmutableArray<INamedTypeSymbol> list)
    {
      foreach (INamedTypeSymbol iface in list)
      {
        if (!seen.Add(iface))
        {
          continue;
        }

        if (IsPresentableReference(iface))
        {
          output.Add(iface);
        }
        else
        {
          Walk(iface.Interfaces);
        }
      }
    }

    Walk(interfaces);
    return output;
  }

  static string TypeKindOf(INamedTypeSymbol type)
  {
    if (type.IsRecord)
    {
      return type.TypeKind is TypeKind.Struct ? "record struct" : "record";
    }

    return type.TypeKind switch
    {
      TypeKind.Class => "class",
      TypeKind.Struct => "struct",
      TypeKind.Interface => "interface",
      TypeKind.Enum => "enum",
      TypeKind.Delegate => "delegate",
      // Visual Basic's Module, which has no C# spelling. Named rather than left to the fallback
      // because the site keys a badge, an icon and a filter tab off this string, and a kind it has
      // never heard of gets the class drawing and a '?' for a badge.
      TypeKind.Module => "module",
      _ => type.TypeKind.ToString().ToLowerInvariant(),
    };
  }

  // ------------------------------------------------------------------
  // Members
  // ------------------------------------------------------------------

  ApiMember BuildMember(ISymbol member, string declaringTypeDocId)
  {
    string docId = DocIds.Of(member) ?? declaringTypeDocId + "." + member.Name;
    DocBlock docs = ResolveInheritDoc(member, _docs.TryGetValue(member, out DocBlock? d) ? d : new DocBlock());

    var apiMember = new ApiMember
    {
      DocId = docId,
      Anchor = Slug.ForMember(docId, declaringTypeDocId),
      Kind = MemberKindOf(member),
      Name = member.Name,
      Accessibility = AccessibilityOf(EffectiveAccessibility(member)),
      IsStatic = member.IsStatic,
      IsVirtual = member.IsVirtual,
      IsOverride = member.IsOverride,
      IsAbstract = member.IsAbstract,
      IsSealed = member.IsSealed,
      Attributes = BuildAttributes(member),
      Obsolete = BuildObsolete(member),
      Source = BuildSource(member),
      Docs = docs,
    };

    switch (member)
    {
      case IMethodSymbol method:
        BuildMethod(method, apiMember, docs);
        break;

      case IPropertySymbol property:
        BuildProperty(property, apiMember, docs);
        break;

      case IFieldSymbol field:
        BuildField(field, apiMember);
        break;

      case IEventSymbol evt:
        BuildEvent(evt, apiMember);
        break;
    }

    if (docs.Summary is not { Count: > 0 })
    {
      docs.Undocumented = true;
      _findings.Undocumented.Add(docId);
    }

    return apiMember;
  }

  void BuildMethod(IMethodSymbol method, ApiMember target, DocBlock docs)
  {
    target.IsExtensionMethod = method.IsExtensionMethod;
    target.Parameters = BuildParameters(method.Parameters, docs);
    target.TypeParameters = BuildTypeParameters(method.TypeParameters, docs);

    string nameAndParameters = NameAndParameters(method, method.Parameters);

    if (method.MethodKind is MethodKind.Constructor)
    {
      target.Name = method.ContainingType.Name;
      target.Signature = nameAndParameters;
    }
    else if (method.MethodKind is MethodKind.Destructor)
    {
      target.Name = "~" + method.ContainingType.Name;
      target.Signature = target.Name + "()";
    }
    else if (method.MethodKind is MethodKind.Conversion)
    {
      target.ReturnType = BuildTypeRef(method.ReturnType);
      target.Signature = nameAndParameters;
    }
    else
    {
      target.ReturnType = BuildTypeRef(method.ReturnType);
      target.Signature = method.ReturnsVoid
          ? "void " + nameAndParameters
          : $"{target.ReturnType.Display} {nameAndParameters}";
    }

    // Straight from the symbol, so no '#'-separator parsing is needed.
    target.ExplicitInterface = ExplicitInterfaceRef(method);

    target.Implements = CollectImplements(method);
    target.Overrides = DocIds.Of(method.OverriddenMethod);
  }

  void BuildProperty(IPropertySymbol property, ApiMember target, DocBlock docs)
  {
    target.ReturnType = BuildTypeRef(property.Type);
    target.Parameters = property.Parameters.Length == 0 ? null : BuildParameters(property.Parameters, docs);

    string nameAndParameters = NameAndParameters(property, property.Parameters);
    target.Signature = $"{target.ReturnType.Display} {nameAndParameters}";

    target.Accessors = new AccessorInfo
    {
      Get = property.GetMethod is { } get && IsVisibleAccessibility(get.DeclaredAccessibility)
            ? AccessibilityOf(get.DeclaredAccessibility)
            : null,
      Set = property.SetMethod is { } set && IsVisibleAccessibility(set.DeclaredAccessibility)
            ? AccessibilityOf(set.DeclaredAccessibility)
            : null,
      InitOnly = property.SetMethod?.IsInitOnly ?? false,
    };

    target.IsReadOnly = property.IsReadOnly;

    target.ExplicitInterface = ExplicitInterfaceRef(property);

    target.Implements = CollectImplements(property);
    target.Overrides = DocIds.Of(property.OverriddenProperty);
  }

  void BuildField(IFieldSymbol field, ApiMember target)
  {
    target.ReturnType = BuildTypeRef(field.Type);
    target.IsConst = field.IsConst;
    target.IsReadOnly = field.IsReadOnly;

    if (field.HasConstantValue)
    {
      // An enum's own members keep their numbers: the page lists them as a value column.
      target.ConstantValue = field.ContainingType.TypeKind == TypeKind.Enum
          ? FormatConstant(field.ConstantValue)
          : FormatValue(field.Type, field.ConstantValue);
    }

    target.Signature = field.ContainingType.TypeKind == TypeKind.Enum
        ? (target.ConstantValue is null ? field.Name : $"{field.Name} = {target.ConstantValue}")
        : $"{target.ReturnType.Display} {field.Name}";
  }

  void BuildEvent(IEventSymbol evt, ApiMember target)
  {
    target.ReturnType = BuildTypeRef(evt.Type);
    target.Signature = $"{target.ReturnType.Display} {evt.Name}";

    target.ExplicitInterface = ExplicitInterfaceRef(evt);

    target.Implements = CollectImplements(evt);
    target.Overrides = DocIds.Of(evt.OverriddenEvent);
  }

  /// <summary>
  /// Interface members this member satisfies, whether explicitly or
  /// implicitly. The implicit case is invisible in the compiler's doc XML, so
  /// it is genuinely new information.
  /// </summary>
  List<string>? CollectImplements(ISymbol member)
  {
    var ids = new List<string>();

    foreach (ISymbol impl in ExplicitImplementations(member))
    {
      if (!IsPresentableReference(impl.ContainingType))
      {
        continue;
      }

      string? id = DocIds.Of(impl);
      if (id is not null)
      {
        ids.Add(id);
      }
    }

    INamedTypeSymbol containing = member.ContainingType;
    foreach (INamedTypeSymbol iface in containing.AllInterfaces)
    {
      if (!IsPresentableReference(iface))
      {
        continue;
      }

      foreach (ISymbol ifaceMember in iface.GetMembers())
      {
        ISymbol? implementation = containing.FindImplementationForInterfaceMember(ifaceMember);
        if (implementation is null || !SymbolEqualityComparer.Default.Equals(implementation, member))
        {
          continue;
        }

        string? id = DocIds.Of(ifaceMember);
        if (id is not null && !ids.Contains(id))
        {
          ids.Add(id);
        }
      }
    }

    return ids.Count == 0 ? null : ids;
  }

  /// <summary>
  /// The interface an explicit implementation's heading names: the first one
  /// the model may name, so an internal contract satisfied alongside a public
  /// one does not take the heading. Null when there is nothing to name, which
  /// leaves the member reading as an ordinary one. VB populates
  /// ExplicitInterfaceImplementations for every Implements clause, so a member
  /// only counts as explicit when the interface is its sole route into the
  /// docs - the same test that let a non-visible member through the filter.
  /// </summary>
  TypeRef? ExplicitInterfaceRef(ISymbol member)
  {
    if (IsVisibleAccessibility(member.DeclaredAccessibility))
    {
      return null;
    }

    foreach (ISymbol impl in ExplicitImplementations(member))
    {
      if (IsPresentableReference(impl.ContainingType))
      {
        return BuildTypeRef(impl.ContainingType);
      }
    }

    return null;
  }

  static string MemberKindOf(ISymbol member) => member switch
  {
    IMethodSymbol { MethodKind: MethodKind.Constructor } => "constructor",
    IMethodSymbol { MethodKind: MethodKind.Destructor } => "destructor",
    IMethodSymbol { MethodKind: MethodKind.Conversion } => "conversion",
    IMethodSymbol { MethodKind: MethodKind.UserDefinedOperator or MethodKind.BuiltinOperator } => "operator",
    IMethodSymbol => "method",
    IPropertySymbol { IsIndexer: true } => "indexer",
    IPropertySymbol => "property",
    IFieldSymbol field => field.ContainingType.TypeKind == TypeKind.Enum ? "enumvalue" : "field",
    IEventSymbol => "event",
    _ => "member",
  };

  /// <summary>
  /// Explicit interface implementations are private at the symbol level but
  /// public in effect; report them as public so the site does not hide them.
  /// Visible members keep their own accessibility - a VB Implements clause on
  /// a public or protected member does not make it explicit.
  /// </summary>
  static Accessibility EffectiveAccessibility(ISymbol member)
  {
    return !IsVisibleAccessibility(member.DeclaredAccessibility) && ExplicitImplementations(member).Length > 0
        ? Accessibility.Public
        : member.DeclaredAccessibility;
  }

  /// <summary>
  /// Enum values, fields, properties, events, constructors, then methods: data
  /// before behaviour, which reads better than the alphabetical order symbols
  /// arrive in.
  /// </summary>
  static readonly Dictionary<string, int> s_memberKindOrder = new(StringComparer.Ordinal)
  {
    ["enumvalue"] = 0,
    ["field"] = 1,
    ["property"] = 2,
    ["indexer"] = 3,
    ["event"] = 4,
    ["constructor"] = 5,
    ["destructor"] = 6,
    ["method"] = 7,
    ["operator"] = 8,
    ["conversion"] = 9,
  };

  static void SortMembers(List<ApiMember> members)
  {
    members.Sort((a, b) =>
    {
      int orderA = s_memberKindOrder.TryGetValue(a.Kind, out int oa) ? oa : 99;
      int orderB = s_memberKindOrder.TryGetValue(b.Kind, out int ob) ? ob : 99;

      if (orderA != orderB)
      {
        return orderA - orderB;
      }

      // Enum members read best in declaration order, which is their constant order.
      int byName = string.CompareOrdinal(a.Name, b.Name);
      return byName != 0 ? byName : string.CompareOrdinal(a.Signature, b.Signature);
    });
  }

  /// <summary>
  /// Guarantees anchors are unique within a page. Overloads normally differ by
  /// parameter types, which the slug keeps, but generic arity collisions are
  /// still possible.
  /// </summary>
  static void DedupeAnchors(List<ApiMember> members)
  {
    var seen = new Dictionary<string, int>(StringComparer.Ordinal);

    foreach (ApiMember member in members)
    {
      string anchor = member.Anchor;

      if (seen.TryGetValue(anchor, out int count))
      {
        seen[anchor] = count + 1;
        member.Anchor = $"{anchor}-{count + 1}";
      }
      else
      {
        seen[anchor] = 1;
      }
    }
  }

  // ------------------------------------------------------------------
  // Shared pieces
  // ------------------------------------------------------------------

  TypeRef BuildTypeRef(ITypeSymbol type)
  {
    // Unwrapped first, and everything below asked of that: an array has neither a doc id nor an
    // assembly of its own, so Brep[] answered no to both and was filed as external. Of resolves to
    // the original definition, so a constructed generic links to the open type where the
    // documentation actually lives.
    ITypeSymbol? target = DocIds.Unwrap(type);
    string? docId = DocIds.Of(target);

    bool external = target?.ContainingAssembly is null
        || !SymbolEqualityComparer.Default.Equals(target.ContainingAssembly, _compilation.Assembly);

    return new TypeRef
    {
      DocId = docId,
      Display = CSharpDisplay.Of(type, DisplayFormats.TypeReference),
      External = external,
      // Only for the ones from elsewhere: a type of ours is found by doc id, and naming the
      // assembly on all thirty-six thousand references would be most of them saying so.
      Assembly = external ? target?.ContainingAssembly?.Name : null,
    };
  }

  List<ApiParameter>? BuildParameters(ImmutableArray<IParameterSymbol> parameters, DocBlock docs)
  {
    if (parameters.Length == 0)
    {
      return null;
    }

    var result = new List<ApiParameter>(parameters.Length);

    foreach (IParameterSymbol parameter in parameters)
    {
      List<DocNode>? paramDoc = null;
      docs.Params?.TryGetValue(parameter.Name, out paramDoc);

      result.Add(new ApiParameter
      {
        Name = parameter.Name,
        Type = BuildTypeRef(parameter.Type),
        RefKind = parameter.RefKind switch
        {
          Microsoft.CodeAnalysis.RefKind.Ref => "ref",
          Microsoft.CodeAnalysis.RefKind.Out => "out",
          Microsoft.CodeAnalysis.RefKind.In => "in",
          Microsoft.CodeAnalysis.RefKind.RefReadOnlyParameter => "ref readonly",
          _ => null,
        },
        IsParams = parameter.IsParams,
        IsOptional = parameter.HasExplicitDefaultValue,
        DefaultValue = parameter.HasExplicitDefaultValue
              ? FormatValue(parameter.Type, parameter.ExplicitDefaultValue)
              : null,
        Doc = paramDoc,
      });
    }

    return result;
  }

  static List<ApiTypeParam>? BuildTypeParameters(ImmutableArray<ITypeParameterSymbol> typeParameters, DocBlock docs)
  {
    if (typeParameters.Length == 0)
    {
      return null;
    }

    var result = new List<ApiTypeParam>(typeParameters.Length);

    foreach (ITypeParameterSymbol parameter in typeParameters)
    {
      var constraints = new List<string>();

      if (parameter.HasReferenceTypeConstraint)
      {
        constraints.Add("class");
      }

      if (parameter.HasValueTypeConstraint)
      {
        constraints.Add("struct");
      }

      if (parameter.HasNotNullConstraint)
      {
        constraints.Add("notnull");
      }

      if (parameter.HasUnmanagedTypeConstraint)
      {
        constraints.Add("unmanaged");
      }

      foreach (ITypeSymbol constraintType in parameter.ConstraintTypes)
      {
        constraints.Add(CSharpDisplay.Of(constraintType, DisplayFormats.TypeReference));
      }

      if (parameter.HasConstructorConstraint)
      {
        constraints.Add("new()");
      }

      List<DocNode>? doc = null;
      docs.TypeParams?.TryGetValue(parameter.Name, out doc);

      result.Add(new ApiTypeParam
      {
        Name = parameter.Name,
        Variance = parameter.Variance switch
        {
          VarianceKind.In => "in",
          VarianceKind.Out => "out",
          _ => null,
        },
        Constraints = constraints.Count == 0 ? null : constraints,
        Doc = doc,
      });
    }

    return result;
  }

  List<ApiAttribute>? BuildAttributes(ISymbol symbol)
  {
    var result = new List<ApiAttribute>();

    foreach (AttributeData attribute in symbol.GetAttributes())
    {
      INamedTypeSymbol? attributeClass = attribute.AttributeClass;
      if (attributeClass is null)
      {
        continue;
      }

      string fullName = CSharpDisplay.Of(attributeClass, DisplayFormats.TypeFullName);
      // Obsolete has its own field, which the site shows as a note rather than a line.
      if (s_hiddenAttributes.Contains(fullName) || fullName == "System.ObsoleteAttribute")
      {
        continue;
      }

      var arguments = new List<string>();
      var named = new List<ITypeSymbol>();
      foreach (TypedConstant argument in attribute.ConstructorArguments)
      {
        arguments.Add(FormatTypedConstant(argument));
        CollectNamedTypes(argument, named);
      }

      foreach (KeyValuePair<string, TypedConstant> pair in attribute.NamedArguments)
      {
        arguments.Add($"{pair.Key} = {FormatTypedConstant(pair.Value)}");
        CollectNamedTypes(pair.Value, named);
      }

      List<TypeRef> types = named
          .Distinct<ITypeSymbol>(SymbolEqualityComparer.Default)
          .Select(BuildTypeRef)
          .ToList();

      string display = attributeClass.Name;
      if (display.EndsWith("Attribute", StringComparison.Ordinal) && display.Length > "Attribute".Length)
      {
        display = display[..^"Attribute".Length];
      }

      // Same external and assembly as a type reference, so a framework attribute still links out.
      TypeRef reference = BuildTypeRef(attributeClass);
      result.Add(new ApiAttribute
      {
        DocId = reference.DocId,
        Display = display,
        Arguments = arguments.Count == 0 ? null : arguments,
        External = reference.External,
        Assembly = reference.Assembly,
        Types = types.Count == 0 ? null : types,
      });
    }

    return result.Count == 0 ? null : result;
  }

  /// <summary>The types an argument writes by name: an enum's, or the one given to typeof.</summary>
  static void CollectNamedTypes(TypedConstant constant, List<ITypeSymbol> into)
  {
    if (constant.IsNull)
    {
      return;
    }

    switch (constant.Kind)
    {
      case TypedConstantKind.Array:
        foreach (TypedConstant value in constant.Values)
        {
          CollectNamedTypes(value, into);
        }
        break;
      case TypedConstantKind.Enum when constant.Type is not null:
        into.Add(constant.Type);
        break;
      case TypedConstantKind.Type when constant.Value is ITypeSymbol type:
        into.Add(type);
        break;
    }
  }

  static ObsoleteInfo? BuildObsolete(ISymbol symbol)
  {
    foreach (AttributeData attribute in symbol.GetAttributes())
    {
      if (attribute.AttributeClass is null || CSharpDisplay.Of(attribute.AttributeClass) != "System.ObsoleteAttribute")
      {
        continue;
      }

      string? message = attribute.ConstructorArguments.Length > 0
          ? attribute.ConstructorArguments[0].Value as string
          : null;

      bool isError = attribute.ConstructorArguments.Length > 1
          && attribute.ConstructorArguments[1].Value is true;

      return new ObsoleteInfo { Message = message, IsError = isError };
    }

    return null;
  }

  /// <summary>
  /// Repo-relative source location. The compiler's doc XML has no equivalent,
  /// so this is the one piece of the model that only a compilation can supply.
  /// </summary>
  SourceRef? BuildSource(ISymbol symbol)
  {
    if (!_declarations.TryGetValue(symbol, out DeclaredSymbol? declaration))
    {
      return null;
    }

    string path = declaration.Tree.FilePath;
    if (path.Length == 0)
    {
      return null;
    }

    string relative = path;
    if (_repoRoot.Length > 0)
    {
      try
      {
        relative = Path.GetRelativePath(_repoRoot, path);
      }
      catch (ArgumentException)
      {
        relative = path;
      }
    }

    return new SourceRef
    {
      File = relative.Replace('\\', '/'),
      Line = declaration.Line,
    };
  }

  DocBlock ParseDocs(ISymbol symbol)
  {
    if (!_declarations.TryGetValue(symbol, out DeclaredSymbol? declaration))
    {
      return new DocBlock();
    }

    return _docParser.Parse(declaration.Doc, declaration.Model, symbol);
  }

  // ------------------------------------------------------------------
  // inheritdoc
  // ------------------------------------------------------------------

  /// <summary>
  /// Fills a block that asked for &lt;inheritdoc/&gt; from the member or type
  /// it inherits from.
  /// </summary>
  /// <remarks>
  /// Symbols inside the documented set resolve against this run's own parsed
  /// blocks, which is higher fidelity than the compiler's XML: crefs are still
  /// structured rather than flattened to strings. Only genuinely external bases
  /// fall back to <c>GetDocumentationCommentXml()</c>, which is why owl does
  /// not need the project's own build-produced doc files.
  /// </remarks>
  DocBlock ResolveInheritDoc(ISymbol symbol, DocBlock block, int depth = 0)
  {
    if (!block.WantsInheritDoc || depth > 8)
    {
      return block;
    }

    // Cycles are possible through mutually-referencing interfaces.
    if (!_inheritInProgress.Add(symbol))
    {
      return block;
    }

    try
    {
      foreach (ISymbol source in InheritDocSources(symbol))
      {
        DocBlock inherited;

        if (_docs.TryGetValue(source, out DocBlock? own))
        {
          inherited = ResolveInheritDoc(source, own, depth + 1);
        }
        else
        {
          inherited = _docParser.ParseMetadataXml(DocIds.DocumentationXml(source));
        }

        if (inherited.IsEmpty)
        {
          continue;
        }

        Fill(block, inherited);
        block.InheritedFrom = DocIds.Of(source);
        break;
      }
    }
    finally
    {
      _inheritInProgress.Remove(symbol);
    }

    return block;
  }

  static IEnumerable<ISymbol> InheritDocSources(ISymbol symbol)
  {
    switch (symbol)
    {
      case INamedTypeSymbol type:
        if (type.BaseType is { } baseType && baseType.SpecialType != SpecialType.System_Object)
        {
          yield return baseType;
        }

        foreach (INamedTypeSymbol iface in type.Interfaces)
        {
          yield return iface;
        }

        yield break;

      case IMethodSymbol method:
        if (method.OverriddenMethod is { } overriddenMethod)
        {
          yield return overriddenMethod;
        }

        foreach (IMethodSymbol impl in method.ExplicitInterfaceImplementations)
        {
          yield return impl;
        }

        foreach (ISymbol implicitImpl in ImplicitInterfaceMembers(method))
        {
          yield return implicitImpl;
        }

        yield break;

      case IPropertySymbol property:
        if (property.OverriddenProperty is { } overriddenProperty)
        {
          yield return overriddenProperty;
        }

        foreach (IPropertySymbol impl in property.ExplicitInterfaceImplementations)
        {
          yield return impl;
        }

        foreach (ISymbol implicitImpl in ImplicitInterfaceMembers(property))
        {
          yield return implicitImpl;
        }

        yield break;

      case IEventSymbol evt:
        if (evt.OverriddenEvent is { } overriddenEvent)
        {
          yield return overriddenEvent;
        }

        foreach (IEventSymbol impl in evt.ExplicitInterfaceImplementations)
        {
          yield return impl;
        }

        foreach (ISymbol implicitImpl in ImplicitInterfaceMembers(evt))
        {
          yield return implicitImpl;
        }

        yield break;
    }
  }

  static IEnumerable<ISymbol> ImplicitInterfaceMembers(ISymbol member)
  {
    INamedTypeSymbol containing = member.ContainingType;

    foreach (INamedTypeSymbol iface in containing.AllInterfaces)
    {
      foreach (ISymbol ifaceMember in iface.GetMembers())
      {
        ISymbol? implementation = containing.FindImplementationForInterfaceMember(ifaceMember);
        if (implementation is not null && SymbolEqualityComparer.Default.Equals(implementation, member))
        {
          yield return ifaceMember;
        }
      }
    }
  }

  static void Fill(DocBlock target, DocBlock source)
  {
    target.Summary ??= source.Summary;
    target.Remarks ??= source.Remarks;
    target.Returns ??= source.Returns;
    target.Value ??= source.Value;
    target.Example ??= source.Example;
    target.Exceptions ??= source.Exceptions;
    target.SeeAlso ??= source.SeeAlso;
    target.Category ??= source.Category;
    target.Since ??= source.Since;
    target.Deprecated ??= source.Deprecated;

    if (source.Params is not null)
    {
      target.Params ??= [];
      foreach (KeyValuePair<string, List<DocNode>> entry in source.Params)
      {
        if (!target.Params.ContainsKey(entry.Key))
        {
          target.Params[entry.Key] = entry.Value;
        }
      }
    }

    if (source.TypeParams is not null)
    {
      target.TypeParams ??= [];
      foreach (KeyValuePair<string, List<DocNode>> entry in source.TypeParams)
      {
        if (!target.TypeParams.ContainsKey(entry.Key))
        {
          target.TypeParams[entry.Key] = entry.Value;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Namespaces
  // ------------------------------------------------------------------

  /// <summary>
  /// Collects the namespaces the documented types live in, picking up docs
  /// from a <c>NamespaceDoc</c> class or a documented namespace declaration
  /// when present.
  /// </summary>
  List<ApiNamespace> BuildNamespaces(List<ApiType> types, List<INamedTypeSymbol> all)
  {
    var namespaceDocs = new Dictionary<string, DocBlock>(StringComparer.Ordinal);

    foreach (KeyValuePair<ISymbol, DeclaredSymbol> entry in _declarations)
    {
      if (entry.Key is INamespaceSymbol ns && entry.Value.Doc is not null)
      {
        DocBlock block = _docParser.Parse(entry.Value.Doc, entry.Value.Model, entry.Key);
        if (!block.IsEmpty)
        {
          namespaceDocs[CSharpDisplay.Of(ns)] = block;
        }
      }
    }

    // The NamespaceDoc convention: a type of that name carries its namespace's docs, and is
    // usually internal so that it stays out of the reference itself.
    foreach (INamedTypeSymbol type in all)
    {
      if (type.Name != "NamespaceDoc" || type.ContainingType is not null)
      {
        continue;
      }

      string ns = type.ContainingNamespace.IsGlobalNamespace ? "" : CSharpDisplay.Of(type.ContainingNamespace);
      if (namespaceDocs.ContainsKey(ns))
      {
        continue;
      }

      DocBlock docs = _docs.TryGetValue(type, out DocBlock? parsed) ? parsed : ParseDocs(type);
      if (!docs.IsEmpty)
      {
        namespaceDocs[ns] = docs;
      }
    }

    var result = types
        .Select(t => t.Namespace)
        .Distinct(StringComparer.Ordinal)
        .OrderBy(n => n, StringComparer.Ordinal)
        .Select(name => new ApiNamespace
        {
          Name = name,
          Docs = namespaceDocs.TryGetValue(name, out DocBlock? docs) ? docs : null,
        })
        .ToList();

    return result;
  }

  // ------------------------------------------------------------------
  // Formatting
  // ------------------------------------------------------------------

  static string AccessibilityOf(Accessibility accessibility) => accessibility switch
  {
    Accessibility.Public => "public",
    Accessibility.Protected => "protected",
    Accessibility.ProtectedOrInternal => "protected internal",
    Accessibility.ProtectedAndInternal => "private protected",
    Accessibility.Internal => "internal",
    Accessibility.Private => "private",
    _ => "",
  };

  static string FormatConstant(object? value) => value switch
  {
    null => "null",
    string s => "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"",
    char c => "'" + c + "'",
    bool b => b ? "true" : "false",
    _ => Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) ?? "",
  };

  /// <summary>
  /// An enum value as source writes it: 'AttributeTargets.Class | AttributeTargets.Interface'
  /// rather than the 1028 the compiler stores.
  /// </summary>
  static string FormatEnum(ITypeSymbol type, object? value)
  {
    static ulong Bits(object? v) => v is ulong u ? u : unchecked((ulong)Convert.ToInt64(v));

    List<(string Name, ulong Bits)> members = type.GetMembers()
        .OfType<IFieldSymbol>()
        .Where(field => field.HasConstantValue)
        .Select(field => (field.Name, Bits(field.ConstantValue)))
        .ToList();

    ulong bits = Bits(value);
    foreach ((string name, ulong memberBits) in members)
    {
      if (memberBits == bits)
      {
        return $"{type.Name}.{name}";
      }
    }

    // Largest first, the way Enum.ToString splits flags, so a named combination wins over its parts.
    var parts = new List<(string Name, ulong Bits)>();
    ulong remaining = bits;
    foreach ((string name, ulong memberBits) in members.OrderByDescending(member => member.Bits))
    {
      if (memberBits != 0 && (remaining & memberBits) == memberBits)
      {
        parts.Add((name, memberBits));
        remaining &= ~memberBits;
      }
    }

    if (remaining == 0 && parts.Count > 0)
    {
      return string.Join(" | ", parts.OrderBy(part => part.Bits).Select(part => $"{type.Name}.{part.Name}"));
    }

    // No members add up to it, so the number is all there is to say.
    return $"({type.Name}){FormatConstant(value)}";
  }

  /// <summary>
  /// A member's name and parameter list, 'Keep(Mode mode = Mode.Disk)' or 'this[int index]'.
  /// </summary>
  static string NameAndParameters(ISymbol member, ImmutableArray<IParameterSymbol> parameters)
  {
    string whole = CSharpDisplay.Of(member, DisplayFormats.MemberNameAndParameters);
    if (!parameters.Any(HasEnumDefault))
    {
      return whole;
    }

    // Only the list is rebuilt: Roslyn writes an enum default as a bare 'Disk', which reads as nothing.
    char close = whole[^1];
    int open = whole.IndexOf(close == ']' ? '[' : '(');
    string list = string.Join(", ", parameters.Select(ParameterDisplay));
    if (member is IMethodSymbol { IsExtensionMethod: true })
    {
      // Roslyn writes 'this' only when it writes the whole method.
      list = "this " + list;
    }

    return whole[..(open + 1)] + list + close;
  }

  static bool HasEnumDefault(IParameterSymbol parameter) =>
      parameter.HasExplicitDefaultValue && parameter.ExplicitDefaultValue is not null && EnumOf(parameter.Type) is not null;

  /// <summary>One parameter as declared, 'Mode mode = Mode.Disk'.</summary>
  static string ParameterDisplay(IParameterSymbol parameter)
  {
    if (!HasEnumDefault(parameter))
    {
      return CSharpDisplay.Of(parameter, DisplayFormats.MemberNameAndParameters);
    }

    string declared = CSharpDisplay.Of(parameter, DisplayFormats.ParameterWithoutDefault);
    return $"{declared} = {FormatEnum(EnumOf(parameter.Type)!, parameter.ExplicitDefaultValue)}";
  }

  /// <summary>A constant of the given type, an enum one by member name.</summary>
  static string FormatValue(ITypeSymbol type, object? value)
  {
    ITypeSymbol? enumType = EnumOf(type);
    return value is not null && enumType is not null
        ? FormatEnum(enumType, value)
        : FormatConstant(value);
  }

  /// <summary>The enum a value of this type is written as, or null; Mode? holds a Mode.</summary>
  static ITypeSymbol? EnumOf(ITypeSymbol type)
  {
    if (type is INamedTypeSymbol { OriginalDefinition.SpecialType: SpecialType.System_Nullable_T } nullable)
    {
      type = nullable.TypeArguments[0];
    }

    return type.TypeKind == TypeKind.Enum ? type : null;
  }

  static string FormatTypedConstant(TypedConstant constant)
  {
    if (constant.IsNull)
    {
      return "null";
    }

    if (constant.Kind == TypedConstantKind.Array)
    {
      return "[" + string.Join(", ", constant.Values.Select(FormatTypedConstant)) + "]";
    }

    if (constant.Kind == TypedConstantKind.Type)
    {
      return constant.Value is ITypeSymbol type
          ? CSharpDisplay.Of(type, DisplayFormats.TypeReference)
          : "null";
    }

    if (constant.Kind == TypedConstantKind.Enum && constant.Type is not null)
    {
      return FormatEnum(constant.Type, constant.Value);
    }

    return FormatConstant(constant.Value);
  }
}
