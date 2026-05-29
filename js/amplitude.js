const AUDIO_PATH = "audio/Snow Strippers Aching Like It s Official Video.mp3";
const MAX_HISTORY = 560;
const FFT_BINS = 512;
const SPHERE_ROWS = 44;
const SPHERE_COLS = 96;
const EMPTY_WAVEFORM = new Array(FFT_BINS).fill(0);
const EMPTY_SPECTRUM = new Array(FFT_BINS).fill(0);
const ROTOSCOPE_FRAME_HOLD = 4;

const DISTORTION_MODES = ["NORMAL", "HARD_CLIP", "SOFT_CLIP", "WAVEFOLD"];
const WAVE_COLORS = {
  glow: [25, 255, 135],
  core: [130, 255, 235],
  spark: [245, 255, 245]
};

let song;
let fft;
let amplitude;

let audioInput;
let audioShaper;
let dryGain;
let wetGain;
let audioOutput;

let songReady = false;
let loadError = false;
let history = [];
let isSeeking = false;
let isChangingSpeed = false;
let playbackRate = 1;
let distortionModeIndex = 3;
let distortionAmount = 1.8;
let visualSize = 1.02;
let rayIntensity = 1.18;
let coreDensity = 0.58;
let autoRotation = 0;
let sphereRotationX = -0.18;
let sphereRotationY = 0;
let pointerDownX = 0;
let pointerDownY = 0;
let pointerStartedOnControl = false;
let pointerMoved = false;
let activeVisualControl = null;
let parameterOverlay;

function preload() {
  soundFormats("mp3");

  song = loadSound(
    getAssetPath(AUDIO_PATH),
    () => {
      songReady = true;
    },
    () => {
      loadError = true;
    }
  );
}

function setup() {
  pixelDensity(1);
  let canvas = createCanvas(document.querySelector('.canvas-wrapper').offsetWidth, document.querySelector('.canvas-wrapper').offsetHeight, WEBGL);
  canvas.parent('canvas-container');
  frameRate(45);
  colorMode(RGB);
  textFont("monospace");

  setupAudioChain();

  fft = new p5.FFT(0.35, FFT_BINS);
  fft.setInput(audioOutput);

  amplitude = new p5.Amplitude();
  amplitude.setInput(audioOutput);
}

function draw() {
  const level = songReady ? amplitude.getLevel() : 0;
  const waveform = songReady ? fft.waveform() : EMPTY_WAVEFORM;
  const spectrum = songReady ? fft.analyze() : EMPTY_SPECTRUM;

  background(0, 4, 3);

  drawScene(waveform, spectrum, level);
}

function setupAudioChain() {
  const audioContext = getAudioContext();

  audioInput = audioContext.createGain();
  audioShaper = audioContext.createWaveShaper();
  dryGain = audioContext.createGain();
  wetGain = audioContext.createGain();
  audioOutput = audioContext.createGain();

  audioShaper.oversample = "4x";
  audioOutput.gain.value = 0.78;

  song.disconnect();
  song.connect(audioInput);

  audioInput.connect(dryGain);
  audioInput.connect(audioShaper);
  audioShaper.connect(wetGain);
  dryGain.connect(audioOutput);
  wetGain.connect(audioOutput);

  const masterInput = p5.soundOut && p5.soundOut.input ? p5.soundOut.input : audioContext.destination;
  audioOutput.connect(masterInput);

  updateAudioDistortion();
}

function drawBezel() {
  noFill();
  stroke(0, 95, 54, 155);
  strokeWeight(1);
  rect(0, 0, width, height);

  stroke(0, 255, 112, 38);
  strokeWeight(1);
  rect(22, 22, width - 44, height - 44);

  stroke(0, 255, 112, 70);
  line(22, 50, 82, 50);
  line(width - 82, 50, width - 22, 50);
  line(22, height - 50, 82, height - 50);
  line(width - 82, height - 50, width - 22, height - 50);

  stroke(235, 255, 245, 125);
  line(width - 118, 0, width - 118, height * 0.28);

  stroke(0, 255, 112, 42);
  line(width - 118, height * 0.28, width - 118, height);
}

function drawScene(waveform, spectrum, level) {
  autoRotation += map(level, 0, 0.35, 0.004, 0.018, true);

  ambientLight(20, 35, 45);
  pointLight(60, 255, 165, -width * 0.25, -height * 0.35, 320);
  pointLight(70, 165, 255, width * 0.28, height * 0.18, 260);

  drawStarField(level);

  push();
  rotateX(sphereRotationX + sin(frameCount * 0.006) * 0.035);
  rotateY(sphereRotationY + autoRotation);
  drawEnergyField(waveform, spectrum, level);
  pop();
}

function drawHud() {
  push();
  resetMatrix();
  translate(-width / 2, -height / 2);

  drawBezel();
  drawProjectInfo();
  drawVisualControls();
  drawSpeedControl();
  drawTimeline();
  drawStatus();

  pop();
}

