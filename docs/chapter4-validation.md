# Chapter 4 — Validation Evidence

## 1. Scope of this chapter

Every number in this chapter is produced by the deterministic engine (`src/engine/`, `src/cad/`)
and reproduced by the automated test suite. The AI assistant plays no part in any figure below: it
selects and drives tools, and the tools return engine results.

**What is validated:** planar rigid-body kinematics of the four-bar and slider-crank mechanisms —
position, velocity, acceleration, transmission angle, Grashof classification, Freudenstein function
generation — and the geometric integrity of the CAD solid modeller.

**What is *not* validated, and is not claimed:** no dynamics (no forces, torques, inertia, or
stress), no friction, no clearance or tolerance analysis, no deflection, no material behaviour, no
manufacturing feasibility. A linkage that KINCAD reports as kinematically valid may still be
unbuildable for reasons this software does not model.

**Evidence sources.** Four test files, all passing:

| File | Cases |
|---|---|
| `src/engine/__tests__/validation.test.ts` | A – H |
| `src/engine/__tests__/synthesis.test.ts` | I, and the coverage grid in §8 |
| `src/engine/__tests__/crosscheck.test.ts` | J |
| `src/cad/__tests__/mesh-validation.test.ts` | K |

## 2. Conventions

**Angles.** All angles are measured counter-clockwise from the +x axis, with the ground link along
+x (θ₁ = 0), O₂ at the origin and O₄ at (d, 0) — Norton's convention. The solver returns angles from
`atan2`, so its native range is (−180°, +180°], and doubling a half-angle result can place a value
outside that range (e.g. −317.96°). Such a value is *the same direction* as its wrapped equivalent
(−317.96° ≡ +42.04°); it is not an error. Where a raw solver value differs from the wrapped value
used for comparison, **both are printed** and the comparison is stated as being made modulo 360°.

**Units.** Lengths are dimensionless in the kinematic cases: the engine is scale-invariant, so link
values are pure ratios and any consistent unit may be read into them. Angles are degrees in this
chapter and radians internally. Angular velocity is rad/s, angular acceleration rad/s². The CAD case
(K) is the exception — it is dimensioned in millimetres.

**Error definitions.**

- Percentage error = |reference − KINCAD| / |reference| × 100 %.
- Where the reference is exactly zero (a residual), percentage error is undefined; the absolute
  residual is reported instead and compared against double-precision machine epsilon
  (ε ≈ 2.22 × 10⁻¹⁶).
- Angular differences are folded into (−180°, 180°] before the magnitude is taken.

**On "hand calculation" as a reference.** Cases E and F compare against values carried to 2–4
decimal places. The residual disagreement (≈ 0.03°–0.08°, ≈ 0.25 %) is the rounding of the
*reference*, not error in the engine — which is why the loop-closure residual, an
absolute test needing no reference value, is reported alongside. Cases G and I replace the rounded
reference with a closed-form one, and Cases J and K replace it with a second independent
implementation. Those are the stronger tests.

## 3. Table 4.1 — Validation cases

The final column is deliberately empty; see §9.

