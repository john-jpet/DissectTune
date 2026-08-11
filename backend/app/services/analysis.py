"""Librosa-based BPM and musical key estimation."""
import numpy as np

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler key profiles
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def analyze_bpm_and_key(audio_path: str) -> tuple[float, str]:
    import librosa

    y, sr = librosa.load(audio_path, sr=None, mono=True)

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)

    best_score = -np.inf
    best_key = "C"
    for shift in range(12):
        major_corr = np.corrcoef(np.roll(MAJOR_PROFILE, shift), chroma_mean)[0, 1]
        minor_corr = np.corrcoef(np.roll(MINOR_PROFILE, shift), chroma_mean)[0, 1]

        if major_corr > best_score:
            best_score = major_corr
            best_key = NOTE_NAMES[shift]
        if minor_corr > best_score:
            best_score = minor_corr
            best_key = f"{NOTE_NAMES[shift]}m"

    return round(bpm, 1), best_key
