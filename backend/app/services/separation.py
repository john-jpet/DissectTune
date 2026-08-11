"""Stem separation via HTDemucs, with a fast stub path for local dev.

When settings.use_real_demucs is False (the default for local/dev environments
without a GPU), separation is mocked: each of the 4 stems is produced as a
copy of the source track so the rest of the pipeline (storage, DB, mixing UI)
can be exercised end-to-end without the heavy model download / inference cost.
Flip USE_REAL_DEMUCS=true (and run on a GPU-equipped worker) to use actual
htdemucs_ft inference.
"""
import os
import shutil
import subprocess
import tempfile

from app.config import settings

STEM_TYPES = ["vocals", "drums", "bass", "other"]


def separate_stems(input_path: str) -> dict[str, str]:
    """Returns a mapping of stem_type -> local file path for the separated stem."""
    if settings.use_real_demucs:
        return _separate_with_demucs(input_path)
    return _separate_stub(input_path)


def _separate_stub(input_path: str) -> dict[str, str]:
    out_dir = tempfile.mkdtemp(prefix="dissecttune_stub_")
    stems = {}
    for stem_type in STEM_TYPES:
        dest = os.path.join(out_dir, f"{stem_type}.wav")
        shutil.copyfile(input_path, dest)
        stems[stem_type] = dest
    return stems


def _separate_with_demucs(input_path: str) -> dict[str, str]:
    out_dir = tempfile.mkdtemp(prefix="dissecttune_demucs_")
    subprocess.run(
        [
            "python",
            "-m",
            "demucs.separate",
            "-n",
            settings.demucs_model,
            "-o",
            out_dir,
            input_path,
        ],
        check=True,
    )

    track_name = os.path.splitext(os.path.basename(input_path))[0]
    stem_dir = os.path.join(out_dir, settings.demucs_model, track_name)

    stems = {}
    for stem_type in STEM_TYPES:
        path = os.path.join(stem_dir, f"{stem_type}.wav")
        if os.path.exists(path):
            stems[stem_type] = path
    return stems
