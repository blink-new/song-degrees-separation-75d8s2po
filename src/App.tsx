import React, { useState, useCallback } from 'react'
import { Music, Plus, Trash2, Search, Network, Loader2 } from 'lucide-react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Badge } from './components/ui/badge'
import { Progress } from './components/ui/progress'
import { Alert, AlertDescription } from './components/ui/alert'
import PlaylistGenerator from './components/PlaylistGenerator'
import ConnectionPath from './components/ConnectionPath'
import axios from 'axios'

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

interface AnalysisResult {
  connections: SongConnection[]
  lowestDegrees: number
  totalAnalyzed: number
}

// Helper functions
const getSimilarArtists = async (artistName: string): Promise<{ name: string; match: number }[]> => {
  try {
    const apiKey = import.meta.env.VITE_LASTFM_API_KEY
    if (!apiKey) {
      console.warn('Last.fm API key not configured')
      return []
    }

    const response = await axios.get(`https://ws.audioscrobbler.com/2.0/`, {
      params: {
        method: 'artist.getsimilar',
        artist: artistName,
        api_key: apiKey,
        format: 'json',
        limit: 50 // Get more artists for better connection finding
      }
    })

    const similarArtists = response.data.similarartists?.artist || []
    if (!similarArtists) return []
    
    const artists = Array.isArray(similarArtists) ? similarArtists : [similarArtists]
    return artists.map((artist: any) => ({
      name: artist.name,
      match: parseFloat(artist.match || '0')
    })).filter(artist => artist.name)
  } catch (error) {
    console.error('Error fetching similar artists for', artistName, ':', error)
    return []
  }
}

const getTrackSimilarity = async (artist1: string, track1: string, artist2: string, track2: string): Promise<number> => {
  try {
    const apiKey = import.meta.env.VITE_LASTFM_API_KEY
    if (!apiKey) return 0

    // Get track info for both songs to compare tags and similar tracks
    const [track1Info, track2Info] = await Promise.all([
      axios.get(`https://ws.audioscrobbler.com/2.0/`, {
        params: {
          method: 'track.getInfo',
          artist: artist1,
          track: track1,
          api_key: apiKey,
          format: 'json'
        }
      }).catch(() => null),
      axios.get(`https://ws.audioscrobbler.com/2.0/`, {
        params: {
          method: 'track.getInfo',
          artist: artist2,
          track: track2,
          api_key: apiKey,
          format: 'json'
        }
      }).catch(() => null)
    ])

    if (!track1Info?.data?.track || !track2Info?.data?.track) {
      return 0
    }

    const tags1 = track1Info.data.track.toptags?.tag || []
    const tags2 = track2Info.data.track.toptags?.tag || []
    
    if (tags1.length === 0 || tags2.length === 0) return 0

    // Calculate tag similarity
    const tagNames1 = new Set(tags1.map((tag: any) => tag.name.toLowerCase()))
    const tagNames2 = new Set(tags2.map((tag: any) => tag.name.toLowerCase()))
    
    const intersection = new Set([...tagNames1].filter(tag => tagNames2.has(tag)))
    const union = new Set([...tagNames1, ...tagNames2])
    
    return union.size > 0 ? intersection.size / union.size : 0
  } catch (error) {
    console.error('Error calculating track similarity:', error)
    return 0
  }
}

const calculateDegrees = async (song1: Song, song2: Song): Promise<{ degrees: number; path: string[] }> => {
  try {
    // Check for direct connection (same artist)
    if (song1.artist.toLowerCase() === song2.artist.toLowerCase()) {
      return { degrees: 0, path: [song1.artist] }
    }

    // Get similar artists for both songs
    const [similar1, similar2] = await Promise.all([
      getSimilarArtists(song1.artist),
      getSimilarArtists(song2.artist)
    ])

    // Check for 1-degree connection (direct similar artists)
    const directConnection = similar1.find(artist1 => 
      artist1.name.toLowerCase() === song2.artist.toLowerCase()
    )
    
    if (directConnection) {
      return { 
        degrees: 1, 
        path: [song1.artist, song2.artist]
      }
    }

    // Check for 2-degree connection (common similar artists)
    const commonArtists = similar1.filter(artist1 => 
      similar2.some(artist2 => 
        artist1.name.toLowerCase() === artist2.name.toLowerCase()
      )
    )

    if (commonArtists.length > 0) {
      // Find the best common artist (highest match score)
      const bestCommon = commonArtists.reduce((best, current) => {
        const match1 = similar1.find(a => a.name.toLowerCase() === current.name.toLowerCase())?.match || 0
        const match2 = similar2.find(a => a.name.toLowerCase() === current.name.toLowerCase())?.match || 0
        const currentScore = match1 + match2
        
        const bestMatch1 = similar1.find(a => a.name.toLowerCase() === best.name.toLowerCase())?.match || 0
        const bestMatch2 = similar2.find(a => a.name.toLowerCase() === best.name.toLowerCase())?.match || 0
        const bestScore = bestMatch1 + bestMatch2
        
        return currentScore > bestScore ? current : best
      })
      
      return { 
        degrees: 2, 
        path: [song1.artist, bestCommon.name, song2.artist]
      }
    }

    // Check for 3-degree connections (similar artists of similar artists)
    for (const artist1 of similar1.slice(0, 5)) { // Limit to top 5 for performance
      const artist1Similar = await getSimilarArtists(artist1.name)
      const connection = artist1Similar.find(a => 
        a.name.toLowerCase() === song2.artist.toLowerCase()
      )
      if (connection) {
        return { 
          degrees: 3, 
          path: [song1.artist, artist1.name, song2.artist]
        }
      }
    }

    // If no connection found through API, return high degree
    return { 
      degrees: 6, 
      path: [song1.artist, '(no direct connection found)', song2.artist]
    }
  } catch (error) {
    console.error('Error calculating degrees:', error)
    return { 
      degrees: 6, 
      path: [song1.artist, '(error calculating connection)', song2.artist]
    }
  }
}