function drawProjectInfo() {
  const x = width - 390;
  const y = 78;
  const boxWidth = 320;
  const boxHeight = 106;

  noStroke();
  fill(0, 8, 5, 185);
  rect(x, y, boxWidth, boxHeight);

  noFill();
  stroke(0, 255, 112, 75);
  strokeWeight(1);
  rect(x, y, boxWidth, boxHeight);

  fill(190, 255, 212, 230);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(13);
  text("ROTOSCOPIO DE ATOMO", x + 14, y + 12);

  fill(110, 255, 170, 170);
  textSize(10);
  text("Composicion audio-reactiva basada en un atomo.", x + 14, y + 36);
  text("Las orbitas y el nucleo estan trazados con", x + 14, y + 52);
  text("lineas tipo frame-by-frame / onion-skin.", x + 14, y + 68);
  text("La musica modifica distorsion, escala y energia.", x + 14, y + 84);
}

function drawScreen(waveform, level) {
  const margin = 56;
  const screenX = margin;
  const screenY = margin;
  const screenWidth = width - margin * 2;
  const screenHeight = height - margin * 2;
  const centerX = screenX + screenWidth / 2;
  const centerY = screenY + screenHeight / 2;

  noStroke();
  fill(0, 8, 2);
  rect(screenX, screenY, screenWidth, screenHeight);

  drawVignette(screenX, screenY, screenWidth, screenHeight);
  drawOscGrid(screenX, screenY, screenWidth, screenHeight);
  drawLissajous(waveform, level, centerX, centerY, screenWidth, screenHeight);

  noFill();
  stroke(30, 80, 50, 120);
  strokeWeight(2);
  rect(screenX, screenY, screenWidth, screenHeight);
}

function drawStarField(level) {
  push();
  strokeWeight(1);

  for (let i = -8; i <= 8; i++) {
    const x = i * width * 0.065;

    stroke(0, 255, 112, 7 + level * 20);
    line(x, -height * 0.48, -680, x, height * 0.48, -680);
  }

  for (let i = -5; i <= 5; i++) {
    const y = i * height * 0.08;

    stroke(0, 255, 112, 6 + level * 18);
    line(-width * 0.5, y, -680, width * 0.5, y, -680);
  }

  for (let i = 0; i < 34; i++) {
    const angle = i * 0.739 + frameCount * 0.001;
    const radius = min(width, height) * (0.34 + (i % 7) * 0.045);

    stroke(0, 255, 112, 12 + level * 45);
    point(cos(angle) * radius, sin(angle * 1.7) * radius * 0.75, -260 - i * 8);
  }

  pop();
}

function drawEnergyField(waveform, spectrum, level) {
  if (!songReady || waveform.length === 0) {
    drawIdleField();
    return;
  }

  const baseRadius = min(width, height) * 0.24 * visualSize;
  const pulse = map(level, 0, 0.35, 0, baseRadius * 0.24, true);
  const bass = getBandEnergy(spectrum, 0, 90) / 255;
  const mid = getBandEnergy(spectrum, 90, 240) / 255;
  const high = getBandEnergy(spectrum, 240, FFT_BINS) / 255;

  noFill();
  blendMode(ADD);
  drawingContext.shadowBlur = 20;
  drawingContext.shadowColor = "rgba(0, 255, 120, 0.58)";

  drawNucleusGlow(baseRadius, pulse, bass, mid, high, level);
  drawOscilloscopeWireframe(waveform, baseRadius, pulse, bass, mid, high, level);
  drawOrbitalBands(waveform, baseRadius, pulse, bass, mid, high, level);
  drawScanNodes(waveform, baseRadius, pulse, bass, mid, high, level);
  drawRotoscopeAtom(waveform, baseRadius, pulse, bass, mid, high, level);

  drawingContext.shadowBlur = 0;
  blendMode(BLEND);
}

function drawIdleField() {
  push();
  noFill();
  blendMode(ADD);
  stroke(0, 190, 88, 80);
  strokeWeight(1);

  const baseRadius = min(width, height) * 0.24 * visualSize;
  drawNucleusGlow(baseRadius, 0, 0, 0, 0, 0);
  drawOscilloscopeWireframe(EMPTY_WAVEFORM, baseRadius, 0, 0, 0, 0, 0);
  drawOrbitalBands(EMPTY_WAVEFORM, baseRadius, 0, 0, 0, 0, 0);
  drawScanNodes(EMPTY_WAVEFORM, baseRadius, 0, 0, 0, 0, 0);
  drawRotoscopeAtom(EMPTY_WAVEFORM, baseRadius, 0, 0, 0, 0, 0);

  blendMode(BLEND);
  pop();
}

function drawOscilloscopeWireframe(waveform, baseRadius, pulse, bass, mid, high, level) {
  const uSteps = 84;
  const latitudes = 12 + floor(coreDensity * 10);
  const longitudes = 18 + floor(coreDensity * 14);
  const glowAlpha = 20 + level * 130;

  for (let lat = 1; lat < latitudes; lat++) {
    const v = map(lat, 0, latitudes, -HALF_PI, HALF_PI);
    const edgeFade = pow(cos(v), 0.55);
    stroke(0, 255, 92, (16 + edgeFade * 58 + glowAlpha) * (0.45 + coreDensity * 0.65));
    strokeWeight(0.45 + edgeFade * 0.55 + level * 1.2);
    beginShape();

    for (let i = 0; i <= uSteps; i++) {
      const u = map(i, 0, uSteps, 0, TWO_PI);
      const p = oscilloscopePoint(u, v, baseRadius, pulse, bass, mid, high, waveform);

      vertex(p.x, p.y, p.z);
    }

    endShape();
  }

  for (let lon = 0; lon < longitudes; lon++) {
    const u = map(lon, 0, longitudes, 0, TWO_PI);
    stroke(45, 255, 126, 14 + level * 100);
    strokeWeight(0.36 + high * 0.9 + level * 0.9);
    beginShape();

    for (let i = 0; i <= uSteps; i++) {
      const v = map(i, 0, uSteps, -HALF_PI, HALF_PI);
      const p = oscilloscopePoint(u, v, baseRadius, pulse, bass, mid, high, waveform);

      vertex(p.x, p.y, p.z);
    }

    endShape();
  }
}

