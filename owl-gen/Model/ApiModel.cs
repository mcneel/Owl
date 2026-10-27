using System.Text.Json.Serialization;

namespace Owl.Gen.Model;

/// <summary>
/// One documented assembly. Serialized to &lt;AssemblyName&gt;.json.
/// </summary>
sealed class ApiAssembly
{
  /// <summary>
  /// Output schema version. Bump when the shape changes incompatibly.
  /// </summary>
  public int Schema { get; set; } = 1;

  /// <summary>Assembly name, which is also this file's name.</summary>
  public string Name { get; set; } = "";

  /// <summary>Assembly version, when the project declared one.</summary>
  public string? Version { get; set; }

  /// <summary>Framework this assembly was documented for.</summary>
  public string? TargetFramework { get; set; }

  /// <summary>Namespaces that contain at least one documented type.</summary>
  public List<ApiNamespace> Namespaces { get; set; } = [];

  /// <summary>Every documented type in the assembly.</summary>
  public List<ApiType> Types { get; set; } = [];
}

/// <summary>An attribute applied to a type or member.</summary>
sealed class ApiAttribute
{
  /// <summary>Doc id of the attribute class, null when unresolvable.</summary>
  [JsonPropertyName("id")] public string? DocId { get; set; }

  /// <summary>
  /// Attribute name as written, without the Attribute suffix.
  /// </summary>
  public string Display { get; set; } = "";

  /// <summary>Constructor and named arguments, already formatted.</summary>
  public List<string>? Arguments { get; set; }

  /// <summary>True when the attribute class lives outside the documented set.</summary>
  public bool External { get; set; }

  /// <summary>
  /// Assembly the attribute class is declared in, recorded only when it is external.
  /// </summary>
  [JsonPropertyName("asm")] public string? Assembly { get; set; }

  /// <summary>
  /// Types the arguments write by name, enums and typeof's, so the site can link them.
  /// </summary>
  public List<TypeRef>? Types { get; set; }
}

/// <summary>
/// A namespace, carrying whatever documentation it was given.
/// </summary>
sealed class ApiNamespace
{
  /// <summary>
  /// Fully qualified namespace name. Empty for the global namespace.
  /// </summary>
  public string Name { get; set; } = "";

  /// <summary>
  /// Docs harvested from a NamespaceDoc class or a documented namespace
  /// declaration.
  /// </summary>
  public DocBlock? Docs { get; set; }
}

/// <summary>One documented type and the members declared on it.</summary>
sealed class ApiType
{
  /// <summary>Documentation comment id, the model's primary key.</summary>
  [JsonPropertyName("docId")] public string DocId { get; set; } = "";

  /// <summary>
  /// URL path segment for this type's page. Emitted rather than derived so the
  /// site never has to reimplement the slug rule and drift from it.
  /// </summary>
  public string Slug { get; set; } = "";

  /// <summary>Containing namespace. Empty for the global namespace.</summary>
  public string Namespace { get; set; } = "";

  /// <summary>Short display name, e.g. StorageSite&lt;T&gt;.</summary>
  public string Name { get; set; } = "";

  /// <summary>
  /// Namespace-qualified display name, including any containing types.
  /// </summary>
  public string FullName { get; set; } = "";

  /// <summary>class, struct, interface, enum, delegate, record, record struct or module.</summary>
  public string Kind { get; set; } = "";

  /// <summary>Declaring type's doc id when this is a nested type.</summary>
  public string? ContainingType { get; set; }

  /// <summary>Declared accessibility, e.g. public or protected.</summary>
  public string Accessibility { get; set; } = "";

  /// <summary>
  /// Lifted out of <see cref="Docs"/> because the site groups types by it.
  /// </summary>
  public string? Category { get; set; }

  /// <summary>True for a static class.</summary>
  public bool IsStatic { get; set; }

  /// <summary>True for an abstract class.</summary>
  public bool IsAbstract { get; set; }

  /// <summary>True for a sealed class.</summary>
  public bool IsSealed { get; set; }

  /// <summary>True for a readonly struct.</summary>
  public bool IsReadOnly { get; set; }

  /// <summary>True for a ref struct.</summary>
  public bool IsRefLikeType { get; set; }

  /// <summary>Generic parameters, in declaration order.</summary>
  public List<ApiTypeParam>? TypeParameters { get; set; }

  /// <summary>Immediate base type, omitted when it is System.Object and for structs and enums.</summary>
  public TypeRef? BaseType { get; set; }

  /// <summary>
  /// Base types from the immediate base up to (but excluding) System.Object.
  /// </summary>
  public List<TypeRef>? InheritanceChain { get; set; }

