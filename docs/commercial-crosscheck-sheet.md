# Commercial-package cross-check — measurement sheet

**Purpose.** Fill the `Commercial package (§9)` column of Table 4.1 in
[chapter4-validation.md](./chapter4-validation.md) with values read off a recognised package. Take
this sheet to the workstation, write in the middle column, and bring it back.

**Rule.** Record what the package displays *before* you look at the expected column, and record it
to the package's own precision — do not round to match. A disagreement is information; a value
adjusted to fit is not evidence of anything.

---

## 0. Record the tool

| | |
|---|---|
| Package and version | |
| Module used (e.g. SolidWorks Motion, Inventor Dynamic Simulation, GIM) | |
| Machine / laboratory | |
| Date | |
| Operator | |

Free alternatives if no licence is available: **GIM** (Univ. of the Basque Country, planar
kinematics) or **Linkage Simulator**. Either serves for Parts 1–2; Part 3 needs a solid modeller.

---

## 1. Four-bar — Cases E, F, G

**Build.** Ground link O₂O₄ = **6** along +x, O₂ at the origin. Crank r₂ = **2**, coupler
r₃ = **7.8**, rocker r₄ = **7**, joined in a closed loop with revolute joints. Any consistent length
unit (mm is convenient; the engine is scale-free). Set the crank to **θ₂ = 60°** counter-clockwise
from O₂→O₄.

**Confirm the circuit is *open*:** the coupler and rocker must not cross. If the package assembles
the crossed configuration, mirror the coupler joint before reading anything — every expected value
below is for the open circuit.

| Case | Quantity | Package reads | Expected (KINCAD) | Difference |
|---|---|---|---|---|
| **E** | θ₃ — coupler angle, CCW from +x | | 42.0360° | |
| **E** | θ₄ — rocker angle, CCW from +x | | 83.4932° | |
| **G** | μ — transmission angle at joint B | | 41.4572° | |
| **F** | ω₃ at ω₂ = 1 rad/s | | −0.15439 rad/s | |
| **F** | ω₄ at ω₂ = 1 rad/s | | +0.13310 rad/s | |

For Case F, drive the crank at **ω₂ = 1 rad/s = 9.5493 rev/min** and read at the instant θ₂ = 60°.

---

## 2. Inline slider-crank — Cases A–D

**Build.** Crank = **1**, connecting rod = **4**, offset = **0** (inline). Slider travels along +x.

| Case | Input | Quantity | Package reads | Expected (KINCAD) | Difference |
|---|---|---|---|---|---|
| **A** | θ₂ = 0° | slider position x | | 5.000000 | |
| **B** | θ₂ = 180° | slider position x | | 3.000000 | |
| **C** | θ₂ = 90° | slider position x | | 3.872983 | |
| **C** | θ₂ = 90° | θ₃ — rod angle | | −14.4775° | |
| **D** | θ₂ = 90°, ω₂ = **10** rad/s | slider velocity v | | −10.000000 | |

A and B are exact dead-centre identities (rod + crank, rod − crank) and C is a closed form
(x = √15), so these should agree to every digit the package prints. Case D uses ω₂ = 10 rather than
1 deliberately: a missing ω₂ factor cannot pass unnoticed.

---

## 3. CAD solid — Case K

**Build.** A block **60 × 12 × 40 mm**. Cut a **⌀16 mm** (r = 8) through-hole normal to the 60 × 40
face, centred on it. Read Tools → Mass Properties (or the package's equivalent).

| Quantity | Package reads | Expected from an *exact* cylinder | Difference |
|---|---|---|---|
| Volume | | 26387.26 mm³ | |
| Surface area | | 7401.06 mm² | |
| Bounding box | | 60.0000 × 12.0000 × 40.0000 mm | |

**Read this before comparing.** KINCAD's Table 4.1 figures are **26394.1413 mm³** and
**7401.7788 mm²**, which are *higher*, because KINCAD's bore is a 48-sided prism inscribed in the
circle — an inscribed polygon removes slightly less material than a true cylinder. The expected gap
is therefore **≈ 6.8844 mm³, with the commercial value lower**, and it is already quantified in §7(b)
of the validation chapter.

So the target here is **not** agreement to 5 significant figures against Table 4.1. A difference of
about 6.88 mm³ in that direction *confirms* the faceting analysis. Record both the package value and
this expected offset; do **not** enter 6.8844 mm³ as engine error, because it is not one.

Volume alone is a ten-minute reading and it is the single most convincing item on this sheet — it
puts an industry-standard geometry kernel behind the CSG builder.

---

## Sign-convention traps

Any of these will look like an error and is not one. Check before recording a disagreement.

| Symptom | Cause | Correction |
|---|---|---|
| θ₄ off by 180° | package measures the rocker from O₄ toward O₂ | add 180° |
| μ reads ≈ 138.54° | package reports the *supplement* of the transmission angle | subtract from 180° |
| ω₃, ω₄ signs both flipped | package is clockwise-positive | negate both |
| θ₃, θ₄ both wrong by several degrees | crossed circuit assembled | mirror the coupler joint, re-read |
| A value like −317.96° | same direction as +42.04°, modulo 360° | wrap into (−180°, 180°] |

All KINCAD angles are counter-clockwise-positive from the +x axis with the ground link along +x
(θ₁ = 0) — Norton's convention. Angular velocity in rad/s, acceleration in rad/s².

---

## Cases deliberately excluded

**H, I and J are not on this sheet.** H is a self-consistency check, not a validation. I prescribes
precision points, which most motion packages cannot synthesise. J is a 360-sample sweep that would
have to be scripted rather than read off a screen. Their absence from the column is expected and is
stated in §9 — it is not an omission an examiner can hold against the chapter.

---

## If something disagrees

Beyond the traps above and the rounding of what the screen displays, a real disagreement is worth
more than a clean column. Bring the numbers back as recorded. It gets investigated, and whichever
side is wrong gets corrected and written up — a discrepancy found on this sheet is a discrepancy
not found by the panel.

---

**Return with:** this sheet completed, the package name and version, and if possible a screenshot of
each reading. Table 4.1's column and the §9 discussion get written from it.
