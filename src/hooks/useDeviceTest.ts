import { useCallback, useEffect, useRef, useState } from 'react';

export function useDeviceTest() {
  const [status, setStatus] = useState<'off' | 'requesting' | 'testing'>('off'),
    [level, setLevel] = useState(0),
    [failure, setFailure] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const stream = useRef<MediaStream>(),
    context = useRef<AudioContext>(),
    timer = useRef<ReturnType<typeof setInterval>>(),
    generation = useRef(0),
    tone = useRef<AudioContext>();
  const stop = useCallback(() => {
    generation.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = undefined;
    if (context.current) void context.current.close().catch(() => {});
    context.current = undefined;
    if (tone.current) void tone.current.close().catch(() => {});
    tone.current = undefined;
    clearInterval(timer.current);
    timer.current = undefined;
    setStatus('off');
    setLevel(0);
  }, []);
  useEffect(() => stop, [stop]);
  const start = useCallback(
    async (deviceId?: string) => {
      stop();
      const id = generation.current;
      setStatus('requesting');
      setFailure('');
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('当前浏览器无法检测麦克风，请确认使用 HTTPS 或本机地址');
        const next = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          video: false,
        });
        if (id !== generation.current) {
          next.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = next;
        const audio = (context.current = new AudioContext());
        await audio.resume();
        if (id !== generation.current) return;
        const analyser = audio.createAnalyser();
        analyser.fftSize = 512;
        audio.createMediaStreamSource(next).connect(analyser);
        // Deliberately never connect the microphone to audio.destination.
        const samples = new Float32Array(analyser.fftSize);
        setStatus('testing');
        timer.current = setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length);
          setLevel(Math.min(100, Math.round(rms * 500)));
        }, 100);
        const list = await navigator.mediaDevices.enumerateDevices();
        if (id === generation.current) setDevices(list);
      } catch (e) {
        if (id !== generation.current) return;
        stop();
        setFailure(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? '麦克风权限未允许。可以在浏览器地址栏修改权限后重试。'
            : e instanceof Error
              ? e.message
              : '麦克风检测失败',
        );
      }
    },
    [stop],
  );
  const testTone = useCallback(async (outputId?: string) => {
    if (tone.current) await tone.current.close().catch(() => {});
    const audio = (tone.current = new AudioContext());
    await audio.resume();
    if (tone.current !== audio) return;
    const outputAudio = audio as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (outputId && outputAudio.setSinkId) await outputAudio.setSinkId(outputId);
    if (tone.current !== audio) return;
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.frequency.value = 440;
    gain.gain.setValueAtTime(0.04, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.5);
    oscillator.onended = () => {
      void audio.close().catch(() => {});
      if (tone.current === audio) tone.current = undefined;
    };
  }, []);
  return { status, level, failure, devices, start, stop, testTone };
}
