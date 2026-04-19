import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2, VolumeX } from 'lucide-react';
import { forceDownload } from '../lib/utils';

interface AudioPlayerProps {
  src: string;
  title: string;
}

export default function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = (Number(e.target.value) / 100) * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      setProgress(Number(e.target.value));
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-50 dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200 dark:border-zinc-700">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <div className="flex items-center gap-4 mb-3">
        <button
          onClick={togglePlay}
          className="w-12 h-12 flex items-center justify-center bg-sky-600 hover:bg-sky-700 text-white rounded-full transition-colors shrink-0 shadow-md shadow-sky-200 dark:shadow-none"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
        </button>
        
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-sky-600"
          />
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-zinc-800">
        <button
          onClick={toggleMute}
          className="p-2 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        
        <button
          onClick={(e) => {
            e.preventDefault();
            forceDownload(src, title + '.mp3');
          }}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 bg-slate-100 dark:bg-zinc-800 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>
    </div>
  );
}
