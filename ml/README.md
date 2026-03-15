# Track'em Toys ML

On-device toy image classification using Core ML and Create ML with transfer learning. Models are trained offline and bundled into the iOS/macOS app for inference — no server-side ML.

## Status

Early stage. Training data structure and pipeline conventions are defined; model training has not yet started.

## Directory Structure

```
ml/
├── training-data/    # Labeled image folders (one per class, Create ML format)
├── models/           # Trained .mlmodel output files
├── TRAINING.md       # Training pipeline conventions and requirements
└── CLAUDE.md         # Agent rules for this module
```

## Constraints

- **Model size:** 10 MB maximum (typically ~7 MB with transfer learning)
- **Inference:** On-device only via Core ML — no server-side ML calls
- **Training scripts:** Must be idempotent, use relative paths only, contain no credentials
- **Training data:** Follows Create ML's `<class-name>/<images>` folder format

## Getting Started

See [`TRAINING.md`](TRAINING.md) for training script requirements, pipeline rules, and evaluation guidelines.

## Integration

Trained models are integrated into the iOS app via `VNCoreMLRequest`. See the iOS module's ML integration patterns in [`ios/CLAUDE.md`](../ios/CLAUDE.md).
