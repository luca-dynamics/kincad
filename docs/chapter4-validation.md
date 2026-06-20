# Chapter 4 Validation Evidence

KINCAD results were validated against hand-derived and reference analytical results for slider-crank position/velocity, four-bar loop closure/velocity, transmission-angle behaviour, and Freudenstein synthesis round-trip consistency. The values below are taken from the passing validation tests in `src/engine/__tests__/validation.test.ts`.

Percentage Error = |Manual value - KINCAD value| / |Manual value| × 100%

| Case | Mechanism | Input parameters | Manual/reference result | KINCAD result | Absolute error | Percentage error | Remarks |
|---|---|---|---|---|---|---|---|
| A. Slider-crank TDC | Inline slider-crank | crank = 1, rod = 4, offset = 0, θ₂ = 0° | x = crank + rod = 5.000000 | x = 5.000000 | 0.000000 | 0.00e+0% | Exact top-dead-centre geometric identity; machine-precision agreement. |
| B. Slider-crank BDC | Inline slider-crank | crank = 1, rod = 4, offset = 0, θ₂ = 180° | x = rod − crank = 3.000000 | x = 3.000000 | 0.000000 | 0.00e+0% | Exact bottom-dead-centre geometric identity; machine-precision agreement. |
| C. Slider-crank at θ₂ = 90° | Inline slider-crank | crank = 1, rod = 4, offset = 0, θ₂ = 90° | x = √15 = 3.872983; θ₃ = atan2(-1, √15) = -14.4775° | x = 3.872983; θ₃ = -14.4775° | x: 0.000000; θ₃: 0.0000° | x: 0.00e+0%; θ₃: 0.00e+0% | Exact closed-form slider position and rod-angle relation. |
| D. Slider-crank velocity at θ₂ = 90° | Inline slider-crank | crank = 1, rod = 4, offset = 0, θ₂ = 90°, ω₂ = 10 rad/s | v = -aω₂ = -10.000000 units/s | v = -10.000000 units/s | 0.000000 units/s | 0.00e+0% | Exact derivative of slider-position equation at θ₂ = 90°. |
| E. Four-bar loop-closure residual | Four-bar crank-rocker, open circuit | r₁ = 6, r₂ = 2, r₃ = 7.8, r₄ = 7, θ₂ = 60° | Hand calculation: θ₃ ≈ 41.96°, θ₄ ≈ 83.52°; loop residual should be approximately zero | θ₃ = -317.9640° (wrapped agreement error 0.0760°); θ₄ = -276.5068° (wrapped agreement error 0.0268°); residual x = 0.000e+0; residual y = -8.882e-16 | residual x: 0.000e+0; residual y: 8.882e-16 | Not applicable for zero residual reference | Residuals are approximately zero at machine precision, confirming position loop-closure consistency. |
| F. Four-bar velocity validation | Four-bar crank-rocker, open circuit | r₁ = 6, r₂ = 2, r₃ = 7.8, r₄ = 7, θ₂ = 60°, ω₂ = 1 rad/s | ω₃ ≈ -0.154 rad/s; ω₄ ≈ 0.133 rad/s | ω₃ = -0.15439 rad/s; ω₄ = 0.13310 rad/s; velocity residual x = -3.331e-16; velocity residual y = -4.441e-16 | ω₃: 0.00039 rad/s; ω₄: 0.00010 rad/s | ω₃: 0.25%; ω₄: 0.07% | Velocity loop residuals are at machine precision and angular velocities agree with hand calculation to within the rounded reference values. |
| G. Transmission angle check | Four-bar crank-rocker, open circuit | r₁ = 6, r₂ = 2, r₃ = 7.8, r₄ = 7, θ₂ = 60° | Expected engineering range: 0° < μ ≤ 90° | μ = 41.46° | Within range | Not applicable | Observed transmission angle lies within the acceptable engineering range used by the validation test. |
| H. Freudenstein synthesis round-trip | Four-bar crank-rocker synthesis | Original links: r₁ = 4, r₂ = 1.2, r₃ = 3.5, r₄ = 3; precision points θ₂ = 40°, 90°, 160° with target θ₄ = -263.0332°, -252.2056°, -225.8090° | Recovered links should match original; output-angle errors should be < 0.001° | Recovered r₂ = 1.2000, r₃ = 3.5000, r₄ = 3.0000; recovered θ₄ = -263.0332°, -252.2056°, -225.8090° | link-length errors: r₂ = 0.0000%, r₃ = 0.0000%, r₄ = 0.0000%; angular errors: 0.000000°, 0.000000°, 0.000000° | r₂: 0.0000%; r₃: 0.0000%; r₄: 0.0000% | Synthesis test confirms consistency of the Freudenstein synthesis solver by recovering the original linkage and reproducing all precision points. |

## Interpretation

- Slider-crank cases validate exact geometric and velocity identities.
- Four-bar loop-closure residual validates position solver consistency.
- Four-bar velocity validation shows low percentage error against hand calculation.
- Synthesis round-trip confirms Freudenstein synthesis implementation.
- Results support the reliability of KINCAD’s deterministic engine for Chapter 4.
