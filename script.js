let scene, camera, renderer, mesh;
let audioContext, analyser, audioSource, dataArray;
let isListening = false;
let audioElement = null;
let fileSource = null;
let isFileMode = false;
let beatPulse = 0;
const EMOTION_KEYS = ['calm', 'sad', 'happy', 'energetic', 'upbeat'];
let bars = [];
const BAR_COUNT = EMOTION_KEYS.length;
let visualMode = localStorage.getItem("visualMode") || "bars";
let waveLine;
let circle;
let waveSmooth = new Array(128).fill(0);

const themeColors = {
    default: 0x6B9BD1,
    neon: 0x00ffff,
    minimal: 0x222222
};


// BPM and emotion detection variables 
// need to add pitch
let bpm = 0;
let lastBeatTime = 0;
let beatTimes = [];
let detectedEmotions = [];
let lastEmotionCheck = 0;
let currentEnergy = 0;

// Emotion definitions based on BPM and energy
// Replace your emotions object with this:
const emotions = {
    calm: {
        bpmRange: [0, 90],
        energyRange: [0, 40],
        pitchRange: [50, 300],     
        color: 0x6B9BD1, name: 'Calm'
    },
    sad: {
        bpmRange: [60, 100],
        energyRange: [30, 70],     
        pitchRange: [80, 300],
        color: 0x9B59B6, name: 'Sad'
    },
    happy: {
        bpmRange: [100, 140],
        energyRange: [55, 120],   
        pitchRange: [200, 600],
        color: 0xFFD700, name: 'Happy'
    },
    energetic: {
        bpmRange: [120, 170],
        energyRange: [85, 160],    
        pitchRange: [150, 500],
        color: 0xFF6B6B, name: 'Energetic'
    },
    upbeat: {
        bpmRange: [140, 200],
        energyRange: [120, 255],   
        pitchRange: [100, 400],
        color: 0xFF4500, name: 'UpBeat'
    }
};

function createBars() {
    bars = [];

    // Responsive sizing
    const screenWidth = window.innerWidth;
    const maxBarWidth = Math.min(1, screenWidth / (BAR_COUNT * 2)); // width scales with screen
    const spacing = maxBarWidth * 1.2; // spacing slightly bigger than width
    const totalWidth = BAR_COUNT * spacing;

    for (let i = 0; i < BAR_COUNT; i++) {
        // Main bar
        const geometry = new THREE.BoxGeometry(maxBarWidth, 1, maxBarWidth);
        const material = new THREE.MeshStandardMaterial({ 
        color: 0x111111, // dark base so neon pops
        emissive: 0x000000,
        emissiveIntensity: 0
    });
        const bar = new THREE.Mesh(geometry, material);

        // Black outline
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
        bar.add(line);

        // Position bars centered
        bar.position.x = i * spacing - totalWidth / 2;
        bar.scale.y = 1; // initial height
        bar.position.y = bar.scale.y / 2;

        scene.add(bar);
        bars.push(bar);
    }
}


function createWave() {
    const theme = localStorage.getItem("theme") || "default";

    const baseColor =
        theme === "minimal" ? 0x000000 :
        theme === "neon" ? 0x00ffff :
        0xffffff;

    const points = [];

    for (let i = 0; i < 128; i++) {
        const x = (i - 64) * 0.2;
        points.push(new THREE.Vector3(x, 0, 0));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
        color: baseColor
    });

    waveLine = new THREE.Line(geometry, material);
    scene.add(waveLine);
}

function getCenterWeight(i, total) {
    const center = total / 2;
    const distance = Math.abs(i - center);
    return Math.max(0, 1 - distance / center);
}

function createCircular() {
    const theme = localStorage.getItem("theme") || "default";

    const baseColor =
        theme === "minimal" ? 0x000000 :
        theme === "neon" ? 0x00ffff :
        0xffffff;

    const geometry = new THREE.CircleGeometry(5, 128);

    const material = new THREE.MeshBasicMaterial({
        color: baseColor,
        wireframe: true
    });

    circle = new THREE.Mesh(geometry, material);
    scene.add(circle);
}

