let scene, camera, renderer, mesh;
let audioContext, analyser, audioSource, dataArray;
let isListening = false;


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
    calm: { bpmRange: [0, 80], energyRange: [0, 100], color: 0x6B9BD1, name: 'Calm' },
    sad: { bpmRange: [60, 100], energyRange: [40, 120], color: 0x9B59B6, name: 'Sad' },
    happy: { bpmRange: [100, 140], energyRange: [100, 180], color: 0xFFD700, name: 'Happy' },
    energetic: { bpmRange: [130, 170], energyRange: [150, 220], color: 0xFF6B6B, name: 'Energetic' },
    intense: { bpmRange: [150, 220], energyRange: [180, 255], color: 0xFF4500, name: 'Intense' }
    
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
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 8;
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // Create single sphere mesh with vertex colors for gradient
    const geometry = new THREE.SphereGeometry(3, 64, 64);
    const material = new THREE.MeshPhongMaterial({ 
        vertexColors: true,
        shininess: 0.1,
        specular: 0x555555
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
    // Focus on bass frequencies for beat detection
    let bassSum = 0;
    for (let i = 0; i < 10; i++) {
        bassSum += dataArray[i];
    }
    const bassAverage = bassSum / 10;
    
    if (bassAverage > 140) {
        const now = Date.now();
        if (now - lastBeatTime > 200) {

            // Trigger haptic feedback on beat
            //const intensity = Math.min(1, bassAverage / 255);
            //triggerHaptic(intensity);

            beatTimes.push(now);
            lastBeatTime = now;
            
            // last 10 beats for BPM calculation
            if (beatTimes.length > 10) {
                beatTimes.shift();
            }
            
            // Calculate BPM
            if (beatTimes.length >= 3) {
                const intervals = [];
                for (let i = 1; i < beatTimes.length; i++) {
                    intervals.push(beatTimes[i] - beatTimes[i - 1]);
                }
                const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
                bpm = Math.round(60000 / avgInterval);
                
                //BPM range
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
function detectEmotion(bpm, energy) {
    let bestMatch = 'calm';
    let bestScore = 0;
    
    for (const [key, emotion] of Object.entries(emotions)) {
        let score = 0;
        
        // Check BPM match
        if (bpm >= emotion.bpmRange[0] && bpm <= emotion.bpmRange[1]) {
            score += 50;
        } else {
            // Partial score based on proximity
            const bpmMid = (emotion.bpmRange[0] + emotion.bpmRange[1]) / 2;
            const bpmDist = Math.abs(bpm - bpmMid);
            score += Math.max(0, 30 - bpmDist / 5);
        }
        
        // Check energy match
        if (energy >= emotion.energyRange[0] && energy <= emotion.energyRange[1]) {
            score += 50;
        } else {
            // Partial score based on proximity
            const energyMid = (emotion.energyRange[0] + emotion.energyRange[1]) / 2;
            const energyDist = Math.abs(energy - energyMid);
            score += Math.max(0, 30 - energyDist / 5);
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

    if ((analyser && isListening) || (analyser && isListening)){

        analyser.getByteFrequencyData(dataArray);

        const sum = dataArray.reduce((a, b) => a + b, 0);
        currentEnergy = sum / dataArray.length;

        detectSilence(currentEnergy);
        detectBeat(dataArray);

        const now = Date.now();
        if (now - lastEmotionCheck > 1500) {

            const effectiveBPM = bpm > 0 ? bpm : Math.round(currentEnergy * 0.8);
            const emotion = detectEmotion(effectiveBPM, currentEnergy);

            if (!detectedEmotions.includes(emotion)) {
                detectedEmotions.push(emotion);
                updateMeshGradient();
            }

            updateEmotionDisplay();
            lastEmotionCheck = now;
        }

        const scale = 1 + (currentEnergy / 255) * 0.4;
        mesh.scale.set(scale, scale, scale);

        const rotationSpeed = 0.003 + (currentEnergy / 255) * 0.01;
        mesh.rotation.x += rotationSpeed;
        mesh.rotation.y += rotationSpeed * 1.3;

    } else {

        mesh.rotation.x += 0.005;
        mesh.rotation.y += 0.0065;
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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