function drawOrbitalBands(waveform, baseRadius, pulse, bass, mid, high, level) {
  const bands = 6;
  const offsets = 3 + floor(rayIntensity * 3);
  const steps = 144;

  for (let band = 0; band < bands; band++) {
    push();

    if (band === 1) {
      rotateX(HALF_PI);
    } else if (band === 2) {
      rotateY(HALF_PI);
    } else if (band === 3) {
      rotateX(QUARTER_PI);
      rotateY(QUARTER_PI * 1.4);
    } else if (band === 4) {
      rotateX(-QUARTER_PI * 1.3);
      rotateZ(QUARTER_PI);
    } else if (band === 5) {
      rotateY(QUARTER_PI * 1.6);
      rotateZ(-QUARTER_PI * 0.7);
    }

    for (let offset = -offsets; offset <= offsets; offset++) {
      const offsetRatio = offset / max(offsets, 1);
      const alpha = map(abs(offsetRatio), 0, 1, 112, 18) + level * 130;
      const bandOffset = offsetRatio * baseRadius * 0.12;

      stroke(0, 255, 112, alpha);
      strokeWeight(0.55 + (1 - abs(offsetRatio)) * 1.25 + level * 1.5);
      beginShape();

      for (let i = 0; i <= steps; i++) {
        const t = map(i, 0, steps, 0, TWO_PI);
        const p = orbitalPoint(t, bandOffset, band, baseRadius, pulse, bass, mid, high, waveform);

        vertex(p.x, p.y, p.z);
      }

      endShape();
    }

    pop();
  }
}

function drawScanNodes(waveform, baseRadius, pulse, bass, mid, high, level) {
  const nodes = 10;

  for (let i = 0; i < nodes; i++) {
    const t = i * TWO_PI / nodes + frameCount * (0.005 + (i % 3) * 0.0015);
    const p = orbitalPoint(t, 0, i % 4, baseRadius, pulse, bass, mid, high, waveform);
    const spark = abs(distortWave(getWaveAt(waveform, i * 101 + frameCount * 1.8)));
    const size = 5 + spark * 14 + level * 22;

    push();
    translate(p.x, p.y, p.z);
    stroke(190, 255, 210, 110 + spark * 130);
    strokeWeight(0.8);
    noFill();
    circle(0, 0, size);

    stroke(0, 255, 112, 70 + spark * 120);
    strokeWeight(4 + spark * 7);
    point(0, 0, 0);
    pop();
  }
}

function drawNucleusGlow(baseRadius, pulse, bass, mid, high, level) {
  const glow = baseRadius * (0.42 + bass * 0.18 + level * 0.5);

  push();
  noFill();

  for (let i = 0; i < 5; i++) {
    const size = glow * (0.58 + i * 0.18) + pulse * 0.35;
    const alpha = 34 - i * 5 + level * 110;

    stroke(0, 255, 112, alpha);
    strokeWeight(6 - i * 0.8);
    circle(0, 0, size);

    rotateX(HALF_PI / 5);
    rotateY(HALF_PI / 7);
  }

  stroke(210, 255, 225, 120 + level * 160);
  strokeWeight(3 + level * 7);
  point(0, 0, 0);
  pop();
}

function drawRotoscopeAtom(waveform, baseRadius, pulse, bass, mid, high, level) {
  const frameIndex = floor(frameCount / ROTOSCOPE_FRAME_HOLD);
  const passes = [
    { age: 2, alpha: 20, spread: 8 },
    { age: 1, alpha: 36, spread: 5 },
    { age: 0, alpha: 120, spread: 2 }
  ];

  drawingContext.shadowBlur = 7;
  drawingContext.shadowColor = "rgba(180, 255, 210, 0.75)";

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    const tracedFrame = frameIndex - pass.age;

    drawRotoscopeNucleus(tracedFrame, baseRadius, pulse, bass, level, pass.alpha, pass.spread);

    for (let orbit = 0; orbit < 6; orbit++) {
      push();
      applyRotoscopeOrbitRotation(orbit);
      drawRotoscopeOrbit(waveform, tracedFrame, orbit, baseRadius, pulse, bass, mid, high, level, pass.alpha, pass.spread);
      pop();
    }
  }

  drawingContext.shadowBlur = 0;
}