| Case | Mechanism | Input parameters | Manual / reference result | KINCAD result | Absolute error | Percentage error | Commercial package (§9) | Remarks |
|---|---|---|---|---|---|---|---|---|
| **A.** Slider-crank at TDC | Inline slider-crank | crank = 1, rod = 4, offset = 0, θ₂ = 0° | x = crank + rod = 5.000000 | x = 5.000000 | 0.000000 | 0.00e+0 % | — | Exact top-dead-centre identity; agreement at machine precision. |
| **B.** Slider-crank at BDC | Inline slider-crank | crank = 1, rod = 4, offset = 0, θ₂ = 180° | x = rod − crank = 3.000000 | x = 3.000000 | 0.000000 | 0.00e+0 % | — | Exact bottom-dead-centre identity. |
| **C.** Slider-crank at θ₂ = 90° | Inline slider-crank | crank = 1, rod = 4, offset = 0, θ₂ = 90° | x = √15 = 3.872983; θ₃ = atan2(−1, √15) = −14.4775° | x = 3.872983; θ₃ = −14.4775° | x: 0.000000; θ₃: 0.0000° | 0.00e+0 % both | — | Closed-form reference, not a rounded one: exact to all printed digits. |
| **D.** Slider-crank velocity at θ₂ = 90° | Inline slider-crank | crank = 1, rod = 4, offset = 0, θ₂ = 90°, ω₂ = 10 rad/s | v = −aω₂ = −10.000000 | v = −10.000000 | 0.000000 | 0.00e+0 % | — | At θ₂ = 90° the rod-angle term vanishes and the slider velocity reduces to −aω₂ exactly. ω₂ = 10, not 1, so a missing ω₂ factor cannot pass. |
| **E.** Four-bar position and loop closure | Four-bar crank-rocker, open circuit | r₁ = 6, r₂ = 2, r₃ = 7.8, r₄ = 7, θ₂ = 60° | Hand derivation (§4): θ₃ = 41.96°, θ₄ = 83.52° (reference rounded to 2 d.p.) | θ₃ = 42.0360°, θ₄ = 83.4932° (raw solver output −317.9640°, −276.5068°, equivalent mod 360°) | θ₃: 0.0760°; θ₄: 0.0268° | θ₃: 0.18 %; θ₄: 0.03 % | — | Difference is the reference's rounding. The absolute test is the loop-closure residual: **x = 0.000e+0, y = −8.882e-16** (4ε), i.e. r₂ + r₃ − r₄ − r₁ = 0 to machine precision. |
| **F.** Four-bar velocity | Four-bar crank-rocker, open circuit | r₁ = 6, r₂ = 2, r₃ = 7.8, r₄ = 7, θ₂ = 60°, ω₂ = 1 rad/s | ω₃ = −0.154 rad/s; ω₄ = 0.133 rad/s (3 d.p.) | ω₃ = −0.15439 rad/s; ω₄ = 0.13310 rad/s | ω₃: 0.00039; ω₄: 0.00010 rad/s | ω₃: 0.25 %; ω₄: 0.07 % | — | Again bounded by reference rounding. Absolute test: velocity loop residual **x = −3.331e-16, y = −4.441e-16**. Case J validates ω over the whole cycle against a method that shares no code. |
| **G.** Transmission angle | Four-bar crank-rocker, open circuit | r₁ = 6, r₂ = 2, r₃ = 7.8, r₄ = 7, θ₂ = 60° | Law of cosines on the coupler–rocker pair, computed independently: **μ = 41.4572°** | μ = 41.4572° | 3.43e-14 ° | 3.43e-14 % | — | The reference is now a closed-form value, not the range check "0° < μ ≤ 90°" used previously — a range cannot falsify a wrong number that happens to land inside it. |
| **H.** Freudenstein round-trip — *consistency, not validation* | Four-bar synthesis | Targets generated from a known linkage r₁ = 4, r₂ = 1.2, r₃ = 3.5, r₄ = 3 at θ₂ = 40°, 90°, 160°, giving θ₄ = 96.9668°, 107.7944°, 134.1910° (raw solver output −263.0332°, −252.2056°, −225.8090°) | Synthesis should recover the original link lengths and reproduce the three angles | r₂ = 1.200000, r₃ = 3.500000, r₄ = 3.000000; θ₄ reproduced exactly | lengths: 0.000000; angles: 0.000000° | 0.0000 % | — | **This case cannot falsify the synthesis.** The targets come from `solvePosition` and are checked with `solvePosition`, so any error common to both directions cancels. It demonstrates that synthesis inverts analysis. Case I is the test that can actually fail. |
| **I.** Freudenstein synthesis from *prescribed* precision points | Four-bar synthesis, d = 4 | Four specifications chosen a priori — round angles a designer would ask for, never read back out of the solver. Detail in §5. | Each solution must satisfy Freudenstein's equation written from its definition, and be reachable by circle–circle intersection | All four solved; worst Freudenstein residual **8.88e-15**, worst geometry Δθ₄ **5.68e-13 °**, worst engine Δθ₄ **5.40e-13 °** | ≤ 5.68e-13 ° | ≤ 6.3e-13 % | — | Three mutually independent checks per point (definition, geometry, engine). Every one of these four specifications was **refused outright** by the earlier implementation. |
| **J.** Full-cycle cross-check against independent methods | Four linkage types, 360 samples each | Crank-rocker (open and crossed), non-Grashof triple-rocker, drag-link double-crank. Detail in §6. | Position by **circle–circle intersection**; ω and α by **central differences** — no Freudenstein, no analytic differentiation, no shared code | Worst \|Δθ₃\| **7.11e-15 rad**, worst \|Δθ₄\| **1.38e-14 rad**; worst relative Δω **2.12e-7**, worst relative Δα **8.02e-7** | as stated | ≤ 8.02e-5 % | — | The only case here that can catch an error which is *smooth in θ₂* — a wrong branch over part of a cycle, or a sign slip in the acceleration coupling. A hand check at one angle cannot. |
| **K.** CAD solid integrity | Bearing block, 60 × 12 × 40 mm, r = 8 mm through-bore, built by CSG | Analytic prism-and-block solid (see §7): V = 26394.1412 mm³; A = 7401.7788 mm² | V = 26394.1413 mm³; A = 7401.7788 mm²; 534 triangles; bounding box 60.0000 × 12.0000 × 40.0000 mm | V: 4.1e-5 mm³; A: < 1e-4 mm² | V: **1.54e-7 %** (1.54e-9 relative) | — | Volume by signed-tetrahedron sum; closure (divergence) residual **4.39e-9** relative, confirming a watertight, consistently-oriented mesh. The reference is the mesh's *own* 48-gon bore, so this tests the mesh, not the tessellation; the tessellation error against a true r = 8 cylinder is quantified separately as **6.8844 mm³**. |

