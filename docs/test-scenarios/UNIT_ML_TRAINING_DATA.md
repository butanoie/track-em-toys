# UNIT: ML Training Data Preparation

## Background

Given the ml module is installed
And a valid manifest JSON exists with photo entries

## Scenarios

### Directory Scanning

#### Happy Path: Scan training tiers (excludes catalog)

```gherkin
Scenario: Discover images from training tiers only (excludes catalog)
  Given a source directory with catalog/, training-primary/, and training-secondary/ tiers
  And training-primary/transformers/mmc/r-03-bovis/ has 3 images
  And training-secondary/transformers/mmc/r-03-bovis/ has 1 image
  And catalog/transformers/mmc/r-03-bovis/ has 3 images
  When scanSourceDir is called
  Then it returns a Manifest with 4 entries for label "transformers/r-03-bovis"
  And no entries reference catalog/ paths
```

#### Happy Path: Correct label format

```gherkin
Scenario: Labels use franchise/item-slug format
  Given a source directory with catalog/transformers/fanstoys/ft-04-scoria/ containing 1 image
  When scanSourceDir is called
  Then the entry label is "transformers/ft-04-scoria"
  And franchise_slug is "transformers"
  And item_slug is "ft-04-scoria"
```

#### Skip: Unmatched directories ignored

```gherkin
Scenario: _unmatched directories are skipped
  Given a source directory with _unmatched/ containing images
  When scanSourceDir is called
  Then no entries reference _unmatched paths
```

#### Skip: Non-image files ignored

```gherkin
Scenario: Non-image files in item directories are skipped
  Given an item directory containing both .jpeg and .txt files
  When scanSourceDir is called
  Then only .jpeg entries are included
```

#### Error: Empty source directory

```gherkin
Scenario: Throw when no images found
  Given an empty source directory
  When scanSourceDir is called
  Then it throws an error mentioning "No images found"
```

#### Happy Path: Category filter scans single tier

```gherkin
Scenario: Category filter scans only the matching tier
  Given a source directory with training-primary/ and training-secondary/ tiers
  When scanSourceDir is called with category "primary"
  Then it returns entries only from training-primary/
  And all entries have category "primary"
```

#### Happy Path: Category filter with testSet

```gherkin
Scenario: Category filter works with testSet
  Given a source directory with test-primary/ and test-secondary/ tiers
  When scanSourceDir is called with testSet and category "primary"
  Then it returns entries only from test-primary/
```

#### Happy Path: Entries include category metadata

```gherkin
Scenario: Populates category from tier name
  Given a source directory with training-primary/ and training-secondary/ tiers
  When scanSourceDir is called
  Then entries from training-primary/ have category "primary"
  And entries from training-secondary/ have category "secondary"
```

#### Error: Category filter with no matching images

```gherkin
Scenario: Category filter with no matching images throws
  Given a source directory with no training-package/ tier
  When scanSourceDir is called with category "package"
  Then it throws an error mentioning "No images found"
```

#### Graceful: Missing tier

```gherkin
Scenario: Missing training tiers do not cause failure
  Given a source directory with only training-primary/ (no other training tiers)
  When scanSourceDir is called
  Then it returns entries from training-primary/ only
```

### Manifest Parsing

#### Happy Path: Valid manifest parses correctly

```gherkin
Scenario: Parse a valid manifest file
  Given a manifest JSON with version 1 and 2 entries
  When readManifest is called with the file path
  Then it returns a Manifest object with entries and stats
```

#### Happy Path: Group entries by label

```gherkin
Scenario: Group manifest entries by their label
  Given 5 entries with label "transformers__commander-stack"
  And 3 entries with label "transformers__margh"
  When groupEntriesByLabel is called
  Then it returns a Map with 2 keys
  And "transformers__commander-stack" has 5 entries
  And "transformers__margh" has 3 entries
```

#### Error: Invalid manifest version

```gherkin
Scenario: Reject manifest with unsupported version
  Given a manifest JSON with version 2
  When readManifest is called
  Then it throws an error mentioning "version 2 is not supported"
```

#### Error: Missing entries array

```gherkin
Scenario: Reject manifest with no entries
  Given a manifest JSON with an empty entries array
  When readManifest is called
  Then it throws an error mentioning "no entries"
```

#### Error: Entry missing photo_path

```gherkin
Scenario: Reject manifest entry without photo_path
  Given a manifest JSON where entry 0 has no photo_path
  When readManifest is called
  Then it throws an error mentioning "photo_path" and the entry index
```

### Balance Analysis

#### Happy Path: Balanced classes