function updateBars(currentEmotion) {
    const theme = localStorage.getItem("theme");

    for (let i = 0; i < bars.length; i++) {
        const key = EMOTION_KEYS[i];

        if (key === currentEmotion) {

            const scale = 1.5 + currentEnergy / 200;
            bars[i].scale.y += (scale - bars[i].scale.y) * 0.2;
            bars[i].position.y = bars[i].scale.y / 2;

            //  ACTIVE COLOR
           if (theme === "neon") {
                bars[i].material.color.setHex(0x000000); // kill base color
                bars[i].material.emissive.setHex(emotions[key].color);
                bars[i].material.emissiveIntensity = 3; // STRONG glow
            } else {
                bars[i].material.color.setHex(emotions[key].color);
            }
        }
    }
}

function updateWave(currentEmotion) {
    if (!analyser || !waveLine) return;

    const theme = localStorage.getItem("theme");

    analyser.getByteTimeDomainData(dataArray);

    const positions = [];

    for (let i = 0; i < 128; i++) {
        const x = (i - 64) * 0.2;
        const y = (dataArray[i] - 128) / 60;
        positions.push(new THREE.Vector3(x, y, 0));
    }

    waveLine.geometry.setFromPoints(positions);

    if (currentEmotion) {
        const color = emotions[currentEmotion].color;

        if (theme === "neon") {
            waveLine.material.color.setHex(emotions[currentEmotion].color);
        } else {
            waveLine.material.color.lerp(new THREE.Color(emotions[currentEmotion].color), 0.1);
        }
    }
}

function updateCircular(currentEmotion) {
    if (!analyser || !circle) return;

    const theme = localStorage.getItem("theme");

    analyser.getByteFrequencyData(dataArray);

    const scale = 1 + currentEnergy / 150;
    circle.scale.set(scale, scale, scale);
    circle.rotation.z += 0.01;

    if (currentEmotion) {
        const color = emotions[currentEmotion].color;

        if (theme === "neon") {
            circle.material.color.setHex(emotions[currentEmotion].color);
        } else {
            circle.material.color.lerp(new THREE.Color(emotions[currentEmotion].color), 0.1);
        }
    }
}

function animateIdleBars() {
    for (let i = 0; i < bars.length; i++) {
        bars[i].scale.y = 0.5 + 0.1 * Math.sin(Date.now() * 0.002 + i);
        bars[i].position.y = bars[i].scale.y / 2;
    }
}

function clearScene() {
    bars.forEach(bar => scene.remove(bar));
    bars = [];

    if (waveLine) {
        scene.remove(waveLine);
        waveLine = null;
    }

    if (circle) {
        scene.remove(circle);
        circle = null;
    }
}

const savedTheme = localStorage.getItem("theme") || "default";
document.body.className = `theme-${savedTheme}`;

// Initialize Three.js scene
function init() {
    scene = new THREE.Scene();
    const savedTheme = localStorage.getItem("theme") || "default";
    document.body.className = `theme-${savedTheme}`;

    const theme = localStorage.getItem("theme") || "default";

    if (theme === "neon") {
        scene.background = new THREE.Color(0x000000);
    } else if (theme === "minimal") {
        scene.background = new THREE.Color(0xf2f2f2);
    } else {
        scene.background = new THREE.Color(0x0e0c32);
    }
        
    // Create gradient background
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const context = canvas.getContext('2d');

    //commented out to test if interfering with themes 
    //const texture = new THREE.CanvasTexture(canvas);
    //const color2 = new THREE.Color("#0e0c32");
    //scene.background = color2;
    
    camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 15;
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    //get latest visual mode
    visualMode = localStorage.getItem("visualMode") || "bars";

    console.log("INIT MODE:", visualMode);

    clearScene();

    if (visualMode === "bars") createBars();
    if (visualMode === "wave") createWave();
    if (visualMode === "circular") createCircular();
        
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);
    
    const pointLight2 = new THREE.PointLight(0xffffff, 0.8);
    pointLight2.position.set(-10, -10, 5);
    scene.add(pointLight2);
    
    window.addEventListener('resize', onWindowResize);
    animate();
}


