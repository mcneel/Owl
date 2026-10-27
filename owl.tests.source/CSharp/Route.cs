namespace Samples;

/// <summary>A path through points.</summary>
public class Route
{
  /// <summary>The stops along the way.</summary>
  public List<Point> Stops { get; } = [];

  /// <summary>Stops grouped by name.</summary>
  public Dictionary<string, List<Point>> Named() => [];

  /// <summary>The corners.</summary>
  /// <param name="names">Who owns each corner.</param>
  public Point[] Corners(Owned<Name> names) => [];

  /// <summary>Picks one item.</summary>
  /// <typeparam name="T">Item type.</typeparam>
  /// <param name="items">What to pick from.</param>
  public T Pick<T>(List<T> items) => items[0];

  /// <summary>Adds a stop.</summary>
  public static Route operator +(Route route, Point stop) => route;

  /// <summary>The last stop.</summary>
  public static Point operator ~(Route route) => default;
}

/// <summary>Points kept in order.</summary>
public class PointList : List<Point>, IComparer<Name>
{
  /// <inheritdoc/>
  public int Compare(Name? x, Name? y) => 0;
}
