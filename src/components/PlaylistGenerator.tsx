import React, { useState, useMemo } from 'react'
import { Music, Download, ArrowDown, Shuffle } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface Song {
  id: string
  title: string
  artist: string
  mbid?: string
  listeners?: number
  playcount?: number
}

interface SongConnection {
  song1: Song
  song2: Song
  degrees: number
  path: string[]
  similarity: number
}

interface PlaylistGeneratorProps {
  songs: Song[]
  connections: SongConnection[]
}

interface PlaylistTrack {
  song: Song
  position: number
  nextConnection?: {
    degrees: number
    similarity: number
  }
}

type OptimizationStrategy = 'optimal' | 'similarity' | 'random'

// Helper function to find connection between two songs
const findConnection = (connections: SongConnection[], song1: Song, song2: Song): SongConnection | undefined => {
  return connections.find(conn => 
    (conn.song1.id === song1.id && conn.song2.id === song2.id) ||
    (conn.song1.id === song2.id && conn.song2.id === song1.id)
  )
}

// Generate optimal playlist using greedy algorithm
const generateOptimalPlaylist = (songs: Song[], connections: SongConnection[]): PlaylistTrack[] => {
  if (songs.length === 0) return []
  
  const remaining = [...songs]
  const playlist: PlaylistTrack[] = []
  
  // Find the best starting song (one with most strong connections)
  let currentSong = remaining.reduce((best, song) => {
    const songConnections = connections.filter(conn => 
      conn.song1.id === song.id || conn.song2.id === song.id
    )
    const strongConnections = songConnections.filter(conn => conn.degrees <= 1).length
    
    const bestConnections = connections.filter(conn => 
      conn.song1.id === best.id || conn.song2.id === best.id
    )
    const bestStrongConnections = bestConnections.filter(conn => conn.degrees <= 1).length
    
    return strongConnections > bestStrongConnections ? song : best
  })
  
  remaining.splice(remaining.findIndex(s => s.id === currentSong.id), 1)
  playlist.push({ song: currentSong, position: 1 })
  
  // Greedily add songs with lowest degrees of separation
  while (remaining.length > 0) {
    let bestNext = remaining[0]
    let bestConnection = findConnection(connections, currentSong, bestNext)
    
    for (const candidate of remaining) {
      const connection = findConnection(connections, currentSong, candidate)
      if (connection && (!bestConnection || connection.degrees < bestConnection.degrees || 
          (connection.degrees === bestConnection.degrees && connection.similarity > bestConnection.similarity))) {
        bestNext = candidate
        bestConnection = connection
      }
    }
    
    const nextConnection = bestConnection ? {
      degrees: bestConnection.degrees,
      similarity: bestConnection.similarity
    } : undefined
    
    // Update previous track with connection info
    if (playlist.length > 0) {
      playlist[playlist.length - 1].nextConnection = nextConnection
    }
    
    playlist.push({ 
      song: bestNext, 
      position: playlist.length + 1
    })
    
    remaining.splice(remaining.findIndex(s => s.id === bestNext.id), 1)
    currentSong = bestNext
  }
  
  return playlist
}

// Generate similarity-based playlist
const generateSimilarityPlaylist = (songs: Song[], connections: SongConnection[]): PlaylistTrack[] => {
  if (songs.length === 0) return []
  
  const sortedConnections = [...connections].sort((a, b) => b.similarity - a.similarity)
  const used = new Set<string>()
  const playlist: PlaylistTrack[] = []
  
  // Start with the song from the highest similarity connection
  if (sortedConnections.length > 0) {
    const firstConnection = sortedConnections[0]
    playlist.push({ song: firstConnection.song1, position: 1 })
    playlist.push({ 
      song: firstConnection.song2, 
      position: 2,
    })
    playlist[0].nextConnection = {
      degrees: firstConnection.degrees,
      similarity: firstConnection.similarity
    }
    used.add(firstConnection.song1.id)
    used.add(firstConnection.song2.id)
  }
  
  // Add remaining songs
  const remaining = songs.filter(song => !used.has(song.id))
  remaining.forEach(song => {
    const lastSong = playlist[playlist.length - 1]?.song
    const connection = lastSong ? findConnection(connections, lastSong, song) : undefined
    
    if (playlist.length > 0 && connection) {
      playlist[playlist.length - 1].nextConnection = {
        degrees: connection.degrees,
        similarity: connection.similarity
      }
    }
    
    playlist.push({ 
      song, 
      position: playlist.length + 1
    })
  })
  
  return playlist
}

// Generate random playlist
const generateRandomPlaylist = (songs: Song[], connections: SongConnection[]): PlaylistTrack[] => {
  const shuffled = [...songs].sort(() => Math.random() - 0.5)
  return shuffled.map((song, index) => {
    const track: PlaylistTrack = { song, position: index + 1 }
    
    if (index < shuffled.length - 1) {
      const connection = findConnection(connections, song, shuffled[index + 1])
      if (connection) {
        track.nextConnection = {
          degrees: connection.degrees,
          similarity: connection.similarity
        }
      }
    }
    
    return track
  })
}

