"""Unit tests for common.py utilities."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import pytest
import torch
from PIL import Image

# Add scripts/ to path so common can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common import (
    build_label_map,
    build_model,
    generate_model_stem,
    get_transforms,
    load_checkpoint,
    parse_label,
    save_checkpoint,
    validate_class_dirs,
)


def test_parse_label_standard():
    result = parse_label("transformers__optimus-prime")
    assert result == {"franchise": "transformers", "item": "optimus-prime"}


def test_parse_label_no_delimiter():
    result = parse_label("some-item")
    assert result == {"franchise": "", "item": "some-item"}


def test_parse_label_multiple_delimiters():
    result = parse_label("franchise__item__extra")
    assert result == {"franchise": "franchise", "item": "item__extra"}


def test_generate_model_stem_format():
    stem = generate_model_stem("primary", 45, 84.3)
    # Format: {category}-classifier-{YYYYMMDD}-c{N}-a{acc}
    parts = stem.split("-")
    assert parts[0] == "primary"
    assert parts[1] == "classifier"
    assert len(parts[2]) == 8  # YYYYMMDD
    assert parts[2].isdigit()
    assert parts[3].startswith("c")
    assert parts[3] == "c45"
    assert stem.endswith("a84.3")


def test_build_label_map():
    class_to_idx = {
        "transformers__optimus-prime": 0,
        "transformers__bumblebee": 1,
    }
    result = build_label_map(class_to_idx)

    assert result["label_map"][0] == "transformers__optimus-prime"
    assert result["label_map"][1] == "transformers__bumblebee"
    assert result["label_hierarchy"][0] == {
        "franchise": "transformers",
        "item": "optimus-prime",
    }
    assert result["label_hierarchy"][1] == {
        "franchise": "transformers",
        "item": "bumblebee",
    }


def test_get_transforms_output_shape():
    """Both transform pipelines produce (3, 224, 224) tensors."""
    img = Image.new("RGB", (300, 400), color=(128, 64, 32))

    train_t = get_transforms(training=True)
    result = train_t(img)
    assert result.shape == (3, 224, 224)

    val_t = get_transforms(training=False)
    result = val_t(img)
    assert result.shape == (3, 224, 224)


def test_build_model_output_shape():
    """Model produces correct number of output classes."""
    model = build_model(10)

    dummy = torch.randn(1, 3, 224, 224)
    with torch.no_grad():
        output = model(dummy)

    assert output.shape == (1, 10)


def test_build_model_custom_classes():
    """Model classifier head matches requested class count."""
    model = build_model(247)
    assert model.classifier[3].out_features == 247


def test_save_load_checkpoint_roundtrip():
    """Checkpoint save/load preserves all keys."""
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "test.pt"
        state = {
            "epoch": 5,
            "model_state_dict": {"layer.weight": torch.randn(3, 3)},
            "class_to_idx": {"a__b": 0, "c__d": 1},
            "best_val_acc": 0.85,
            "category": "primary",
        }
        save_checkpoint(path, state)
        loaded = load_checkpoint(path)

        assert loaded["epoch"] == 5
        assert loaded["best_val_acc"] == 0.85
        assert loaded["category"] == "primary"
        assert set(loaded["class_to_idx"].keys()) == {"a__b", "c__d"}
        assert torch.allclose(
            loaded["model_state_dict"]["layer.weight"],
            state["model_state_dict"]["layer.weight"],
        )


def test_validate_class_dirs_valid(tmp_path):
    """Valid class directories pass validation."""
    (tmp_path / "transformers__optimus-prime").mkdir()
    (tmp_path / "transformers__bumblebee").mkdir()

    result = validate_class_dirs(tmp_path)
    assert "transformers__optimus-prime" in result
    assert "transformers__bumblebee" in result


def test_validate_class_dirs_no_delimiter(tmp_path):
    """Directories without __ delimiter cause exit."""
    (tmp_path / "bad-name").mkdir()

    with pytest.raises(SystemExit) as exc_info:
        validate_class_dirs(tmp_path)
    assert exc_info.value.code == 2


def test_validate_class_dirs_empty(tmp_path):
    """Empty directory causes exit."""
    with pytest.raises(SystemExit) as exc_info:
        validate_class_dirs(tmp_path)
    assert exc_info.value.code == 2
