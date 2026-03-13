let scene, camera, renderer, mesh;
let audioContext, analyser, audioSource, dataArray;
let isListening = false;
let beatPulse = 0;
let hapticsEnabled = true;
const EMOTION_KEYS = ['calm', 'sad', 'happy', 'energetic', 'intense'];
let bars = [];
const BAR_COUNT = EMOTION_KEYS.length;


// BPM and emotion detection variables 
// need to add pitch
let bpm = 0;
let lastBeatTime = 0;
let beatTimes = [];
let detectedEmotions = [];
let lastEmotionCheck = 0;
let currentEnergy = 0;

// Emotion definitions based on BPM and energy
const emotions = {
    calm: { 
        bpmRange: [0, 85], 
        energyRange: [0, 90], 
        pitchRange: [50, 200], 
        color: 0x6B9BD1, 
        name: 'Calm' 
    },

    sad: { 
        bpmRange: [60, 105], 
        energyRange: [40, 130], 
        pitchRange: [80, 300],   // lower-mid pitch
        color: 0x9B59B6, 
        name: 'Sad' 
    },

    happy: { 
        bpmRange: [105, 145], 
        energyRange: [110, 190], 
        pitchRange: [250, 600],  // higher pitch
        color: 0xFFD700, 
        name: 'Happy' 
    },

    energetic: { 
        bpmRange: [130, 175], 
        energyRange: [160, 230], 
        pitchRange: [200, 500], 
        color: 0xFF6B6B, 
        name: 'Energetic' 
    },

    intense: { 
        bpmRange: [160, 220], 
        energyRange: [200, 255], 
        pitchRange: [100, 400], 
        color: 0xFF4500, 
        name: 'Intense' 
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
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff });

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

function updateBars() {
    for (let i = 0; i < bars.length; i++) {
        const key = EMOTION_KEYS[i];

        if (detectedEmotions.includes(key)) {
            // Bar active: scale with energy
            const scale = 1.5 + currentEnergy / 200; 
            bars[i].scale.y += (scale - bars[i].scale.y) * 0.2; // smooth
            bars[i].position.y = bars[i].scale.y / 2;

            // Change color to emotion
            bars[i].material.color.setHex(emotions[key].color);
        } else {
            // Bar inactive: return to white
            bars[i].scale.y += (1 - bars[i].scale.y) * 0.1;
            bars[i].position.y = bars[i].scale.y / 2;
            bars[i].material.color.setHex(0xffffff);
        }
    }
}

function animateIdleBars() {
    for (let i = 0; i < bars.length; i++) {
        bars[i].scale.y = 0.5 + 0.1 * Math.sin(Date.now() * 0.002 + i);
        bars[i].position.y = bars[i].scale.y / 2;
    }
}

