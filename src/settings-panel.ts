import { playMidiSequence } from './scale-player.ts'
import { subscribeSettings, updateSettings, type PracticeSettings } from './settings.ts'
import { type TimbreId } from './timbre.ts'

const holdInput = document.querySelector<HTMLInputElement>('#hold')!
const holdValue = document.querySelector<HTMLElement>('#hold-value')!
const gateInput = document.querySelector<HTMLInputElement>('#gate')!
const gateValue = document.querySelector<HTMLElement>('#gate-value')!
const previewButton = document.querySelector<HTMLButtonElement>('#timbre-preview')!
const statusEl = document.querySelector<HTMLElement>('#settings-status')!
const timbreButtons = document.querySelectorAll<HTMLButtonElement>('[data-timbre]')

let preview: AbortController | null = null

holdInput.addEventListener('input', () => {
  updateSettings({ holdMs: Number(holdInput.value) })
})

gateInput.addEventListener('input', () => {
  updateSettings({ gate: Number(gateInput.value) })
})

for (const button of timbreButtons) {
  button.addEventListener('click', () => {
    const timbre = button.dataset.timbre
    if (timbre) updateSettings({ timbre: timbre as TimbreId })
  })
}

previewButton.addEventListener('click', () => {
  void previewTimbre()
})

subscribeSettings(paint)

export function stopSettingsPreview(): void {
  preview?.abort()
  preview = null
  previewButton.disabled = false
  previewButton.textContent = '试听这个音色'
}

async function previewTimbre(): Promise<void> {
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
      statusEl.textContent = error instanceof Error ? error.message : '这个音色没有播出来。'
    }
  } finally {
    if (preview === controller) {
      preview = null
      previewButton.disabled = false
      previewButton.textContent = '试听这个音色'
    }
  }
}

function paint(settings: PracticeSettings): void {
  holdInput.value = String(settings.holdMs)
  holdValue.textContent = `${(settings.holdMs / 1000).toFixed(2)} 秒`
  gateInput.value = String(settings.gate)
  gateValue.textContent = gateLabel(settings.gate)
  for (const button of timbreButtons) {
    button.setAttribute('aria-pressed', button.dataset.timbre === settings.timbre ? 'true' : 'false')
  }
}

function gateLabel(gate: number): string {
  if (gate <= 5) return '灵敏'
  if (gate <= 14) return '适中'
  return '只收较响的声音'
}
