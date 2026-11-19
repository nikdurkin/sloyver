Sloyver 1.8.0 — guided interface verification, 2026-10-28

196 automated tests passed (0 failed/skipped). The new guided navigation modules and stylesheet retain the existing controls and physical inputs. Navigation labels are 20 px, main panel headings 27 px, primary buttons 16 px. The detailed UI checks, compatibility and limitations are recorded in validation-1.8.0.json.

Browser QA used local synthetic projects, not user/customer production parts. It included real load checking, a local-reinforcement rerun, manual PETG HF selection, restoration, incomplete conditions, explicit skip, nested direction controls, hole actions, RU/EN and both themes. The desktop native save path and Windows launch were not exercised in this Linux environment. A 3MF dialog with the current recipe and modifier was observed; browser download bytes were not independently captured.

package-checks-1.8.0.json verifies all 84 packaged source/data/asset/doc files (package.json semantically), Windows x64 PE metadata, both portable archive CRCs, and the actual embedded ASAR against the verified unpacked application. Reproduce after npm ci and build:win with node verification/verify-release.cjs /absolute/path/to/7zz. No Windows execution is implied by these checks.

guided-fixture.mjs generates a synthetic beam with one clamp and a 1000 N transverse load. It is only a software regression example, not a calibrated printed specimen. Physical calculations/data listed in validation-1.8.0.json are byte-identical to the 1.7.2 baseline. No printed strength test or new vendor slicer regression was performed. Historical reports below must not be interpreted as reruns for 1.8.0.

Sloyver 1.7.2 — rename verification, 2026-10-28

The application, native dialogs, reports, 3MF generator and preset names, executable and distribution now use Sloyver / Слойвер. Internal userData, origin, IPC, local-storage and project-format identifiers are retained for compatibility. The section below records the previous release validation; its vendor CLI results are historical and were not rerun for the rename. See validation-1.7.2.json for current checks.

Sloy 1.7.1 validation, 2026-10-28

npm test: 192 tests passed. Includes FEM element/solver and boundary-condition checks, print structure and reinforcement coverage, partial strength assessment, native 3MF geometry and settings, all 56 stock machine/nozzle combinations, General, currency parsing and translation placeholders.

native-catalog-checks.json: 57 imports and reverse exports with official Bambu Studio 02.08.02.61 for Linux, including all 56 stock variants and a custom 300x250x280 mm General printer with a 0.5 mm nozzle. Settings and native 100% infill modifiers without wall overrides survived. One physical normal part remained. General start/end G-code remained empty.

catalog-fixtures.mjs generates the synthetic 40x20x20 mm part and modifier. validate-native-catalog.py expects an extracted official Linux release at ../../research/bambu/squashfs-root and its dependencies under ../../research/ubuntu-libs. The official CLI release needs complete machine_full/process_full/filament_full resources to resolve system preset compatibility. Verification-only aliases must not share the generated custom process name. Large fixtures and vendor binaries are excluded from this source ZIP.

native-slice-checks.json: real Bambu Studio slicing with resolved official profiles. A partially external modifier increased infill paths on the middle layer from 343.43 to 592.35 mm. Outer/inner wall paths stayed exactly 453.864 mm. The old eight-wall override produced 829.616 mm of wall paths. No extrusion outside the base CAD bounds was added. This checks generated toolpaths, not only 3MF metadata. It does not validate physical printed strength.

asar-check.json: 80 application source/data/asset/doc files matched packaged app.asar byte for byte. Package metadata version/main/name matched semantically. Windows runtime PE machine was 0x8664. The portable launcher itself uses the normal x86 NSIS stub and contains the x64 payload.

Browser interface QA used synthetic models and material values. RU/EN switching included the exact reported header. General properties, manual RUB price, manual FX and retained reinforcement were saved into a version-8 project and inspected. Browser 3MF download was not confirmed; desktop uses native save IPC instead. No native Windows launch or separate OrcaSlicer run was performed.

expanded-mesh-checks.json: actual 51,597-element / 57,344-node axial solve (above the old 45,000 cap), matching analytical 0.0025 mm displacement, with force/moment equilibrium. Runtime and peak RSS are measurements of this Linux test environment, not a performance promise. New caps: 100,000 elements, 160,000 nodes and 4,000,000 domain cells.

Regression tests also solve a coarse selected-hole load, preserve its force/moment and warning through save/restore, and prevent a confirmed-strength verdict for approximate hole patches. Connected stress regions form wider padded boxes; enlargement merges neighbours and shifts edge-centred boxes inward without reducing the requested width.