```gherkin
Scenario: Analyze two classes with similar photo counts
  Given class A has 18 entries and class B has 19 entries
  And target count is 100
  When analyzeBalance is called
  Then class A augmentCount is 82
  And class B augmentCount is 81
  And min is 18 and max is 19
  And mean is 18.5
```

#### Edge: Class already at target

```gherkin
Scenario: Class with enough photos needs no augmentation
  Given class A has 150 entries
  And target count is 100
  When analyzeBalance is called
  Then class A augmentCount is 0
```

#### Edge: Class below viable minimum

```gherkin
Scenario: Class with very few photos triggers viability warning
  Given class A has 3 entries
  And target count is 100
  When analyzeBalance is called
  Then class A has an imbalance warning mentioning "Low source"
```

### Transforms

#### Happy Path: Each transform produces valid WebP

```gherkin
Scenario: All registered transforms produce valid output
  Given a 10x10 white WebP image buffer
  When each transform in TRANSFORMS is applied
  Then each output is a non-empty Buffer
  And each output is valid WebP (starts with RIFF header)
```

#### Happy Path: Compound transforms apply multiple operations

```gherkin
Scenario: Compound transform applies flip and rotation
  Given a 100x100 WebP image buffer
  When the "hflip-rotate-cw" transform is applied
  Then the output differs from both flip-only and rotate-only output
```

#### Determinism: Same input produces same output

```gherkin
Scenario: Transforms are deterministic
  Given a 10x10 WebP image buffer
  When the same transform is applied twice to the same input
  Then both outputs are byte-identical
```

### Augmentation

#### Happy Path: Augment to target count

```gherkin
Scenario: Augment a class from 19 to 100 images
  Given 19 manifest entries for a class
  And target count is 100
  When augmentClass is called with the transform registry
  Then it produces 81 augmented images
  And each has a deterministic filename with "aug-" prefix
```

#### Edge: Zero augmentation needed

```gherkin
Scenario: Class already at target produces no augmented images
  Given 120 manifest entries for a class
  And target count is 100
  When augmentClass is called
  Then it produces 0 augmented images
```

#### Error: Corrupt source image skipped

```gherkin
Scenario: Corrupt source is skipped with warning
  Given 5 manifest entries where entry 2 points to a corrupt file
  And target count is 10
  When augmentClass is called
  Then it produces augmented images from the remaining 4 sources
  And it logs a warning about the corrupt file
```

#### Determinism: Same manifest produces same filenames

```gherkin
Scenario: Augmented filenames are deterministic
  Given the same manifest entries and target count
  When augmentClass is called twice
  Then both runs produce identical filename sets
```

### File Copy

#### Happy Path: Copy originals to class directory

```gherkin
Scenario: Copy source photos into output structure
  Given 3 source WebP files at known paths
  And an output directory
  When copyClass is called with label "transformers__margh"
  Then directory "{output}/transformers__margh/" is created
  And 3 files are copied into it
```

#### Happy Path: Write augmented files

```gherkin
Scenario: Write augmented buffers to disk
  Given 2 augmented images with filenames
  And an output directory with label "transformers__margh"
  When copyClass writes the augmented images
  Then 2 augmented WebP files exist in the class directory
```

#### Idempotency: Re-run overwrites cleanly

```gherkin
Scenario: Re-run produces identical output
  Given a previous run populated the class directory
  When copyClass is called again with clean mode
  Then old files are removed first
  And the output matches a fresh run
```

#### Error: Source file not found

```gherkin
Scenario: Missing source file is recorded as error
  Given a manifest entry pointing to a non-existent file
  When copyClass attempts to copy it
  Then it records a CopyError with the path
  And continues processing remaining files
```

### Output Validation

#### Happy Path: Valid Create ML structure

```gherkin
Scenario: Validate a correctly structured output directory
  Given an output directory with 2 class subdirectories
  And each contains only .webp files
  When validateOutputStructure is called
  Then it returns valid=true with no errors
```

#### Error: Empty class directory

```gherkin
Scenario: Empty class directory fails validation
  Given an output directory with class "transformers__margh" containing no files
  When validateOutputStructure is called
  Then it returns valid=false
  And errors mention the empty class
```

#### Warning: Unexpected directories

```gherkin
Scenario: Extra directories not in manifest trigger warning
  Given an output directory with 3 class directories
  But the manifest only has 2 labels
  When validateOutputStructure is called
  Then it warns about the unexpected directory
```

#### Error: Class below minimum image count

```gherkin
Scenario: Class with fewer than 10 images fails validation
  Given a class directory with 5 images
  When validateOutputStructure is called
  Then it returns valid=false
  And errors mention minimum 10 images required
```
