import unicodedata

from evaluation.metrics import build_report, cer, grapheme_clusters, wer


def test_perfect_measurement_is_not_a_benchmark() -> None:
    report = build_report([("alpha", "alpha"), ("beta gamma", "beta gamma")])
    assert report["cer"] == 0
    assert report["wer"] == 0
    assert report["benchmarkValidated"] is False
    assert report["measured"] is True


def test_known_error_rates() -> None:
    assert cer("abcd", "abxd") == 0.25
    assert wer("one two three", "one two") == 1 / 3


def test_devanagari_grapheme_cluster() -> None:
    assert grapheme_clusters("की") == ["की"]
    assert len("की") == 2
    composed = unicodedata.normalize("NFC", "क" + "\u093c")
    assert composed == "क़"
    assert grapheme_clusters(composed) == ["क़"]
