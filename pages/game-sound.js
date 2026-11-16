// Original, synthesized wooden taps. No third-party sound recordings are used.
export function createGameSound(win) {
  let context = null, noise = null;
  function prime() {
    try {
      const AudioContext = win.AudioContext || win.webkitAudioContext;
      if (!AudioContext) return;
      context ||= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  function play(kind = 'move') {
    try {
      prime(); if (!context || context.state !== 'running') return;
      const t = context.currentTime;
      if (!noise) {
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .055), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      const tap = (offset, freq, volume) => {
        const oscillator = context.createOscillator(), tone = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(freq, t + offset);
        oscillator.frequency.exponentialRampToValueAtTime(freq * .55, t + offset + .06);
        tone.gain.setValueAtTime(.0001, t + offset); tone.gain.exponentialRampToValueAtTime(volume, t + offset + .003);
        tone.gain.exponentialRampToValueAtTime(.0001, t + offset + .095);
        oscillator.connect(tone); tone.connect(context.destination); oscillator.start(t + offset); oscillator.stop(t + offset + .1);
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
        source.buffer = noise; filter.type = 'lowpass'; filter.frequency.value = kind === 'capture' ? 1700 : 1200;
        envelope.gain.setValueAtTime(.0001, t + offset); envelope.gain.exponentialRampToValueAtTime(volume * .55, t + offset + .002);
        envelope.gain.exponentialRampToValueAtTime(.0001, t + offset + .045);
        source.connect(filter); filter.connect(envelope); envelope.connect(context.destination); source.start(t + offset); source.stop(t + offset + .05);
      };
      tap(0, kind === 'capture' ? 260 : 340, .09);
      if (kind === 'capture') tap(.035, 185, .055);
      if (kind === 'check') tap(.045, 460, .045);
    } catch { /* Audio support differs across browsers. */ }
  }
  return { prime, play, destroy: () => { if (context) void context.close(); } };
}
