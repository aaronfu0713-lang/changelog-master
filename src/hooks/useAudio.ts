import { useState, useRef, useCallback } from 'react';
import type { VoiceName } from '../types';
import { generateAudio, createAudioUrl, downloadAudio } from '../services/ttsService';

interface UseAudioReturn {
  audioUrl: string | null;
  generatingFor: string | null;
  playingFor: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  error: string | null;
  selectedVoice: VoiceName;
  setSelectedVoice: (voice: VoiceName) => void;
  setPlaybackSpeed: (speed: number) => void;
  generateAndPlay: (text: string, label: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  download: (filename: string) => void;
}

export function useAudio(): UseAudioReturn {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [playingFor, setPlayingFor] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeedState] = useState(() => {
    const saved = localStorage.getItem('playbackSpeed');
    return saved ? parseFloat(saved) : 1;
  });
  const [error, setError] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(
    (localStorage.getItem('voicePreference') as VoiceName) ||
      (import.meta.env.VITE_VOICE_PREFERENCE as VoiceName) ||
      'Charon'
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleVoiceChange = (voice: VoiceName) => {
    setSelectedVoice(voice);
    localStorage.setItem('voicePreference', voice);
  };

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeedState(speed);
    localStorage.setItem('playbackSpeed', speed.toString());
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, []);

  const generateAndPlay = useCallback(
    async (text: string, label: string) => {
      setGeneratingFor(label);
      setError(null);

      try {
        const buffer = await generateAudio(text, selectedVoice);
        setAudioBuffer(buffer);

        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }

        const url = createAudioUrl(buffer);
        setAudioUrl(url);

        if (audioRef.current) {
          audioRef.current.pause();
        }

        const audio = new Audio(url);
        audio.playbackRate = playbackSpeed;
        audioRef.current = audio;

        audio.addEventListener('loadedmetadata', () => {
          setDuration(audio.duration);
        });

        audio.addEventListener('timeupdate', () => {
          setCurrentTime(audio.currentTime);
        });

        audio.addEventListener('ended', () => {
          setIsPlaying(false);
          setPlayingFor(null);
          setCurrentTime(0);
        });

        audio.addEventListener('error', () => {
          setError('Failed to play audio');
          setIsPlaying(false);
          setPlayingFor(null);
        });

        // Auto-play after generation
        await audio.play();
        setIsPlaying(true);
        setPlayingFor(label);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate audio');
      } finally {
        setGeneratingFor(null);
      }
    },
    [selectedVoice, audioUrl, playbackSpeed]
  );

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setPlayingFor(null);
      setCurrentTime(0);
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration || 0));
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const download = useCallback(
    (filename: string) => {
      if (audioBuffer) {
        downloadAudio(audioBuffer, filename);
      }
    },
    [audioBuffer]
  );

  return {
    audioUrl,
    generatingFor,
    playingFor,
    isPlaying,
    currentTime,
    duration,
    playbackSpeed,
    error,
    selectedVoice,
    setSelectedVoice: handleVoiceChange,
    setPlaybackSpeed: handleSpeedChange,
    generateAndPlay,
    play,
    pause,
    stop,
    seek,
    download,
  };
}
