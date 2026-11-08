import { playMidiSequence } from './scale-player.ts'
import { silenceSpeech } from './speak.ts'
import { subscribeSettings, updateSettings, type PracticeSettings } from './settings.ts'

const holdInput = document.querySelector<HTMLInputElement>('#hold')!
const holdValue = document.querySelector<HTMLElement>('#hold-value')!
const gateInput = document.querySelector<HTMLInputElement>('#gate')!
const gateValue = document.querySelector<HTMLElement>('#gate-value')!
const noteInput = document.querySelector<HTMLInputElement>('#note-length')!
const noteValue = document.querySelector<HTMLElement>('#note-length-value')!
const volumeInput = document.querySelector<HTMLInputElement>('#piano-volume')!
const volumeValue = document.querySelector<HTMLElement>('#piano-volume-value')!
const voiceInput = document.querySelector<HTMLInputElement>('#voice-prompts')!
const previewButton = document.querySelector<HTMLButtonElement>('#piano-preview')!
const statusEl = document.querySelector<HTMLElement>('#settings-status')!

let preview: AbortController | null = null

holdInput.addEventListener('input', () => {
  updateSettings({ holdMs: Number(holdInput.value) })
})

gateInput.addEventListener('input', () => {
  updateSettings({ gate: Number(gateInput.value) })
})

noteInput.addEventListener('input', () => {
  updateSettings({ noteSeconds: Number(noteInput.value) })
})

volumeInput.addEventListener('input', () => {
  updateSettings({ pianoVolume: Number(volumeInput.value) })
})

voiceInput.addEventListener('change', () => {
  updateSettings({ voicePrompts: voiceInput.checked })
  if (!voiceInput.checked) silenceSpeech()
})

previewButton.addEventListener('click', () => {
  void previewPiano()
})

subscribeSettings(paint)

export function stopSettingsPreview(): void {
  preview?.abort()
  preview = null
  previewButton.disabled = false
  previewButton.textContent = '试听钢琴'
}

async function previewPiano(): Promise<void> {
  preview?.abort()
  const controller = new AbortController()
  preview = controller
  previewButton.disabled = true
  previewButton.textContent = '正在试听…'
  statusEl.textContent = ''
  try {
    await playMidiSequence([60, 64, 67], () => {}, controller.signal)
  } catch (error) {
    if (!controller.signal.aborted) {
      statusEl.textContent = error instanceof Error ? error.message : '钢琴没有播出来。'
    }
  } finally {
    if (preview === controller) {
      preview = null
      previewButton.disabled = false
      previewButton.textContent = '试听钢琴'
    }
  }
}

function paint(settings: PracticeSettings): void {
  holdInput.value = String(settings.holdMs)
  holdValue.textContent = `${(settings.holdMs / 1000).toFixed(2)} 秒`
  gateInput.value = String(settings.gate)
  gateValue.textContent = gateLabel(settings.gate)
  noteInput.value = String(settings.noteSeconds)
  noteValue.textContent = `${settings.noteSeconds.toFixed(1)} 秒`
  volumeInput.value = String(settings.pianoVolume)
  volumeValue.textContent = `${settings.pianoVolume}%`
  voiceInput.checked = settings.voicePrompts
}

function gateLabel(gate: number): string {
  if (gate <= 5) return '灵敏'
  if (gate <= 14) return '适中'
  return '只收较响的声音'
}
