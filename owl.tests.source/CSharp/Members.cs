namespace Samples.Members;

/// <summary>Converts things.</summary>
/// <typeparam name="TIn">What goes in.</typeparam>
/// <typeparam name="TOut">What comes out.</typeparam>
public interface IConverter<in TIn, out TOut>
{
  /// <summary>Converts one value.</summary>
  TOut Convert(TIn value);
}

/// <summary>Handles a value.</summary>
public delegate void Handler(int value);

/// <summary>Every kind of member and parameter.</summary>
public class Gadget : IConverter<string, int>, IDisposable
{
  /// <summary>The largest size.</summary>
  public const int MaxSize = 10;

  /// <summary>Where gadgets are kept unless told otherwise.</summary>
  public const Mode DefaultMode = Mode.Disk;

  /// <summary>Keeps the gadget.</summary>
  /// <param name="mode">Where to keep it.</param>
  /// <param name="fallback">Where to keep it when that fails.</param>
  /// <deprecated>2.1</deprecated>
  public void Keep(Mode mode = Mode.Disk, Mode? fallback = Mode.Memory) { }

  /// <summary>Set once, at construction.</summary>
  public readonly int Id;

  /// <summary>Makes a gadget.</summary>
  public Gadget() { }

  /// <summary>Makes a gadget with an id.</summary>
  /// <since>2.1</since>
  public Gadget(int id) => Id = id;

  /// <summary>Cleans up.</summary>
  ~Gadget() { }

  /// <summary>Readable by anyone, settable only here.</summary>
  public string Label { get; private set; } = "";

  /// <summary>Gets an item by position.</summary>
  public int this[int index] => index;

  /// <summary>Raised when something happens.</summary>
  public event Handler? Happened;

  /// <summary>Every kind of parameter.</summary>
  public void Configure(ref int a, out int b, in int c, int d = 5, params string[] rest) => b = a + c + d;

  /// <summary>A generic method with a constraint.</summary>
  public T Pick<T>(T first, T second) where T : IComparable<T> => first;

  /// <summary>Counts the characters.</summary>
  public int Convert(string value) => value.Length;

  /// <summary>Releases the gadget, only through <see cref="IDisposable"/>.</summary>
  void IDisposable.Dispose() { }

  /// <summary>Combines two gadgets.</summary>
  public static Gadget operator +(Gadget a, Gadget b) => new(a.Id + b.Id);

  /// <summary>Turns an id into a gadget.</summary>
  public static explicit operator Gadget(int id) => new(id);

  /// <summary>Turns a gadget into its id.</summary>
  public static implicit operator int(Gadget gadget) => gadget.Id;

  /// <summary>Gone for good.</summary>
  [Obsolete("Removed", error: true)]
  public void Old() { }

  /// <summary>Exists in the build owl reads.</summary>
  public void Defined() { }

#if OWL_SAMPLE
  /// <summary>Only compiled when OWL_SAMPLE is defined, which the project does.</summary>
  public void WhenDefined() { }
#else
  /// <summary>Never compiled, because the project defines OWL_SAMPLE.</summary>
  public void WhenNotDefined() { }
#endif
}

/// <summary>Split across two files.</summary>
public partial class Split
{
  /// <summary>From the first file.</summary>
  public void First() { }
}