const PlaylistGenerator: React.FC<PlaylistGeneratorProps> = ({ songs, connections }) => {
  const [strategy, setStrategy] = useState<OptimizationStrategy>('optimal')

  const playlist = useMemo(() => {
    switch (strategy) {
      case 'optimal':
        return generateOptimalPlaylist(songs, connections)
      case 'similarity':
        return generateSimilarityPlaylist(songs, connections)
      case 'random':
        return generateRandomPlaylist(songs, connections)
      default:
        return []
    }
  }, [strategy, songs, connections])

  // Calculate playlist statistics
  const stats = useMemo(() => {
    const connectionsWithData = playlist.filter(track => track.nextConnection)
    const totalDegrees = connectionsWithData.reduce((sum, track) => sum + (track.nextConnection?.degrees || 0), 0)
    const totalSimilarity = connectionsWithData.reduce((sum, track) => sum + (track.nextConnection?.similarity || 0), 0)
    const strongConnections = connectionsWithData.filter(track => (track.nextConnection?.degrees || 0) <= 1).length
    
    return {
      avgDegrees: connectionsWithData.length > 0 ? totalDegrees / connectionsWithData.length : 0,
      avgSimilarity: connectionsWithData.length > 0 ? totalSimilarity / connectionsWithData.length : 0,
      strongConnections,
      totalConnections: connectionsWithData.length
    }
  }, [playlist])

  const exportPlaylist = () => {
    const playlistText = playlist.map(track => 
      `${track.position}. "${track.song.title}" by ${track.song.artist}`
    ).join('\n')
    
    const blob = new Blob([playlistText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `playlist-${strategy}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getConnectionColor = (degrees: number) => {
    if (degrees <= 1) return 'text-green-400'
    if (degrees === 2) return 'text-amber-400'
    return 'text-gray-400'
  }

  const getConnectionBadgeColor = (degrees: number) => {
    if (degrees <= 1) return 'bg-green-600'
    if (degrees === 2) return 'bg-amber-600'
    return 'bg-gray-600'
  }

  if (songs.length < 2) return null

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Music className="w-5 h-5" />
          Playlist Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strategy Selection */}
        <div className="flex items-center gap-4">
          <label className="text-sm text-slate-400">Optimization Strategy:</label>
          <Select value={strategy} onValueChange={(value: OptimizationStrategy) => setStrategy(value)}>
            <SelectTrigger className="w-48 bg-slate-700 border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              <SelectItem value="optimal">Optimal Flow</SelectItem>
              <SelectItem value="similarity">Similarity</SelectItem>
              <SelectItem value="random">Random</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Playlist Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-3 bg-slate-700 rounded-lg">
            <div className="text-lg font-bold text-blue-400">
              {stats.avgDegrees.toFixed(1)}°
            </div>
            <div className="text-xs text-slate-400">Avg Degrees</div>
          </div>
          <div className="text-center p-3 bg-slate-700 rounded-lg">
            <div className="text-lg font-bold text-purple-400">
              {Math.round(stats.avgSimilarity * 100)}%
            </div>
            <div className="text-xs text-slate-400">Avg Similarity</div>
          </div>
          <div className="text-center p-3 bg-slate-700 rounded-lg">
            <div className="text-lg font-bold text-green-400">
              {stats.strongConnections}
            </div>
            <div className="text-xs text-slate-400">Strong Links</div>
          </div>
          <div className="text-center p-3 bg-slate-700 rounded-lg">
            <div className="text-lg font-bold text-slate-300">
              {playlist.length}
            </div>
            <div className="text-xs text-slate-400">Total Tracks</div>
          </div>
        </div>

        {/* Playlist Tracks */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {playlist.map((track, index) => (
            <div key={track.song.id} className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 bg-rose-600 rounded-full flex items-center justify-center text-sm font-bold">
                  {track.position}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">
                    {track.song.title}
                  </div>
                  <div className="text-sm text-slate-400 truncate">
                    by {track.song.artist}
                  </div>
                </div>
                {track.nextConnection && (
                  <div className="flex items-center gap-2">
                    <Badge className={`${getConnectionBadgeColor(track.nextConnection.degrees)} text-white`}>
                      {track.nextConnection.degrees}°
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {Math.round(track.nextConnection.similarity * 100)}%
                    </span>
                  </div>
                )}
              </div>
              
              {track.nextConnection && index < playlist.length - 1 && (
                <div className="flex justify-center">
                  <div className={`flex items-center gap-1 text-xs ${getConnectionColor(track.nextConnection.degrees)}`}>
                    <ArrowDown className="w-3 h-3" />
                    <span>{track.nextConnection.degrees} degree{track.nextConnection.degrees !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Export Button */}
        <div className="flex gap-2 pt-4">
          <Button
            onClick={exportPlaylist}
            className="flex-1 bg-amber-600 hover:bg-amber-700"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Playlist
          </Button>
          <Button
            variant="outline"
            onClick={() => setStrategy(strategy === 'random' ? 'optimal' : 'random')}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <Shuffle className="w-4 h-4" />
          </Button>
        </div>

        {/* Strategy Description */}
        <div className="text-xs text-slate-500 bg-slate-900/50 p-3 rounded-lg">
          {strategy === 'optimal' && 
            "Optimal Flow uses a greedy algorithm to minimize degrees of separation between consecutive songs, creating the smoothest musical transitions."
          }
          {strategy === 'similarity' && 
            "Similarity strategy prioritizes tracks with highest similarity scores, grouping musically similar songs together."
          }
          {strategy === 'random' && 
            "Random strategy provides a baseline comparison to show the difference optimization makes."
          }
        </div>
      </CardContent>
    </Card>
  )
}

export default PlaylistGenerator