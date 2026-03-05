// ── Text-to-speech ────────────────────────────────────────────────────

export const canSpeak = () => typeof window !== 'undefined' && !!window.speechSynthesis;

export function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth) { console.warn('[voice] TTS not available in this browser'); return; }

  const doSpeak = () => {
    console.log('[voice] speaking:', text);
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.05;
    utt.onerror = (e) => console.warn('[voice] TTS error:', e.error);
    synth.speak(utt);
  };

  // Safari and some browsers load voices asynchronously.
  // getVoices() returns [] until the voiceschanged event fires.
  if (synth.getVoices().length > 0) {
    doSpeak();
    return;
  }

  let fired = false;
  synth.onvoiceschanged = () => {
    if (fired) return;
    fired = true;
    synth.onvoiceschanged = null;
    doSpeak();
  };
  // Fallback: some browsers never fire voiceschanged — try after a short delay
  setTimeout(() => {
    if (fired) return;
    fired = true;
    doSpeak();
  }, 300);
}

// ── Word-to-number parser ─────────────────────────────────────────────

const ONES = [
  'zero','one','two','three','four','five','six','seven','eight','nine',
  'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
  'seventeen','eighteen','nineteen'
];
const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

export function wordsToNumber(text) {
  // Browser often returns digits directly (e.g. "350" for "three fifty")
  const stripped = text.replace(/[^0-9]/g, '');
  if (stripped) return parseInt(stripped);

  const words = text.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
  let total = 0;
  let current = 0;

  for (const word of words) {
    const oneIdx = ONES.indexOf(word);
    if (oneIdx >= 0)    { current += oneIdx; continue; }
    const tenIdx = TENS.indexOf(word);
    if (tenIdx >= 0)    { current += tenIdx * 10; continue; }
    if (word === 'hundred')  { current = (current || 1) * 100; continue; }
    if (word === 'thousand') { total = (total + (current || 1)) * 1000; current = 0; continue; }
  }

  const result = total + current;
  return result > 0 ? result : null;
}

// ── Speech recognition ────────────────────────────────────────────────

export const canRecognize = () => !!(
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)
);

/**
 * Starts a one-shot voice recognition session.
 * @param {{ onResult(transcripts: string[]), onError?(err), onEnd?() }} callbacks
 * @returns {SpeechRecognition|null}  call .abort() to cancel early
 */
export function startVoiceInput({ onResult, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn('[voice] SpeechRecognition not available (blocked by browser or not supported)');
    onError?.('not-supported');
    return null;
  }

  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.continuous = false;

  rec.onstart  = () => console.log('[voice] STT started — listening');
  rec.onresult = (e) => {
    const transcripts = Array.from(e.results[0]).map(r => r.transcript.trim());
    console.log('[voice] STT result:', transcripts);
    onResult(transcripts);
  };
  rec.onerror = (e) => {
    console.warn('[voice] STT error:', e.error);
    onError?.(e.error);
  };
  rec.onend = () => {
    console.log('[voice] STT ended');
    onEnd?.();
  };

  try {
    rec.start();
    console.log('[voice] STT rec.start() called');
  } catch (err) {
    console.warn('[voice] STT start failed:', err);
    onError?.('start-failed');
  }
  return rec;
}

// ── Diagnostics ───────────────────────────────────────────────────────

/**
 * Logs voice support info to the browser console.
 * Call this from a button click to see what's available.
 */
export function logVoiceStatus() {
  const synth = window.speechSynthesis;
  console.group('%c[voice] diagnostics', 'font-weight:bold;color:#ec4899');
  console.log('Browser:           ', navigator.userAgent);
  console.log('TTS (speechSynth): ', synth ? '✅ available' : '❌ not available');
  if (synth) {
    const voices = synth.getVoices();
    console.log('Voices loaded:     ', voices.length, voices.length === 0 ? '⚠️ (loading asynchronously — may be fine)' : '');
    if (voices.length > 0) {
      console.log('English voices:    ', voices.filter(v => v.lang.startsWith('en')).map(v => v.name).join(', ') || 'none');
    }
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  console.log('STT (SpeechRec):   ', SR ? '✅ available' : '❌ not available / blocked by browser');
  if (!SR) {
    console.log(
      '%c⚠️  Brave users: lower Shields for this site (shield icon in address bar → disable fingerprinting protection).',
      'color:orange'
    );
    console.log(
      '%c⚠️  Safari: requires HTTPS or localhost; check Preferences → Websites → Microphone.',
      'color:orange'
    );
  }
  console.groupEnd();
}

// ── Player name matcher ───────────────────────────────────────────────

/**
 * Returns the id of the first player whose name appears in `text`.
 * Strips bot-prefix tags like "[AI]" before comparing.
 */
export function matchPlayerName(text, players) {
  const t = text.toLowerCase();
  for (const p of players) {
    // Strip "[Tier] " prefix → "Cortex"
    const cleanName = p.username.replace(/^\[.*?\]\s*/, '').toLowerCase();
    if (cleanName.length > 1 && t.includes(cleanName)) return p.id;
    // Full username without brackets → "AI Cortex"
    const fullClean = p.username.replace(/[\[\]]/g, '').toLowerCase().trim();
    if (fullClean.length > 1 && t.includes(fullClean)) return p.id;
  }
  return null;
}

// ── Elimination voice command parser ─────────────────────────────────

/**
 * Parses a voice transcript for elimination mode.
 * Returns { targetId, guessValue } — either may be null.
 *
 * Supported speech patterns:
 *   "target Cortex"       → switch target to player named Cortex
 *   "target 2"            → switch to 2nd alive opponent (1-based)
 *   "Cortex"              → same as above (no keyword needed)
 *   "350"                 → set guess to 350
 *   "Cortex 350"          → target Cortex AND set guess to 350
 *   "target Cortex 350"   → same
 */
export function parseEliminationVoice(transcripts, aliveOpponents, maxNumber) {
  const result = { targetId: null, guessValue: null };

  for (const raw of transcripts) {
    const t = raw.toLowerCase().trim();

    // --- Targeting ---
    if (!result.targetId) {
      const targetKw = t.match(/target\s+(.+)/);
      if (targetKw) {
        const after = targetKw[1];
        const nameId = matchPlayerName(after, aliveOpponents);
        if (nameId) {
          result.targetId = nameId;
        } else {
          // 1-based index: "target 2" → second alive opponent
          const idx = parseInt(after.replace(/[^0-9]/g, '')) - 1;
          if (!isNaN(idx) && idx >= 0 && idx < aliveOpponents.length) {
            result.targetId = aliveOpponents[idx].id;
          }
        }
      }
      // Plain name mention (no keyword)
      if (!result.targetId) {
        result.targetId = matchPlayerName(t, aliveOpponents) ?? null;
      }
    }

    // --- Guess number ---
    if (!result.guessValue) {
      // Strip the matched player name and "target" keyword before parsing
      let remaining = t.replace(/\btarget\b/g, '');
      if (result.targetId) {
        const tp = aliveOpponents.find(p => p.id === result.targetId);
        if (tp) {
          const cn = tp.username.replace(/^\[.*?\]\s*/, '').toLowerCase();
          const fc = tp.username.replace(/[\[\]]/g, '').toLowerCase().trim();
          remaining = remaining.replace(cn, '').replace(fc, '');
        }
      }
      const num = wordsToNumber(remaining.trim());
      if (num !== null && num >= 1 && num <= maxNumber) result.guessValue = num;
    }

    if (result.targetId && result.guessValue) break;
  }

  return result;
}
