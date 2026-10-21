namespace Samples.Docs;

/// <summary>
/// Uses every documentation tag owl reads: <c>inline code</c>, <see langword="null"/>,
/// <see href="https://example.com">a web link</see> and <see cref="Samples.IStore"/>.
/// </summary>
/// <remarks>
/// <para>First paragraph.</para>
/// <para>Second paragraph.<br/>After a break.</para>
/// <list type="bullet">
///   <item><description>One</description></item>
///   <item><description>Two</description></item>
/// </list>
/// <list type="table">
///   <listheader><term>Name</term><description>Meaning</description></listheader>
///   <item><term>A</term><description>First</description></item>
/// </list>
/// <note type="warning">Be careful.</note>
/// </remarks>
/// <seealso cref="Samples.MemoryStore"/>
/// <since>2.0</since>
/// <deprecated>3.0</deprecated>
public class Tagged
{
  /// <summary>Finds <paramref name="key"/> in a <typeparamref name="T"/>.</summary>
  /// <typeparam name="T">The container.</typeparam>
  /// <param name="key">What to find.</param>
  /// <returns>True when found.</returns>
  /// <exception cref="ArgumentNullException"><paramref name="key"/> is null.</exception>
  /// <example>
  /// <code language="csharp">
  /// var found = tagged.Find&lt;List&lt;int&gt;&gt;("a");
  /// </code>
  /// <code source="Examples/Find.cs" region="find"/>
  /// </example>
  public bool Find<T>(string key) => key.Length > 0;

  /// <summary>How many there are.</summary>
  /// <value>Never negative.</value>
  public int Count => 0;

  /// <summary>Points at something that is not there: <see cref="Missing"/>.</summary>
  public void Broken() { }

  /// <summary>Points at an example file that is not there.</summary>
  /// <example><code source="Examples/Nowhere.cs"/></example>
  public void NoExample() { }

  public void Undocumented() { }
}
