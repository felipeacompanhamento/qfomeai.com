export const playTumTanSound = async () => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const playNote = (frequency: number, duration: number, startTime: number) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  };

  const now = audioCtx.currentTime;
  playNote(220, 0.15, now);      // "Tum" (mais grave)
  playNote(330, 0.15, now + 0.15); // "Tan" (mais agudo)
};
