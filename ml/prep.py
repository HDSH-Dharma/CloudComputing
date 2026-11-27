"""Builds the classifier dataset <out>/{train,val,test}/{failure,normal}/ from Roboflow exports and own video frames.

Splits are made per group (one original photo, or one source video), so Roboflow's augmented copies of a photo
and neighbouring frames of a video never end up in both train and test. That would make the test score look
better than the model really is.

Self-check: python ml/prep.py
"""
import hashlib
import random
import re
import shutil
import tempfile
from pathlib import Path

import yaml

CLASSES = ("failure", "normal")
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
VAL_SHARE = TEST_SHARE = 0.15
MAX_RATIO = 3  # the bigger class keeps at most 3x the images of the smaller one, so the model can't just always say "failure"


def group_key(path: Path) -> str:
    """Name of the original photo or video a file came from."""
    stem = path.stem.split(".rf.")[0]  # Roboflow: imag-61-_jpg.rf.<hash>.jpg
    stem = re.sub(r"_(jpe?g|png|webp)$", "", stem)
    return re.sub(r"(_f\d+|_mp4-\d+)$", "", stem)  # video frames: clip_f0012.jpg, Error_1_Failed_mp4-0186.jpg


def images(folder: Path):
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMAGE_EXT)


def from_detection(export: Path, fail_names: set[str]) -> list[tuple[Path, str]]:
    """Roboflow "yolov8" export: an image is "failure" when it has a box of a failure class. Others are skipped."""
    names = yaml.safe_load((export / "data.yaml").read_text())["names"]
    names = list(names.values()) if isinstance(names, dict) else names
    fail_ids = {str(i) for i, n in enumerate(names) if n.lower() in fail_names}
    out = []
    for img in images(export):
        label = img.parent.parent / "labels" / f"{img.stem}.txt"
        ids = {line.split()[0] for line in label.read_text().splitlines() if line.strip()} if label.exists() else set()
        if ids & fail_ids:
            out.append((img, "failure"))
    return out


def from_folders(export: Path, mapping: dict[str, str]) -> list[tuple[Path, str]]:
    """Roboflow "folder" export or own frames: <split>/<ClassName>/*.jpg or <ClassName>/*.jpg."""
    return [(img, mapping[img.parent.name]) for img in images(export) if img.parent.name in mapping]


def build(items: list[tuple[Path, str]], out: Path) -> dict[str, dict[str, int]]:
    """Copies items into out/{train,val,test}/<class>/ and returns the counts."""
    shutil.rmtree(out, ignore_errors=True)
    groups: dict[str, dict[str, list[Path]]] = {c: {} for c in CLASSES}
    for path, cls in items:
        groups[cls].setdefault(group_key(path), []).append(path)

    # Balance by dropping whole groups (seeded, so every run gives the same dataset).
    sizes = {c: sum(len(v) for v in groups[c].values()) for c in CLASSES}
    limit = min(sizes.values()) * MAX_RATIO
    rng = random.Random(0)
    for c in CLASSES:
        keys = sorted(groups[c])
        rng.shuffle(keys)
        kept, total = {}, 0
        for k in keys:
            if limit and total >= limit:
                break
            kept[k] = groups[c][k]
            total += len(kept[k])
        groups[c] = kept

    counts = {s: {c: 0 for c in CLASSES} for s in ("train", "val", "test")}
    for c in CLASSES:
        keys = sorted(groups[c], key=lambda k: hashlib.md5(k.encode()).hexdigest())
        n = len(keys)
        n_test = max(1, round(n * TEST_SHARE)) if n >= 3 else 0
        n_val = max(1, round(n * VAL_SHARE)) if n >= 3 else 0
        for i, k in enumerate(keys):
            split = "test" if i < n_test else "val" if i < n_test + n_val else "train"
            dest = out / split / c
            dest.mkdir(parents=True, exist_ok=True)
            for j, src in enumerate(groups[c][k]):
                shutil.copy(src, dest / f"{hashlib.md5(str(src).encode()).hexdigest()[:10]}_{j}{src.suffix.lower()}")
                counts[split][c] += 1
    return counts


def _self_check():
    assert group_key(Path("imag-61-_jpg.rf.abc123.jpg")) == "imag-61-"
    assert group_key(Path("imag-61-_jpg.rf.zzz999.jpg")) == "imag-61-"
    assert group_key(Path("Error_1_Failed_mp4-0186.jpg")) == "Error_1_Failed"
    assert group_key(Path("myprint_f0012.jpg")) == "myprint"
    assert group_key(Path("spaghetti_35.jpg")) == "spaghetti_35"

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        items = []
        for g in range(20):  # 20 photos x 3 augmented copies
            for a in range(3):
                p = root / "src" / f"photo{g}_jpg.rf.{a}.jpg"
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(b"x")
                items.append((p, "failure"))
        for v in range(6):  # 6 videos x 10 frames
            for f in range(10):
                p = root / "own" / "normal" / f"video{v}_f{f:04d}.jpg"
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(b"x")
                items.append((p, "normal"))
        counts = build(items, root / "data")
        assert all(counts[s][c] > 0 for s in counts for c in CLASSES), counts
        assert sum(counts[s]["failure"] for s in counts) == 60  # 60 <= 3 x 60 normal, nothing dropped
        assert all(counts[s][c] % (3 if c == "failure" else 10) == 0 for s in counts for c in CLASSES), "a group was split"
    print("prep.py self-check ok")


if __name__ == "__main__":
    _self_check()
