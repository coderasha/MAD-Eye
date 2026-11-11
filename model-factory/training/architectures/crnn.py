"""ME-04 starting architecture: CNN, bidirectional LSTM, CTC.

The module definition is MAD-EYE training code. Loading this class does not
provide recognition accuracy. Weights exist only after a training run, and a
smoke run on synthetic glyphs is not a benchmark.
"""

from __future__ import annotations

import torch
from torch import nn


class PrintedCrnn(nn.Module):
    def __init__(self, num_classes: int) -> None:
        super().__init__()
        if num_classes < 2:
            raise ValueError("CTC requires a blank plus at least one character")
        self.num_classes = num_classes
        self.cnn = nn.Sequential(
            nn.Conv2d(1, 64, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            nn.Conv2d(64, 128, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            nn.Conv2d(128, 256, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(256, 256, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d((2, 1), (2, 1)),
            nn.Conv2d(256, 512, 3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.Conv2d(512, 512, 3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True),
            nn.MaxPool2d((2, 1), (2, 1)),
            nn.Conv2d(512, 512, kernel_size=(2, 1)),
            nn.ReLU(inplace=True),
        )
        self.rnn = nn.LSTM(
            input_size=512,
            hidden_size=256,
            num_layers=2,
            bidirectional=True,
            batch_first=True,
        )
        self.classifier = nn.Linear(512, num_classes)

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        """Return logits shaped (batch, time, classes) for a (batch, 1, 32, width) tensor."""
        features = self.cnn(images)
        sequence = features.squeeze(2).permute(0, 2, 1)
        recurrent, _hidden = self.rnn(sequence)
        return self.classifier(recurrent)


def ctc_loss(logits: torch.Tensor, targets: torch.Tensor, target_lengths: torch.Tensor) -> torch.Tensor:
    log_probs = logits.log_softmax(2).permute(1, 0, 2)
    input_lengths = torch.full(
        (logits.shape[0],),
        logits.shape[1],
        dtype=torch.long,
        device=logits.device,
    )
    return nn.functional.ctc_loss(
        log_probs,
        targets,
        input_lengths,
        target_lengths,
        blank=0,
        zero_infinity=True,
    )


def greedy_decode(logits: torch.Tensor) -> list[list[int]]:
    """Collapse the argmax path by removing repeats and the blank at index 0."""
    predictions = logits.argmax(dim=-1)
    decoded: list[list[int]] = []
    for sequence in predictions.tolist():
        collapsed: list[int] = []
        previous = None
        for index in sequence:
            if index != previous and index != 0:
                collapsed.append(index)
            previous = index
        decoded.append(collapsed)
    return decoded