// Initialize Three.js scene
function init() {
    scene = new THREE.Scene();
    
    // Create gradient background
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const context = canvas.getContext('2d');
 
    const texture = new THREE.CanvasTexture(canvas);
    const color2 = new THREE.Color("#100c6b");
    scene.background = color2;
    
    camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 15;
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // Create bar graph visual
    createBars();
    
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
async function setupAudio(){
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    audioSource = audioContext.createMediaStreamSource(stream);
    audioSource.connect(analyser);
}


// Detect beats and calculate BPM + add haptics to beat 
function detectBeat(dataArray) {
    let bassSum = 0;
    for (let i = 0; i < 15; i++) bassSum += dataArray[i];
    const bassAverage = bassSum / 15;

    // Lowered threshold so beats are detected more reliably
    const threshold = Math.max(30, currentEnergy * 1.1);

    const now = Date.now();
    if (bassAverage > threshold && now - lastBeatTime > 200) {
        lastBeatTime = now;
        beatTimes.push(now);

        // Keep last 20 beats
        if (beatTimes.length > 20) beatTimes.shift();

        // Visual pulse (if you still use mesh)
        if (mesh) {
            mesh.scale.set(1.2, 1.2, 1.2);
            beatPulse = 1.5;
        }

        // Adaptive haptics
        if (hapticsEnabled && navigator.vibrate) {
            const vibMin = 50;
            const vibMax = 100;
            const bassClamped = Math.min(255, Math.max(100, bassAverage));
            const vibDuration = Math.round(
                ((bassClamped - 100) / (255 - 100)) * (vibMax - vibMin) + vibMin
            );
            navigator.vibrate(vibDuration);
        }

        // Calculate BPM if at least 2 intervals
        if (beatTimes.length >= 3) {
            const intervals = [];
            for (let i = 1; i < beatTimes.length; i++) {
                intervals.push(beatTimes[i] - beatTimes[i - 1]);
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            bpm = Math.round(60000 / avgInterval);
            bpm = Math.max(40, Math.min(220, bpm));
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
        return Math.round(audioContext.sampleRate/bestOffset);
    }
    return 0;
}


// Detect emotion based on BPM and energy
function detectEmotion(bpm, energy, pitch) {
    let bestMatch = 'calm';
    let bestScore = 0;

    for (const [key, emotion] of Object.entries(emotions)) {
        let score = 0;

        // BPM scoring (40%)
        if (bpm >= emotion.bpmRange[0] && bpm <= emotion.bpmRange[1]) {
            score += 40;
        }

        // Energy scoring (35%)
        if (energy >= emotion.energyRange[0] && energy <= emotion.energyRange[1]) {
            score += 35;
        }

        // Pitch scoring (25%)
        if (pitch >= emotion.pitchRange[0] && pitch <= emotion.pitchRange[1]) {
            score += 25;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = key;
        }
    }

    return bestMatch;
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
        display.innerHTML = "Press Start Listening 🎤";
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
        <div>Emotions Detected:</div>
        <div style="background-color: ${colorHex}; padding: 4px; color: #fff;">${emotionData.name}</div>
        <div>BPM: ${bpm} | Energy: ${Math.round(currentEnergy)} | Pitch: ${pitch} Hz</div>
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
    currentEnergy = sum / dataArray.length;

    detectSilence(currentEnergy);
    detectBeat(dataArray);
    console.log('BPM:', bpm, 'Energy:', Math.round(currentEnergy), 'Pitch:', detectPitch());
    updateBars();

    const now = Date.now();
    if (now - lastEmotionCheck > 400) {
        const pitch = detectPitch();
        const emotion = detectEmotion(bpm, currentEnergy, pitch);
        detectedEmotions.push(emotion);
        if (detectedEmotions.length > 20) detectedEmotions.shift();

        updateEmotionDisplay();
        lastEmotionCheck = now;
    }

} else {
    // idle bar animation
    animateIdleBars();
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

//Button
document.getElementById("listenBtn").addEventListener("click", async function () {

    const display = document.getElementById("emotion-display");

    if (!isListening) {

        this.textContent = "Requesting Mic Access...";
        display.innerHTML = "Waiting for microphone permission...";

        try {
            await setupAudio();

            isListening = true;
            this.textContent = "Stop Listening";
            display.innerHTML = " Listening... Make some sound";

        } catch (error) {

            console.error(error);
            this.textContent = "Start Listening ";
            display.innerHTML = " Microphone access denied. Please allow access and try again.";
        }

    } else {

        if (audioContext) {
            audioContext.close();
        }

        isListening = false;
        this.textContent = "Start Listening ";
        display.innerHTML = "Stopped.";
    }
});

const hapticsToggle = document.getElementById("hapticsToggle");

if (hapticsToggle) {

    // Load saved setting
    const savedSetting = localStorage.getItem("hapticsEnabled");
    if (savedSetting !== null) {
        hapticsEnabled = savedSetting === "true";
        hapticsToggle.checked = hapticsEnabled;
    }

    // Update when user toggles
    hapticsToggle.addEventListener("change", function () {
        hapticsEnabled = this.checked;
        localStorage.setItem("hapticsEnabled", hapticsEnabled);
    });
}

init();