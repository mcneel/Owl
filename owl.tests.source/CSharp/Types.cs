namespace Samples;

/// <summary>Reads and writes values.</summary>
/// <category>Storage</category>
/// <since>2.0</since>
public interface IStore
{
  /// <summary>Reads the value stored under <paramref name="key"/>.</summary>
  /// <param name="key">Name of the value.</param>
  /// <returns>The value, or null.</returns>
  string? Read(string key);
}

/// <summary>Keeps values in memory. See <see cref="IStore"/>.</summary>
/// <category>Storage</category>
public class MemoryStore : IStore
{
  /// <inheritdoc/>
  public virtual string? Read(string key) => null;

  /// <summary>Not part of the public API.</summary>
  internal void Hidden() { }
}

/// <summary>A store that caches reads.</summary>
/// <category>Storage</category>
/// <since>2.1</since>
public sealed class CachedStore : MemoryStore
{
  /// <inheritdoc/>
  public override string? Read(string key) => base.Read(key);
}

/// <summary>Should never appear: internal.</summary>
internal class InternalThing { }

/// <summary>A point in two dimensions.</summary>
public struct Point
{
  /// <summary>Horizontal position.</summary>
  public double X;

  /// <summary>Adds two points.</summary>
  public static Point operator +(Point a, Point b) => new() { X = a.X + b.X };
}

/// <summary>How a value is stored.</summary>
public enum Mode
{
  /// <summary>Kept in memory.</summary>
  Memory,

  /// <summary>Written to disk.</summary>
  Disk,
}

/// <summary>An immutable name.</summary>
public record Name(string First, string Last);

/// <summary>A name that cannot be derived from.</summary>
public sealed record FinalName(string Value);

/// <summary>A pair of numbers, by value.</summary>
public record struct Pair(int A, int B);

/// <summary>A list that knows its owner.</summary>
/// <typeparam name="T">Item type.</typeparam>
public class Owned<T> where T : class
{
  /// <summary>Old way to clear.</summary>
  [System.Obsolete("Use Reset instead")]
  public void Clear() { }

  /// <summary>Raised when the list changes.</summary>
  public event System.EventHandler? Changed;

  /// <summary>Clears the list.</summary>
  public void Reset() => Changed?.Invoke(this, System.EventArgs.Empty);
}
