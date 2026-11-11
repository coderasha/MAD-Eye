import cv2
import numpy as np
from scipy import ndimage

from services.preprocessing import operations, quality
from services.preprocessing.pipeline import PreprocessOptions, process_page, process_pages


def _lined(width: int = 320, height: int = 200) -> np.ndarray:
    image = np.full((height, width), 255, dtype=np.uint8)
    for y in range(30, height - 20, 24):
        image[y : y + 3, 20 : width - 20] = 0
    return image


def test_blur_orders_sharp_above_defocused() -> None:
    sharp = _lined()
    blurred = cv2.GaussianBlur(sharp, (31, 31), 0)
    assert quality.blur_variance(sharp) > quality.blur_variance(blurred) * 5
    assert quality.blur_level(quality.blur_variance(sharp)) == "sharp"
    assert quality.blur_level(quality.blur_variance(blurred)) == "blurry"


def test_noise_score_rises_with_salt() -> None:
    clean = _lined()
    noisy = clean.copy()
    rng = np.random.default_rng(7)
    mask = rng.random(clean.shape) > 0.95
    noisy[mask] = rng.integers(0, 256, size=int(mask.sum()), dtype=np.uint8)
    assert quality.noise_score(noisy) > quality.noise_score(clean) * 3


def test_skew_estimation_and_deskew() -> None:
    original = _lined()
    rotated = ndimage.rotate(original, 7, reshape=False, order=1, cval=255).astype(np.uint8)
    skew = quality.estimate_skew_degrees(rotated)
    assert abs(skew - 7) < 1.0
    corrected = operations.rotate_image(rotated, -skew)
    residual = quality.estimate_skew_degrees(corrected)
    assert abs(residual) < 1.0


def test_clean_page_skips_denoise_and_deskew() -> None:
    result = process_page(_lined(), PreprocessOptions())
    assert result.status == "COMPLETED"
    assert result.plan is not None
    assert "denoise" in result.plan.skipped
    assert "deskew" in result.plan.skipped
    assert "contrast" in result.plan.skipped
    assert "low_contrast" not in result.quality.degradation_flags
    assert result.provenance.benchmark_validated is False
    assert result.provenance.model_code is None
    assert result.quality is not None
    assert result.quality.upside_down_resolved is False


def test_faint_ink_plans_contrast() -> None:
    image = np.full((160, 240), 190, dtype=np.uint8)
    image[40:48, 30:180] = 170
    result = process_page(image, PreprocessOptions())
    assert result.plan is not None
    assert "contrast" in result.plan.operations
    assert result.quality is not None
    assert "low_contrast" in result.quality.degradation_flags


def test_skewed_page_plans_deskew() -> None:
    rotated = ndimage.rotate(_lined(), 6, reshape=False, order=1, cval=255).astype(np.uint8)
    result = process_page(rotated, PreprocessOptions())
    assert result.plan is not None
    assert "deskew" in result.plan.operations


def test_sideways_is_reported_and_not_rotated() -> None:
    vertical = np.full((200, 320), 255, dtype=np.uint8)
    for x in range(30, 300, 24):
        vertical[20:180, x : x + 3] = 0
    result = process_page(vertical, PreprocessOptions())
    assert result.quality is not None
    assert result.quality.orientation_degrees == 90
    assert result.plan is not None
    assert "orientation_rotation" in result.plan.skipped


def test_illumination_correction_flattens_a_gradient() -> None:
    gradient = np.tile(np.linspace(40, 210, 240, dtype=np.float32), (160, 1))
    image = gradient.astype(np.uint8)
    image[40:120, 80:160] = 20
    before = quality.shadow_score(image)
    corrected = operations.correct_illumination(image)
    assert quality.shadow_score(corrected) < before


def test_one_empty_page_does_not_drop_the_others() -> None:
    pages, errors = process_pages([_lined(), np.array([], dtype=np.uint8), _lined()], PreprocessOptions())
    assert [page.status for page in pages] == ["COMPLETED", "FAILED", "COMPLETED"]
    assert len(errors) == 1
    assert errors[0].page_index == 1


def test_binarized_derivative_is_optional() -> None:
    plain = process_page(_lined(), PreprocessOptions())
    assert plain.output is not None
    assert plain.output.derivatives == []
    with_binary = process_page(_lined(), PreprocessOptions(include_binarized=True))
    assert with_binary.output is not None
    assert with_binary.output.derivatives[0].kind == "binarized"


def test_experimental_unsharp_stays_off() -> None:
    blurred = cv2.GaussianBlur(_lined(), (31, 31), 0)
    result = process_page(blurred, PreprocessOptions())
    assert result.plan is not None
    assert "experimental_unsharp" in result.plan.skipped
