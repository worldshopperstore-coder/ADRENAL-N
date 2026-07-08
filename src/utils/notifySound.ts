let audioCtx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioCtx;
}

/**
 * Tarayıcılar AudioContext'i ilk kullanıcı etkileşimine kadar "suspended"
 * tutar — bildirim sesi kullanıcı hiçbir yere tıklamadan tetiklenirse
 * (örn. karşı taraf mesaj atınca) sessiz kalır. Bu yüzden ilk tıklama/tuş/
 * dokunma anında context'i önceden "unlock" edip hazır tutuyoruz.
 */
export function unlockNotifySound() {
  const ctx = getContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

if (typeof window !== 'undefined') {
  const unlockOnce = () => {
    unlockNotifySound();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce);
  window.addEventListener('keydown', unlockOnce);
}

/** Kısa, iki notalı bildirim sesi çal (harici dosya gerekmez) */
export function playNotifySound() {
  try {
    const ctx = getContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const notes = [880, 1175]; // A5 -> D6

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch (err) {
    console.warn('[NotifySound] Ses çalınamadı:', err);
  }
}
