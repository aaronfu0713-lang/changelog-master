import { useState, useRef, useCallback, useEffect } from 'react';
import type { VoiceName, TTSLanguage } from '../types';
import { generateAudio, createAudioUrl, downloadAudio, getCachedAudio, hashString } from '../services/ttsService';

interface LastPlayedAudio {
  textHash: string;
  voice: VoiceName;
  language: TTSLanguage;
  label: string;
}

interface UseAudioReturn {
  audioUrl: string | null;
  generatingFor: string | null;
  playingFor: string | null;
  isPlaying: boolean;
  isRestoring: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  error: string | null;
  selectedVoice: VoiceName;
  selectedLanguage: TTSLanguage;
  setSelectedVoice: (voice: VoiceName) => void;
  setSelectedLanguage: (lang: TTSLanguage) => void;
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
  const [isRestoring, setIsRestoring] = useState(false);
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
  const [selectedLanguage, setSelectedLanguageState] = useState<TTSLanguage>(
    (localStorage.getItem('ttsLanguage') as TTSLanguage) || 'en'
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasRestoredRef = useRef(false);

  const handleVoiceChange = (voice: VoiceName) => {
    setSelectedVoice(voice);
    localStorage.setItem('voicePreference', voice);
  };

  const handleLanguageChange = (lang: TTSLanguage) => {
    setSelectedLanguageState(lang);
    localStorage.setItem('ttsLanguage', lang);
  };

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeedState(speed);
    localStorage.setItem('playbackSpeed', speed.toString());
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, []);

  // Helper to setup audio element with all event listeners
  const setupAudioElement = useCallback((buffer: ArrayBuffer, label: string, autoPlay: boolean = true) => {
    setAudioBuffer(buffer);

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

    setPlayingFor(label);

    if (autoPlay) {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  }, [playbackSpeed]);

  // Restore last played audio on mount
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const restoreAudio = async () => {
      const saved = localStorage.getItem('lastPlayedAudio');
      if (!saved) return;

      try {
        const lastPlayed: LastPlayedAudio = JSON.parse(saved);
        setIsRestoring(true);

        const cacheKey = `${lastPlayed.voice}_${lastPlayed.language || 'en'}`;
        const cached = await getCachedAudio(lastPlayed.textHash, cacheKey);
        if (cached) {
          console.log('Restored last played audio from cache');
          setupAudioElement(cached, lastPlayed.label, false);
        }
      } catch (err) {
        console.error('Failed to restore audio:', err);
      } finally {
        setIsRestoring(false);
      }
    };

    restoreAudio();
  }, [setupAudioElement]);

  const generateAndPlay = useCallback(
    async (text: string, label: string) => {
      setGeneratingFor(label);
      setError(null);

      try {
        const buffer = await generateAudio(text, selectedVoice, selectedLanguage);

        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }

        const textHash = hashString(text);
        const lastPlayed: LastPlayedAudio = { textHash, voice: selectedVoice, language: selectedLanguage, label };
        localStorage.setItem('lastPlayedAudio', JSON.stringify(lastPlayed));

        setupAudioElement(buffer, label, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate audio');
      } finally {
        setGeneratingFor(null);
      }
    },
    [selectedVoice, selectedLanguage, audioUrl, setupAudioElement]
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
    isRestoring,
    currentTime,
    duration,
    playbackSpeed,
    error,
    selectedVoice,
    selectedLanguage,
    setSelectedVoice: handleVoiceChange,
    setSelectedLanguage: handleLanguageChange,
    setPlaybackSpeed: handleSpeedChange,
    generateAndPlay,
    play,
    pause,
    stop,
    seek,
    download,
  };
}
