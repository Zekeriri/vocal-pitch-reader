"""Build public/notes/notes.wav: one fixed-length spoken clip per note from C2 through B6."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import tempfile

from gtts import gTTS

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
FIRST_MIDI = 36
COUNT = 60
SLOT_SECONDS = 2
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'notes' / 'notes.wav'


def note_name(midi: int) -> str:
    pitch = NAMES[midi % 12]
    octave = midi // 12 - 1
    return f'{pitch}{octave}'


def spoken(name: str) -> str:
    if '#' in name:
        letter, octave = name.split('#')
        return f'{letter} sharp {octave}'
    return f'{name[0]} {name[1:]}'


def synthesize(midi: int, folder: Path) -> Path:
    name = note_name(midi)
    mp3 = folder / f'{midi}.mp3'
    gTTS(spoken(name), lang='en').save(str(mp3))
    return mp3


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as raw:
        folder = Path(raw)
        midis = list(range(FIRST_MIDI, FIRST_MIDI + COUNT))
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda midi: synthesize(midi, folder), midis))

        slots: list[Path] = []
        longest = 0.0
        for midi in midis:
            measured = subprocess.check_output(
                [
                    'ffprobe',
                    '-v',
                    'error',
                    '-show_entries',
                    'format=duration',
                    '-of',
                    'csv=p=0',
                    str(folder / f'{midi}.mp3'),
                ],
                text=True,
            ).strip()
            longest = max(longest, float(measured))
            slot = folder / f'{midi}.wav'
            subprocess.check_call(
                [
                    'ffmpeg',
                    '-y',
                    '-v',
                    'error',
                    '-i',
                    str(folder / f'{midi}.mp3'),
                    '-af',
                    f'apad=pad_dur={SLOT_SECONDS},atrim=0:{SLOT_SECONDS}',
                    '-ac',
                    '1',
                    '-ar',
                    '22050',
                    str(slot),
                ]
            )
            slots.append(slot)
        if longest >= SLOT_SECONDS - 0.05:
            raise SystemExit(f'clip is {longest:.2f}s, longer than the {SLOT_SECONDS}s slot')

        listing = folder / 'list.txt'
        listing.write_text(''.join(f"file '{slot}'\n" for slot in slots))
        subprocess.check_call(
            [
                'ffmpeg',
                '-y',
                '-v',
                'error',
                '-f',
                'concat',
                '-safe',
                '0',
                '-i',
                str(listing),
                '-c',
                'copy',
                str(OUT),
            ]
        )
        print(f'wrote {OUT} ({OUT.stat().st_size} bytes), longest clip {longest:.2f}s')
        export_mp3s(OUT)


def export_mp3s(wav: Path) -> None:
    """iPhone 播放短 mp3 比在一条长 wav 里跳转可靠。"""
    for index in range(COUNT):
        target = wav.parent / f'n{index:02d}.mp3'
        subprocess.check_call(
            [
                'ffmpeg',
                '-y',
                '-v',
                'error',
                '-ss',
                str(index * SLOT_SECONDS),
                '-t',
                str(SLOT_SECONDS),
                '-i',
                str(wav),
                '-c:a',
                'libmp3lame',
                '-b:a',
                '48k',
                '-ar',
                '22050',
                '-ac',
                '1',
                str(target),
            ]
        )
    print(f'wrote {COUNT} mp3 clips to {wav.parent}')


if __name__ == '__main__':
    main()