function drawRotoscopeNucleus(frameIndex, baseRadius, pulse, bass, level, alpha, spread) {
  const contourCount = 4;

  for (let contour = 0; contour < contourCount; contour++) {
    const radius = baseRadius * (0.15 + contour * 0.035 + bass * 0.04) + pulse * 0.18;

    stroke(200, 255, 218, alpha * (1 - contour * 0.12));
    strokeWeight(contour === 0 ? 2.2 : 1.1);
    noFill();
    beginShape();

    for (let i = 0; i <= 72; i++) {
      const t = map(i, 0, 72, 0, TWO_PI);
      const wobble = rotoscopeNoise(i, contour, frameIndex) * spread;
      const r = radius + wobble + sin(t * 5 + frameIndex * 0.21) * (2 + level * 10);

      vertex(cos(t) * r, sin(t) * r, sin(t * 3) * r * 0.12);
    }

    endShape();
  }
}

function drawRotoscopeOrbit(waveform, frameIndex, orbit, baseRadius, pulse, bass, mid, high, level, alpha, spread) {
  const steps = 118;
  const duplicates = orbit % 2 === 0 ? 2 : 1;

  for (let copy = 0; copy < duplicates; copy++) {
    stroke(orbit % 3 === 0 ? 220 : 0, 255, orbit % 3 === 1 ? 190 : 112, alpha);
    strokeWeight(copy === 0 ? 1.8 + level * 1.6 : 0.75);
    noFill();
    beginShape();

    for (let i = 0; i <= steps; i++) {
      const t = map(i, 0, steps, 0, TWO_PI);
      const p = orbitalPoint(t, copy * baseRadius * 0.025, orbit, baseRadius, pulse, bass, mid, high, waveform);
      const jitter = spread + abs(distortWave(getWaveAt(waveform, i * 3 + orbit * 17))) * 8;
      const x = p.x + rotoscopeNoise(i, orbit + copy, frameIndex) * jitter;
      const y = p.y + rotoscopeNoise(i + 31, orbit, frameIndex) * jitter;
      const z = p.z + rotoscopeNoise(i + 73, copy, frameIndex) * jitter * 0.55;

      vertex(x, y, z);
    }

    endShape();
  }
}

function applyRotoscopeOrbitRotation(orbit) {
  if (orbit === 1) {
    rotateX(HALF_PI);
  } else if (orbit === 2) {
    rotateY(HALF_PI);
  } else if (orbit === 3) {
    rotateX(QUARTER_PI);
    rotateY(QUARTER_PI * 1.35);
  } else if (orbit === 4) {
    rotateX(-QUARTER_PI * 1.2);
    rotateZ(QUARTER_PI);
  } else if (orbit === 5) {
    rotateY(QUARTER_PI * 1.55);
    rotateZ(-QUARTER_PI * 0.65);
  }
}

function rotoscopeNoise(index, seed, frameIndex) {
  return sin(index * 12.9898 + seed * 78.233 + frameIndex * 1.713) * 0.5;
}

function oscilloscopePoint(u, v, baseRadius, pulse, bass, mid, high, waveform) {
  const wave = distortWave(getWaveAt(waveform, u * 91 + v * 127 + frameCount * 0.45));
  const lobe = 1 + 0.23 * cos(4 * u) * cos(2 * v) + 0.12 * sin(6 * u + frameCount * 0.01);
  const audioLift = wave * (12 + 48 * rayIntensity) + bass * 28 + high * 22 * cos(8 * u);
  const radius = (baseRadius + pulse + audioLift) * lobe;
  const flatten = 0.72 + mid * 0.22;

  return {
    x: radius * cos(v) * cos(u),
    y: radius * sin(v) * flatten,
    z: radius * cos(v) * sin(u)
  };
}

function orbitalPoint(t, offset, band, baseRadius, pulse, bass, mid, high, waveform) {
  const wave = distortWave(getWaveAt(waveform, t * 131 + band * 59 + frameCount * 0.6));
  const snap = abs(distortWave(getWaveAt(waveform, t * 151 + band * 31)));
  const r = baseRadius * (1.16 + band * 0.035) + pulse + wave * (18 + 52 * rayIntensity) + bass * 34;
  const ellipse = 0.38 + high * 0.12;
  const flutter = sin(t * 8 + frameCount * 0.03 + band) * (5 + snap * 22);

  return {
    x: cos(t) * r,
    y: sin(t * 2) * r * ellipse + offset,
    z: sin(t) * r * 0.18 + flutter + offset * 0.35
  };
}

function getWaveAt(waveform, index) {
  const wrapped = ((floor(index) % waveform.length) + waveform.length) % waveform.length;
  return waveform[wrapped] || 0;
}

function getBandEnergy(spectrum, startBin, endBin) {
  if (!spectrum || spectrum.length === 0) {
    return 0;
  }

  const start = constrain(floor(startBin), 0, spectrum.length - 1);
  const end = constrain(floor(endBin), start + 1, spectrum.length);
  let total = 0;

  for (let i = start; i < end; i++) {
    total += spectrum[i];
  }

  return total / (end - start);
}

function drawOscGrid(screenX, screenY, screenWidth, screenHeight) {
  stroke(0, 180, 60, 22);
  strokeWeight(1);

  for (let i = 0; i <= 10; i++) {
    const x = screenX + (screenWidth / 10) * i;
    line(x, screenY, x, screenY + screenHeight);
  }

  for (let i = 0; i <= 8; i++) {
    const y = screenY + (screenHeight / 8) * i;
    line(screenX, y, screenX + screenWidth, y);
  }

  stroke(0, 200, 70, 60);
  line(screenX + screenWidth / 2, screenY, screenX + screenWidth / 2, screenY + screenHeight);
  line(screenX, screenY + screenHeight / 2, screenX + screenWidth, screenY + screenHeight / 2);
}