// Setup audio analysis
async function setupAudio(stream){

    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    audioSource = audioContext.createMediaStreamSource(stream);
    audioSource.connect(analyser);
}

//upload file option
async function setupFileAudio(file) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }

    // Stop previous audio if exists
    if (audioElement) {
        audioElement.pause();
        audioElement = null;
    }

    audioElement = new Audio(URL.createObjectURL(file));
    audioElement.crossOrigin = "anonymous";
    audioElement.loop = false;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    fileSource = audioContext.createMediaElementSource(audioElement);
    fileSource.connect(analyser);
    analyser.connect(audioContext.destination);

    audioElement.play();

    isListening = true;
    isFileMode = true;
    
    const listenBtn = document.getElementById("listenBtn");
    if (listenBtn) {
        listenBtn.textContent = "Stop Listening";
    }

    const display = document.getElementById("emotion-display");
    if (display) {
        display.innerHTML = `Playing: ${file.name}`;
    };
}

// Detect beats and calculate BPM 
function detectBeat(dataArray) {
    let bassSum = 0;
    for (let i = 0; i < 20; i++) bassSum += dataArray[i];
    const bassAverage = bassSum / 20;

    const now = Date.now();

    // Dynamic threshold
    const dynamicThreshold = currentEnergy * 0.9;
    const threshold = Math.max(40, dynamicThreshold);  

    if (bassAverage > threshold && bassAverage > 60) {

        if (now - lastBeatTime > 300) { // slightly slower debounce
            beatTimes.push(now);
            lastBeatTime = now;

            if (beatTimes.length > 8) beatTimes.shift();

            if (beatTimes.length >= 3) {
                let intervals = [];
                for (let i = 1; i < beatTimes.length; i++) {
                    intervals.push(beatTimes[i] - beatTimes[i - 1]);
                }

                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                bpm = Math.round(60000 / avgInterval);

                // clamp realistic BPM
                bpm = Math.max(60, Math.min(180, bpm));
            }
        }
    }
}

//Pitch detection 

function detectPitch(){
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    let bestOffset = -1;
    let bestCorrelation = 0;

    for(let offset=20; offset<1000; offset++){
        let correlation = 0;
        for(let i=0;i<buffer.length-offset;i++){
            correlation += buffer[i]*buffer[i+offset];
        }
        correlation /= (buffer.length-offset);

        if(correlation > bestCorrelation){
            bestCorrelation = correlation;
            bestOffset = offset;
        }
    }

    if(bestOffset > 0){
        const pitch = audioContext.sampleRate / bestOffset;

        // ignore unrealistic pitch
        if (pitch < 100 || pitch > 800) return 0;

        return Math.round(pitch);
            }
            return 0;
}


// Detect emotions based on BPM, energy, and pitch
function detectBestEmotion(bpm, energy, pitch) {
    // Primary: energy thresholds
    let base;
    if (energy < 25)       base = 'calm';
    else if (energy < 50)  base = 'sad';
    else if (energy < 85)  base = 'happy';
    else if (energy < 130) base = 'energetic';
    else                   base = 'upbeat';

    // BPM nudge — only if have a real BPM reading
    if (bpm > 0) {
        if (bpm > 150 && base === 'energetic') base = 'upbeat';
        if (bpm < 80  && base === 'happy')     base = 'sad';
        if (bpm < 70  && base === 'energetic') base = 'happy';
    }

    return base;
}

