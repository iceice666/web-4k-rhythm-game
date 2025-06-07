class RhythmGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        this.lanes = 4;
        this.laneWidth = this.canvas.width / this.lanes;
        this.hitZone = this.canvas.height - 80;
        
        this.notes = [];
        this.score = 0;
        this.combo = 0;
        this.noteSpeed = 3;
        
        this.keys = ['d', 'f', 'j', 'k'];
        this.keyStates = { d: false, f: false, j: false, k: false };
        
        this.lastTime = 0;
        this.gameTime = 0;
        this.particles = [];
        this.gameStarted = false;
        this.gamePaused = false;
        this.musicBuffer = null;
        this.musicSource = null;
        this.musicGainNode = null;
        this.startTime = 0;
        this.pauseTime = 0;
        
        this.settings = this.loadSettings();
        
        this.setupAudio();
        this.setupUploadHandlers();
        this.setupEventListeners();
        this.setupPauseMenu();
        this.loadSampleChart();
        this.gameLoop();
        
        document.getElementById('upload-status').textContent = 'Upload a music file to auto-generate notes!';
    }
    
    updateProgress(percentage, message = '') {
        const progressContainer = document.getElementById('progress-container');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = message || `${Math.round(percentage)}%`;
        
        if (percentage > 0 && percentage < 100) {
            progressContainer.classList.remove('hidden');
        } else if (percentage >= 100) {
            setTimeout(() => {
                progressContainer.classList.add('hidden');
            }, 1000);
        }
    }
    
    hideProgress() {
        document.getElementById('progress-container').classList.add('hidden');
    }
    
    loadSettings() {
        const defaultSettings = {
            musicVolume: 0.5,
            hitSoundVolume: 0.3,
            gameSpeed: 1.0
        };
        
        try {
            const saved = localStorage.getItem('rhythmGameSettings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch (e) {
            return defaultSettings;
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('rhythmGameSettings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Could not save settings to localStorage');
        }
    }
    
    setupAudio() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.hitSounds = {};
        this.createHitSounds();
    }
    
    createHitSounds() {
        const frequencies = [261.63, 293.66, 329.63, 349.23]; // C4, D4, E4, F4
        
        this.keys.forEach((key, index) => {
            this.hitSounds[key] = this.createTone(frequencies[index], 0.1);
        });
    }
    
    createTone(frequency, duration) {
        return () => {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            
            const volume = this.settings.hitSoundVolume;
            gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        };
    }
    
    playHitSound(key) {
        if (this.hitSounds[key]) {
            this.hitSounds[key]();
        }
    }
    
    setupUploadHandlers() {
        const uploadBtn = document.getElementById('upload-btn');
        const musicUpload = document.getElementById('music-upload');
        const startBtn = document.getElementById('start-btn');
        const uploadStatus = document.getElementById('upload-status');
        
        uploadBtn.addEventListener('click', () => {
            musicUpload.click();
        });
        
        musicUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                uploadStatus.textContent = 'Loading music file...';
                console.log(`Loading music file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
                
                this.updateProgress(0, 'Starting...');
                
                try {
                    await this.loadMusicFile(file);
                    const noteCount = this.chartNotes ? this.chartNotes.length : 0;
                    uploadStatus.textContent = `Ready! ${noteCount} notes generated`;
                    startBtn.disabled = false;
                    document.getElementById('song-info').textContent = `♪ ${file.name}`;
                    console.log('Music analysis complete!');
                    this.updateProgress(100, 'Complete!');
                } catch (error) {
                    uploadStatus.textContent = 'Error loading music file';
                    console.error('Music loading error:', error);
                    this.hideProgress();
                }
            }
        });
        
        startBtn.addEventListener('click', () => {
            this.startGame();
        });
    }
    
    async loadMusicFile(file) {
        this.updateProgress(10, 'Reading file...');
        const arrayBuffer = await file.arrayBuffer();
        
        this.updateProgress(20, 'Decoding audio...');
        this.musicBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        this.updateProgress(30, 'Analyzing beats...');
        const beats = await this.detectBeats(this.musicBuffer);
        
        this.updateProgress(90, 'Generating notes...');
        this.generateNotesFromBeats(beats);
    }
    
    async detectBeats(audioBuffer) {
        console.log('Starting beat detection analysis...');
        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0);
        const duration = audioBuffer.duration;
        
        console.log(`Audio info: ${duration.toFixed(2)}s, ${sampleRate}Hz, ${channelData.length} samples`);
        
        this.updateProgress(35, 'Energy analysis...');
        const energyBeats = await this.detectEnergyBeats(channelData, sampleRate);
        
        this.updateProgress(55, 'Spectral analysis...');
        const spectralBeats = await this.detectSpectralFlux(channelData, sampleRate);
        
        this.updateProgress(75, 'Combining beats...');
        const combinedBeats = this.combineBeats(energyBeats, spectralBeats);
        
        this.updateProgress(85, 'Filtering beats...');
        console.log(`Detected ${energyBeats.length} energy beats, ${spectralBeats.length} spectral beats`);
        console.log(`Combined: ${combinedBeats.length} beats`);
        
        return this.filterBeats(combinedBeats);
    }
    
    async detectEnergyBeats(channelData, sampleRate) {
        const beats = [];
        const frameSize = 1024;
        const hopSize = 512;
        
        const energyHistory = [];
        const historySize = 30;
        let frameCount = 0;
        const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);
        
        for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
            const frame = channelData.slice(i, i + frameSize);
            
            let energy = 0;
            for (let j = 0; j < frame.length; j++) {
                energy += frame[j] * frame[j];
            }
            energy = Math.sqrt(energy / frame.length);
            
            energyHistory.push(energy);
            if (energyHistory.length > historySize) {
                energyHistory.shift();
            }
            
            if (energyHistory.length >= historySize) {
                const meanEnergy = energyHistory.reduce((a, b) => a + b) / energyHistory.length;
                const variance = energyHistory.reduce((sum, val) => sum + Math.pow(val - meanEnergy, 2), 0) / energyHistory.length;
                const threshold = meanEnergy + Math.sqrt(variance) * 1.3;
                
                if (energy > threshold && energy > 0.008) {
                    const timeInSeconds = i / sampleRate;
                    beats.push({
                        time: timeInSeconds * 1000,
                        intensity: energy,
                        type: 'energy'
                    });
                }
            }
            
            frameCount++;
            if (frameCount % 200 === 0) {
                const progress = 35 + (frameCount / totalFrames) * 15;
                this.updateProgress(progress, 'Energy analysis...');
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        return beats;
    }
    
    async detectSpectralFlux(channelData, sampleRate) {
        const beats = [];
        const frameSize = 1024;
        const hopSize = 512;
        const bands = 32;
        
        let previousSpectrum = new Array(bands).fill(0);
        const fluxHistory = [];
        const historySize = 15;
        let frameCount = 0;
        const totalFrames = Math.floor((channelData.length - frameSize) / hopSize);
        
        for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
            const frame = channelData.slice(i, i + frameSize);
            
            const spectrum = this.computeSpectrum(frame);
            
            let flux = 0;
            for (let j = 0; j < spectrum.length; j++) {
                const diff = spectrum[j] - previousSpectrum[j];
                if (diff > 0) {
                    flux += diff;
                }
            }
            
            fluxHistory.push(flux);
            if (fluxHistory.length > historySize) {
                fluxHistory.shift();
            }
            
            if (fluxHistory.length >= historySize) {
                const meanFlux = fluxHistory.reduce((a, b) => a + b) / fluxHistory.length;
                const threshold = meanFlux * 1.6;
                
                if (flux > threshold && flux > 0.005) {
                    const timeInSeconds = i / sampleRate;
                    beats.push({
                        time: timeInSeconds * 1000,
                        intensity: flux,
                        type: 'spectral'
                    });
                }
            }
            
            frameCount++;
            if (frameCount % 200 === 0) {
                const progress = 55 + (frameCount / totalFrames) * 15;
                this.updateProgress(progress, 'Spectral analysis...');
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            previousSpectrum = spectrum;
        }
        
        return beats;
    }
    
    computeSpectrum(frame) {
        const spectrum = [];
        const N = frame.length;
        const bands = 32;
        const samplesPerBand = Math.floor(N / bands);
        
        for (let band = 0; band < bands; band++) {
            const start = band * samplesPerBand;
            const end = Math.min(start + samplesPerBand, N);
            
            let energy = 0;
            for (let i = start; i < end; i++) {
                energy += frame[i] * frame[i];
            }
            
            spectrum[band] = Math.sqrt(energy / (end - start));
        }
        
        return spectrum;
    }
    
    combineBeats(energyBeats, spectralBeats) {
        const allBeats = [...energyBeats, ...spectralBeats];
        allBeats.sort((a, b) => a.time - b.time);
        
        const combinedBeats = [];
        const mergeThreshold = 100;
        
        for (let beat of allBeats) {
            const lastBeat = combinedBeats[combinedBeats.length - 1];
            
            if (!lastBeat || beat.time - lastBeat.time > mergeThreshold) {
                combinedBeats.push(beat);
            } else {
                lastBeat.intensity = Math.max(lastBeat.intensity, beat.intensity);
                lastBeat.time = (lastBeat.time + beat.time) / 2;
            }
        }
        
        return combinedBeats;
    }
    
    filterBeats(beats) {
        if (beats.length === 0) {
            console.warn('No beats detected, generating fallback pattern');
            return this.generateFallbackBeats();
        }
        
        beats.sort((a, b) => a.time - b.time);
        
        const minInterval = 150;
        const filtered = [];
        let lastBeatTime = -minInterval;
        
        for (let beat of beats) {
            if (beat.time - lastBeatTime >= minInterval) {
                filtered.push(beat);
                lastBeatTime = beat.time;
            }
        }
        
        console.log(`Filtered beats: ${filtered.length} (from ${beats.length} raw beats)`);
        
        if (filtered.length < 10) {
            console.warn('Very few beats detected, adding supplementary pattern');
            const supplementary = this.generateSupplementaryBeats(filtered);
            filtered.push(...supplementary);
            filtered.sort((a, b) => a.time - b.time);
        }
        
        return filtered.slice(0, 300);
    }
    
    generateFallbackBeats() {
        const duration = this.musicBuffer.duration * 1000;
        const beats = [];
        const interval = 500;
        
        for (let time = 1000; time < duration - 1000; time += interval) {
            beats.push({
                time: time,
                intensity: 0.5,
                type: 'fallback'
            });
        }
        
        console.log(`Generated ${beats.length} fallback beats`);
        return beats;
    }
    
    generateSupplementaryBeats(existingBeats) {
        const duration = this.musicBuffer.duration * 1000;
        const supplementary = [];
        
        if (existingBeats.length === 0) {
            return this.generateFallbackBeats();
        }
        
        const avgInterval = existingBeats.length > 1 ? 
            (existingBeats[existingBeats.length - 1].time - existingBeats[0].time) / (existingBeats.length - 1) : 
            600;
        
        const targetInterval = Math.max(300, Math.min(800, avgInterval));
        
        for (let time = 500; time < duration - 500; time += targetInterval) {
            const hasNearbyBeat = existingBeats.some(beat => Math.abs(beat.time - time) < 200);
            
            if (!hasNearbyBeat) {
                supplementary.push({
                    time: time,
                    intensity: 0.3,
                    type: 'supplementary'
                });
            }
        }
        
        console.log(`Generated ${supplementary.length} supplementary beats`);
        return supplementary;
    }
    
    generateNotesFromBeats(beats) {
        this.chartNotes = [];
        console.log(`Generating notes from ${beats.length} beats`);
        
        for (let i = 0; i < beats.length; i++) {
            const beat = beats[i];
            const intensity = beat.intensity || 0.5;
            const beatType = beat.type || 'unknown';
            
            let numNotes = 1;
            
            if (beatType === 'fallback' || beatType === 'supplementary') {
                numNotes = 1;
            } else if (intensity > 0.8) {
                numNotes = 4;
            } else if (intensity > 0.6) {
                numNotes = 3;
            } else if (intensity > 0.4) {
                numNotes = 2;
            } else {
                numNotes = 1;
            }
            
            if (beatType === 'spectral' && intensity > 0.5) {
                numNotes = Math.min(numNotes + 1, 4);
            }
            
            const lanes = this.selectLanes(numNotes, i);
            
            for (let lane of lanes) {
                this.chartNotes.push({
                    time: beat.time,
                    lane: lane,
                    beatType: beatType,
                    intensity: intensity
                });
            }
        }
        
        this.chartNotes.sort((a, b) => a.time - b.time);
        console.log(`Generated ${this.chartNotes.length} notes total`);
        this.nextNoteIndex = 0;
    }
    
    selectLanes(numNotes, beatIndex) {
        const lanes = [];
        const availableLanes = [0, 1, 2, 3];
        
        for (let i = 0; i < numNotes; i++) {
            const laneIndex = (beatIndex + i) % availableLanes.length;
            if (!lanes.includes(availableLanes[laneIndex])) {
                lanes.push(availableLanes[laneIndex]);
            }
        }
        
        while (lanes.length < numNotes && lanes.length < 4) {
            for (let lane of availableLanes) {
                if (!lanes.includes(lane)) {
                    lanes.push(lane);
                    break;
                }
            }
        }
        
        return lanes;
    }
    
    startGame() {
        if (!this.musicBuffer) return;
        
        this.gameStarted = true;
        this.score = 0;
        this.combo = 0;
        this.notes = [];
        this.particles = [];
        this.nextNoteIndex = 0;
        this.gameTime = 0;
        this.startTime = this.audioContext.currentTime;
        
        this.playMusic();
        this.updateUI();
        
        document.getElementById('upload-section').style.display = 'none';
    }
    
    playMusic() {
        if (this.musicSource) {
            this.musicSource.stop();
        }
        
        this.musicSource = this.audioContext.createBufferSource();
        this.musicGainNode = this.audioContext.createGain();
        
        this.musicSource.buffer = this.musicBuffer;
        this.musicSource.connect(this.musicGainNode);
        this.musicGainNode.connect(this.audioContext.destination);
        
        this.musicGainNode.gain.value = this.settings.musicVolume;
        this.musicSource.start();
        
        this.musicSource.onended = () => {
            if (!this.gamePaused) {
                this.endGame();
            }
        };
    }
    
    endGame() {
        this.gameStarted = false;
        this.gamePaused = false;
        document.getElementById('upload-section').style.display = 'flex';
        document.getElementById('pause-menu').classList.add('hidden');
        document.getElementById('upload-status').textContent = `Game Over! Final Score: ${Math.floor(this.score)}`;
    }
    
    setupPauseMenu() {
        const pauseMenu = document.getElementById('pause-menu');
        const resumeBtn = document.getElementById('resume-btn');
        const restartBtn = document.getElementById('restart-btn');
        const quitBtn = document.getElementById('quit-btn');
        
        const volumeSlider = document.getElementById('volume-slider');
        const volumeValue = document.getElementById('volume-value');
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        const hitVolumeSlider = document.getElementById('hit-volume-slider');
        const hitVolumeValue = document.getElementById('hit-volume-value');
        
        volumeSlider.value = this.settings.musicVolume * 100;
        volumeValue.textContent = Math.round(this.settings.musicVolume * 100) + '%';
        speedSlider.value = this.settings.gameSpeed * 100;
        speedValue.textContent = Math.round(this.settings.gameSpeed * 100) + '%';
        hitVolumeSlider.value = this.settings.hitSoundVolume * 100;
        hitVolumeValue.textContent = Math.round(this.settings.hitSoundVolume * 100) + '%';
        
        volumeSlider.addEventListener('input', (e) => {
            this.settings.musicVolume = e.target.value / 100;
            volumeValue.textContent = e.target.value + '%';
            if (this.musicGainNode) {
                this.musicGainNode.gain.value = this.settings.musicVolume;
            }
            this.saveSettings();
        });
        
        speedSlider.addEventListener('input', (e) => {
            this.settings.gameSpeed = e.target.value / 100;
            speedValue.textContent = e.target.value + '%';
            this.saveSettings();
        });
        
        hitVolumeSlider.addEventListener('input', (e) => {
            this.settings.hitSoundVolume = e.target.value / 100;
            hitVolumeValue.textContent = e.target.value + '%';
            this.createHitSounds();
            this.saveSettings();
        });
        
        resumeBtn.addEventListener('click', () => {
            this.togglePause();
        });
        
        restartBtn.addEventListener('click', () => {
            this.restartGame();
        });
        
        quitBtn.addEventListener('click', () => {
            this.quitToMenu();
        });
    }
    
    togglePause() {
        if (!this.gameStarted) return;
        
        this.gamePaused = !this.gamePaused;
        const pauseMenu = document.getElementById('pause-menu');
        
        if (this.gamePaused) {
            pauseMenu.classList.remove('hidden');
            if (this.musicSource) {
                this.pauseTime = this.audioContext.currentTime;
                this.musicSource.stop();
            }
        } else {
            pauseMenu.classList.add('hidden');
            if (this.musicBuffer) {
                const elapsedTime = this.pauseTime - this.startTime;
                this.resumeMusic(elapsedTime);
                this.startTime = this.audioContext.currentTime - elapsedTime;
            }
        }
    }
    
    resumeMusic(fromTime) {
        if (this.musicSource) {
            this.musicSource.stop();
        }
        
        this.musicSource = this.audioContext.createBufferSource();
        this.musicGainNode = this.audioContext.createGain();
        
        this.musicSource.buffer = this.musicBuffer;
        this.musicSource.connect(this.musicGainNode);
        this.musicGainNode.connect(this.audioContext.destination);
        
        this.musicGainNode.gain.value = this.settings.musicVolume;
        this.musicSource.start(0, fromTime);
        
        this.musicSource.onended = () => {
            if (!this.gamePaused) {
                this.endGame();
            }
        };
    }
    
    restartGame() {
        if (this.musicSource) {
            this.musicSource.stop();
        }
        this.gamePaused = false;
        document.getElementById('pause-menu').classList.add('hidden');
        this.startGame();
    }
    
    quitToMenu() {
        if (this.musicSource) {
            this.musicSource.stop();
        }
        this.gameStarted = false;
        this.gamePaused = false;
        document.getElementById('pause-menu').classList.add('hidden');
        document.getElementById('upload-section').style.display = 'flex';
        this.notes = [];
        this.particles = [];
        this.score = 0;
        this.combo = 0;
        this.updateUI();
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            
            if (key === 'escape') {
                this.togglePause();
                return;
            }
            
            if (this.gamePaused) return;
            
            if (this.keys.includes(key) && !this.keyStates[key]) {
                this.keyStates[key] = true;
                this.handleKeyPress(key);
                this.updateKeyDisplay(key, true);
            }
        });
        
        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keys.includes(key)) {
                this.keyStates[key] = false;
                this.updateKeyDisplay(key, false);
            }
        });
    }
    
    updateKeyDisplay(key, active) {
        const keyElement = document.querySelector(`[data-key="${key}"]`);
        if (keyElement) {
            keyElement.classList.toggle('active', active);
        }
    }
    
    handleKeyPress(key) {
        const laneIndex = this.keys.indexOf(key);
        const hitNote = this.checkHit(laneIndex);
        
        if (hitNote) {
            this.removeNote(hitNote);
            const score = this.calculateScore(hitNote.timing);
            this.updateScore(score);
            this.combo++;
            this.playHitSound(key);
            this.createHitEffect(laneIndex * this.laneWidth + this.laneWidth / 2, this.hitZone, score);
        } else {
            this.combo = 0;
        }
        
        this.updateUI();
    }
    
    checkHit(laneIndex) {
        const tolerance = 50;
        
        for (let note of this.notes) {
            if (note.lane === laneIndex) {
                const distance = Math.abs(note.y - this.hitZone);
                if (distance <= tolerance) {
                    note.timing = distance;
                    return note;
                }
            }
        }
        return null;
    }
    
    calculateScore(timing) {
        if (timing <= 15) return 300; // Perfect
        if (timing <= 30) return 200; // Great
        if (timing <= 50) return 100; // Good
        return 50; // OK
    }
    
    removeNote(noteToRemove) {
        this.notes = this.notes.filter(note => note !== noteToRemove);
    }
    
    updateScore(points) {
        this.score += points * (1 + this.combo * 0.1);
    }
    
    updateUI() {
        document.getElementById('score').textContent = `Score: ${Math.floor(this.score)}`;
        document.getElementById('combo').textContent = `Combo: ${this.combo}`;
    }
    
    createHitEffect(x, y, score) {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8 - 2,
                life: 1.0,
                decay: 0.02,
                color: color,
                size: Math.random() * 4 + 2
            });
        }
        
        this.particles.push({
            x: x,
            y: y - 20,
            vx: 0,
            vy: -1,
            life: 1.0,
            decay: 0.015,
            color: this.getScoreColor(score),
            size: 16,
            text: this.getScoreText(score)
        });
    }
    
    getScoreColor(score) {
        if (score >= 300) return '#00ff00'; // Perfect - Green
        if (score >= 200) return '#ffff00'; // Great - Yellow
        if (score >= 100) return '#ff8800'; // Good - Orange
        return '#ff4444'; // OK - Red
    }
    
    getScoreText(score) {
        if (score >= 300) return 'PERFECT';
        if (score >= 200) return 'GREAT';
        if (score >= 100) return 'GOOD';
        return 'OK';
    }
    
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= particle.decay;
            
            if (particle.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    drawParticles() {
        for (let particle of this.particles) {
            this.ctx.save();
            this.ctx.globalAlpha = particle.life;
            
            if (particle.text) {
                this.ctx.fillStyle = particle.color;
                this.ctx.font = `bold ${particle.size}px Arial`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(particle.text, particle.x, particle.y);
            } else {
                this.ctx.fillStyle = particle.color;
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.restore();
        }
    }
    
    loadSampleChart() {
        const chart = [
            { time: 1000, lane: 0 },
            { time: 1500, lane: 1 },
            { time: 2000, lane: 2 },
            { time: 2500, lane: 3 },
            { time: 3000, lane: 0 },
            { time: 3200, lane: 1 },
            { time: 3400, lane: 2 },
            { time: 3600, lane: 3 },
            { time: 4000, lane: 0 },
            { time: 4000, lane: 2 },
            { time: 4500, lane: 1 },
            { time: 4500, lane: 3 },
            { time: 5000, lane: 0 },
            { time: 5200, lane: 1 },
            { time: 5400, lane: 2 },
            { time: 5600, lane: 3 },
            { time: 6000, lane: 0 },
            { time: 6000, lane: 1 },
            { time: 6000, lane: 2 },
            { time: 6000, lane: 3 }
        ];
        
        this.chartNotes = chart;
        this.nextNoteIndex = 0;
    }
    
    spawnNotes() {
        if (!this.gameStarted || this.gamePaused) return;
        
        const currentMusicTime = (this.audioContext.currentTime - this.startTime) * 1000;
        const adjustedSpawnTime = 2000 / this.settings.gameSpeed;
        
        while (this.nextNoteIndex < this.chartNotes.length) {
            const chartNote = this.chartNotes[this.nextNoteIndex];
            if (currentMusicTime >= chartNote.time - adjustedSpawnTime) {
                this.notes.push({
                    x: chartNote.lane * this.laneWidth + this.laneWidth / 2,
                    y: -20,
                    lane: chartNote.lane,
                    width: 40,
                    height: 20,
                    targetTime: chartNote.time
                });
                this.nextNoteIndex++;
            } else {
                break;
            }
        }
    }
    
    updateNotes() {
        if (this.gamePaused) return;
        
        for (let i = this.notes.length - 1; i >= 0; i--) {
            const note = this.notes[i];
            note.y += this.noteSpeed * this.settings.gameSpeed;
            
            if (note.y > this.canvas.height + 50) {
                this.notes.splice(i, 1);
                this.combo = 0;
                this.updateUI();
            }
        }
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawLanes();
        this.drawHitZone();
        this.drawNotes();
        this.drawParticles();
    }
    
    drawLanes() {
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
        this.ctx.lineWidth = 2;
        
        for (let i = 1; i < this.lanes; i++) {
            const x = i * this.laneWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
    }
    
    drawHitZone() {
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        this.ctx.fillRect(0, this.hitZone - 25, this.canvas.width, 50);
        
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.hitZone);
        this.ctx.lineTo(this.canvas.width, this.hitZone);
        this.ctx.stroke();
    }
    
    drawNotes() {
        this.ctx.fillStyle = '#00ffff';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        
        for (let note of this.notes) {
            this.ctx.fillRect(
                note.x - note.width / 2,
                note.y - note.height / 2,
                note.width,
                note.height
            );
            this.ctx.strokeRect(
                note.x - note.width / 2,
                note.y - note.height / 2,
                note.width,
                note.height
            );
        }
    }
    
    gameLoop(currentTime = 0) {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        if (!this.gameStarted) {
            this.gameTime += deltaTime;
        }
        
        this.spawnNotes();
        this.updateNotes();
        this.updateParticles();
        this.render();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new RhythmGame();
});