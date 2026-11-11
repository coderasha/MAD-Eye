import pytest

torch = pytest.importorskip("torch")

from training.architectures.crnn import PrintedCrnn, ctc_loss, greedy_decode
from training.charsets.english import ENGLISH_CHARSET, charset_size, decode_indices, encode_text
from training.train_printed import smoke_train


def test_forward_and_greedy_decode() -> None:
    charset = "ab"
    model = PrintedCrnn(charset_size(charset))
    images = torch.zeros(2, 1, 32, 128)
    logits = model(images)
    assert logits.shape[0] == 2
    assert logits.shape[2] == 3
    assert logits.shape[1] >= 1
    forced = torch.full((1, 6, 3), -10.0)
    forced[0, :, 0] = 5
    forced[0, 1, 0] = -10
    forced[0, 1, 1] = 8
    forced[0, 2, 1] = 8
    forced[0, 4, 2] = 8
    decoded = greedy_decode(forced)
    assert decode_indices(decoded[0], charset) == "ab"


def test_ctc_loss_is_finite() -> None:
    charset = "ab"
    model = PrintedCrnn(charset_size(charset))
    images = torch.rand(2, 1, 32, 64)
    logits = model(images)
    targets = torch.tensor(encode_text("ab", charset) + encode_text("a", charset), dtype=torch.long)
    lengths = torch.tensor([2, 1], dtype=torch.long)
    loss = ctc_loss(logits, targets, lengths)
    assert torch.isfinite(loss)


def test_smoke_checkpoint_is_not_a_benchmark(tmp_path) -> None:
    summary = smoke_train(2, tmp_path / "me04.pt", charset="ab")
    assert summary["benchmarkValidated"] is False
    assert summary["dataset"] == "synthetic_smoke"
    assert summary["finalLoss"] is not None
    checkpoint = torch.load(tmp_path / "me04.pt", weights_only=False)
    assert checkpoint["benchmark_validated"] is False
    assert "accuracy" not in checkpoint