// Update mesh colors with gradient
function updateMeshGradient() {
    if (detectedEmotions.length === 0) return;

    const currentEmotion = detectedEmotions[detectedEmotions.length - 1];
    const color = new THREE.Color(emotions[currentEmotion].color);
    const geometry = mesh.geometry;
    const colors = geometry.attributes.color.array;

    for (let i = 0; i < geometry.attributes.position.count; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    geometry.attributes.color.needsUpdate = true;
}

// Update emotion display
function updateEmotionDisplay() {
    const display = document.getElementById('emotion-display');

    if (!isListening) {
        display.innerHTML = "Press Start Listening ";
        return;
    }

    if (currentEnergy < 15) {
        display.innerHTML = "Listening... No sound detected.";
        return;
    }

    if (detectedEmotions.length === 0) {
        display.innerHTML = "Listening... Detecting emotions...";
        return;
    }

    const currentEmotion = detectedEmotions[detectedEmotions.length - 1];
    const emotionData = emotions[currentEmotion];
    const pitch = detectPitch();

    const colorHex = '#' + emotionData.color.toString(16).padStart(6, '0');

   display.innerHTML = `
    <div>Emotion:</div>
    <div style="background-color: ${colorHex}; padding: 6px; color: #fff;">
        ${emotionData.name}
    </div>
    <div>BPM: ${bpm}</div>
    <div>Energy: ${Math.round(currentEnergy)}</div>
    <div>Pitch: ${pitch} Hz</div>
`;
}

// Silence detection variables
let silenceThreshold = 30; // Adjust based on testing
let silenceDuration = 0;
let maxSilenceDuration = 2000; // 2 seconds of silence = new song

function detectSilence(energy) {
    if (energy < silenceThreshold) {
        silenceDuration += 16.67; // Approximate ms per frame (60fps)
        
        if (silenceDuration >= maxSilenceDuration) {
            // Reset everything for new song
            resetForNewSong();
            silenceDuration = 0;
        }
    } else {
        silenceDuration = 0; // Reset silence counter if sound detected
    }
}

function resetForNewSong() {
    beatTimes = [];
    detectedEmotions = [];
    bpm = 0;
    lastEmotionCheck = 0;
    currentEnergy = 0;
    
    // Reset sphere to default color
    const geometry = mesh.geometry;
    const colors = geometry.attributes.color.array;
    const defaultColor = new THREE.Color(0x6B9BD1);
    
    for (let i = 0; i < colors.length; i += 3) {
        colors[i] = defaultColor.r;
        colors[i + 1] = defaultColor.g;
        colors[i + 2] = defaultColor.b;
    }
    geometry.attributes.color.needsUpdate = true;
    
    // Update display
    document.getElementById('emotion-display').innerHTML = '<div>Waiting for new song...</div>';
}


// Animation loop
function animate() {

    requestAnimationFrame(animate);

    if (analyser && isListening) {
    analyser.getByteFrequencyData(dataArray);

    const sum = dataArray.reduce((a, b) => a + b, 0);
    const rawEnergy = sum / dataArray.length;
    currentEnergy = Math.min(200, rawEnergy === 0 ? 0 : Math.log1p(rawEnergy) * 30);

    detectSilence(currentEnergy);
    detectBeat(dataArray);
    console.log(
    'BPM:', bpm,
    '| Energy:', Math.round(currentEnergy),
    '| Pitch:', detectPitch(),
    '| Emotion:', detectedEmotions[detectedEmotions.length - 1],
    '| EnergyBands:', EMOTION_KEYS.filter(k =>
        currentEnergy >= emotions[k].energyRange[0] &&
        currentEnergy <= emotions[k].energyRange[1]
    ).join(',')
    );
}

    const now = Date.now();
    if (analyser && isListening) {
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const rawEnergy = sum / dataArray.length;
    currentEnergy = Math.min(200, rawEnergy === 0 ? 0 : Math.log1p(rawEnergy) * 30);

    detectSilence(currentEnergy);
    detectBeat(dataArray);

    const now = Date.now();

    let currentEmotion = null; 

    if (now - lastEmotionCheck > 400) {
        const pitch = detectPitch();
        const bestEmotion = detectBestEmotion(bpm, currentEnergy, pitch);

        detectedEmotions.push(bestEmotion);
        if (detectedEmotions.length > 3) detectedEmotions.shift();

        currentEmotion = detectedEmotions[detectedEmotions.length - 1];

        updateEmotionDisplay(currentEmotion);
        lastEmotionCheck = now;
    } else {
        currentEmotion = detectedEmotions[detectedEmotions.length - 1];
    }

    updateBars(currentEmotion);
    updateCircular(currentEmotion);
    updateWave(currentEmotion);
}
    
    beatPulse *= 0.9;
    //mesh.scale.lerp(new THREE.Vector3(1,1,1), 0.1);

    renderer.render(scene, camera);
}

//responsiveness
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;

    // Dynamic camera Z based on screen width
    if (width < 500) {
        camera.position.z = 12; // iPhone portrait
    } else if (width < 900) {
        camera.position.z = 10; // small tablet / phone landscape
    } else {
        camera.position.z = 8;  // desktop
    }

    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

//listen to audio file
const fileInput = document.getElementById("fileInput");

if (fileInput) {
    fileInput.addEventListener("change", async function (event) {
        const file = event.target.files[0];
        if (!file) return;

        const status = document.getElementById("upload-status");
        if (status) {
            status.textContent = `Selected: ${file.name}`;
        }

        const display = document.getElementById("emotion-display");

        display.innerHTML = "Loading audio file...";

        try {
            await setupFileAudio(file);
            display.innerHTML = `Playing: ${file.name}`;
        } catch (error) {
            console.error(error);
            display.innerHTML = "Error loading file.";
        }
    });
}

//Button
const listenBtn = document.getElementById("listenBtn");

if (listenBtn) {
    listenBtn.addEventListener("click", async function () {

        const display = document.getElementById("emotion-display");

        if (!isListening) {

            this.textContent = "Requesting Mic Access...";
            display.innerHTML = "Waiting for microphone permission...";

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                await setupAudio(stream);

                if (audioContext.state === "suspended") {
                    await audioContext.resume();
                }

                isListening = true;
                this.textContent = "Stop Listening";
                display.innerHTML = " Listening... Make some sound";

            } catch (error) {

                console.error(error);
                this.textContent = "Start Listening ";
                display.innerHTML = " Microphone access denied.";
            }

        } else {

            // stop mic/file safely
            if (audioElement) {
                audioElement.pause();
                audioElement = null;
            }

            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }

            isListening = false;
            isFileMode = false;

            this.textContent = "Start Listening";
            display.innerHTML = "Stopped.";
        }
    });
}