function drawLissajous(waveform, level, centerX, centerY, screenWidth, screenHeight) {
  if (!songReady || waveform.length === 0) {
    return;
  }

  const half = floor(waveform.length / 2);
  const radius = min(screenWidth, screenHeight) * 0.62;
  const glow = map(level, 0, 0.4, 0.65, 1.45, true);
  const spikePower = map(level, 0, 0.35, 1.8, 3.2, true);
  const step = 2;

  for (let i = 0; i < half - step; i += step) {
    const current = distortWave(waveform[i]);
    const next = distortWave(waveform[i + step]);
    const opposite = distortWave(waveform[i + half]);
    const xWave = signedPow(current, spikePower);
    const yWave = signedPow(opposite, spikePower);
    const spike = abs(current - next) * radius * 0.85;
    const angle = map(i, 0, half, 0, TWO_PI);
    const x = xWave * radius + cos(angle * 9) * spike;
    const y = yWave * radius + sin(angle * 11) * spike;

    history.push({ x: centerX + x, y: centerY + y });
  }

  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  noFill();

  for (let i = 1; i < history.length; i++) {
    const point = history[i];
    const previous = history[i - 1];
    const age = i / history.length;
    const spread = 6;
    const glowX = sin(age * TWO_PI) * spread;
    const glowY = cos(age * TWO_PI) * spread;
    const sparkX = -glowX * 0.7;
    const sparkY = -glowY * 0.7;

    stroke(WAVE_COLORS.glow[0], WAVE_COLORS.glow[1], WAVE_COLORS.glow[2], age * 120 * glow);
    strokeWeight(7);
    line(previous.x + glowX, previous.y + glowY, point.x + glowX, point.y + glowY);

    stroke(WAVE_COLORS.core[0], WAVE_COLORS.core[1], WAVE_COLORS.core[2], age * 230 * glow);
    strokeWeight(2.8);
    line(previous.x, previous.y, point.x, point.y);

    stroke(WAVE_COLORS.spark[0], WAVE_COLORS.spark[1], WAVE_COLORS.spark[2], age * 255 * glow);
    strokeWeight(1.4);
    line(previous.x + sparkX, previous.y + sparkY, point.x + sparkX, point.y + sparkY);
  }
}

function drawVignette(screenX, screenY, screenWidth, screenHeight) {
  noStroke();

  for (let i = 0; i < 12; i++) {
    fill(0, 0, 0, map(i, 0, 12, 0, 40));
    rect(screenX + i, screenY + i, screenWidth - i * 2, screenHeight - i * 2);
  }
}

function drawTimeline() {
  const timeline = getTimelineBounds();
  const progress = getSongProgress();
  const playheadX = timeline.x + timeline.width * progress;

  noStroke();
  fill(0, 14, 8, 210);
  rect(timeline.x, timeline.y, timeline.width, timeline.height);

  fill(0, 255, 112, 190);
  rect(timeline.x, timeline.y, timeline.width * progress, timeline.height);

  stroke(0, 255, 112, 88);
  strokeWeight(1);
  noFill();
  rect(timeline.x, timeline.y, timeline.width, timeline.height);

  fill(210, 255, 220);
  noStroke();
  rect(playheadX - 2, timeline.y - 6, 4, timeline.height + 12);
}

function setupParameterOverlay() {
  // Información ya está en el panel HTML, no necesitamos crear overlay adicional
}

function updateParameterOverlay() {
  // Información mostrada en el panel HTML lateral
}

function getParameterRow(label, value, range, description) {
  return (
    "<div style='height:45px;margin-bottom:0;'>" +
    "<div style='display:flex;justify-content:space-between;font-size:12px;line-height:1.1;background:rgba(0,0,0,0.8);padding:2px 4px;'>" +
    "<span><strong>" + label + "</strong> <span style='color:#ffffff;'>" + value + "</span></span>" +
    "<span style='color:#7dffae;'>" + range + "</span>" +
    "</div>" +
    "<div style='margin-top:4px;font-size:10px;line-height:1.15;color:#eaffee;background:rgba(0,0,0,0.7);padding:2px 4px;'>" + description + "</div>" +
    "</div>"
  );
}

function drawVisualControls() {
  const panel = getVisualPanelBounds();
  const controls = getVisualControls();

  noStroke();
  fill(0, 18, 9, 245);
  rect(panel.x, panel.y, panel.width, panel.height);

  noFill();
  stroke(80, 255, 150, 190);
  strokeWeight(1);
  rect(panel.x, panel.y, panel.width, panel.height);

  stroke(0, 255, 112, 120);
  line(panel.x, panel.y + 26, panel.x + panel.width, panel.y + 26);
  line(panel.x + 10, panel.y + 8, panel.x + 34, panel.y + 8);
  line(panel.x + panel.width - 34, panel.y + 8, panel.x + panel.width - 10, panel.y + 8);

  drawModeButtons(controls.mode);
  drawSliderControl(controls.distortion, distortionAmount, 0.5, 5);
  drawSliderControl(controls.size, visualSize, 0.65, 1.7);
  drawSliderControl(controls.rays, rayIntensity, 0.45, 2.4);
  drawSliderControl(controls.core, coreDensity, 0, 1);
}