const calculateSimilarity = async (song1: Song, song2: Song): Promise<number> => {
  // Use real Last.fm track similarity
  return await getTrackSimilarity(song1.artist, song1.title, song2.artist, song2.title)
}

function App() {
  const [songs, setSongs] = useState<Song[]>([])
  const [newSongTitle, setNewSongTitle] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [results, setResults] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const addSong = useCallback(async () => {
    if (!newSongTitle.trim()) return

    setError(null)
    
    // Check if API key is available
    const apiKey = import.meta.env.VITE_LASTFM_API_KEY
    if (!apiKey) {
      setError('Last.fm API key is not configured. Please check your environment variables.')
      return
    }

    try {
      // Search for the song using Last.fm API
      const response = await axios.get(`https://ws.audioscrobbler.com/2.0/`, {
        params: {
          method: 'track.search',
          track: newSongTitle,
          api_key: apiKey,
          format: 'json',
          limit: 1
        }
      })

      const tracks = response.data.results?.trackmatches?.track
      if (!tracks || tracks.length === 0) {
        setError(`No results found for "${newSongTitle}"`)
        return
      }

      const track = Array.isArray(tracks) ? tracks[0] : tracks
      const newSong: Song = {
        id: `${track.artist}-${track.name}-${Date.now()}`,
        title: track.name,
        artist: track.artist,
        mbid: track.mbid,
        listeners: parseInt(track.listeners) || 0
      }

      setSongs(prev => [...prev, newSong])
      setNewSongTitle('')
    } catch (err: any) {
      if (err.response?.status === 400) {
        setError('Invalid API request. Please check the Last.fm API key configuration.')
      } else {
        setError('Failed to search for song. Please try again.')
      }
      console.error('Last.fm API error:', err)
    }
  }, [newSongTitle])

  const removeSong = useCallback((songId: string) => {
    setSongs(prev => prev.filter(song => song.id !== songId))
  }, [])

  const analyzeSongs = useCallback(async () => {
    if (songs.length < 2) {
      setError('Please add at least 2 songs to analyze')
      return
    }

    setIsAnalyzing(true)
    setAnalysisProgress(0)
    setError(null)
    setResults(null)

    try {
      const connections: SongConnection[] = []
      const totalPairs = (songs.length * (songs.length - 1)) / 2
      let processedPairs = 0

      // Analyze each pair of songs
      for (let i = 0; i < songs.length; i++) {
        for (let j = i + 1; j < songs.length; j++) {
          const song1 = songs[i]
          const song2 = songs[j]

          // Calculate real degrees of separation using Last.fm API
          const degreesResult = await calculateDegrees(song1, song2)
          const similarity = await calculateSimilarity(song1, song2)

          connections.push({
            song1,
            song2,
            degrees: degreesResult.degrees,
            path: degreesResult.path,
            similarity
          })

          processedPairs++
          setAnalysisProgress((processedPairs / totalPairs) * 100)

          // Add small delay to show progress
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      // Find the lowest degrees of separation
      const lowestDegrees = Math.min(...connections.map(c => c.degrees))
      
      // Sort connections by degrees (lowest first), then by similarity (highest first)
      connections.sort((a, b) => {
        if (a.degrees !== b.degrees) return a.degrees - b.degrees
        return b.similarity - a.similarity
      })

      setResults({
        connections,
        lowestDegrees,
        totalAnalyzed: connections.length
      })
    } catch (err) {
      setError('Analysis failed. Please try again.')
      console.error('Analysis error:', err)
    } finally {
      setIsAnalyzing(false)
      setAnalysisProgress(0)
    }
  }, [songs])

  const clearAll = useCallback(() => {
    setSongs([])
    setResults(null)
    setError(null)
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-600 rounded-lg">
              <Music className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Song Degrees of Separation</h1>
              <p className="text-slate-400">Discover musical connections through Last.fm data</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Plus className="w-5 h-5" />
                  Add Songs to Analyze
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter song title..."
                    value={newSongTitle}
                    onChange={(e) => setNewSongTitle(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addSong()}
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                  />
                  <Button 
                    onClick={addSong}
                    disabled={!newSongTitle.trim()}
                    className="bg-rose-600 hover:bg-rose-700"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>

                {error && (
                  <Alert className="bg-red-900/20 border-red-800">
                    <AlertDescription className="text-red-200">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                {!import.meta.env.VITE_LASTFM_API_KEY && (
                  <Alert className="bg-amber-900/20 border-amber-800">
                    <AlertDescription className="text-amber-200">
                      <strong>Demo Mode:</strong> Last.fm API key not configured. 
                      Connections and similarity scores may not reflect real data.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Song List */}
                <div className="space-y-2">
                  {songs.map((song) => (
                    <div
                      key={song.id}
                      className="flex items-center justify-between p-3 bg-slate-700 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-white">{song.title}</div>
                        <div className="text-sm text-slate-400">by {song.artist}</div>
                        {song.listeners && (
                          <div className="text-xs text-amber-400">
                            {song.listeners.toLocaleString()} listeners
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSong(song.id)}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {songs.length >= 2 && (
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={analyzeSongs}
                      disabled={isAnalyzing}
                      className="flex-1 bg-amber-600 hover:bg-amber-700"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Network className="w-4 h-4 mr-2" />
                          Analyze Connections
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={clearAll}
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      Clear All
                    </Button>
                  </div>
                )}

                {isAnalyzing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Analysis Progress</span>
                      <span className="text-amber-400">{Math.round(analysisProgress)}%</span>
                    </div>
                    <Progress value={analysisProgress} className="bg-slate-700" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {results && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Network className="w-5 h-5" />
                    Connection Analysis Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-slate-700 rounded-lg">
                      <div className="text-2xl font-bold text-amber-400">
                        {results.lowestDegrees}
                      </div>
                      <div className="text-sm text-slate-400">Lowest Degrees</div>
                    </div>
                    <div className="text-center p-4 bg-slate-700 rounded-lg">
                      <div className="text-2xl font-bold text-rose-400">
                        {results.totalAnalyzed}
                      </div>
                      <div className="text-sm text-slate-400">Connections Analyzed</div>
                    </div>
                  </div>

                  {/* Explanation Section */}
                  <div className="p-4 bg-slate-800 rounded-lg space-y-3">
                    <h4 className="text-sm font-medium text-slate-300">Understanding the Metrics</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="font-medium text-white mb-1">🔗 Degrees of Separation</div>
                        <div className="text-slate-400">
                          Measures how many "hops" through artists it takes to connect two songs using Last.fm's similar artist data.
                          Lower degrees = stronger musical connections.
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-white mb-1">📊 Similarity Score</div>
                        <div className="text-slate-400">
                          Measures how musically similar two songs are (0-100%) based on Last.fm's track tags and genres.
                          Higher percentage = more similar musical style.
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-slate-700 pt-3">
                      <div className="font-medium text-white mb-1 text-xs">📝 Playlist Similarity</div>
                      <div className="text-slate-400 text-xs">
                        The percentage next to each song in the playlist shows its similarity to the <strong>next song</strong> in the sequence.
                        This helps you understand how smooth the musical transitions will be.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-medium text-white">Strongest Connections</h3>
                    {results.connections.slice(0, 5).map((connection, index) => (
                      <ConnectionPath
                        key={index}
                        connection={connection}
                        isLowestDegree={connection.degrees === results.lowestDegrees}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {results && (
              <PlaylistGenerator 
                songs={songs} 
                connections={results.connections} 
              />
            )}

            {songs.length === 0 && (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="text-center py-12">
                  <Music className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-400 mb-2">
                    No Songs Added Yet
                  </h3>
                  <p className="text-slate-500">
                    Add some songs to start discovering musical connections
                  </p>
                </CardContent>
              </Card>
            )}

            {songs.length === 1 && (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="text-center py-12">
                  <Network className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-400 mb-2">
                    Add More Songs
                  </h3>
                  <p className="text-slate-500">
                    Add at least one more song to analyze connections
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App