  /// <summary>Directly implemented interfaces.</summary>
  public List<TypeRef>? Interfaces { get; set; }

  /// <summary>All interfaces including inherited ones, as doc ids.</summary>
  public List<string>? AllInterfaces { get; set; }

  /// <summary>
  /// Doc ids of types in the documented set that derive from this one.
  /// </summary>
  public List<string>? DerivedTypes { get; set; }

  /// <summary>
  /// Attributes applied to the type, minus the ones owl hides.
  /// </summary>
  public List<ApiAttribute>? Attributes { get; set; }

  /// <summary>Set when the type carries [Obsolete].</summary>
  public ObsoleteInfo? Obsolete { get; set; }

  /// <summary>Where the type is declared.</summary>
  public SourceRef? Source { get; set; }

  /// <summary>
  /// Delegate signature, only set when <see cref="Kind"/> is "delegate".
  /// </summary>
  public string? Signature { get; set; }

  /// <summary>
  /// Delegate return type, only set when <see cref="Kind"/> is "delegate".
  /// </summary>
  public TypeRef? ReturnType { get; set; }

  /// <summary>
  /// Delegate parameters, only set when <see cref="Kind"/> is "delegate".
  /// </summary>
  public List<ApiParameter>? Parameters { get; set; }

  /// <summary>The type's own documentation.</summary>
  public DocBlock Docs { get; set; } = new();

  /// <summary>
  /// Members declared on this type only. Inherited members are intentionally
  /// not inlined: every SDK type is present in the output, so the site rolls
  /// them up by walking <see cref="InheritanceChain"/>. Inlining would
  /// multiply the output size for no gain.
  /// </summary>
  public List<ApiMember> Members { get; set; } = [];
}

/// <summary>
/// One generic type parameter, with its variance and constraints.
/// </summary>
sealed class ApiTypeParam
{
  /// <summary>Parameter name, e.g. T.</summary>
  public string Name { get; set; } = "";

  /// <summary>"in", "out", or null for invariant.</summary>
  public string? Variance { get; set; }

  /// <summary>Declared constraints, in the order C# requires them.</summary>
  public List<string>? Constraints { get; set; }

  /// <summary>The matching &lt;typeparam&gt; documentation.</summary>
  public List<DocNode>? Doc { get; set; }
}

/// <summary>One member declared on a type.</summary>
sealed class ApiMember
{
  /// <summary>Documentation comment id, the model's primary key.</summary>
  [JsonPropertyName("docId")] public string DocId { get; set; } = "";

  /// <summary>Fragment id for this member within its type's page.</summary>
  public string Anchor { get; set; } = "";

  /// <summary>
  /// constructor, destructor, method, property, indexer, field, event,
  /// operator, conversion or enumvalue.
  /// </summary>
  public string Kind { get; set; } = "";

  /// <summary>Member name, without any parameter list.</summary>
  public string Name { get; set; } = "";

  /// <summary>
  /// Display signature with short type names, e.g. "IStorage Load(Uri uri)".
  /// </summary>
  public string Signature { get; set; } = "";

  /// <summary>Declared accessibility, e.g. public or protected.</summary>
  public string Accessibility { get; set; } = "";

  /// <summary>True for a static member.</summary>
  public bool IsStatic { get; set; }

  /// <summary>True for a virtual member.</summary>
  public bool IsVirtual { get; set; }

  /// <summary>True when the member overrides a base member.</summary>
  public bool IsOverride { get; set; }

  /// <summary>True for an abstract member.</summary>
  public bool IsAbstract { get; set; }

  /// <summary>True for a sealed override.</summary>
  public bool IsSealed { get; set; }

  /// <summary>True for an extension method.</summary>
  public bool IsExtensionMethod { get; set; }

  /// <summary>
  /// Set for explicit interface implementations - members visible only through
  /// the interface, never a visible VB member with an Implements clause. Comes
  /// straight from ExplicitInterfaceImplementations rather than being parsed
  /// back out of a doc id.
  /// </summary>
  public TypeRef? ExplicitInterface { get; set; }

  /// <summary>
  /// Doc ids of interface members this member implements, implicitly or
  /// explicitly.
  /// </summary>
  public List<string>? Implements { get; set; }

  /// <summary>Doc id of the member this one overrides.</summary>
  public string? Overrides { get; set; }

  /// <summary>Return or field type. Null for constructors.</summary>
  public TypeRef? ReturnType { get; set; }

  /// <summary>Parameters, in declaration order.</summary>
  public List<ApiParameter>? Parameters { get; set; }