function drawModeButtons(bounds) {
  const buttonGap = 4;
  const buttonWidth = (bounds.width - buttonGap * (DISTORTION_MODES.length - 1)) / DISTORTION_MODES.length;

  for (let i = 0; i < DISTORTION_MODES.length; i++) {
    const x = bounds.x + i * (buttonWidth + buttonGap);
    const active = i === distortionModeIndex;

    noStroke();
    fill(active ? color(0, 255, 112, 205) : color(0, 28, 16, 190));
    rect(x, bounds.y, buttonWidth, bounds.height);

    noFill();
    stroke(active ? color(210, 255, 225, 180) : color(0, 255, 112, 62));
    strokeWeight(1);
    rect(x, bounds.y, buttonWidth, bounds.height);

    fill(active ? color(0, 18, 9) : color(155, 255, 205, 180));
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(9);
    text(getModeLabel(DISTORTION_MODES[i]), x + buttonWidth / 2, bounds.y + bounds.height / 2);
  }
}

function drawSliderControl(bounds, value, minValue, maxValue) {
  const progress = map(value, minValue, maxValue, 0, 1, true);
  const knobX = bounds.x + bounds.width * progress;

  stroke(0, 255, 112, 60);
  strokeWeight(1);
  line(bounds.x, bounds.y + bounds.height / 2, bounds.x + bounds.width, bounds.y + bounds.height / 2);

  for (let i = 0; i <= 8; i++) {
    const x = bounds.x + bounds.width * (i / 8);
    const tick = i % 4 === 0 ? 7 : 4;

    stroke(0, 255, 112, 45);
    line(x, bounds.y + bounds.height / 2 - tick, x, bounds.y + bounds.height / 2 + tick);
  }

  noStroke();
  fill(0, 255, 112, 190);
  rect(bounds.x, bounds.y + bounds.height / 2 - 1, bounds.width * progress, 2);

  fill(215, 255, 228);
  rect(knobX - 3, bounds.y - 6, 6, bounds.height + 12);
}

function drawSpeedControl() {
  const speedControl = getSpeedControlBounds();
  const progress = map(playbackRate, 0.5, 2, 0, 1, true);
  const playheadX = speedControl.x + speedControl.width * progress;

  noStroke();
  fill(0, 14, 8, 205);
  rect(speedControl.x, speedControl.y, speedControl.width, speedControl.height);

  fill(0, 255, 112, 175);
  rect(speedControl.x, speedControl.y, speedControl.width * progress, speedControl.height);

  stroke(0, 255, 112, 70);
  strokeWeight(1);
  noFill();
  rect(speedControl.x, speedControl.y, speedControl.width, speedControl.height);

  fill(215, 255, 228);
  noStroke();
  rect(playheadX - 2, speedControl.y - 5, 4, speedControl.height + 10);

  fill(0, 220, 90, 160);
  textAlign(CENTER, CENTER);
  textSize(12);
  text("PLAYBACK RATE " + nf(playbackRate, 1, 2) + "x", width / 2, speedControl.y - 14);
}

function drawStatus() {
  noStroke();
  fill(0, 220, 90, 180);
  textAlign(CENTER, CENTER);
  textSize(12);
  text(getStatusText(), width / 2, 36);
  text(getDistortionText(), width / 2, 56);

  if (songReady && !loadError) {
    text(formatTime(song.currentTime()) + " / " + formatTime(song.duration()), width / 2, height - 24);
  }
}

function getStatusText() {
  if (loadError) {
    return "NO SE PUDO CARGAR EL MP3";
  }

  if (!songReady) {
    return "LOADING SNOW STRIPPERS...";
  }

  if (song.isPlaying()) {
    return "SIGNAL LOCK  ROTOSCOPE ATOM  > SNOW STRIPPERS";
  }

  return "CLICK TO ARM AUDIO";
}

function getDistortionText() {
  return "FRAME-BY-FRAME TRACE  WAVESHAPER " + DISTORTION_MODES[distortionModeIndex] + "  DRIVE " + nf(distortionAmount, 1, 2);
}

function toggleSong() {
  if (!songReady || loadError) {
    return;
  }

  userStartAudio();
  song.isPlaying() ? song.pause() : song.play();
}

function mousePressed() {
  pointerDownX = mouseX;
  pointerDownY = mouseY;
  pointerMoved = false;
  pointerStartedOnControl = isPointerOnControl(mouseX, mouseY);

  if (isPointerOnTimeline(mouseX, mouseY)) {
    seekSong(mouseX);
    isSeeking = true;
    return;
  }

  if (isPointerOnSpeedControl(mouseX, mouseY)) {
    changeSpeed(mouseX);
    isChangingSpeed = true;
    return;
  }

  activeVisualControl = getVisualControlAt(mouseX, mouseY);

  if (activeVisualControl) {
    updateVisualControl(activeVisualControl, mouseX);
  }
}

function mouseDragged() {
  if (dist(mouseX, mouseY, pointerDownX, pointerDownY) > 6) {
    pointerMoved = true;
  }

  if (!pointerStartedOnControl && !isSeeking && !isChangingSpeed) {
    rotateSphereWithPointer(movedX, movedY);
  }

  if (activeVisualControl) {
    updateVisualControl(activeVisualControl, mouseX);
  }

  if (isSeeking) {
    seekSong(mouseX);
  }

  if (isChangingSpeed) {
    changeSpeed(mouseX);
  }
}

