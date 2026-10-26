namespace Samples.Shapes;

/// <summary>Any shape with an area.</summary>
/// <category>Shapes</category>
public abstract class Shape
{
  /// <summary>The shape's area.</summary>
  public abstract double Area { get; }

  /// <summary>Describes the shape.</summary>
  public virtual string Describe() => GetType().Name;

  /// <summary>Only derived shapes can call this.</summary>
  protected void Touch() { }

  /// <summary>Derived shapes and this assembly can call this.</summary>
  protected internal void Mark() { }

  /// <summary>Not visible outside this assembly's derived shapes.</summary>
  private protected void Secret() { }
}

/// <summary>A circle.</summary>
/// <category>Shapes</category>
public class Circle : Shape
{
  /// <summary>The radius.</summary>
  public double Radius { get; init; }

  /// <inheritdoc/>
  public override double Area => Math.PI * Radius * Radius;

  /// <summary>A position inside a circle.</summary>
  public class Spot
  {
    /// <summary>Distance from the centre.</summary>
    public double Distance { get; set; }
  }
}

/// <summary>Helpers for shapes.</summary>
/// <category>Shapes</category>
public static class ShapeExtensions
{
  /// <summary>Twice the area.</summary>
  /// <param name="shape">The shape to measure.</param>
  public static double DoubleArea(this Shape shape) => shape.Area * 2;

  /// <summary>Keeps the shape.</summary>
  /// <param name="shape">The shape to keep.</param>
  /// <param name="mode">Where to keep it.</param>
  public static void Keep(this Shape shape, Mode mode = Mode.Memory) { }
}