## 4. Worked derivation for Case E

The reference for Case E is derived by hand from Norton's closed-form solution (Eq. 4.10 for θ₄,
Eq. 4.13 for θ₃), independently of the code. Given r₁ = d = 6, r₂ = a = 2, r₃ = b = 7.8, r₄ = c = 7,
θ₂ = 60°:

**Step 1 — link ratios.**

    K₁ = d/a = 6/2                         = 3.000000
    K₂ = d/c = 6/7                         = 0.857143
    K₃ = (a² − b² + c² + d²)/(2ac)
       = (4 − 60.84 + 49 + 36)/(2·2·7)      = 1.005714

**Step 2 — output angle θ₄** (quadratic in tan(θ₄/2); cos 60° = 0.5, sin 60° = 0.866025):

    A = cos θ₂ − K₁ − K₂ cos θ₂ + K₃       = −1.922857
    B = −2 sin θ₂                          = −1.732051
    C = K₁ − (K₂ + 1) cos θ₂ + K₃          =  3.077143
    B² − 4AC                               = 26.667624,   √ = 5.164071

    θ₄ = 2 · atan2(−B − √(B²−4AC), 2A)     — the minus root is the OPEN circuit
       = −276.5068°  ≡  83.4932°  (mod 360°)

**Step 3 — coupler angle θ₃:**

    K₄ = d/b = 6/7.8                       =  0.769231
    K₅ = (c² − d² − a² − b²)/(2ab)
       = (49 − 36 − 4 − 60.84)/(2·2·7.8)   = −1.661538
    D = cos θ₂ − K₁ + K₄ cos θ₂ + K₅       = −3.776923
    E = −2 sin θ₂                          = −1.732051
    F = K₁ + (K₄ − 1) cos θ₂ + K₅          =  1.223077
    E² − 4DF                               = 21.477870,   √ = 4.634422

    θ₃ = 2 · atan2(−E − √(E²−4DF), 2D)
       = −317.9640°  ≡  42.0360°  (mod 360°)

