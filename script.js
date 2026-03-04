let scene, camera, renderer, mesh;
let audioContext, analyser, audioSource, dataArray;
let isListening = false;
let beatPulse = 0;


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
    camera.position.z = 8;
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // Create single sphere mesh with vertex colors for gradient
    let sphereRadius = window.innerWidth < 600 ? 2.2 : 3;
    const geometry = new THREE.CircleGeometry(5, 128);
    geometry.rotateX(-Math.PI / 2); // horizontal

    const material = new THREE.MeshStandardMaterial({
        color: 0x6B9BD1,
        wireframe: true,
        transparent: true,
        opacity: 0.8
    });
    
    // Initialize vertex colors
    const colors = [];
    const color = new THREE.Color(0x6B9BD1);
    for (let i = 0; i < geometry.attributes.position.count; i++) {
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
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


// Detect beats and calculate BPM
function detectBeat(dataArray) {

    let bassSum = 0;
    for (let i = 0; i < 15; i++) {  // wider bass range
        bassSum += dataArray[i];
    }

    const bassAverage = bassSum / 15;

    // Dynamic threshold 
    const threshold = currentEnergy * 1.3;

    if (bassAverage > threshold && bassAverage > 100) {

        const now = Date.now();

        // Prevent double triggering
        if (now - lastBeatTime > 250) {

            beatTimes.push(now);
            lastBeatTime = now;

            //  visual pulse
            mesh.scale.set(1.2, 1.2, 1.2);

            //  ripple burst effect
            beatPulse = 1.5;   // global variable 

            // Keep last 10 beats
            if (beatTimes.length > 10) {
                beatTimes.shift();
            }

            // BPM Calculation
            if (beatTimes.length >= 3) {

                const intervals = [];

                for (let i = 1; i < beatTimes.length; i++) {
                    intervals.push(beatTimes[i] - beatTimes[i - 1]);
                }

                const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;

                bpm = Math.round(60000 / avgInterval);

                bpm = Math.max(40, Math.min(200, bpm));
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

        // Wave
        const time = Date.now() * 0.002;
        const positions = mesh.geometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {

            const x = positions.getX(i);
            const z = positions.getZ(i);

            const distance = Math.sqrt(x * x + z * z);

            let wave = Math.sin(distance * 3 - time * 4);

            wave *= (currentEnergy / 255) * 1.5 + beatPulse;

            positions.setY(i, wave);
        }

        positions.needsUpdate = true;

    } else {

        // subtle idle motion when not listening
        mesh.rotation.y += 0.002;
    }

    beatPulse *= 0.9;
    mesh.scale.lerp(new THREE.Vector3(1,1,1), 0.1);

    renderer.render(scene, camera);
}

//responsiveness
function onWindowResize() {

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;

    // Dynamic camera distance based on aspect ratio
    const aspect = width / height;

    if (aspect < 0.75) {
        // Very tall screen (iPhone portrait)
        camera.position.z = 12;
    } else if (aspect < 1) {
        camera.position.z = 10;
    } else {
        camera.position.z = 8;
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

init();