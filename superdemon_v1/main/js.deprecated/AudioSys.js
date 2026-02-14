export const AudioSys = {
    ctx: null,

    humOscs: [],
    humBaseFreqs: [], // Store base frequencies for pitch shifting
    humGain: null,
    humLFO: null,

    lastHeartbeat: 0, // Track heartbeat timing

    choirOsc1: null,
    choirOsc2: null,
    choirOsc3: null, // High Shimmer
    choirGain: null,
    choirFilter: null,
    shimmerLFO: null,

    // Bass Properties
    bassOsc1: null,
    bassOsc2: null,
    bassGain: null,
    bassFilter: null,

    init() {
        try {
            if (this.ctx && this.ctx.state !== 'closed') return;
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch (e) { console.log("Audio Init Failed", e); }
    },

    startHum() {
        if (!this.ctx || this.humOscs.length > 0) return;
        try {
            this.humGain = this.ctx.createGain();
            this.humLFO = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();

            // NEW HUM: "Ethereal Glass" (Dreamy, floaty)
            // Intervals: Root (A2), Fifth (E3), Major 7th (G#3), Ninth (B3)
            this.humBaseFreqs = [110, 165, 207.65, 246.94];

            this.humOscs = [];
            this.humBaseFreqs.forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                osc.type = i < 2 ? 'sine' : 'triangle'; // Mix of pure and harmonic
                osc.frequency.value = f;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 400 + (i * 100);

                osc.connect(filter);
                filter.connect(this.humGain);
                osc.start();
                this.humOscs.push(osc);
            });

            // LFO for slow, breathing movement (DISABLED to prevent drops)
            // this.humLFO.type = 'sine';
            // this.humLFO.frequency.value = 0.2;
            // this.humLFO.connect(lfoGain);
            // lfoGain.connect(this.humGain.gain);

            this.humGain.gain.value = 0.08;
            // lfoGain.gain.value = 0.02;

            this.humGain.connect(this.ctx.destination);
            // this.humLFO.start();

            // --- ANGELIC VOCAL (Pre-init) ---
            this.choirOsc1 = this.ctx.createOscillator();
            this.choirOsc2 = this.ctx.createOscillator();
            this.choirOsc3 = this.ctx.createOscillator(); // High Shimmer
            this.shimmerLFO = this.ctx.createOscillator();

            // --- SMOOTH BASS LAYER ---
            this.bassOsc1 = this.ctx.createOscillator(); // Root
            this.bassOsc2 = this.ctx.createOscillator(); // Fifth
            this.bassGain = this.ctx.createGain();
            this.bassFilter = this.ctx.createBiquadFilter();

            this.choirGain = this.ctx.createGain();
            this.choirFilter = this.ctx.createBiquadFilter();

            this.choirOsc1.type = 'sine';
            this.choirOsc2.type = 'sine';
            this.choirOsc3.type = 'sine';

            // Lowered Pitch (A3 Major Triad)
            this.choirOsc1.frequency.value = 220.00; // A3
            this.choirOsc2.frequency.value = 277.18; // C#4
            this.choirOsc3.frequency.value = 329.63; // E4

            this.shimmerLFO.type = 'sine';
            this.shimmerLFO.frequency.value = 3.0; // Even slower

            const shimmerGain = this.ctx.createGain();
            shimmerGain.gain.value = 1.5; // Subtle
            this.shimmerLFO.connect(shimmerGain);
            shimmerGain.connect(this.choirOsc3.frequency);

            this.choirFilter.type = 'lowpass';
            this.choirFilter.frequency.value = 1200;

            this.choirGain.gain.value = 0;

            this.choirOsc1.connect(this.choirFilter);
            this.choirOsc2.connect(this.choirFilter);
            this.choirOsc3.connect(this.choirFilter);
            this.choirFilter.connect(this.choirGain);
            this.choirGain.connect(this.ctx.destination);

            // BASS SETUP
            this.bassOsc1.type = 'sine'; // Very smooth
            this.bassOsc2.type = 'sine';
            this.bassOsc1.frequency.value = 55.00; // A1
            this.bassOsc2.frequency.value = 82.41; // E2 (Fifth)

            this.bassFilter.type = 'lowpass';
            this.bassFilter.frequency.value = 200; // Deep warmth

            this.bassGain.gain.value = 0;

            this.bassOsc1.connect(this.bassFilter);
            this.bassOsc2.connect(this.bassFilter);
            this.bassFilter.connect(this.bassGain);
            this.bassGain.connect(this.ctx.destination);

            this.choirOsc1.start();
            this.choirOsc2.start();
            this.choirOsc3.start();
            this.shimmerLFO.start();
            this.bassOsc1.start();
            this.bassOsc2.start();

        } catch (e) { }
    },

    updateHum(combo) {
        if (this.humOscs.length === 0 || !this.humGain) return;
        try {
            const t = this.ctx.currentTime;
            const cappedCombo = Math.min(combo, 100);
            const intensity = Math.min(1, cappedCombo / 60);

            // Volume swells with intensity
            const targetVol = 0.08 + (intensity * 0.1);
            this.humGain.gain.setTargetAtTime(targetVol, t, 0.1); // Reverted to 0.1 for responsiveness

            // PITCH SCALING: +1 Semitone every 5 Combo
            const semitones = Math.floor(cappedCombo / 5);
            const pitchMult = Math.pow(1.059463, semitones);

            this.humOscs.forEach((osc, i) => {
                if (this.humBaseFreqs[i]) {
                    osc.frequency.setTargetAtTime(this.humBaseFreqs[i] * pitchMult, t, 0.5); // Smoother pitch shift
                }
            });

            // --- HEARTBEAT LOGIC ---
            // BPM = 60 + (Combo * 2) -> Faster ramp up
            const bpm = 60 + (cappedCombo * 2);
            const interval = 60 / bpm;

            if (t - this.lastHeartbeat > interval) {
                this.playHeartbeat();
                this.lastHeartbeat = t;
            }

            // --- ANGELIC VOCAL & BASS UPDATE (Ramp 55 -> 60) ---
            const MAX_CHOIR_VOL = 0.15;
            const MAX_BASS_VOL = 0.4; // Bass needs more gain to be felt (Set to 0.4)
            let ramp = 0;

            if (combo >= 55) {
                if (combo >= 60) {
                    ramp = 1.0;
                } else {
                    // Linear Ramp 55->60
                    ramp = (combo - 55) / 5; // 0.0 to 1.0
                }
            }

            this.choirGain.gain.setTargetAtTime(ramp * MAX_CHOIR_VOL, t, 0.5);
            this.bassGain.gain.setTargetAtTime(ramp * MAX_BASS_VOL, t, 0.5);

            if (ramp > 0) {
                // Slight pitch drift for realism
                this.choirOsc1.frequency.setTargetAtTime(220.00 + Math.sin(t) * 1, t, 0.1);
                this.choirOsc2.frequency.setTargetAtTime(277.18 + Math.cos(t) * 1, t, 0.1);
                // Shimmer follows
                this.choirOsc3.frequency.setTargetAtTime(329.63, t, 0.1);
            }

        } catch (e) { }
    },

    playHeartbeat() {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            // Mellow: Lower start freq, less drastic drop
            osc.frequency.setValueAtTime(80, t);
            osc.frequency.exponentialRampToValueAtTime(30, t + 0.2);

            // Soft Attack to prevent clicking/clipping
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.6, t + 0.02); // 20ms attack
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2); // Longer decay

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(t + 0.2);
        } catch (e) { }
    },

    stopHum() {
        if (this.humOscs.length > 0) {
            try {
                this.humGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
                this.choirGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
                if (this.bassGain) this.bassGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);

                const stopTime = this.ctx.currentTime + 0.5;
                this.humOscs.forEach(o => o.stop(stopTime));
                this.humLFO.stop(stopTime);
                this.choirOsc1.stop(stopTime);
                this.choirOsc2.stop(stopTime);
                this.choirOsc3.stop(stopTime);
                this.shimmerLFO.stop(stopTime);

                if (this.bassOsc1) this.bassOsc1.stop(stopTime);
                if (this.bassOsc2) this.bassOsc2.stop(stopTime);

            } catch (e) { }

            this.humOscs = [];
            this.humGain = null;
            this.humLFO = null;
            this.choirOsc1 = null;
            this.choirOsc2 = null;
            this.choirOsc3 = null;
            this.shimmerLFO = null;
            this.choirGain = null;
            this.choirFilter = null;

            this.bassOsc1 = null;
            this.bassOsc2 = null;
            this.bassGain = null;
            this.bassFilter = null;
        }
    },

    playTone(freq, type, dur, vol = 0.1) {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
            osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(vol, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
            osc.connect(gain); gain.connect(this.ctx.destination); osc.start(); osc.stop(this.ctx.currentTime + dur);
        } catch (e) { }
    },
    slowDown() {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(100, t); osc.frequency.linearRampToValueAtTime(60, t + 0.5);
            gain.gain.setValueAtTime(0.1, t); gain.gain.linearRampToValueAtTime(0, t + 0.5);
            osc.connect(gain); gain.connect(this.ctx.destination); osc.start(); osc.stop(t + 0.5);
        } catch (e) { }
    },
    dash(combo = 0) {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const cappedCombo = Math.min(combo, 100);
            const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
            const startFreq = 300 + (cappedCombo * 15); const endFreq = 1200 + (cappedCombo * 40);
            osc.type = 'triangle'; osc.frequency.setValueAtTime(startFreq, t); osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.15);
            gain.gain.setValueAtTime(0.1, t); gain.gain.linearRampToValueAtTime(0, t + 0.15);

            if (combo > 10) {
                const osc2 = this.ctx.createOscillator(); const gain2 = this.ctx.createGain();
                osc2.type = 'sine'; osc2.frequency.setValueAtTime(startFreq * 1.5, t); osc2.frequency.linearRampToValueAtTime(endFreq * 2, t + 0.2);
                gain2.gain.setValueAtTime(0.05, t); gain2.gain.linearRampToValueAtTime(0, t + 0.2);
                osc2.connect(gain2); gain2.connect(this.ctx.destination); osc2.start(); osc2.stop(t + 0.2);
            }
            osc.connect(gain); gain.connect(this.ctx.destination); osc.start(); osc.stop(t + 0.15);
        } catch (e) { }
    },
    kill(combo) {
        const cappedCombo = Math.min(combo, 100);
        const pitch = Math.min(1200, 300 + (cappedCombo * 50));
        this.playTone(pitch, 'square', 0.1, 0.2);
        this.playTone(100, 'sawtooth', 0.2, 0.25);
    },
    explode(combo = 0) {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            // Smooth Bassy Thud
            osc.type = 'sine'; // Smooth body
            osc.frequency.setValueAtTime(150, t); // Start punch
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.15); // Fast drop to sub-bass

            gain.gain.setValueAtTime(0.8, t); // High impact
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3); // Short tail

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.3);
        } catch (e) { }
    },
    nova(combo = 0) {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const cappedCombo = Math.min(combo, 100);
            const osc1 = this.ctx.createOscillator(); const gain1 = this.ctx.createGain();
            osc1.type = 'triangle'; const freq = 100 + (cappedCombo * 10); osc1.frequency.setValueAtTime(freq, t); osc1.frequency.exponentialRampToValueAtTime(10, t + 1.0);
            gain1.gain.setValueAtTime(0.5, t); // Reduced from 0.8
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 1.0);

            const osc2 = this.ctx.createOscillator(); const gain2 = this.ctx.createGain(); const filter = this.ctx.createBiquadFilter();
            osc2.type = 'sawtooth'; osc2.frequency.setValueAtTime(freq * 5, t); osc2.frequency.exponentialRampToValueAtTime(freq, t + 0.5);
            filter.type = 'lowpass'; filter.frequency.setValueAtTime(1000 + (cappedCombo * 200), t); filter.frequency.exponentialRampToValueAtTime(100, t + 0.5);
            gain2.gain.setValueAtTime(0.2, t); // Reduced from 0.3
            gain2.gain.linearRampToValueAtTime(0, t + 0.5);

            osc1.connect(gain1); gain1.connect(this.ctx.destination);
            osc2.connect(filter); filter.connect(gain2); gain2.connect(this.ctx.destination);
            osc1.start(); osc1.stop(t + 1.0); osc2.start(); osc2.stop(t + 0.5);
        } catch (e) { }
    },

    tierUp(tier) {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            // Sharp Progressive Chords (Simultaneous)
            const base = 220 * Math.pow(2, tier - 1); // A3, A4, A5

            // Tier 1: Root only
            // Tier 2: Root + Fifth
            // Tier 3: Root + Major 3rd + Fifth + Major 7th
            let notes = [base];
            if (tier === 2) notes.push(base * 1.5);
            if (tier >= 3) notes = [base, base * 1.25, base * 1.5, base * 1.875];

            notes.forEach((freq) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                // Mix of Triangle (Body) and Sawtooth (Edge) - simulating with Triangle + Filter
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, t);

                // Filter Envelope for "Zap"
                filter.type = 'lowpass';
                filter.Q.value = 2;
                filter.frequency.setValueAtTime(freq * 3, t);
                filter.frequency.exponentialRampToValueAtTime(freq, t + 0.1);

                // Fast Attack, Short Decay (Sharp Hit)
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.4);
            });
        } catch (e) { }
    },
    collect() { this.playTone(1500 + Math.random() * 500, 'sine', 0.05, 0.1); },
    error() { this.playTone(100, 'sawtooth', 0.3, 0.2); },
    deflect() { this.playTone(800, 'sine', 0.1, 0.2); },
    stun() { this.playTone(600, 'square', 0.3, 0.1); },
    levelup() {
        this.playTone(400, 'sine', 0.1, 0.3); setTimeout(() => this.playTone(600, 'sine', 0.2, 0.3), 100);
        setTimeout(() => this.playTone(800, 'sine', 0.4, 0.3), 200);
    },
    shoot() { this.playTone(400, 'triangle', 0.1, 0.1); },
    warn() { this.playTone(80, 'sawtooth', 1.0, 0.5); },
    playVictoryJingle() {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;

            // Mystical, Melancholic Relief
            // Slow, deep A Minor 9 chord swell
            const chordFreqs = [110, 164.81, 196.00, 220, 261.63]; // A2, E3, G3, A3, C4

            chordFreqs.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = i < 2 ? 'triangle' : 'sine'; // Deep base, soft top
                osc.frequency.setValueAtTime(freq, t);

                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.15, t + 2.0); // Slow swell
                gain.gain.exponentialRampToValueAtTime(0.001, t + 8.0); // Long fade

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 8.0);
            });

            // Simple, lonely melody (High Sine)
            const melody = [
                { f: 523.25, d: 0, l: 1.5 }, // C5
                { f: 493.88, d: 1.5, l: 1.5 }, // B4
                { f: 440.00, d: 3.0, l: 3.0 }, // A4
            ];

            melody.forEach(note => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(note.f, t + note.d);

                gain.gain.setValueAtTime(0, t + note.d);
                gain.gain.linearRampToValueAtTime(0.1, t + note.d + 0.2);
                gain.gain.exponentialRampToValueAtTime(0.001, t + note.d + note.l);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t + note.d);
                osc.stop(t + note.d + note.l);
            });
        } catch (e) { }
    },
    bounce() { this.playTone(800, 'square', 0.1, 0.1); }
};