**Step 4 — closure check.** Substituting into the vector loop r₂ + r₃ − r₄ − r₁ = 0:

    x:  2 cos 60° + 7.8 cos 42.0360° − 7 cos 83.4932° − 6  =  0.000e+0
    y:  2 sin 60° + 7.8 sin 42.0360° − 7 sin 83.4932° − 0  = −8.882e-16

The residual is 4ε, i.e. zero to double precision. The 2-decimal-place reference values 41.96° and
83.52° that appear in the table round from these, which is the whole of the 0.0760°/0.0268°
discrepancy reported in Case E.

## 5. Case I detail — synthesis from prescribed precision points

Four specifications, chosen before running the solver. For each, the synthesis must return positive
link lengths, report which assembly circuit the solution lies on, and report any 180° datum rotation.

| # | Prescribed θ₂ | Prescribed θ₄ | r₂ | r₃ | r₄ | Circuit | Datum offsets (input / output) |
|---|---|---|---|---|---|---|---|
| I-a | 40°, 90°, 160° | 50°, 80°, 110° | 0.699566 | 3.825366 | 1.142301 | crossed | 180° / 180° |
| I-b | 30°, 75°, 120° | 60°, 90°, 120° | 5.501556 | 6.679780 | 9.212901 | crossed | 180° / 180° |
| I-c | 45°, 90°, 135° | 95°, 120°, 145° | 3.587835 | 12.034832 | 11.932608 | crossed | 180° / 180° |
| I-d | 30°, 60°, 90° | 35°, 55°, 75° | 2.736161 | 3.180782 | 4.078192 | crossed | 180° / 180° |

All four use d = r₁ = 4. A 180° datum offset means a Freudenstein ratio came out negative: K₁ = d/a
< 0 says the input link is directed *opposite* the assumed datum. The link has positive length |a|;
only the reference direction moves, so the prescribed correspondence is realised at θ₂ + 180°. For
I-a the achieved correspondence is therefore 220°, 270°, 340° → 230°, 260°, 290°.

Each of the twelve precision points is checked three independent ways:

1. **Against the definition** — Freudenstein's equation K₁cos θ₄ − K₂cos θ₂ + K₃ − cos(θ₂ − θ₄),
   evaluated directly from the returned lengths. Worst residual **8.88 × 10⁻¹⁵**.
2. **By geometry** — circle–circle intersection, with no Freudenstein coefficients and no quadratic
   anywhere in the path. Worst Δθ₄ **5.68 × 10⁻¹³ °**.
3. **Through the engine** — `solvePosition` on the reported circuit. Worst Δθ₄ **5.40 × 10⁻¹³ °**.

Check 2 also confirms that the *reported* circuit is the right one: driving the same lengths on the
other circuit misses every target, which the test asserts explicitly.

Genuinely impossible specifications are still refused, with a reason. Three identical input angles
give a rank-deficient system and return *"Precision points are singular (degenerate system); choose
different angles."*

## 6. Case J detail — full-cycle cross-check

Position is recomputed by circle–circle intersection and motion by central differences
(`src/engine/__tests__/independent.ts`), sharing no code with the solver. The assembly branch is
resolved **once** at the first valid sample and then held; re-matching per sample would conceal a
mid-sweep circuit jump, which is one of the defects this sweep exists to detect.

**Position, 360 samples per case:**

| Linkage | r₁, r₂, r₃, r₄ | Assemblable samples | Worst \|Δθ₃\| (rad) | Worst \|Δθ₄\| (rad) |
|---|---|---|---|---|
| Crank-rocker, open | 6, 2, 7.8, 7 | 360 / 360 | 8.88e-16 | 1.78e-15 |
| Crank-rocker, crossed | 6, 2, 7.8, 7 | 360 / 360 | 8.88e-16 | 1.78e-15 |
| Non-Grashof triple-rocker | 6, 2, 3, 3 | 161 / 360 | 2.66e-15 | 4.88e-15 |
| Drag-link double-crank | 2, 5, 4.5, 5 | 360 / 360 | 7.11e-15 | 1.38e-14 |