function mouseReleased() {
  if (!pointerStartedOnControl && !pointerMoved) {
    toggleSong();
  }

  isSeeking = false;
  isChangingSpeed = false;
  activeVisualControl = null;
}

function touchStarted() {
  pointerDownX = mouseX;
  pointerDownY = mouseY;
  pointerMoved = false;
  pointerStartedOnControl = isPointerOnControl(mouseX, mouseY);

  if (isPointerOnTimeline(mouseX, mouseY)) {
    seekSong(mouseX);
    isSeeking = true;
    return false;
  }

  if (isPointerOnSpeedControl(mouseX, mouseY)) {
    changeSpeed(mouseX);
    isChangingSpeed = true;
    return false;
  }

  activeVisualControl = getVisualControlAt(mouseX, mouseY);

  if (activeVisualControl) {
    updateVisualControl(activeVisualControl, mouseX);
  }

  return false;
}

function touchMoved() {
  if (dist(mouseX, mouseY, pointerDownX, pointerDownY) > 6) {
    pointerMoved = true;
  }

  if (!pointerStartedOnControl && !isSeeking && !isChangingSpeed) {
    rotateSphereWithPointer(movedX, movedY);
  }

  if (activeVisualControl) {
    updateVisualControl(activeVisualControl, mouseX);
  }

  if (isSeeking) {
    seekSong(mouseX);
  }

  if (isChangingSpeed) {
    changeSpeed(mouseX);
  }

  return false;
}

function touchEnded() {
  if (!pointerStartedOnControl && !pointerMoved) {
    toggleSong();
  }

  isSeeking = false;
  isChangingSpeed = false;
  activeVisualControl = null;
}

function keyPressed() {
  if (key === " ") {
    toggleSong();
  }

  if (key === "d" || key === "D") {
    changeDistortionMode();
  }

  if (key === "+" || key === "=") {
    changeDistortionAmount(0.1);
  }

  if (key === "-" || key === "_") {
    changeDistortionAmount(-0.1);
  }

  if (key === "[" || key === "{") {
    visualSize = constrain(visualSize - 0.05, 0.65, 1.7);
  }

  if (key === "]" || key === "}") {
    visualSize = constrain(visualSize + 0.05, 0.65, 1.7);
  }
}

function rotateSphereWithPointer(deltaX, deltaY) {
  sphereRotationY += deltaX * 0.01;
  sphereRotationX = constrain(sphereRotationX - deltaY * 0.01, -PI * 0.8, PI * 0.8);
}

function seekSong(pointerX) {
  if (!songReady || loadError) {
    return;
  }

  const timeline = getTimelineBounds();
  const progress = constrain((pointerX - timeline.x) / timeline.width, 0, 1);
  song.jump(song.duration() * progress);
  history = [];
}

function changeSpeed(pointerX) {
  if (!songReady || loadError) {
    return;
  }

  const speedControl = getSpeedControlBounds();
  const progress = constrain((pointerX - speedControl.x) / speedControl.width, 0, 1);
  playbackRate = map(progress, 0, 1, 0.5, 2);
  song.rate(playbackRate);
}

function changeDistortionMode() {
  distortionModeIndex = (distortionModeIndex + 1) % DISTORTION_MODES.length;
  updateAudioDistortion();
  history = [];
}

function changeDistortionAmount(delta) {
  distortionAmount = constrain(distortionAmount + delta, 0.5, 5);
  updateAudioDistortion();
  history = [];
}

function updateVisualControl(controlName, pointerX) {
  if (controlName === "mode") {
    const modeBounds = getVisualControls().mode;
    const buttonWidth = modeBounds.width / DISTORTION_MODES.length;
    const nextMode = constrain(floor((pointerX - modeBounds.x) / buttonWidth), 0, DISTORTION_MODES.length - 1);

    if (nextMode !== distortionModeIndex) {
      distortionModeIndex = nextMode;
      updateAudioDistortion();
    }

    return;
  }

  const bounds = getVisualControls()[controlName];
  const progress = constrain((pointerX - bounds.x) / bounds.width, 0, 1);

  if (controlName === "distortion") {
    distortionAmount = map(progress, 0, 1, 0.5, 5);
    updateAudioDistortion();
    return;
  }

  if (controlName === "size") {
    visualSize = map(progress, 0, 1, 0.65, 1.7);
    return;
  }

  if (controlName === "rays") {
    rayIntensity = map(progress, 0, 1, 0.45, 2.4);
    return;
  }

  if (controlName === "core") {
    coreDensity = map(progress, 0, 1, 0, 1);
  }
}

function updateAudioDistortion() {
  if (!audioShaper || !dryGain || !wetGain) {
    return;
  }

  const mode = DISTORTION_MODES[distortionModeIndex];
  const wet = mode === "NORMAL" ? 0 : map(distortionAmount, 0.5, 5, 0.18, 0.95, true);
  const dry = mode === "NORMAL" ? 1 : 1 - wet * 0.35;

  audioShaper.curve = makeAudioDistortionCurve(mode, distortionAmount);
  dryGain.gain.value = dry;
  wetGain.gain.value = wet;
}

