''' <summary>Shared helpers for stores.</summary>
''' <category>Helpers</category>
Public Module StoreHelpers

  ''' <summary>Reads through any <see cref="Samples.IStore"/>.</summary>
  Public Function ReadFrom(store As Samples.IStore, key As String) As String
    Return store.Read(key)
  End Function

  ''' <summary>
  ''' Joins words, using a project-level import. See <see href="https://example.com/join">joining</see>
  ''' and <a href="https://example.com/words">words</a>.
  ''' </summary>
  Public Function Join(words As String()) As StringBuilder
    Return New StringBuilder(String.Join(" ", words))
  End Function

End Module

''' <summary>A store written in Visual Basic.</summary>
''' <category>Storage</category>
Public Class VbStore
  Inherits Samples.MemoryStore
  Implements IDisposable

  ''' <summary>Raised after a read.</summary>
  Public Event Changed(sender As Object)

  ''' <summary>A property with a getter and a setter.</summary>
  Public Property Size As Integer

  ''' <summary>Releases the store.</summary>
  Public Sub Dispose() Implements IDisposable.Dispose
  End Sub

End Class
