const AUDIO_PATH = "audio/Snow Strippers Aching Like It s Official Video.mp3";
const DEFAULT_AUDIO_NAME = AUDIO_PATH.split('/').pop();
const MAX_HISTORY = 560;
const FFT_BINS = 512;
const SPHERE_ROWS = 44;
const SPHERE_COLS = 96;
const EMPTY_WAVEFORM = new Array(FFT_BINS).fill(0);
const EMPTY_SPECTRUM = new Array(FFT_BINS).fill(0);
const ROTOSCOPE_FRAME_HOLD = 4;

// Visual styles
const SCENE_PRESETS = ["ATOMO", "MINIMAL"];
const VISUAL_STYLES = SCENE_PRESETS;
let visualStyleIndex = 0;
let scenePresetIndex = 0;

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
let pendingSeekTime = 0;
let distortionModeIndex = 3;
let distortionAmount = 1.8;
let visualSize = 1.02;
let rayIntensity = 1.18;
let coreDensity = 0.58;
let roomTempoSensitivity = 1;
let roomHeartbeat = 0;
let roomBeatAverage = 0;
let roomBeatPrevious = 0;
let roomBeatPulse = 0;
let roomBeatCooldown = 0;
let autoCameraPulse = 0;
let autoRotation = 0;
let sphereRotationX = -0.18;
let sphereRotationY = 0;
let pointerDownX = 0;
let pointerDownY = 0;
let pointerStartedOnControl = false;
let pointerMoved = false;
let activeVisualControl = null;
let parameterOverlay;

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

  amplitude = createAmplitudeAnalyzer(audioOutput);

  initFileDropzone();
  loadDefaultAudio();
}

function createAmplitudeAnalyzer(input) {
  try {
    const analyzer = new p5.Amplitude();
    analyzer.setInput(input);
    return analyzer;
  } catch (error) {
    console.warn('No se pudo iniciar p5.Amplitude; el visual usara nivel 0 como fallback.', error);
    return {
      getLevel: () => 0,
      setInput: () => {}
    };
  }
}

function loadDefaultAudio() {
  soundFormats("mp3");
  songReady = false;
  loadError = false;

  const audioPath = getAssetPath(AUDIO_PATH);

  song = loadSound(
    audioPath,
    () => {
      songReady = true;
      loadError = false;
      pendingSeekTime = 0;
      setupAudioChain();

      if (fft) {
        fft.setInput(audioOutput);
      }

      if (amplitude) {
        amplitude.setInput(audioOutput);
      }

      setCurrentFileName(DEFAULT_AUDIO_NAME);
      showFileFeedback('Archivo actual: ' + DEFAULT_AUDIO_NAME);
    },
    (error) => {
      songReady = false;
      loadError = true;
      console.error('No se pudo cargar el audio por defecto:', audioPath, error);
      showFileFeedback('No se pudo cargar el MP3 por defecto. Arrastra un archivo .mp3 para continuar.');
    }
  );
}

