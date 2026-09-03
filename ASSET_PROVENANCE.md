# Asset Provenance

This record describes how the current Lessonique companion assets were produced. It is intended to make the repository's visual-asset history reviewable without redistributing the original reference images.

## Companion assets

| Repository asset | Production record | First tracked commit | SHA-256 |
|---|---|---|---|
| `public/images/companion/lessonique-companion-normal.png` | Generated with OpenAI ImageGen from three user-provided visual references, followed by a transparency-only cleanup pass. | `c1e816c` | `0270B9B508674CF354BDC76D65A59A1BEC945A468130FC6B51E7DD234F73BC4A` |
| `public/images/companion/lessonique-companion-incompatible.png` | Generated with OpenAI ImageGen by editing the approved normal asset against the user-provided incompatible-state reference, followed by a transparency-only cleanup pass. | `c1e816c` | `CCF4A4DCC38584F552DB9ED683B696B4D20EEF605CABCE3458496C2CD4FA3C1A` |
| `public/images/companion/construction-pet-sprite.webp` | Built as a normalized 4-by-4 WebP sprite atlas from a user-provided 16-frame construction sheet using a local Sharp script. | `8e107cc` | `DAE05A2E34D5535158BF364D4BD41A43EADB7664003E997510054E029501DD47` |
| `public/images/companion/construction-pet-sprite-32f.webp` | Produced as an alternate 8-by-4 animation atlas from the approved construction sprite with OpenAI ImageGen-assisted intermediate poses and local deterministic composition. | `858c301` | `3B992FDEBBED77FC79137F79A9A3B52C4E9F6CE61BC4FD42156541B65E562F4C` |

The original reference images are not distributed in this repository. The generated and normalized assets were created during the challenge development period and committed between August 31 and September 1, 2026.

## Project owner declaration

The project owner confirms that the source visual references were created using ChatGPT's Create Image tool. Codex was then used to design and assemble the remaining Lessonique-owned derivatives, variants, sprite sheets, and related visual assets.

The project owner confirms authorization to use, modify, publish, and distribute these resulting assets as part of Lessonique. Lessonique-owned visual assets are made available under the repository's MIT License. Third-party software and assets remain subject to their respective terms.