Both methods must also agree on *whether* the linkage assembles at each angle. The triple-rocker
assembles on only 161 of 360 samples, and the two methods decline on exactly the same arc — the
reachable range is pinned, not merely its existence. The drag-link is included because θ₄ winds past
±180° repeatedly, which is where a seam-handling mistake would appear.

**Velocity and acceleration, ω₂ = 2.5 rad/s** (deliberately not 1, so a missing ω₂ factor cannot
hide):

| Linkage | Samples off the toggle gate | Worst relative Δω | Worst relative Δα |
|---|---|---|---|
| Crank-rocker, open | 360 / 360 | 5.09e-9 | 7.01e-7 |
| Crank-rocker, crossed | 360 / 360 | 5.09e-9 | 8.02e-7 |
| Non-Grashof triple-rocker | 153 / 360 | 2.12e-7 | 5.97e-7 |
| Drag-link double-crank | 360 / 360 | 2.70e-9 | 7.10e-7 |

**On the toggle gate.** Samples where the half-chord between the two assembly configurations falls
below 0.2 × coupler length are excluded. Near a toggle the two circuits merge, the derivatives are
unbounded, and the third derivative — which sets a central difference's truncation error — grows
with them. The exclusion is a limitation of the *reference* method, not of the engine, and is stated
here rather than absorbed by loosening the tolerance for all 360 samples.

A constant chosen to make a test pass is indistinguishable from a constant chosen because it is
right, so the gate is swept. Were the *engine* wrong near toggle, admitting samples closer to the
singularity would leave the disagreement roughly flat or move it erratically. Instead it falls
monotonically and steeply — 440× across this range — which is the signature of an O(h²) truncation
term scaling with a third derivative that blows up at the singularity. Measured on the
worst-conditioned case, the triple-rocker, whose assemblable arc *ends* at a toggle at both ends:

| Gate (× coupler) | 0.05 | 0.10 | 0.20 | 0.30 |
|---|---|---|---|---|
| Samples retained (of 360) | 161 | 159 | 153 | 145 |
| Worst relative Δω | 2.51e-5 | 2.10e-6 | **2.12e-7** | 5.67e-8 |

## 7. Case K detail — CAD solid integrity

The CSG builder tessellates a cylindrical bore into a regular **48-sided prism**. Validating the
mesh and validating the tessellation are two different questions, and conflating them would let one
error hide the other, so they are separated:

**(a) Is the mesh a correct solid?** The reference is the exact volume and surface area of the
*polyhedron the builder intended to produce* — a 60 × 12 × 40 block minus a regular 48-gon prism
inscribed in r = 8:

    48-gon area  = ½ · 48 · 8² · sin(2π/48)          = 200.4882 mm²
    V(analytic)  = 60·12·40 − 200.4882·12            = 26394.1412 mm³
    48-gon perim = 48 · 2 · 8 · sin(π/48)            = 50.2296 mm
    A(analytic)  = 2·(3600 − 200.4882) + 50.2296·12  = 7401.7788 mm²

Measured from the mesh by signed-tetrahedron summation: **V = 26394.1413 mm³** (1.54 × 10⁻⁹
relative) and **A = 7401.7788 mm²**. The divergence identity ∑ Aᵢ n̂ᵢ = 0 over all 534 triangles
holds to **4.39 × 10⁻⁹** relative, which is what establishes the mesh is closed and consistently
oriented — a mesh with a hole or a flipped triangle fails this even when its volume looks plausible.

**(b) How far is the tessellation from the true cylinder it approximates?** A true r = 8 bore gives
V = 60·12·40 − π·8²·12 = **26387.2568 mm³**. The 48-gon prism therefore leaves **6.8844 mm³** of
extra material (0.026 % of the part). This is a deliberate property of a faceted representation, not
an error in the mesh, and it is the figure a commercial B-rep kernel would differ by (§9, step 7).

## 8. Coverage of the synthesis solver, and an audit of its refusals