function initFileDropzone() {
  const dropzone = document.getElementById('audio-dropzone');
  const fileInput = document.getElementById('audio-file-input');
  if (!dropzone || !fileInput) {
    return;
  }

  const setDropzoneActive = (active) => {
    dropzone.classList.toggle('file-dropzone--active', active);
  };

  const preventDefaults = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFiles = (files) => {
    if (!files || files.length === 0) {
      return;
    }
    console.log('handleFiles received', files[0] && files[0].name, files[0]);
    loadAudioFile(files[0]);
  };

  const handleDrop = (event) => {
    preventDefaults(event);
    setDropzoneActive(false);
    console.log('drop event', event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    handleFiles(event.dataTransfer.files);
  };

  fileInput.addEventListener('change', (event) => {
    handleFiles(event.target.files);
  });

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener('dragenter', (event) => {
    preventDefaults(event);
    setDropzoneActive(true);
  });
  dropzone.addEventListener('dragover', (event) => {
    preventDefaults(event);
    setDropzoneActive(true);
  });
  dropzone.addEventListener('dragleave', (event) => {
    preventDefaults(event);
    setDropzoneActive(false);
  });
  dropzone.addEventListener('drop', handleDrop);

  // Prevent page scroll when pressing Space if focus is not on UI.
  document.addEventListener('keydown', (e) => {
    const isSpace = e.code === 'Space' || e.key === ' ';
    if (!isSpace) return;
    try {
      const tgt = e.target || document.activeElement;
      const tag = tgt && tgt.tagName;
      const inUI = (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') || (tgt.closest && (tgt.closest('.info-panel') || tgt.closest('.file-drop-section')));
      // If the event target is a UI control, don't prevent or interfere.
      if (!inUI) {
        e.preventDefault();
        // allow propagation so p5's keyPressed receives it
      }
    } catch (err) {
      // ignore
    }
  }, { passive: false });

  setCurrentFileName(DEFAULT_AUDIO_NAME);
}

function loadAudioFile(file) {
  const lowerName = file.name.toLowerCase();
  if (!file.type.startsWith('audio/') && !lowerName.endsWith('.mp3')) {
    showFileFeedback('Solo se permite un archivo MP3 válido.');
    return;
  }

  songReady = false;
  loadError = false;
  const previousSong = song;
  const previousPlaying = previousSong && previousSong.isPlaying();
  const fileURL = URL.createObjectURL(file);

  console.log('Loading audio file (via FileReader):', file.name, file.type);

  const reader = new FileReader();
  reader.onload = function(evt) {
    const arrayBuffer = evt.target.result;
    const ctx = getAudioContext();
    const decodePromise = ctx.decodeAudioData ? ctx.decodeAudioData(arrayBuffer) : new Promise((resolve, reject) => ctx.decodeAudioData(arrayBuffer, resolve, reject));
    decodePromise.then((audioBuffer) => {
      try {
        if (previousSong && previousPlaying) {
          try { previousSong.stop(); } catch (e) {}
        }
        if (previousSong && previousSong.disconnect) {
          try { previousSong.disconnect(); } catch (e) {}
        }
      } catch (e) {}

      // convert AudioBuffer channels to array of Float32Array
      const channels = [];
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const data = audioBuffer.getChannelData(c);
        channels.push(new Float32Array(data));
      }

      // create a new p5.SoundFile and set buffer
      try {
        const sFile = new p5.SoundFile();
        sFile.setBuffer(channels);
        song = sFile;
      } catch (e) {
        console.error('Error creating p5.SoundFile:', e);
        showFileFeedback('Error interno al procesar el MP3.');
        song = previousSong;
        return;
      }

      try { setupAudioChain(); } catch (e) { console.warn('setupAudioChain failed:', e); }
      playbackRate = 1;
      pendingSeekTime = 0;
      try { song.rate(playbackRate); } catch (e) {}

      // Reconnect analyzers to the current audio output so visuals react
      try {
        if (typeof fft !== 'undefined' && fft) {
          fft.setInput(audioOutput);
        } else {
          fft = new p5.FFT(0.35, FFT_BINS);
          fft.setInput(audioOutput);
        }
      } catch (e) {
        console.warn('Could not set FFT input after load:', e);
      }

      try {
        if (typeof amplitude !== 'undefined' && amplitude) {
          amplitude.setInput(audioOutput);
        } else {
          amplitude = createAmplitudeAnalyzer(audioOutput);
        }
      } catch (e) {
        console.warn('Could not set Amplitude input after load:', e);
      }

      songReady = true;
      setCurrentFileName(file.name);
      showFileFeedback('Archivo cargado: ' + file.name + ' — pulsa Space o haz clic sobre el canvas para reproducir');
      syncDOMControls();

      // reset file input so same file can be selected again
      const fileInput = document.getElementById('audio-file-input');
      if (fileInput) fileInput.value = '';
    }).catch((err) => {
      loadError = true;
      const msg = (err && err.message) ? err.message : JSON.stringify(err);
      showFileFeedback('Error al decodificar el MP3: ' + msg);
      console.error('decodeAudioData error:', err);
      song = previousSong;
    });
  };

  reader.onerror = function(err) {
    loadError = true;
    showFileFeedback('Error leyendo el archivo.');
    console.error('FileReader error:', err);
    song = previousSong;
  };

  reader.readAsArrayBuffer(file);

  return null;
}

function setCurrentFileName(name) {
  const currentFileName = document.getElementById('current-file-name');
  if (currentFileName) {
    currentFileName.textContent = name;
  }
}

function showFileFeedback(message) {
  const feedback = document.getElementById('dropzone-feedback');
  if (feedback) {
    feedback.textContent = message;
  }
}

function syncDOMControls() {
  const controls = [
    ["distortion-slider", "distortion-val", distortionAmount, "", 2],
    ["size-slider", "size-val", visualSize, "", 2],
    ["rays-slider", "rays-val", rayIntensity, "", 2],
    ["room-tempo-slider", "room-tempo-val", roomTempoSensitivity, "", 2],
    ["core-slider", "core-val", coreDensity, "", 2],
    ["speed-slider", "speed-val", playbackRate, "x", 2]
  ];

  controls.forEach(([sliderId, valueId, value, suffix, decimals]) => {
    const slider = document.getElementById(sliderId);
    const valueLabel = document.getElementById(valueId);

    if (slider) {
      slider.value = value;
    }

    if (valueLabel) {
      valueLabel.textContent = value.toFixed(decimals) + suffix;
    }
  });

  const presetButtons = document.querySelectorAll('[data-scene-preset]');
  presetButtons.forEach((button) => {
    const active = Number(button.dataset.scenePreset) === scenePresetIndex;
    button.classList.toggle('preset-button--active', active);
  });
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

  if (song && song.disconnect && song.connect) {
    song.disconnect();
    song.connect(audioInput);
  }

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

function drawRoomGrid(level, spectrum) {
  push();

  const cols = 10;
  const rows = 8;
  const lowBeat = getBandEnergy(spectrum, 0, 110) / 255;
  const midBeat = getBandEnergy(spectrum, 110, 260) / 255;
  const beatEnergy = constrain(lowBeat * 0.82 + midBeat * 0.42 + level * 0.9, 0, 1);
  const adaptiveOnset = beatEnergy - roomBeatAverage;
  const instantRise = beatEnergy - roomBeatPrevious;
  const onset = max(adaptiveOnset, instantRise * 1.35);
  const threshold = map(constrain(roomBeatAverage, 0, 0.5), 0, 0.5, 0.026, 0.052);

  roomBeatAverage = lerp(roomBeatAverage, beatEnergy, 0.028);
  roomBeatCooldown = max(0, roomBeatCooldown - 1);

  if (onset > threshold && roomBeatCooldown === 0) {
    roomBeatPulse = constrain(onset * 10.5 + beatEnergy * 0.62, 0.5, 1);
    roomBeatCooldown = 5;
  }

  roomBeatPrevious = beatEnergy;
  roomBeatPulse *= 0.82;

  const energyPulse = pow(beatEnergy, 1.35) * 0.38;
  const targetPulse = max(roomBeatPulse, energyPulse);

  roomHeartbeat = lerp(roomHeartbeat, targetPulse, targetPulse > roomHeartbeat ? 0.74 : 0.18);

  const pulse = pow(roomHeartbeat, 1.08) * constrain(roomTempoSensitivity, 0, 2);
  const glowPulse = pow(roomBeatPulse, 1.05) * constrain(roomTempoSensitivity, 0, 2);
  const expansion = 1 + pulse * 0.16;
  const depthExpansion = 1 + pulse * 0.22;
  const roomW = width * 1.1 * expansion;
  const roomH = height * 1.1 * expansion;
  const depth = 900 * depthExpansion;
  const frontDepth = depth * 0.3;
  const alpha = 55 + level * 70 + pulse * 190;

  translate(0, 0, pulse * 88);
  scale(1 + pulse * 0.035);

  stroke(0, 210 + lowBeat * 45, 180 + midBeat * 55, alpha);
  strokeWeight(0.75 + pulse * 2.5);
  noFill();

  // PISO
  for (let i = 0; i <= cols; i++) {
    const x = map(i, 0, cols, -roomW / 2, roomW / 2);
    line(x, roomH / 2, -depth, x, roomH / 2, frontDepth);
  }
  for (let i = 0; i <= rows; i++) {
    const z = map(i, 0, rows, -depth, frontDepth);
    stroke(0, 210 + lowBeat * 45, 180 + midBeat * 55, alpha * map(i, 0, rows, 1.2, 0.7));
    line(-roomW / 2, roomH / 2, z, roomW / 2, roomH / 2, z);
  }

  // TECHO
  for (let i = 0; i <= cols; i++) {
    const x = map(i, 0, cols, -roomW / 2, roomW / 2);
    line(x, -roomH / 2, -depth, x, -roomH / 2, frontDepth);
  }
  for (let i = 0; i <= rows; i++) {
    const z = map(i, 0, rows, -depth, frontDepth);
    stroke(0, 210 + lowBeat * 45, 180 + midBeat * 55, alpha * map(i, 0, rows, 1.1, 0.65));
    line(-roomW / 2, -roomH / 2, z, roomW / 2, -roomH / 2, z);
  }

  // PARED IZQUIERDA
  for (let i = 0; i <= rows; i++) {
    const y = map(i, 0, rows, -roomH / 2, roomH / 2);
    stroke(0, 210 + lowBeat * 45, 180 + midBeat * 55, alpha * 0.88);
    line(-roomW / 2, y, -depth, -roomW / 2, y, frontDepth);
  }
  for (let i = 0; i <= rows; i++) {
    const z = map(i, 0, rows, -depth, frontDepth);
    line(-roomW / 2, -roomH / 2, z, -roomW / 2, roomH / 2, z);
  }

  // PARED DERECHA
  for (let i = 0; i <= rows; i++) {
    const y = map(i, 0, rows, -roomH / 2, roomH / 2);
    line(roomW / 2, y, -depth, roomW / 2, y, frontDepth);
  }
  for (let i = 0; i <= rows; i++) {
    const z = map(i, 0, rows, -depth, frontDepth);
    line(roomW / 2, -roomH / 2, z, roomW / 2, roomH / 2, z);
  }

  // PARED DEL FONDO
  for (let i = 0; i <= cols; i++) {
    const x = map(i, 0, cols, -roomW / 2, roomW / 2);
    stroke(0, 245, 160 + lowBeat * 80, alpha + pulse * 110);
    line(x, -roomH / 2, -depth, x, roomH / 2, -depth);
  }
  for (let i = 0; i <= rows; i++) {
    const y = map(i, 0, rows, -roomH / 2, roomH / 2);
    line(-roomW / 2, y, -depth, roomW / 2, y, -depth);
  }

  if (pulse > 0.025) {
    push();
    translate(0, 0, -depth);
    rectMode(CENTER);
    noFill();

    for (let ring = 0; ring < 3; ring++) {
      const ringPulse = pulse * (1 + ring * 0.36);
      stroke(130, 255, 235, glowPulse * (120 - ring * 28));
      strokeWeight(1 + pulse * (3.2 - ring * 0.45));
      rect(
        0,
        0,
        roomW * (0.32 + ringPulse * 0.18),
        roomH * (0.23 + ringPulse * 0.14)
      );
    }

    stroke(0, 255, 112, glowPulse * 170);
    strokeWeight(0.8 + pulse * 2.4);
    line(-roomW * 0.22, 0, roomW * 0.22, 0);
    line(0, -roomH * 0.16, 0, roomH * 0.16);
    pop();
  }

  pop();
}

function drawScene(waveform, spectrum, level) {
  autoRotation += map(level, 0, 0.35, 0.004, 0.018, true);
  const cameraTarget = constrain(roomHeartbeat * 0.9 + level * 1.4, 0, 1);

  autoCameraPulse = lerp(autoCameraPulse, cameraTarget, cameraTarget > autoCameraPulse ? 0.24 : 0.07);

  ambientLight(20, 35, 45);
  pointLight(60, 255, 165, -width * 0.25, -height * 0.35, 320);
  pointLight(70, 165, 255, width * 0.28, height * 0.18, 260);

  push();
  const slowBreath = sin(frameCount * 0.012) * 0.018;
  const cameraZoom = 1 + slowBreath + autoCameraPulse * 0.055;
  const cameraDepth = sin(frameCount * 0.009) * 18 + autoCameraPulse * 82;

  translate(0, 0, cameraDepth);
  scale(cameraZoom);
  rotateX(sin(frameCount * 0.006) * 0.018 + autoCameraPulse * 0.012);
  rotateY(sin(frameCount * 0.004) * 0.024);

  drawStarField(level);
  drawRoomGrid(level, spectrum);

  push();
  rotateX(sphereRotationX + sin(frameCount * 0.006) * 0.035);
  rotateY(sphereRotationY + autoRotation);
  drawEnergyField(waveform, spectrum, level);
  pop();

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
  // Always draw the energy field (use EMPTY_WAVEFORM when no song loaded)
  if (!waveform || waveform.length === 0) {
    waveform = EMPTY_WAVEFORM;
  }

  const baseRadius = min(width, height) * 0.24 * visualSize;
  const pulse = map(level, 0, 0.35, 0, baseRadius * 0.24, true);
  const bass = getBandEnergy(spectrum, 0, 90) / 255;
  const mid = getBandEnergy(spectrum, 90, 240) / 255;
  const high = getBandEnergy(spectrum, 240, FFT_BINS) / 255;

  if (visualStyleIndex === 1) {
    drawMinimalAtom(waveform, baseRadius, pulse, bass, mid, high, level);
    return;
  }

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

function drawTunnelPreset(waveform, baseRadius, pulse, bass, mid, high, level) {
  push();
  noFill();
  blendMode(ADD);

  const beat = constrain(roomHeartbeat + bass * 0.35, 0, 1);
  const rings = 24 + floor(rayIntensity * 10);
  const segments = 96;
  const tunnelDepth = 1600;
  const travel = (frameCount * (4.2 + playbackRate * 1.5)) % (tunnelDepth / rings);
  const twist = frameCount * 0.006 + beat * 0.16;

  drawingContext.shadowBlur = 34;
  drawingContext.shadowColor = "rgba(0,255,140,0.9)";

  rotateZ(sin(frameCount * 0.006) * 0.06);

  for (let ring = 0; ring < rings; ring++) {
    const z = -ring * (tunnelDepth / rings) + travel;
    const depthFade = pow(map(ring, 0, rings - 1, 1, 0.14), 0.88);
    const gate = ring % 4 === 0 ? 1.22 : 1;
    const radius = baseRadius * (0.5 + ring * 0.058) * gate + beat * 52;
    const yScale = 0.52 + sin(ring * 0.7 + frameCount * 0.02) * 0.06;

    stroke(0, 245, 150 + high * 90, (38 + level * 190 + beat * 80) * depthFade);
    strokeWeight((0.55 + beat * 2.6 + high * 1.2) * depthFade);
    beginShape();

    for (let i = 0; i <= segments; i++) {
      const angle = map(i, 0, segments, 0, TWO_PI) + twist * ring;
      const wave = distortWave(getWaveAt(waveform, i * 5 + ring * 17 + frameCount));
      const teeth = sin(angle * 8 + frameCount * 0.035 + ring) * (2 + mid * 12);
      const r = radius + wave * (16 + rayIntensity * 28) + teeth;

      vertex(cos(angle) * r, sin(angle) * r * yScale, z);
    }

    endShape(CLOSE);

    if (ring % 3 === 0) {
      stroke(180, 255, 230, (18 + beat * 95) * depthFade);
      strokeWeight(0.5 + beat * 1.4);
      rectMode(CENTER);
      push();
      translate(0, 0, z);
      rotateZ(twist * ring);
      rect(0, 0, radius * 1.55, radius * 0.82);
      pop();
    }
  }

  for (let spoke = 0; spoke < 22; spoke++) {
    const angle = map(spoke, 0, 22, 0, TWO_PI) + twist;
    const inner = baseRadius * (0.18 + beat * 0.08);
    const outer = baseRadius * (2.4 + beat * 0.26);
    const yScale = 0.54;

    stroke(120, 255, 220, 35 + level * 90 + beat * 85);
    strokeWeight(0.45 + beat * 1.4);
    line(
      cos(angle) * inner,
      sin(angle) * inner * yScale,
      40,
      cos(angle) * outer,
      sin(angle) * outer * yScale,
      -tunnelDepth * 0.86
    );
  }

  for (let i = 0; i < 42; i++) {
    const angle = i * 2.399 + frameCount * 0.018;
    const lane = baseRadius * (0.45 + (i % 7) * 0.22);
    const z = -((frameCount * (9 + playbackRate * 5) + i * 87) % tunnelDepth);
    const spark = abs(distortWave(getWaveAt(waveform, i * 23 + frameCount * 1.7)));

    stroke(210, 255, 230, 45 + spark * 150);
    strokeWeight(1.3 + spark * 4 + beat * 2);
    point(cos(angle) * lane, sin(angle) * lane * 0.55, z);
  }

  drawMoireOverlay(waveform, baseRadius, level, bass, mid, high, beat, "tunnel");

  drawingContext.shadowBlur = 0;
  blendMode(BLEND);
  pop();
}

function drawMoireOverlay(waveform, baseRadius, level, bass, mid, high, beat, mode) {
  push();
  noFill();
  blendMode(ADD);

  const radius = baseRadius * (1.25 + beat * 0.18);
  const lineCount = mode === "sphere" ? 11 : mode === "minimal" ? 18 : 26;
  const step = radius * 2.15 / lineCount;
  const drift = frameCount * (0.012 + playbackRate * 0.004);
  const alpha = 12 + level * 85 + beat * 70;
  const waveAmp = (8 + mid * 24 + beat * 18) * (mode === "sphere" ? 0.5 : mode === "minimal" ? 0.45 : 1);

  drawingContext.shadowBlur = mode === "minimal" ? 8 : 18;
  drawingContext.shadowColor = "rgba(130,255,235,0.48)";

  const moireLayers = mode === "sphere" ? 1 : 2;
  const moireSteps = mode === "sphere" ? 24 : 42;

  for (let layer = 0; layer < moireLayers; layer++) {
    push();
    rotateZ((layer === 0 ? 1 : -1) * (0.16 + sin(frameCount * 0.004) * 0.06));
    rotateY((layer === 0 ? 1 : -1) * (0.08 + beat * 0.08));

    if (mode === "sphere") {
      stroke(255, 255, 255, alpha * (layer === 0 ? 0.72 : 0.46));
    } else {
      stroke(layer === 0 ? 0 : 130, 255, layer === 0 ? 145 + high * 70 : 235, alpha * (layer === 0 ? 0.9 : 0.62));
    }
    strokeWeight(mode === "minimal" ? 0.45 + beat * 0.45 : 0.55 + beat * 0.9);

    for (let row = -lineCount; row <= lineCount; row++) {
      const y = row * step * 0.5;
      const phase = drift + row * 0.17 + layer * 1.8;

      beginShape();
      for (let i = -moireSteps; i <= moireSteps; i++) {
        const x = i * radius / moireSteps;
        const localWave = distortWave(getWaveAt(waveform, i * 9 + row * 13 + frameCount * 0.8));
        const wobble = sin(i * 0.28 + phase) * waveAmp + sin(i * 0.06 + phase * 1.7) * waveAmp * 0.42;
        const z = sin(i * 0.12 + row * 0.08 + drift) * (18 + bass * 28) + localWave;

        vertex(x, y + wobble + localWave * waveAmp * 0.65, z - layer * 24);
      }
      endShape();
    }

    pop();
  }

  const rings = mode === "sphere" ? 3 : mode === "chaos" ? 9 : 6;
  for (let ring = 0; ring < rings; ring++) {
    const ringRadius = radius * (0.32 + ring * 0.12 + beat * 0.025);
    const ringAlpha = alpha * map(ring, 0, rings - 1, 0.75, 0.18);

    push();
    rotateX(HALF_PI * 0.45 + ring * 0.08);
    rotateZ(frameCount * (0.004 + ring * 0.0006));
    if (mode === "sphere") {
      stroke(255, 255, 255, ringAlpha * 0.72);
    } else {
      stroke(210, 255, 230, ringAlpha);
    }
    strokeWeight(0.4 + beat * 0.7);
    beginShape();
    const ringSteps = mode === "sphere" ? 90 : 180;
    for (let i = 0; i <= ringSteps; i++) {
      const t = map(i, 0, ringSteps, 0, TWO_PI);
      const ripple = sin(t * (7 + ring) + drift * 2.6) * (2 + high * 7);
      const r = ringRadius + ripple;

      vertex(cos(t) * r, sin(t) * r * 0.46, sin(t * 2) * 18);
    }
    endShape(CLOSE);
    pop();
  }

  drawingContext.shadowBlur = 0;
  pop();
}

// TikTok-like simplified 3D atom: dense wireframe rings + radial spokes + glowing core
// Sphere-style TikTok-like atom: dense spherical wireframe that responds to audio
function drawTikTokSphere(waveform, baseRadius, pulse, bass, mid, high, level) {
  push();
  noFill();

  const beat = constrain(roomHeartbeat + bass * 0.34 + level * 1.2, 0, 1);
  const radius = baseRadius * (1.08 + beat * 0.1) + pulse * 0.08;
  const rings = 16 + floor(coreDensity * 7);
  const steps = 84;
  const lobeCount = 9;
  const phase = frameCount * 0.012;

  drawingContext.shadowBlur = 22 + beat * 24;
  drawingContext.shadowColor = "rgba(255,255,255,0.72)";

  rotateZ(frameCount * 0.002);
  rotateY(sin(frameCount * 0.004) * 0.12);

  for (let pass = 0; pass < 2; pass++) {
    push();
    rotateZ(pass * 0.18 + frameCount * (0.0018 + pass * 0.001));
    rotateX(pass * 0.22 - 0.18);

    for (let ring = 0; ring < rings; ring++) {
      const ringRatio = map(ring, 0, rings - 1, -1, 1);
      const band = sqrt(max(0, 1 - ringRatio * ringRatio));
      const y = ringRatio * radius * (0.78 + pass * 0.035);
      const rowRadius = radius * band;
      const rowAlpha = (24 + band * 120 + level * 135 + beat * 70) * (1 - pass * 0.23);

      stroke(245, 255, 250, rowAlpha);
      strokeWeight(0.34 + band * 0.78 + beat * 0.85);
      beginShape();

      for (let i = 0; i <= steps; i++) {
        const t = map(i, 0, steps, 0, TWO_PI);
        const wave = distortWave(getWaveAt(waveform, i * 4 + ring * 19 + pass * 61));
        const flower = sin(t * lobeCount + phase + ring * 0.18 + pass) * (10 + mid * 28 + beat * 18);
        const lace = sin(t * 17 - phase * 1.4 + ring * 0.31) * (2.5 + high * 10);
        const r = rowRadius + flower * band + lace + wave * (8 + rayIntensity * 13);
        const z = sin(t * 2 + ring * 0.11 + pass) * (18 + high * 26) * band + wave * 22;

        vertex(cos(t) * r, y + sin(t * 3 + phase) * beat * 8, sin(t) * r * 0.58 + z);
      }

      endShape(CLOSE);
    }

    pop();
  }

  for (let family = 0; family < 2; family++) {
    const diagonals = 18;

    push();
    rotateZ(family === 0 ? 0.55 : -0.55);
    rotateY(family === 0 ? 0.28 : -0.28);

    stroke(255, 255, 255, 18 + level * 55 + beat * 40);
    strokeWeight(0.28 + beat * 0.35);

    for (let lineIndex = -diagonals; lineIndex <= diagonals; lineIndex++) {
      beginShape();
      for (let i = -32; i <= 32; i++) {
        const x = i * radius / 34;
        const y = lineIndex * radius / diagonals * 0.66 + sin(i * 0.15 + phase + lineIndex) * (5 + beat * 8);
        const mask = 1 - constrain((x * x + y * y) / (radius * radius * 1.04), 0, 1);

        if (mask <= 0.02) {
          endShape();
          beginShape();
          continue;
        }

        const z = sin(i * 0.2 + lineIndex * 0.21 + phase) * 42 * mask;
        vertex(x, y, z);
      }
      endShape();
    }

    pop();
  }

  for (let outline = 0; outline < 4; outline++) {
    const outlineRadius = radius * (0.96 + outline * 0.024);

    stroke(255, 255, 255, 60 + beat * 80 - outline * 5);
    strokeWeight(0.75 + beat * 1.8);
    beginShape();
    for (let i = 0; i <= 150; i++) {
      const t = map(i, 0, 150, 0, TWO_PI);
      const wave = distortWave(getWaveAt(waveform, i * 5 + outline * 43 + frameCount));
      const edge = sin(t * lobeCount + phase * 1.3 + outline) * (18 + beat * 24);
      const micro = sin(t * 31 - phase * 2) * (3 + high * 8);
      const r = outlineRadius + edge + micro + wave * 16;

      vertex(cos(t) * r, sin(t) * r * 0.86, sin(t * 2 + outline) * 34);
    }
    endShape(CLOSE);
  }

  noStroke();
  fill(255, 255, 255, 18 + beat * 32);
  circle(0, 0, radius * 0.46);
  fill(255, 255, 255, 180 + beat * 45);
  circle(0, 0, 8 + beat * 18 + level * 12);

  drawMoireOverlay(waveform, baseRadius, level, bass, mid, high, beat, "sphere");

  drawingContext.shadowBlur = 0;
  drawingContext.shadowColor = "transparent";
  pop();
}

// Geometric faceted atom: lower-poly spherical shell with quantized radius to create flat facets
function drawGeometricAtom(waveform, baseRadius, pulse, bass, mid, high, level) {
  push();
  noFill();
  strokeJoin(MITER);

  const beat = constrain(roomHeartbeat + bass * 0.45 + high * 0.22, 0, 1);
  const shardCount = 58 + floor(rayIntensity * 34);

  drawingContext.shadowBlur = 30 + beat * 26;
  drawingContext.shadowColor = "rgba(0,255,112,0.92)";

  rotateX(frameCount * 0.004 + beat * 0.12);
  rotateY(frameCount * 0.009);
  rotateZ(sin(frameCount * 0.01) * 0.18);

  for (let i = 0; i < shardCount; i++) {
    const seed = i * 12.989;
    const angle = i * 2.399963 + frameCount * (0.007 + (i % 5) * 0.0008);
    const tilt = sin(seed * 0.73) * HALF_PI;
    const wave = distortWave(getWaveAt(waveform, i * 11 + frameCount * 1.6));
    const spark = abs(distortWave(getWaveAt(waveform, i * 31 + frameCount * 2.2)));
    const radius = baseRadius * (0.35 + (i % 9) * 0.105) + wave * 56 + beat * 80;
    const x = cos(angle) * radius;
    const y = sin(angle * 1.31) * radius * 0.64;
    const z = sin(angle) * radius * 0.72 + cos(i) * 50;
    const shardSize = 12 + spark * 42 + beat * 28;

    push();
    translate(x, y, z);
    rotateX(tilt + frameCount * 0.012);
    rotateY(angle + wave * 0.8);
    rotateZ(seed + frameCount * 0.018);

    stroke(0, 255, 112 + high * 90, 42 + spark * 145 + level * 90);
    strokeWeight(0.6 + spark * 1.8 + beat * 1.2);
    beginShape();
    vertex(-shardSize * 0.55, -shardSize * 0.25, 0);
    vertex(shardSize * 0.62, -shardSize * 0.42, shardSize * 0.18);
    vertex(shardSize * 0.24, shardSize * 0.68, -shardSize * 0.18);
    endShape(CLOSE);

    if (spark > 0.35 || i % 7 === 0) {
      stroke(210, 255, 230, 36 + spark * 120);
      line(0, 0, 0, -x * 0.18, -y * 0.18, -z * 0.18);
    }

    pop();
  }

  for (let band = 0; band < 5; band++) {
    push();
    rotateX((band / 5) * PI + frameCount * 0.006);
    rotateY(frameCount * (0.01 + band * 0.002));

    stroke(band % 2 ? 130 : 0, 255, band % 2 ? 235 : 112, 52 + beat * 145);
    strokeWeight(0.8 + beat * 2.5);
    beginShape();

    for (let i = 0; i <= 180; i += 2) {
      if (i % 28 > 18) {
        endShape();
        beginShape();
        continue;
      }

      const t = map(i, 0, 180, 0, TWO_PI);
      const wave = distortWave(getWaveAt(waveform, i * 4 + band * 53));
      const r = baseRadius * (0.8 + band * 0.09) + wave * (28 + rayIntensity * 22) + beat * 48;

      vertex(cos(t) * r, sin(t) * r * (0.32 + band * 0.035), sin(t * 2) * r * 0.18);
    }

    endShape();
    pop();
  }

  noStroke();
  fill(0, 255, 112, 28 + beat * 70);
  circle(0, 0, baseRadius * (0.34 + beat * 0.45));
  fill(230, 255, 235, 190 + beat * 55);
  circle(0, 0, 12 + beat * 38 + level * 22);

  drawMoireOverlay(waveform, baseRadius, level, bass, mid, high, beat, "chaos");

  drawingContext.shadowBlur = 0;
  drawingContext.shadowColor = "transparent";
  pop();
}

function drawMinimalAtom(waveform, baseRadius, pulse, bass, mid, high, level) {
  push();
  noFill();

  const beat = constrain(roomHeartbeat + bass * 0.4 + level * 1.1, 0, 1);
  const radius = baseRadius * (0.96 + beat * 0.12);
  const latitudes = 11 + floor(coreDensity * 6);
  const longitudes = 18 + floor(rayIntensity * 7);
  const time = frameCount * 0.011;
  const grid = [];

  drawingContext.shadowBlur = 20 + beat * 24;
  drawingContext.shadowColor = "rgba(255,70,48,0.74)";

  rotateX(-0.18 + sin(frameCount * 0.006) * 0.1);
  rotateY(frameCount * 0.006);
  rotateZ(sin(frameCount * 0.005) * 0.08);

  for (let lat = 0; lat <= latitudes; lat++) {
    const v = map(lat, 0, latitudes, -HALF_PI, HALF_PI);
    const row = [];

    for (let lon = 0; lon <= longitudes; lon++) {
      const u = map(lon, 0, longitudes, 0, TWO_PI);
      const wave = distortWave(getWaveAt(waveform, lon * 9 + lat * 31 + frameCount * 1.15));
      const noisy = noise(
        cos(u) * 1.25 + 4,
        sin(u) * 1.25 + 4,
        lat * 0.18 + time
      );
      const lobes = sin(u * 5 + time * 1.7) * cos(v * 3.2 + time) + sin(u * 9 - v * 4 + time * 0.8) * 0.45;
      const distortion = (noisy - 0.5) * (95 + beat * 120) + lobes * (24 + mid * 48) + wave * (35 + high * 42);
      const r = radius + distortion;
      const squash = 0.78 + sin(u * 3 + time) * 0.08;

      row.push({
        x: r * cos(v) * cos(u) * (1.04 + beat * 0.04),
        y: r * sin(v) * squash,
        z: r * cos(v) * sin(u) * (0.72 + beat * 0.1)
      });
    }

    grid.push(row);
  }

  for (let lat = 0; lat < latitudes; lat++) {
    for (let lon = 0; lon < longitudes; lon++) {
      const a = grid[lat][lon];
      const b = grid[lat][lon + 1];
      const c = grid[lat + 1][lon + 1];
      const d = grid[lat + 1][lon];
      const edgeFade = 1 - abs((lat / latitudes) - 0.5);
      const spark = abs(distortWave(getWaveAt(waveform, lon * 17 + lat * 43 + frameCount * 2)));
      const alpha = 44 + edgeFade * 92 + beat * 95 + spark * 80;

      stroke(255, 72 + high * 90, 48, alpha);
      strokeWeight(0.45 + spark * 0.85 + beat * 0.8);

      line(a.x, a.y, a.z, b.x, b.y, b.z);
      line(b.x, b.y, b.z, c.x, c.y, c.z);
      line(c.x, c.y, c.z, d.x, d.y, d.z);
      line(d.x, d.y, d.z, a.x, a.y, a.z);

      if ((lat + lon) % 2 === 0) {
        line(a.x, a.y, a.z, c.x, c.y, c.z);
      } else {
        line(b.x, b.y, b.z, d.x, d.y, d.z);
      }
    }
  }

  stroke(255, 118, 62, 60 + beat * 120);
  strokeWeight(1.1 + beat * 1.8);
  for (let path = 0; path < 7; path++) {
    beginShape();
    for (let i = 0; i <= 160; i++) {
      const u = map(i, 0, 160, 0, TWO_PI);
      const lat = floor(map((sin(u * 2 + path) + 1) * 0.5, 0, 1, 1, latitudes - 1));
      const lon = floor(map(i % 160, 0, 160, 0, longitudes - 1));
      const p = grid[lat][lon];

      vertex(p.x, p.y, p.z);
    }
    endShape();
  }

  for (let spike = 0; spike < 26; spike++) {
    const lat = 1 + (spike * 5) % (latitudes - 1);
    const lon = (spike * 7) % longitudes;
    const p = grid[lat][lon];
    const length = 0.16 + beat * 0.18 + abs(distortWave(getWaveAt(waveform, spike * 71 + frameCount))) * 0.12;

    stroke(255, 142, 82, 28 + beat * 72);
    strokeWeight(0.45 + beat * 0.8);
    line(p.x, p.y, p.z, p.x * (1 + length), p.y * (1 + length), p.z * (1 + length));
  }

  noStroke();
  fill(255, 64, 42, 16 + beat * 40);
  circle(0, 0, radius * (0.42 + beat * 0.08));

  drawingContext.shadowBlur = 0;
  drawingContext.shadowColor = "transparent";
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
  drawStyleButtons(controls.style);
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

function drawStyleButtons(bounds) {
  const buttonGap = 6;
  const buttonWidth = (bounds.width - buttonGap * (VISUAL_STYLES.length - 1)) / VISUAL_STYLES.length;

  for (let i = 0; i < VISUAL_STYLES.length; i++) {
    const x = bounds.x + i * (buttonWidth + buttonGap);
    const active = i === visualStyleIndex;

    noStroke();
    fill(active ? color(0, 255, 112, 205) : color(0, 20, 16, 180));
    rect(x, bounds.y, buttonWidth, bounds.height);

    noFill();
    stroke(active ? color(210, 255, 225, 180) : color(0, 255, 112, 62));
    strokeWeight(1);
    rect(x, bounds.y, buttonWidth, bounds.height);

    fill(active ? color(0, 18, 9) : color(200, 255, 230, 180));
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(10);
    text(VISUAL_STYLES[i], x + buttonWidth / 2, bounds.y + bounds.height / 2 - 1);
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
    text(formatTime(getPlaybackTime()) + " / " + formatTime(song.duration()), width / 2, height - 24);
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

  if (song.isPlaying()) {
    pendingSeekTime = song.currentTime();
    song.pause();
  } else {
    const cueTime = constrain(pendingSeekTime, 0, max(0, song.duration() - 0.01));

    if (song.isPaused && song.isPaused()) {
      song.pauseTime = cueTime;
      song._pauseTime = cueTime;
    }

    song.play(0, playbackRate, undefined, cueTime);
  }
}

function mousePressed() {
  pointerDownX = mouseX;
  pointerDownY = mouseY;
  pointerMoved = false;
  pointerStartedOnControl = isPointerOnControl(mouseX, mouseY) || isPointerOnDOMUI(mouseX, mouseY);

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
    return; // Evitar que el clic en controles active toggleSong
  }
}

function mouseDragged() {
  if (dist(mouseX, mouseY, pointerDownX, pointerDownY) > 6) {
    pointerMoved = true;
  }

  if (!pointerStartedOnControl && !isPointerOnDOMUI(mouseX, mouseY) && !isSeeking && !isChangingSpeed) {
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
  if (!pointerStartedOnControl && !pointerMoved && !isSeeking && !isChangingSpeed && !activeVisualControl) {
    if (isPointerOverCanvas()) {
      toggleSong();
    }
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

  if (!pointerStartedOnControl && !isPointerOnDOMUI(mouseX, mouseY) && !isSeeking && !isChangingSpeed) {
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
  if (!pointerStartedOnControl && !pointerMoved && !isSeeking && !isChangingSpeed && !activeVisualControl) {
    if (isPointerOverCanvas()) {
      toggleSong();
    }
  }

  isSeeking = false;
  isChangingSpeed = false;
  activeVisualControl = null;
}

function keyPressed() {
  console.log('keyPressed() called - key:', key, 'keyCode:', keyCode, 'focused:', document.activeElement && document.activeElement.tagName);
  if (key === " " || keyCode === 32) {
    if (!isFocusOnUI()) {
      toggleSong();
    } else {
      console.log('Space pressed but focus is on UI, ignoring toggle');
    }
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
  seekSongToProgress(progress);
}

function seekSongToProgress(progress) {
  if (!songReady || loadError || !song || song.duration() === 0) {
    return;
  }

  const seekTime = constrain(song.duration() * progress, 0, max(0, song.duration() - 0.01));
  pendingSeekTime = seekTime;

  if (song.isPlaying()) {
    song.jump(seekTime);
  } else {
    song.pauseTime = seekTime;
    song._pauseTime = seekTime;
  }

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

function applyScenePreset(index) {
  scenePresetIndex = constrain(index, 0, SCENE_PRESETS.length - 1);
  visualStyleIndex = scenePresetIndex;

  if (scenePresetIndex === 0) {
    distortionModeIndex = 3;
    distortionAmount = 1.8;
    visualSize = 1.02;
    rayIntensity = 1.18;
    coreDensity = 0.58;
    roomTempoSensitivity = 1;
  } else {
    distortionModeIndex = 0;
    distortionAmount = 0.95;
    visualSize = 1.05;
    rayIntensity = 1.35;
    coreDensity = 0.68;
    roomTempoSensitivity = 1.05;
  }

  updateAudioDistortion();
  syncDOMControls();
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

  if (controlName === "style") {
    const bounds = getVisualControls().style;
    const buttonWidth = bounds.width / VISUAL_STYLES.length;
    const nextStyle = constrain(floor((pointerX - bounds.x) / buttonWidth), 0, VISUAL_STYLES.length - 1);

    if (nextStyle !== scenePresetIndex) {
      applyScenePreset(nextStyle);
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

  return constrain(getPlaybackTime() / song.duration(), 0, 1);
}

function getPlaybackTime() {
  if (!songReady || loadError || !song) {
    return 0;
  }

  if (song.isPlaying()) {
    pendingSeekTime = song.currentTime();
  }

  return constrain(pendingSeekTime, 0, song.duration ? song.duration() : pendingSeekTime);
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
    style: {
      x: panel.x + 14,
      y: panel.y + 32,
      width: 200,
      height: 20
    },
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

  if (isPointerInBounds(pointerX, pointerY, controls.style, 5)) {
    return "style";
  }

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

function isPointerOverCanvas() {
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + Math.max(0, Math.min(rect.width, mouseX));
  const cy = rect.top + Math.max(0, Math.min(rect.height, mouseY));
  const el = document.elementFromPoint(cx, cy);
  let node = el;
  while (node) {
    if (node === canvas) return true;
    node = node.parentElement;
  }
  return false;
}

function isFocusOnUI() {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return true;
  if (active.closest && active.closest('.info-panel')) return true;
  if (active.closest && active.closest('.file-drop-section')) return true;
  return false;
}

function isPointerOnDOMUI(pointerX, pointerY) {
  try {
    const canvas = document.querySelector('canvas');
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const x = (typeof pointerX === 'number' ? pointerX : mouseX) + rect.left;
    const y = (typeof pointerY === 'number' ? pointerY : mouseY) + rect.top;
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    if (el.closest && (el.closest('.info-panel') || el.closest('.file-drop-section'))) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || el.classList.contains('slider')) return true;
    return false;
  } catch (err) {
    return false;
  }
}

function getAssetPath(path) {
  if (window.location.pathname.includes("/audioreactivo/")) {
    return "../" + path;
  }

  return path;
}
