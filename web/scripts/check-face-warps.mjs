import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync("src/lib/faceWarp.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function("exports", "module", compiled)(loaded.exports, loaded);
const { buildFaceWarps } = loaded.exports;
const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
Object.assign(points, {
  234: { x: 0.3, y: 0.5 }, 454: { x: 0.7, y: 0.5 },
  10: { x: 0.5, y: 0.2 }, 152: { x: 0.5, y: 0.8 },
  9: { x: 0.5, y: 0.35 },
  33: { x: 0.36, y: 0.42 }, 133: { x: 0.45, y: 0.42 },
  263: { x: 0.64, y: 0.42 }, 362: { x: 0.55, y: 0.42 },
});
assert.deepEqual(buildFaceWarps(points, "original"), []);
assert.deepEqual(buildFaceWarps([], "mog"), []);
const mog = buildFaceWarps(points, "mog");
const notMog = buildFaceWarps(points, "not-mog");
assert(mog[0].move.x < 0 && mog[1].move.x > 0, "Cheeks expand symmetrically");
assert(mog[2].move.x < 0 && mog[3].move.x > 0, "Mog jaw expands");
assert(notMog[2].move.x > 0 && notMog[3].move.x < 0, "Not Mog jaw tapers");
assert(notMog[0].bulge > 0 && notMog[1].bulge > 0, "Forehead and nose magnify");
assert(Math.abs(mog[2].move.x) >= 0.13 * 0.4, "Mog uses the stronger jaw expansion");
for (const [preset, direction] of [[mog, -1], [notMog, 1]]) {
  const eyes = preset.slice(-2);
  assert(eyes.every(warp => warp.move.y * direction > 0), "Outer eye corners tilt in the preset direction");
  assert.equal(eyes[0].move.y, eyes[1].move.y, "Both outer corners get equal tilt");
  for (const [i, inner] of [133, 362].entries()) {
    const eye = eyes[i];
    const innerDistance = Math.hypot(
      (points[inner].x - eye.center.x - eye.move.x) / eye.radius.x,
      (points[inner].y - eye.center.y - eye.move.y) / eye.radius.y,
    );
    assert(innerDistance >= 1, "Inner eye corners stay outside the tilt warp");
  }
}
const rolledPoints = points.map(point => ({ x: 1 - point.y, y: point.x }));
const rolledMogEyes = buildFaceWarps(rolledPoints, "mog").slice(-2);
assert(rolledMogEyes.every(eye => eye.move.x > 0 && Math.abs(eye.move.y) < 1e-9), "Tilt follows a rolled head instead of screen up");
assert.equal(mog[4].move.x, 0, "Frontal chin does not shift sideways");
for (const direction of [-1, 1]) {
  const profile = points.map(point => ({ ...point }));
  profile[1].x += direction * 0.08;
  const chin = buildFaceWarps(profile, "mog")[4];
  assert(chin.move.x * direction > 0.07, "Profile chin projects toward the nose on either side");
  assert.equal(chin.move.y, mog[4].move.y, "Projection preserves the frontal chin depth");
  const slightTurn = profile.map(point => ({ ...point }));
  slightTurn[1].x = 0.5 + direction * 0.025;
  assert(Math.abs(buildFaceWarps(slightTurn, "mog")[4].move.x) < Math.abs(chin.move.x), "Projection increases gradually with head turn");
  const narrowProfile = profile.map(point => ({ ...point }));
  narrowProfile[234].x = 0.46;
  narrowProfile[454].x = 0.54;
  assert(buildFaceWarps(narrowProfile, "mog")[4].radius.x >= 0.6 * 0.22, "Chin influence does not collapse as the face turns sideways");
  const rolledProfile = profile.map(point => ({ x: 1 - point.y, y: point.x }));
  const rolledChin = buildFaceWarps(rolledProfile, "mog")[4];
  assert(rolledChin.move.y * direction > 0.07, "Profile projection follows head roll");
  assert.equal(buildFaceWarps(profile, "not-mog")[4].move.x, notMog[4].move.x, "Profile chin projection applies only to Mog");
}
const tinyTurn = points.map(point => ({ ...point }));
tinyTurn[1].x += 0.005;
assert.equal(buildFaceWarps(tinyTurn, "mog")[4].move.x, 0, "Small nose offsets stay within the frontal dead zone");
for (const preset of [mog, notMog]) {
  assert(preset.length <= 8);
  for (const warp of preset) {
    assert(warp.radius.x > 0 && warp.radius.y > 0);
    assert(Object.values(warp).flatMap(value => typeof value === "number" ? [value] : Object.values(value)).every(Number.isFinite));
  }
}
const before = JSON.stringify(points);
buildFaceWarps(points, "not-mog");
assert.equal(JSON.stringify(points), before, "Preset generation does not mutate tracking points");
console.log("Face warp checks passed");
const scoreModule = { exports: {} };
const scoreCode = ts.transpileModule(fs.readFileSync("src/lib/scoreToFaceFilter.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function("exports", "module", scoreCode)(scoreModule.exports, scoreModule);
const { scoreToFaceFilter } = scoreModule.exports;
for (const [score, preset, strength] of [
  [60, "mog", 0.8], [70, "mog", 0.9], [79, "mog", 0.99], [80, "mog", 1],
  [100, "mog", 1], [59, "not-mog", 0.5], [10, "not-mog", 1], [0, "not-mog", 1],
]) {
  const result = scoreToFaceFilter(score);
  assert.equal(result.preset, preset);
  assert(Math.abs(result.strength - strength) < 1e-9, `Score ${score} maps to ${strength}`);
}
assert.equal(scoreToFaceFilter(-5).score, 0);
assert.equal(scoreToFaceFilter(105).score, 100);
for (const value of [NaN, Infinity, -Infinity, null, "60"]) {
  assert.throws(() => scoreToFaceFilter(value), RangeError);
}
for (let score = 0; score < 59; score++) {
  assert(scoreToFaceFilter(score).strength >= scoreToFaceFilter(score + 1).strength, "Lower negative scores produce stronger Not Mog");
}
for (let score = 60; score < 100; score++) {
  assert(scoreToFaceFilter(score).strength <= scoreToFaceFilter(score + 1).strength, "Higher positive scores produce stronger Mog");
}
assert(scoreToFaceFilter(59.5).strength >= 0.5, "Fractional scores below 60 keep at least 50% Not Mog");
console.log("Score-to-filter checks passed");