function makeAudioDistortionCurve(mode, amount) {
  const curveLength = 4096;
  const curve = new Float32Array(curveLength);

  for (let i = 0; i < curveLength; i++) {
    const x = map(i, 0, curveLength - 1, -1, 1);
    curve[i] = shapeWave(x, mode, amount);
  }

  return curve;
}

function distortWave(value) {
  return shapeWave(value, DISTORTION_MODES[distortionModeIndex], distortionAmount);
}

function shapeWave(value, mode, amount) {
  const driven = value * amount;

  if (mode === "HARD_CLIP") {
    return constrain(driven, -0.72, 0.72) / 0.72;
  }

  if (mode === "SOFT_CLIP") {
    return tanh(driven);
  }

  if (mode === "WAVEFOLD") {
    return wavefold(driven);
  }

  return value;
}

function wavefold(value) {
  let folded = value;

  while (folded > 1 || folded < -1) {
    if (folded > 1) {
      folded = 2 - folded;
    }

    if (folded < -1) {
      folded = -2 - folded;
    }
  }

  return folded;
}

function tanh(value) {
  const positive = Math.exp(value);
  const negative = Math.exp(-value);

  return (positive - negative) / (positive + negative);
}

function signedPow(value, power) {
  return Math.sign(value) * Math.pow(abs(value), power);
}

function getSongProgress() {
  if (!songReady || loadError || song.duration() === 0) {
    return 0;
  }

  return constrain(song.currentTime() / song.duration(), 0, 1);
}

function getTimelineBounds() {
  return {
    x: width * 0.18,
    y: height - 52,
    width: width * 0.64,
    height: 7
  };
}

function getSpeedControlBounds() {
  return {
    x: width * 0.28,
    y: height - 92,
    width: width * 0.44,
    height: 7
  };
}

function getVisualPanelBounds() {
  const panelWidth = min(520, width - 92);

  return {
    x: 46,
    y: max(76, height - 360),
    width: panelWidth,
    height: 250
  };
}

function getVisualControls() {
  const panel = getVisualPanelBounds();
  const x = panel.x + 230;
  const width = panel.width - 248;
  const firstSliderY = panel.y + 78;
  const gap = 45;

  return {
    mode: {
      x,
      y: panel.y + 32,
      width,
      height: 20
    },
    distortion: {
      x,
      y: firstSliderY,
      width,
      height: 6
    },
    size: {
      x,
      y: firstSliderY + gap,
      width,
      height: 6
    },
    rays: {
      x,
      y: firstSliderY + gap * 2,
      width,
      height: 6
    },
    core: {
      x,
      y: firstSliderY + gap * 3,
      width,
      height: 6
    }
  };
}

function isPointerOnTimeline(pointerX, pointerY) {
  const timeline = getTimelineBounds();
  const hitPadding = 18;

  return (
    pointerX >= timeline.x &&
    pointerX <= timeline.x + timeline.width &&
    pointerY >= timeline.y - hitPadding &&
    pointerY <= timeline.y + timeline.height + hitPadding
  );
}

function isPointerOnSpeedControl(pointerX, pointerY) {
  const speedControl = getSpeedControlBounds();
  const hitPadding = 18;

  return (
    pointerX >= speedControl.x &&
    pointerX <= speedControl.x + speedControl.width &&
    pointerY >= speedControl.y - hitPadding &&
    pointerY <= speedControl.y + speedControl.height + hitPadding
  );
}

function isPointerOnControl(pointerX, pointerY) {
  return isPointerOnTimeline(pointerX, pointerY) || isPointerOnSpeedControl(pointerX, pointerY) || Boolean(getVisualControlAt(pointerX, pointerY));
}

function getVisualControlAt(pointerX, pointerY) {
  const controls = getVisualControls();

  if (isPointerInBounds(pointerX, pointerY, controls.mode, 5)) {
    return "mode";
  }

  if (isPointerInBounds(pointerX, pointerY, controls.distortion, 11)) {
    return "distortion";
  }

  if (isPointerInBounds(pointerX, pointerY, controls.size, 11)) {
    return "size";
  }

  if (isPointerInBounds(pointerX, pointerY, controls.rays, 11)) {
    return "rays";
  }

  if (isPointerInBounds(pointerX, pointerY, controls.core, 11)) {
    return "core";
  }

  return null;
}

function isPointerInBounds(pointerX, pointerY, bounds, padding) {
  return (
    pointerX >= bounds.x - padding &&
    pointerX <= bounds.x + bounds.width + padding &&
    pointerY >= bounds.y - padding &&
    pointerY <= bounds.y + bounds.height + padding
  );
}

function getModeLabel(mode) {
  if (mode === "HARD_CLIP") {
    return "HARD";
  }

  if (mode === "SOFT_CLIP") {
    return "SOFT";
  }

  if (mode === "WAVEFOLD") {
    return "FOLD";
  }

  return "NORM";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const minutes = floor(seconds / 60);
  const remainingSeconds = floor(seconds % 60);

  return minutes + ":" + nf(remainingSeconds, 2);
}

function windowResized() {
  let container = document.querySelector('.canvas-wrapper');
  if (container) {
    resizeCanvas(container.offsetWidth, container.offsetHeight);
  }
}

function getAssetPath(path) {
  if (window.location.pathname.includes("/audioreactivo/")) {
    return "../" + path;
  }

  return path;
}