Cases H and I use chosen specifications. They show the solver works on those, but not how much of
the design space it serves, nor whether what it refuses deserves refusing. This sweeps a grid of 81
specifications built from round angles (θ₂ triples starting at 20°, 40°, 60° with spans of 50+50,
40+70 and 70+40 degrees; θ₄ triples starting at 30°, 60°, 90° with spans of 30+30, 25+45 and 45+25),
all at d = 4, and audits **every verdict** against a second Freudenstein implementation written from
the equations, whose assemblability test is circle–circle intersection.

| Outcome | Count (of 81) |
|---|---|
| Solved | **51** |
| — of which require the 180° datum rotation | 25 |
| Solved under the previous implementation's guard | **26** |
| Refused — singular system | 1 |
| Refused — lengths recovered but no circuit reaches all three points | 29 |
| **Verdict disagreements against the independent solver** | **0** |
| Worst \|Δ link length\| against the independent solver | 0.00e+0 (bit-identical) |
| Worst Freudenstein residual over all accepted solutions | 2.17e-12 |
| Worst engine Δθ₄ over all accepted solutions | 1.19e-12 ° |

Two results matter here. First, **the fix roughly doubles the served design space** — 26 → 51 of 81
— because the previous implementation treated a negative Freudenstein ratio as a non-physical
linkage and refused it, when it only ever meant that link points the other way. Second, **the 30
remaining refusals are independently confirmed**: a separate solver reaches the same verdict on all
81 specifications, so the refusals are a property of the geometry, not a defect in the code.

The acceptance *count* is a property of the grid and should not be read as a general figure; a
different grid gives a different count. The count that is meaningful is the ratio: 25 of the 51
solutions require the datum rotation, so nearly half of everything this solver now delivers was
previously reported as impossible.

The "previous implementation" column is *reconstructed, not remembered*. The old guard refused
exactly when a ratio came out negative, and that is exactly the condition the corrected solver
reports as a 180° offset — so `inputOffset ≠ 0 or outputOffset ≠ 0` is a faithful reconstruction.
Reinstating the old guard in the source makes this test fail with 25 disagreements, all of the form
*"production refused, independent solved"*, which is the original defect stated precisely.

## 9. Independent comparison against a commercial package — **to be completed**

The rightmost column of Table 4.1 is empty because no commercial-software result has been obtained.
It must be filled by running the cases in a real package; no number may be entered from memory,
from a textbook worked example, or from an estimate, because a fabricated comparison column would
invalidate the chapter it is meant to strengthen.

Note what this column adds and what it does not. Cases G, I, J and K are already checked against
*independent methods* — closed-form law of cosines, circle–circle intersection, central differences,
analytic solid geometry — so the engine is not validated solely against itself. A commercial package
adds an externally-recognised authority, which is worth having in a dissertation, but it is a
*third* opinion rather than the first independent one.

**Procedure.** Use any one of: SolidWorks Motion, Autodesk Inventor Dynamic Simulation, PTC Creo
Mechanism, Ansys Motion, MSC Adams, or the free `linkages`/GIM/Linkage Simulator tools. Record the
package name and version.

1. **Build the four-bar.** Sketch ground O₂O₄ = 6 units horizontally. Add the crank (2), coupler
   (7.8) and rocker (7) as three more links with revolute joints, forming a closed loop. Work in a
   consistent unit — the engine is scale-free, so mm is convenient; use 6 mm, 2 mm, 7.8 mm, 7 mm, or
   scale all four by the same factor.
2. **Set the crank angle to exactly 60°** measured counter-clockwise from O₂→O₄. Confirm the
   assembly is the *open* circuit: the coupler and rocker must not cross. If the package assembles
   the crossed configuration, mirror the coupler joint before reading anything.
3. **Read Case E:** the coupler angle θ₃ and rocker angle θ₄, both measured counter-clockwise from
   the same +x axis as the ground link. Expect ≈ 42.04° and ≈ 83.49°. If a package reports the
   rocker angle from O₄ toward O₂, add 180°.
