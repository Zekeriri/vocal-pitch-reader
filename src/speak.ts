import { nameToSpeech } from './pitch.ts'

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

export function speakNote(note: string): boolean {
  if (!canSpeak()) return false
  const synth = window.speechSynthesis
  const utterance = new SpeechSynthesisUtterance(nameToSpeech(note))
  utterance.lang = 'en-US'
  utterance.rate = 1.02
  const voices = synth.getVoices()
  const voice =
    voices.find((item) => item.lang === 'en-US' && item.localService) ??
    voices.find((item) => item.lang.startsWith('en'))
  if (voice) utterance.voice = voice
  try {
    synth.cancel()
    synth.speak(utterance)
  } catch {
    return false
  }
  return true
}

export function speakChinese(text: string): boolean {
  if (!canSpeak()) return false
  const synth = window.speechSynthesis
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.04
  const voice =
    synth.getVoices().find((item) => item.lang === 'zh-CN') ??
    synth.getVoices().find((item) => item.lang.toLowerCase().startsWith('zh'))
  if (voice) utterance.voice = voice
  try {
    synth.cancel()
    synth.speak(utterance)
  } catch {
    return false
  }
  return true
}

export function silenceSpeech(): void {
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
}