//helper function for themes
function applyThemeToScene(theme) {
    let baseColor;

    if (theme === "neon") baseColor = 0x000000;
    else if (theme === "minimal") baseColor = 0xf2f2f2;
    else baseColor = 0x0e0c32;

    scene.background = new THREE.Color(baseColor);

    if (waveLine) {
        waveLine.material.color.setHex(
            theme === "minimal" ? 0x000000 :
            theme === "neon" ? 0x00ffff : 0xffffff
        );
    }

    if (circle) {
        circle.material.color.setHex(
            theme === "minimal" ? 0x000000 :
            theme === "neon" ? 0x00ffff : 0xffffff
        );
    }

    bars.forEach(bar => {
        if (theme === "minimal") {
            bar.material.color.setHex(0x111111);
            bar.material.emissiveIntensity = 0;
        }
    });
}

//listeners
const themeInputs = document.querySelectorAll('input[name="theme"]');

themeInputs.forEach(input => {
    input.addEventListener("change", (e) => {
        const theme = e.target.value;

        document.body.className = `theme-${theme}`;
        localStorage.setItem("theme", theme);

        if (scene) {
            applyThemeToScene(theme);
        }
    });
});

const inputs = document.querySelectorAll('input[name="visual"]');

if (inputs.length > 0) {

    // load saved mode first
    const savedMode = localStorage.getItem("visualMode");

    console.log("Loaded mode:", savedMode);

    if (!savedMode) {
        localStorage.setItem("visualMode", "bars");
        inputs.forEach(input => {
            input.checked = (input.value === "bars");
        });
    }

    // save when changed
    inputs.forEach(input => {
        input.addEventListener("change", (e) => {
            console.log("Saving mode:", e.target.value);
            localStorage.setItem("visualMode", e.target.value);
        });
    });
}

window.addEventListener("load", init);