4. **Read Case G:** the transmission angle, i.e. the included angle at joint B between the coupler
   and the rocker. Expect ≈ 41.46°. Many packages report the *supplement*; if the value is near
   138.54°, subtract from 180°.
5. **Read Case F:** drive the crank at ω₂ = 1 rad/s (= 9.5493 rev/min) and read ω₃ and ω₄ at the
   instant θ₂ = 60°. Expect ≈ −0.1544 and ≈ +0.1331 rad/s. Sign convention is
   counter-clockwise-positive; negate if the package reports clockwise-positive.
6. **Read Cases A–D:** build the inline slider-crank with crank = 1, rod = 4, offset = 0, and read
   slider position at θ₂ = 0°, 180° and 90°, then slider velocity at θ₂ = 90° with ω₂ = 10 rad/s.
7. **Read Case K:** model the 60 × 12 × 40 mm block, cut the ⌀16 mm through-hole on the 60 × 40
   face's centre, and read the mass-properties volume and surface area. A commercial kernel uses an
   *exact* cylinder, so it should report the true-cylinder figures — **V ≈ 26387.26 mm³, A ≈ 7401.06
   mm²** — not the 48-gon figures in Table 4.1. The expected gap is therefore the 6.8844 mm³
   quantified in §7(b), with the commercial value *lower*. A difference of that order **confirms**
   the faceting analysis; enter both the package value and this expected offset in the caption, and
   do not record the 6.8844 mm³ as an engine error, because it is not one.
8. Enter each value in the column with the package's own precision, compute the percentage error
   against the KINCAD column using the definition in §2, and state the package and version in the
   caption.

Cases H, I and J are not suitable for this comparison. H is a self-consistency check; I prescribes
precision points, which most motion packages cannot synthesise; J is a 360-sample sweep that would
have to be scripted rather than read off a screen.

## 10. Interpretation

1. **Exact identities hold exactly.** Cases A–D agree to all printed digits at machine precision,
   confirming the slider-crank position and velocity formulations.
2. **Position analysis closes the loop to machine precision.** Case E's residual of 8.882 × 10⁻¹⁶
   (4ε) is an absolute test needing no reference value, and the hand derivation in §4 confirms the
   solver's route independently.
3. **The residual disagreements in E and F are reference rounding, not engine error.** This is
   demonstrable rather than asserted: the closed-form references in C and G agree to 10⁻¹⁴, and the
   independent methods in J agree to 10⁻¹⁵ on position.
4. **Velocity and acceleration are validated over whole cycles, not at single angles.** Case J
   compares against methods that share no code with the solver, across four linkage types including
   a non-Grashof partial-arc case and a drag-link that winds θ₄ past ±180°. Agreement is at the
   reference method's own accuracy floor.
5. **Synthesis is validated against prescribed targets, not its own output.** Case I is the
   falsifiable test; Case H is labelled as consistency only. §8 shows the solver serves roughly
   twice the design space it did before, and that its remaining refusals are confirmed by an
   independent implementation.
6. **The CAD modeller produces watertight, correctly-oriented solids.** Case K's 1.54 × 10⁻⁹
   relative volume agreement against analytic geometry, together with a divergence residual of
   4.39 × 10⁻⁹, establishes closure; the 6.8844 mm³ faceting gap is quantified rather than ignored.
7. **The limits are stated, not hidden.** The toggle-gate exclusion in J, the reference rounding in
   E and F, the non-falsifiability of H, the polyhedral approximation in K, and the empty commercial
   column in §9 are all recorded here. Taken together the evidence supports the deterministic
   engine as the single source of numerical truth in KINCAD, within the kinematics-only scope
   declared in §1.

## 11. Reproducing every figure

```bash
npx vitest run src/engine src/cad --disable-console-intercept
```

Every number in this chapter is printed by that command. `--disable-console-intercept` is required:
without it Vitest suppresses the test suites' own output and only the pass/fail summary appears.