  /// <summary>Generic parameters for a generic method.</summary>
  public List<ApiTypeParam>? TypeParameters { get; set; }

  /// <summary>
  /// Getter and setter visibility, for properties and indexers.
  /// </summary>
  public AccessorInfo? Accessors { get; set; }

  /// <summary>Literal value for constants and enum members.</summary>
  public string? ConstantValue { get; set; }

  /// <summary>True for a const field.</summary>
  public bool IsConst { get; set; }

  /// <summary>True for a readonly field.</summary>
  public bool IsReadOnly { get; set; }

  /// <summary>
  /// Attributes applied to the member, minus the ones owl hides.
  /// </summary>
  public List<ApiAttribute>? Attributes { get; set; }

  /// <summary>Set when the member carries [Obsolete].</summary>
  public ObsoleteInfo? Obsolete { get; set; }

  /// <summary>Where the member is declared.</summary>
  public SourceRef? Source { get; set; }

  /// <summary>The member's own documentation.</summary>
  public DocBlock Docs { get; set; } = new();
}

/// <summary>One parameter of a method, indexer or delegate.</summary>
sealed class ApiParameter
{
  /// <summary>Parameter name.</summary>
  public string Name { get; set; } = "";

  /// <summary>Parameter type.</summary>
  public TypeRef Type { get; set; } = new();

  /// <summary>
  /// ref, out, in or ref readonly. Null for by-value parameters.
  /// </summary>
  public string? RefKind { get; set; }

  /// <summary>True for a params array.</summary>
  public bool IsParams { get; set; }

  /// <summary>True when the parameter has a default value.</summary>
  public bool IsOptional { get; set; }

  /// <summary>The default value as written, when there is one.</summary>
  public string? DefaultValue { get; set; }

  /// <summary>The matching &lt;param&gt; documentation.</summary>
  public List<DocNode>? Doc { get; set; }
}

/// <summary>
/// Where a symbol is declared, repo-relative. The compiler's doc XML has no
/// equivalent, so this is new information the docs site can turn into a source
/// link.
/// </summary>
sealed class SourceRef
{
  /// <summary>
  /// Path relative to the repository root, with forward slashes.
  /// </summary>
  public string File { get; set; } = "";

  /// <summary>One-based line of the declaration.</summary>
  public int Line { get; set; }
}

/// <summary>
/// A reference to a type. <see cref="DocId"/> is null only when the symbol
/// could not be resolved at all; <see cref="External"/> distinguishes
/// "resolved, but lives outside the documented assembly set" from "one of
/// ours", which is what decides whether a cref becomes a link or plain text.
/// </summary>
sealed class TypeRef
{
  /// <summary>Doc id of the referenced type, null when unresolvable.</summary>
  [JsonPropertyName("id")] public string? DocId { get; set; }

  /// <summary>How the type is written in a signature.</summary>
  public string Display { get; set; } = "";

  /// <summary>True when the type lives outside the documented set.</summary>
  public bool External { get; set; }

  /// <summary>
  /// Assembly the type is declared in, recorded only when it is external.
  /// </summary>
  /// <remarks>
  /// It is what decides whether another documentation site has a page for the
  /// type. The doc id cannot answer that: one namespace is routinely spread
  /// across several assemblies, and only some of them are documented anywhere.
  /// </remarks>
  [JsonPropertyName("asm")] public string? Assembly { get; set; }

  /// <summary>
  /// Doc ids of the types written inside this one, such as <c>Point3d</c> in
  /// <c>List&lt;Point3d&gt;</c>. Null when there are none.
  /// </summary>
  /// <remarks>
  /// <see cref="DocId"/> names only the open generic, so without these a type
  /// passed as an argument would never be found as referenced.
  /// </remarks>
  public List<string>? Inner { get; set; }
}

/// <summary>Accessor visibility for a property or indexer.</summary>
sealed class AccessorInfo
{
  /// <summary>
  /// Accessibility of the getter, or null when there is no getter.
  /// </summary>
  public string? Get { get; set; }

  /// <summary>
  /// Accessibility of the setter, or null when there is no setter.
  /// </summary>
  public string? Set { get; set; }

  /// <summary>True when the setter is init-only.</summary>
  public bool InitOnly { get; set; }
}

/// <summary>Details of an [Obsolete] attribute.</summary>
sealed class ObsoleteInfo
{
  /// <summary>The message given to the attribute, when there was one.</summary>
  public string? Message { get; set; }

  /// <summary>True when use is an error rather than a warning.</summary>
  public bool IsError { get; set; }
}
