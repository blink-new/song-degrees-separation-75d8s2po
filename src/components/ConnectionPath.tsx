import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Users, ArrowRight } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'

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

interface ConnectionPathProps {
  connection: SongConnection
  isLowestDegree: boolean
}

// Use the real path data from Last.fm API
const getDetailedPath = (connection: SongConnection): string[] => {
  // Return the actual path calculated by the API
  return connection.path
}

const ConnectionPath: React.FC<ConnectionPathProps> = ({ connection, isLowestDegree }) => {
  const [isOpen, setIsOpen] = useState(false)
  const detailedPath = getDetailedPath(connection)
  
  const getDegreeColor = (degrees: number) => {
    if (degrees <= 1) return 'bg-green-600'
    if (degrees === 2) return 'bg-amber-600'
    if (degrees === 3) return 'bg-orange-600'
    return 'bg-gray-600'
  }
  
  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.8) return 'text-green-400'
    if (similarity >= 0.6) return 'text-amber-400'
    if (similarity >= 0.4) return 'text-orange-400'
    return 'text-gray-400'
  }

  return (
    <div className="p-4 bg-slate-700 rounded-lg space-y-3">
      {/* Header with songs and basic info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge 
            className={`${getDegreeColor(connection.degrees)} text-white`}
          >
            {connection.degrees} degree{connection.degrees !== 1 ? 's' : ''}
          </Badge>
          <span className={`text-sm font-medium ${getSimilarityColor(connection.similarity)}`}>
            {Math.round(connection.similarity * 100)}% similarity
          </span>
          {isLowestDegree && (
            <Badge variant="outline" className="border-amber-500 text-amber-400">
              Strongest
            </Badge>
          )}
        </div>
        
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-slate-400 hover:text-white"
            >
              <Users className="w-4 h-4 mr-2" />
              {isOpen ? 'Hide Path' : 'Show Path'}
              {isOpen ? (
                <ChevronDown className="w-4 h-4 ml-2" />
              ) : (
                <ChevronRight className="w-4 h-4 ml-2" />
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Song titles */}
      <div className="space-y-2">
        <div className="text-white font-medium">
          \"{connection.song1.title}\" by {connection.song1.artist}
        </div>
        <div className="text-slate-400 text-center">
          <ArrowRight className="w-4 h-4 mx-auto" />
        </div>
        <div className="text-white font-medium">
          \"{connection.song2.title}\" by {connection.song2.artist}
        </div>
      </div>

      {/* Expandable connection path */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent className="space-y-3">
          <div className="border-t border-slate-600 pt-3">
            <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Connection Path ({connection.degrees} degrees)
            </h4>
            
            <div className="space-y-2">
              {detailedPath.map((step, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center text-xs text-white font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm ${index === 0 || index === detailedPath.length - 1 ? 'text-white font-medium' : 'text-slate-300'}`}>
                      {step}
                    </div>
                    {index === 0 && (
                      <div className="text-xs text-slate-500">Starting artist</div>
                    )}
                    {index > 0 && index < detailedPath.length - 1 && (
                      <div className="text-xs text-slate-500">
                        {index === 1 && connection.degrees === 1 ? 'Direct connection' : 
                         index === 1 ? 'First connection' :
                         index === detailedPath.length - 2 ? 'Final connection' :
                         'Intermediate connection'}
                      </div>
                    )}
                    {index === detailedPath.length - 1 && (
                      <div className="text-xs text-slate-500">Target artist</div>
                    )}
                  </div>
                  {index < detailedPath.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
            
            {/* Path explanation */}
            <div className="mt-4 p-3 bg-slate-800 rounded-lg">
              <h5 className="text-xs font-medium text-slate-400 mb-2">Path Explanation</h5>
              <p className="text-xs text-slate-500">
                {connection.degrees === 0 && "Both songs are by the same artist - direct connection."}
                {connection.degrees === 1 && "Artists have direct collaboration or are very similar in style."}
                {connection.degrees === 2 && "Artists are connected through one intermediate artist or influence."}
                {connection.degrees === 3 && "Artists are connected through multiple influences or genre connections."}
                {connection.degrees >= 4 && "Artists are connected through a longer chain of musical influences and industry connections."}
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export default ConnectionPath