namespace Samples.Editions;

/// <summary>In every build of the samples.</summary>
public class Everywhere
{
  /// <summary>In every build.</summary>
  public void Always() { }

#if SAMPLES_EDITION2
  /// <summary>Only in the Edition2 build.</summary>
  public void Added() { }
#endif
}

#if SAMPLES_EDITION2
/// <summary>Only in the Edition2 build.</summary>
public class OnlyInEdition2 { }
#else
/// <summary>Only in the default build.</summary>
public class OnlyInDefault { }
#endif
