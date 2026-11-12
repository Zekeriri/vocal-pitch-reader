import { nameToSpeech } from './pitch.ts'
import { readSettings } from './settings.ts'

let speechGen = 0
let heardUntil = 0

export function prepareSpeech(): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.getVoices()
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    window.speechSynthesis.getVoices()
  })
}

export function canSpeak(): boolean {
  return 'speechSynthesis' in window
}

export function appIsSpeaking(): boolean {
  return performance.now() < heardUntil
}

export function speakNote(note: string): boolean {
  if (!canSpeak() || !readSettings().voicePrompts) return false
  const synth = window.speechSynthesis
  const spoken = nameToSpeech(note)
  const utterance = new SpeechSynthesisUtterance(spoken)
  utterance.lang = 'en-US'
  utterance.rate = 1.02
  armSpeech(utterance, spoken)
  const voices = synth.getVoices()
  const voice =
    voices.find((item) => item.lang === 'en-US' && item.localService) ??
    voices.find((item) => item.lang.startsWith('en'))
  if (voice) utterance.voice = voice
  try {
    synth.cancel()
    synth.speak(utterance)
  } catch {
    silenceSpeech()
    return false
  }
  return true
}

export function speakChinese(text: string): boolean {
  if (!canSpeak() || !readSettings().voicePrompts) return false
  const synth = window.speechSynthesis
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.04
  armSpeech(utterance, text)
  const voice =
    synth.getVoices().find((item) => item.lang === 'zh-CN') ??
    synth.getVoices().find((item) => item.lang.toLowerCase().startsWith('zh'))
  if (voice) utterance.voice = voice
  try {
    synth.cancel()
    synth.speak(utterance)
  } catch {
    silenceSpeech()
    return false
  }
  return true
}

export function silenceSpeech(): void {
  speechGen += 1
  heardUntil = 0
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
}

function armSpeech(utterance: SpeechSynthesisUtterance, text: string): void {
  const gen = ++speechGen
  heardUntil = performance.now() + Math.min(2500, 600 + text.length * 140)
  const done = () => {
    if (gen === speechGen) heardUntil = 0
  }
  utterance.onend = done
  utterance.onerror = done
}
