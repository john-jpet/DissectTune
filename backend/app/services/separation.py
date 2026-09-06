"""Four-stem separation; output lifetime belongs to the calling task."""
import os
import subprocess
import sys
from app.config import settings

STEM_TYPES = ["vocals", "drums", "bass", "other"]


def separate_stems(input_path: str, out_dir: str) -> dict[str, str]:
    if settings.use_real_demucs:
        subprocess.run([sys.executable, "-m", "demucs.separate", "-n",
            settings.demucs_model, "-o", out_dir, input_path],
            check=True, timeout=3600)
        stem_dir = os.path.join(out_dir, settings.demucs_model,
            os.path.splitext(os.path.basename(input_path))[0])
    else:
        import shutil
        stem_dir = os.path.join(out_dir, "demo")
        os.makedirs(stem_dir, exist_ok=True)
        first = os.path.join(stem_dir, "vocals.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", input_path,
            "-ar", "44100", "-ac", "2", first], check=True, timeout=120)
        for name in STEM_TYPES[1:]:
            shutil.copyfile(first, os.path.join(stem_dir, name + ".wav"))
    paths = {name: os.path.join(stem_dir, name + ".wav") for name in STEM_TYPES}
    import soundfile as sf
    for path in paths.values():
        info = sf.info(path)
        if info.frames == 0:
            raise ValueError("Separation produced empty audio")
    return paths
