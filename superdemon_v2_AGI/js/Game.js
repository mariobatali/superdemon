import { WarpGrid } from './WarpGrid.js';
import { AudioSys } from './AudioSys.js';
import { WARDENS_NEEDED_FOR_RITUAL, STARTING_COMBO } from './Constants.js';
import { EntityManager } from './Entities.js';

export const Game = {
    canvas: null, ctx: null,
    width: 0, height: 0, active: false, paused: false, victoryMode: false,
    grid: null, hue: 0, gameFrame: 0, timeScale: 1.0, targetTimeScale: 1.0,
    player: { x: 0, y: 0, vx: 0, vy: 0, radius: 10, ram: 3, maxRam: 3, overheat: 0, aimTimer: 0 },
    upgrades: { explosion: 0, range: 0, echo: 0, phase: 0, nanites: 0, voltage: 0, ram: 0 },
    combo: 0, comboTimer: 0, maxDashRange: 600, bossSpawnScore: 2000, nextBossScore: 2000, bossActive: false, bossEncounters: 0, wardensKilled: 0, totalKills: 0, nextWardenKills: 50,
    mouse: { x: 0, y: 0, down: false }, aim: { active: false, x: 0, y: 0 },
    score: 0, displayedScore: 0, shake: 0, distortionLevel: 0,
    em: null, // Entity Manager
    lastTime: 0, accumulator: 0, step: 1 / 60,

    bossSpawning: false,
    bossSpawnTimer: 0,

    // KINETIC EVOLUTION SPECIFIC
    powerTier: 0, // 0, 1, 2, 3
    nukeCharge: 0, // 0 to 1

    // FINAL BOSS STUFF
    finalBossActive: false,
    finalBossStage: 0,
    starNodes: [],
    nextStarTarget: 1,
    finalZoneRadius: 0,

    // ATTEMPT TRACKING
    attempt: 0,

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.em = new EntityManager(this);

        this.resize(); window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
        window.addEventListener('mousedown', () => this.onInputDown()); window.addEventListener('mouseup', () => this.onInputUp());
        window.addEventListener('touchstart', e => { e.preventDefault(); this.mouse.x = e.touches[0].clientX; this.mouse.y = e.touches[0].clientY; this.onInputDown(); }, { passive: false });
        window.addEventListener('touchmove', e => { e.preventDefault(); this.mouse.x = e.touches[0].clientX; this.mouse.y = e.touches[0].clientY; }, { passive: false });
        window.addEventListener('touchend', e => this.onInputUp());

        requestAnimationFrame(t => this.loop(t));
    },

    onInputDown() { if (!this.active || this.paused) return; this.mouse.down = true; if (this.player.overheat <= 0) { this.targetTimeScale = 0.02; this.aim.active = true; this.player.aimTimer = 0; AudioSys.slowDown(); } else { AudioSys.error(); } },
    onInputUp() {
        if (!this.active || this.paused) return;
        this.mouse.down = false;
        this.targetTimeScale = 1.0;
        if (this.aim.active) {
            try {
                this.executeDash();
            } catch (e) {
                console.error("Dash Error:", e);
            } finally {
                this.aim.active = false;
            }
        }
    },
    resize() { this.width = this.canvas.width = window.innerWidth; this.height = this.canvas.height = window.innerHeight; this.grid = new WarpGrid(this.width, this.height, 40); },

    start() {
        // Increment Attempt
        this.attempt++;
        localStorage.setItem('superdemon_attempts', this.attempt);

        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('victory-screen').classList.remove('active');

        AudioSys.init();
        AudioSys.startHum(); // Start Ambient Hum
        this.active = true; this.paused = false; this.victoryMode = false; this.score = 0;
        this.player.x = this.width / 2; this.player.y = this.height / 2; this.player.vx = 0; this.player.vy = 0;
        this.player.x = this.width / 2; this.player.y = this.height / 2; this.player.vx = 0; this.player.vy = 0;
        this.player.maxRam = 3; this.player.ram = 3; this.player.overheat = 0;
        this.aim.active = false; // Fix: Reset aim state
        this.mouse.down = false; // Fix: Reset mouse state
        this.timeScale = 1.0; this.targetTimeScale = 1.0; // Fix: Reset time scale

        this.powerTier = 0;
        this.lastPowerTier = 0;
        this.distortionLevel = 0;

        this.upgrades = { explosion: 0, range: 0, echo: 0, phase: 0, voltage: 0, ram: 0 };
        this.combo = STARTING_COMBO; this.comboTimer = 0; this.nextBossScore = 2000; this.bossActive = false; this.bossEncounters = 0; this.wardensKilled = 0;
        this.totalKills = 0; this.nextWardenKills = 20;

        this.em.reset();
        this.shake = 0; this.grid = new WarpGrid(this.width, this.height, 30);

        // Final Boss Reset
        this.finalBossActive = false;
        this.finalZoneRadius = 0;
        this.starNodes = [];

        this.bossSpawning = false;
        this.bossSpawnTimer = 0;
        this.nukeCharge = 0;

        document.getElementById('boss-warning').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'flex';
        this.em.queueSpawn(2);

        this.spawnTimers = {
            basic: 0,
            shooter: 0,
            singularity: 0,
            glitch: 0,
            shielded: 0,
            mines: 0
        };

        this.updateUI();
    },

    triggerGameOver(reason) {
        this.active = false;
        this.aim.active = false; // Fix persistent dash line
        this.em.texts = [];
        AudioSys.stopHum(); // Stop Hum

        const goScreen = document.getElementById('game-over-screen');
        document.getElementById('final-score').innerText = Math.floor(this.score);

        const reasonEl = document.getElementById('death-reason');
        if (reasonEl) reasonEl.innerText = `KILLED BY: ${reason}`;

        const attemptEl = document.getElementById('attempt-num');
        if (attemptEl) attemptEl.innerText = this.attempt;

        goScreen.classList.add('active');
    },

    initFinalBoss() {
        this.finalBossActive = true;
        this.bossActive = false;
        this.em.reset();

        this.nextStarTarget = 1;
        this.finalZoneRadius = Math.max(this.width, this.height);

        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = 250;

        const indices = [0, 2, 4, 1, 3];
        const colors = ['#f00', '#f80', '#ff0', '#0f0', '#00f'];

        for (let i = 0; i < 5; i++) {
            const idx = indices[i];
            const angle = (idx * (Math.PI * 2 / 5)) - Math.PI / 2;

            this.starNodes.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                id: i + 1,
                points: i + 3,
                color: colors[i],
                active: true,
                radius: 25
            });
        }

        AudioSys.warn();
        // this.em.spawnText(centerX, centerY, "INITIATE RITUAL", "#fff");
    },

    triggerVictory() {
        this.victoryMode = true;
        // this.active = false; // Keep active for movement
        AudioSys.stopHum();
        AudioSys.playVictoryJingle();

        const vScreen = document.getElementById('victory-screen');
        vScreen.classList.add('active');
        document.getElementById('victory-score').innerText = Math.floor(this.score);

        // Save High Score
        const high = localStorage.getItem('superdemon_highscore') || 0;
        if (this.score > high) {
            localStorage.setItem('superdemon_highscore', Math.floor(this.score));
        }
    },

    checkShieldBlock(px, py, boss) {
        const angleToPlayer = Math.atan2(py - boss.y, px - boss.x);
        const shieldWidth = Math.PI * 0.4; // Shield width
        for (let sAngle of boss.shields) {
            let diff = angleToPlayer - (sAngle + shieldWidth / 2);
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) < shieldWidth / 2) return true;
        }
        return false;
    },

    executeDash() {
        if (this.player.ram <= 0 && !this.victoryMode) return;
        const dx = this.mouse.x - this.player.x; const dy = this.mouse.y - this.player.y; const dist = Math.sqrt(dx * dx + dy * dy);

        // TIER 3: Nuclear Range (Doubled Dash Range)
        let currentDashRange = this.maxDashRange;
        if (this.powerTier >= 3) currentDashRange *= 2;
        if (this.victoryMode) currentDashRange = 9999; // Infinite Range in Victory

        const dashDist = Math.min(dist, currentDashRange);
        let ex = this.player.x + (dx / dist) * dashDist; let ey = this.player.y + (dy / dist) * dashDist;
        let startX = this.player.x; let startY = this.player.y;

        ex = Math.max(0, Math.min(this.width, ex)); ey = Math.max(0, Math.min(this.height, ey));

        // TIER 1: Echo Slash
        const hasEcho = this.powerTier >= 1;
        const lineLife = 30 + (hasEcho ? 20 : 0);
        this.em.slashLines.push({ x1: startX, y1: startY, x2: ex, y2: ey, life: lineLife, width: 15, lethal: hasEcho });

        this.applyGridForce(startX, startY, 125, 100);
        this.applyGridForce(ex, ey, 125, 100);

        this.player.x = ex; this.player.y = ey; this.player.vx = (dx / dist) * 2; this.player.vy = (dy / dist) * 2;

        let hitCount = 0; let hitMine = false;
        let bossKilled = false;

        // CHECK STAR NODES (Final Boss)
        if (this.finalBossActive) {
            for (let i = 0; i < this.starNodes.length; i++) {
                const node = this.starNodes[i];
                if (!node.active) continue;

                if (this.lineCircleCollide(startX, startY, ex, ey, node)) {
                    if (node.id === this.nextStarTarget) {
                        // Correct
                        node.active = false;
                        this.nextStarTarget++;
                        this.createExplosion(node.x, node.y, 200);
                        AudioSys.kill(this.combo);
                        // this.em.spawnText(node.x, node.y - 30, node.id + "/5", node.color);
                        this.applyGridForce(node.x, node.y, 300, 200);
                        hitCount++;

                        if (this.nextStarTarget > 5) {
                            this.triggerVictory();
                            return; // Stop processing
                        }
                    } else {
                        // Wrong Hit - Immediate Stop
                        AudioSys.error();
                        this.shake = 20;
                        this.em.spawnText(node.x, node.y - 30, "RESET", "#f00");

                        this.nextStarTarget = 1;
                        this.starNodes.forEach(n => n.active = true);

                        this.player.ram = 0;
                        this.player.overheat = 60;

                        this.player.vx *= -0.5;
                        this.player.vy *= -0.5;
                        this.player.x = startX;
                        this.player.y = startY;

                        return; // HALT DASH
                    }
                }
            }
        }

        for (let i = this.em.mines.length - 1; i >= 0; i--) {
            let m = this.em.mines[i];
            if (this.lineCircleCollide(startX, startY, ex, ey, m)) {
                // TIER 2: Mine Mastery
                if (this.powerTier >= 2) {
                    this.em.mines.splice(i, 1);
                    this.em.spawnConfetti(m.x, m.y, '#f80', 20);

                    // Mine Mastery: Trigger Nuke
                    this.createExplosion(m.x, m.y, 100); // 100px Radius (Max Nuke Size)
                    this.applyGridForce(m.x, m.y, 200, 50); // Match Nuke Grid Force

                    // Refill RAM
                    this.player.ram = Math.min(this.player.maxRam, this.player.ram + 1);

                    // Apply Damage
                    hitCount += this.triggerNukeDamage(m.x, m.y, 100);
                    if (hitCount > 0) bossKilled = true;

                    this.combo++;
                    this.comboTimer = 240;
                } else {
                    hitMine = true; this.shake += 40; AudioSys.error(); for (let k = 0; k < 8; k++) this.em.spawnConfetti(m.x, m.y, '#f00', 15); this.em.mines.splice(i, 1); this.applyGridForce(m.x, m.y, 300, 200);
                }
            }
        }

        if (hitMine) {
            this.player.ram = 0;
            this.player.overheat = 180;
            this.player.vx *= -2;
            this.player.vy *= -2;
            this.combo = 0;
            this.updateUI();
            this.triggerGameOver("DATA MINE");
            return;
        }

        for (let i = this.em.projectiles.length - 1; i >= 0; i--) {
            let p = this.em.projectiles[i];
            if (this.lineCircleCollide(startX, startY, ex, ey, p)) { this.em.projectiles.splice(i, 1); this.em.spawnConfetti(p.x, p.y, '#fa0', 3); /* this.em.spawnText(p.x, p.y, "DENIED", "#f0f"); */ }
        }

        if (this.nukeCharge > 0.1) {
            const radius = 100 * this.nukeCharge; // Reverted to 100
            this.createExplosion(ex, ey, radius); this.applyGridForce(ex, ey, radius, 50);

            // Trigger Damage
            hitCount += this.triggerNukeDamage(ex, ey, radius);

            this.nukeCharge = 0; // Reset charge after Nuke
        }

        if (!bossKilled) {
            for (let i = this.em.list.length - 1; i >= 0; i--) {
                let e = this.em.list[i];
                if (e.type === 2 && e.opacity < 0.8) continue;
                if (this.lineCircleCollide(startX, startY, ex, ey, e)) {
                    let allowed = true;
                    // Jouster Invulnerability
                    if (e.type === 6 && e.state === 2) allowed = false;

                    if (e.type === 4) { if (this.checkShieldBlock(startX, startY, e)) allowed = false; }
                    else if (e.hasShield && e.stunned <= 0) {
                        const toPlayerX = startX - e.x; const toPlayerY = startY - e.y;
                        const toPlayerAngle = Math.atan2(toPlayerY, toPlayerX);
                        let diff = toPlayerAngle - e.shieldAngle;
                        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
                        if (Math.abs(diff) < Math.PI / 2) allowed = false;
                    }
                    if (allowed) {
                        const isImmuneSingularity = (e.type === 3 && e.warmupTimer <= 0);
                        if (this.killEnemy(i, 'dash')) bossKilled = true;
                        if (!isImmuneSingularity) hitCount++;
                    }
                    else { AudioSys.deflect(); this.em.spawnConfetti(e.x, e.y, '#fff', 8); /* this.em.spawnText(e.x, e.y - 20, "BLOCKED", "#fff"); */ this.player.vx *= -1; this.player.vy *= -1; }
                }
                if (bossKilled) break;
            }
        }

        AudioSys.dash(this.combo); this.shake = 20;

        if (hitCount > 0) {
            this.player.ram = Math.min(this.player.maxRam, this.player.ram + 1);
            this.shake += hitCount * 10; this.combo += hitCount; this.comboTimer = 240;
            if (hitCount >= 2) this.triggerPrismNova(ex, ey);
        } else {
            if (!this.victoryMode) {
                this.player.ram--;
                if (this.player.ram <= 0) {
                    this.player.overheat = 120;
                    AudioSys.overheat(); // Devastating Sound
                    this.combo = 0;
                }
            }
        }
        this.updateUI();
    },

    applyGridForce(x, y, radius, force) {
        const inv = this.grid.getInverseDistortedPoint(x, y, this.width / 2, this.height / 2, this.distortionLevel);
        this.grid.applyForce(inv.x, inv.y, radius * inv.scale, force);
    },

    addGridShockwave(x, y, radius, color, life, width = 50) {
        const inv = this.grid.getInverseDistortedPoint(x, y, this.width / 2, this.height / 2, this.distortionLevel);
        this.grid.addColorShockwave(inv.x, inv.y, radius * inv.scale, color, life, width);
    },

    createExplosion(x, y, radius) {
        // Replaced overlay shockwave with Grid Color Shockwave
        this.addGridShockwave(x, y, radius, -1, 20, 25); // Width 25
        AudioSys.explode(this.combo);
    },

    triggerNukeDamage(x, y, radius) {
        let hitCount = 0;
        let bossKilled = false;

        // Destroy Projectiles in Blast
        for (let i = this.em.projectiles.length - 1; i >= 0; i--) {
            let p = this.em.projectiles[i];
            if (Math.hypot(p.x - x, p.y - y) < radius) {
                this.em.projectiles.splice(i, 1);
                this.em.spawnConfetti(p.x, p.y, '#fa0', 3);
            }
        }

        for (let i = this.em.list.length - 1; i >= 0; i--) {
            let e = this.em.list[i];
            const ex = e.visualX || e.x; const ey = e.visualY || e.y;
            if (Math.hypot(ex - x, ey - y) < radius + e.radius) {
                let blocked = false;
                if (e.type === 4) {
                    blocked = this.checkShieldBlock(x, y, e);
                } else if (e.hasShield && e.stunned <= 0) {
                    // Fix: Check angle FROM Enemy TO Explosion (is explosion in front of shield?)
                    const angleToExplosion = Math.atan2(y - e.y, x - e.x);
                    let diff = angleToExplosion - e.shieldAngle;
                    while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
                    if (Math.abs(diff) < Math.PI * 0.7) blocked = true; // 70% Coverage
                }

                if (!blocked) {
                    if (this.killEnemy(i, 'explosion')) bossKilled = true;
                    hitCount++;
                }
                else { AudioSys.deflect(); }
            }
            if (bossKilled) break;
        }
        return hitCount;
    },
    update(dt) {
        const timeDelta = dt * 60;
        const scaledDt = timeDelta * this.timeScale;

        if (this.victoryMode) {
            this.grid.update();
            if (Math.random() < 0.1) {
                const x = Math.random() * this.width;
                const y = Math.random() * this.height;
                const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
                this.em.spawnConfetti(x, y, color, 20);
                this.createExplosion(x, y, 100);
            }
            // Update Particles only
            for (let i = this.em.particles.length - 1; i >= 0; i--) {
                let p = this.em.particles[i];
                p.x += p.vx * timeDelta; p.y += p.vy * timeDelta; p.life -= timeDelta;
                if (p.type === 'confetti') { p.angle += p.vAngle * timeDelta; p.vx *= 0.9; p.vy *= 0.9; }
                if (p.life <= 0) this.em.particles.splice(i, 1);
            }
            return;
        }

        if (!this.active || this.paused) return;
        this.gameFrame += scaledDt; this.hue = (this.hue + 2 * scaledDt) % 360; this.timeScale += (this.targetTimeScale - this.timeScale) * 0.2 * timeDelta;

        // AIM WARP EFFECT
        if (this.aim.active && this.player.ram > 0) {
            this.applyGridForce(this.player.x, this.player.y, this.maxDashRange * 0.5, -10.0);
        }

        // Smooth Distortion Level (0.0 to 1.0)
        this.distortionLevel = Math.min(50, this.combo) / 50;

        this.grid.update();
        this.em.update(scaledDt, timeDelta);
        AudioSys.updateHum(this.combo);

        // KINETIC EVOLUTION: Update Power Tier (Audio/Events only)
        if (this.combo >= 50) this.powerTier = 3;
        else if (this.combo >= 30) this.powerTier = 2; // Tier 2 at 30
        else if (this.combo >= 15) this.powerTier = 1; // Tier 1 at 15
        else this.powerTier = 0;

        // Trigger Tier Audio
        if (this.powerTier > this.lastPowerTier) {
            AudioSys.tierUp(this.powerTier);
        }
        this.lastPowerTier = this.powerTier;

        const densityMult = this.combo > 50 ? 3 : 2; // Double earlier, Triple past 50
        const mobCap = (12 + (this.score / 300)) * densityMult;

        // Independent Spawn Logic
        // Fix: Removed !this.bossActive check to allow concurrent spawns
        if (!this.finalBossActive) {

            // 1. Basic Enemies (Type 0)
            // High Cap, Standard Rate
            const basicCount = this.em.list.filter(e => e.type === 0 && !e.hasShield).length;
            if (basicCount < mobCap) {
                this.spawnTimers.basic += scaledDt;
                let rate = 25 - (this.score / 10000); // Doubled Rate (was 50)
                rate = Math.max(5, rate); // Cap lower (was 10)
                if (this.spawnTimers.basic > rate) {
                    this.em.queueSpawn(1, 0);
                    this.spawnTimers.basic = 0;
                }
            }

            // 2. Shooters (Type 1)
            // Medium Cap, Slower Rate
            const shooterCount = this.em.list.filter(e => e.type === 1).length;
            const shooterCap = (2 + Math.floor(this.score / 5000)) * densityMult;
            if (shooterCount < shooterCap && this.wardensKilled >= 1) {
                this.spawnTimers.shooter += scaledDt;
                let rate = 40; // Doubled Rate (was 80)
                if (this.spawnTimers.shooter > rate) {
                    this.em.queueSpawn(1, 1);
                    this.spawnTimers.shooter = 0;
                }
            }

            // 3. Singularity (Type 3)
            // Hard Cap of 3 (Scaled), Slow Rate
            const gravityCount = this.em.list.filter(e => e.type === 3).length;
            const gravityCap = 3 * densityMult;
            if (gravityCount < gravityCap && this.wardensKilled >= 1) {
                this.spawnTimers.singularity += scaledDt;
                let rate = 70; // Doubled Rate (was 140)
                if (this.spawnTimers.singularity > rate) {
                    this.em.queueSpawn(1, 3);
                    this.spawnTimers.singularity = 0;
                }
            }

            // 4. Glitch (Type 5)
            // Low Cap, Fast Rate (Annoying but fragile)
            const glitchCount = this.em.list.filter(e => e.type === 5).length;
            const glitchCap = 2 * densityMult;
            if (glitchCount < glitchCap && this.wardensKilled >= 2) {
                this.spawnTimers.glitch += scaledDt;
                let rate = 50; // Reduced Rate (was 25)
                if (this.spawnTimers.glitch > rate) {
                    this.em.queueSpawn(1, 5);
                    this.spawnTimers.glitch = 0;
                }
            }

            // 5. Shielded (Type 4 Variant)
            // Low Cap, Medium Rate
            const shieldedCount = this.em.list.filter(e => e.hasShield && e.type !== 4).length;
            const shieldedCap = 3 * densityMult;
            if (shieldedCount < shieldedCap && this.score > 125) {
                this.spawnTimers.shielded += scaledDt;
                let rate = 50; // Doubled Rate (was 100)
                if (this.spawnTimers.shielded > rate) {
                    this.em.queueSpawn(1, 4);
                    this.spawnTimers.shielded = 0;
                }
            }

            // 6. Mines
            // Scaled Cap based on enemy count (more enemies = more mines needed for combos)
            const mineCap = Math.max(3, this.em.list.length * 0.5);
            if (this.em.mines.length < mineCap) {
                this.spawnTimers.mines += scaledDt;
                let rate = 25; // Doubled Rate (was 50)
                if (this.spawnTimers.mines > rate) {
                    this.em.spawnMine();
                    this.spawnTimers.mines = 0;
                }
            }
            // 7. Jouster (Type 6)
            // Mid-game, Low Cap (Matched to Glitch)
            const jousterCount = this.em.list.filter(e => e.type === 6).length;
            const jousterCap = 2 * densityMult;
            if (jousterCount < jousterCap && this.wardensKilled >= 2) {
                this.spawnTimers.jouster = (this.spawnTimers.jouster || 0) + scaledDt;
                let rate = 50; // Reduced Rate (was 25)
                if (this.spawnTimers.jouster > rate) {
                    this.em.queueSpawn(1, 6);
                    this.spawnTimers.jouster = 0;
                }
            }

        }

        if (this.totalKills >= this.nextWardenKills && !this.bossActive && !this.finalBossActive && this.wardensKilled < WARDENS_NEEDED_FOR_RITUAL) {
            if (!this.bossSpawning) {
                this.bossSpawning = true;
                this.bossSpawnTimer = 40; // Faster spawn (was 60)

                // Pre-calculate Safe Spawn Position
                let bx, by;
                let attempts = 0;
                do {
                    bx = Math.random() * this.width;
                    by = Math.random() * this.height;
                    attempts++;
                } while (!this.em.isLocationSafe(bx, by) && attempts < 20);

                if (!this.em.isLocationSafe(bx, by)) {
                    bx = (this.player.x + this.width / 2) % this.width;
                    by = (this.player.y + this.height / 2) % this.height;
                }
                this.bossSpawnX = bx;
                this.bossSpawnY = by;
            }
        }

        if (this.bossSpawning) {
            this.bossSpawnTimer -= scaledDt;
            // Persistent Warp at Spawn Location
            this.applyGridForce(this.bossSpawnX, this.bossSpawnY, 200, -10);

            if (this.bossSpawnTimer <= 0) {
                this.em.spawnBoss(this.bossSpawnX, this.bossSpawnY);
                this.bossSpawning = false;
            }
        }

        // RITUAL TRIGGER
        if (this.wardensKilled >= WARDENS_NEEDED_FOR_RITUAL && !this.bossActive && !this.finalBossActive) {
            this.initFinalBoss();
        }
        if (this.combo > 0) { this.comboTimer -= 1 * scaledDt; if (this.comboTimer <= 0) { this.combo = 0; this.updateUI(); } }
        if (this.player.overheat > 0) { this.player.overheat -= scaledDt; if (this.player.overheat <= 0) { this.player.ram = this.player.maxRam; this.updateUI(); } }

        // Final Boss Logic
        if (this.finalBossActive) {
            // RITUAL SHAKE: Toned down
            const shakeIntensity = 2 + Math.sin(this.gameFrame * 0.1) * 1;
            this.shake = Math.max(this.shake, shakeIntensity);

            // RAINBOW BLACKHOLE EFFECT
            this.applyGridForce(this.width / 2, this.height / 2, 800, -20);

            // Decay: 10,000 points per second (Game Time)
            const decay = 10000 * dt * this.timeScale;
            this.score = Math.max(0, this.score - decay);
            if (this.finalZoneRadius > 300) {
                this.finalZoneRadius -= 0.2 * scaledDt;
            }
            const distFromCenter = Math.sqrt((this.player.x - this.width / 2) ** 2 + (this.player.y - this.height / 2) ** 2);
            if (distFromCenter > this.finalZoneRadius) {
                this.triggerGameOver("CONTAINMENT FIELD");
            }
        }

        this.player.x += this.player.vx * scaledDt; this.player.y += this.player.vy * scaledDt;
        this.player.vx *= Math.pow(0.95, scaledDt); this.player.vy *= Math.pow(0.95, scaledDt);
        if (this.player.y < 0 || this.player.y > this.height) { this.player.vy *= -1; this.player.y = Math.max(0, Math.min(this.height, this.player.y)); }

        // NUKE CHARGE LOGIC
        if (!this.mouse.down) {
            let chargeRate = 2; // Base: 0.5s Charge
            if (this.powerTier >= 3) chargeRate = 10; // TIER 3: Instant Charge (0.1s)
            this.nukeCharge += (scaledDt / 60) * chargeRate;
        }
        this.nukeCharge = Math.min(1, this.nukeCharge);

        if (this.player.x < 0 || this.player.x > this.width) { this.player.vx *= -1; this.player.x = Math.max(0, Math.min(this.width, this.player.x)); }

        for (let i = this.em.slashLines.length - 1; i >= 0; i--) {
            let l = this.em.slashLines[i]; l.life -= 1 * scaledDt; l.width *= 0.95;
            if (l.lethal && l.life > 5) {
                for (let j = this.em.list.length - 1; j >= 0; j--) {
                    let e = this.em.list[j];
                    if (this.lineCircleCollide(l.x1, l.y1, l.x2, l.y2, e)) {
                        // TIER 1: Echo Slash Logic
                        let blocked = false;
                        const cx = (l.x1 + l.x2) / 2; const cy = (l.y1 + l.y2) / 2;

                        if (e.type === 4) {
                            blocked = this.checkShieldBlock(l.x1, l.y1, e);
                        } else if (e.hasShield && e.stunned <= 0) {
                            const angleToAttacker = Math.atan2(l.y1 - e.y, l.x1 - e.x);
                            let diff = angleToAttacker - e.shieldAngle;
                            while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
                            if (Math.abs(diff) < Math.PI / 2) blocked = true;
                        }

                        if (!blocked) {
                            // TIER 1: Echo Slash Pull (Visual)
                            if (this.powerTier >= 1 && e.type !== 4 && e.type !== 3) {
                                e.x += (cx - e.x) * 0.2; e.y += (cy - e.y) * 0.2;
                            }

                            // KILL ENEMY
                            this.killEnemy(j, 'slash');
                        } else {
                            if (!e.lastBlockTime || this.gameFrame - e.lastBlockTime > 30) {
                                if (e.type !== 4) AudioSys.deflect();
                                e.lastBlockTime = this.gameFrame;
                            }
                        }
                    }
                }
            }
            if (l.life <= 0) this.em.slashLines.splice(i, 1);
        }
    },

    triggerPrismNova(x, y, overrideCombo = null) {
        // Replaced overlay shockwave with Grid Color Shockwave
        this.addGridShockwave(x, y, 1000, -1, 40, 30); // Width 30 (Thinner)
        this.applyGridForce(x, y, 550, 100); // Reduced range (was 800)

        // Use override if provided (e.g., for Warden Death), otherwise use current combo
        const audioIntensity = overrideCombo !== null ? overrideCombo : this.combo;
        AudioSys.nova(audioIntensity);

        // PUSHBACK & STUN LOGIC (Restored)
        const rangeSq = 550 * 550;
        this.em.list.forEach(e => {
            if (e.type === 4) return; // Don't push Boss (unless required?)
            const distSq = (e.x - x) ** 2 + (e.y - y) ** 2;
            if (distSq < rangeSq) {
                const dist = Math.sqrt(distSq);
                const force = (1.0 - dist / 550) * 20; // Max Force 20
                if (dist > 1) { // Avoid NaN
                    const nx = (e.x - x) / dist;
                    const ny = (e.y - y) / dist;
                    e.vx += nx * force;
                    e.vy += ny * force;
                    e.stunned = 120; // 2 Second Stun
                }
            }
        });

        // Clear Projectiles in Nova Radius
        for (let i = this.em.projectiles.length - 1; i >= 0; i--) {
            let p = this.em.projectiles[i];
            if (Math.hypot(p.x - x, p.y - y) < 550) {
                this.em.projectiles.splice(i, 1);
                this.em.spawnConfetti(p.x, p.y, '#fa0', 3);
            }
        }
    },

    lineCircleCollide(x1, y1, x2, y2, circle) {
        const cx = circle.visualX || circle.x; const cy = circle.visualY || circle.y;
        const abX = x2 - x1; const abY = y2 - y1;
        const acX = cx - x1; const acY = cy - y1;
        const t = (acX * abX + acY * abY) / (abX * abX + abY * abY);
        let closestX, closestY;
        if (t < 0) { closestX = x1; closestY = y1; } else if (t > 1) { closestX = x2; closestY = y2; } else { closestX = x1 + t * abX; closestY = y1 + t * abY; }
        const distX = cx - closestX; const distY = cy - closestY;
        return (distX * distX + distY * distY) < (circle.radius * circle.radius);
    },

    killEnemy(index, source) {
        const deadEnemy = this.em.list[index]; const dx = deadEnemy.x; const dy = deadEnemy.y;

        if (deadEnemy.type === 4) { // Boss
            this.bossActive = false;
            this.wardensKilled++;
            this.score += 5000;
            // Scale gap based on kills (higher kills = faster pacing)
            const killGap = 15 + (this.wardensKilled * 1);
            this.nextWardenKills = this.totalKills + killGap;

            // NEW VISUALS: Prism Nova + Massive Confetti
            this.triggerPrismNova(dx, dy, 60); // High Intensity (but not deafening)

            // MASSIVE CONFETTI
            for (let i = 0; i < 300; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 5 + Math.random() * 15;
                const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
                this.em._spawnParticle({
                    x: dx, y: dy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                    life: Math.random() * 90 + 30, color: color, w: Math.random() * 8 + 4, h: Math.random() * 4 + 2,
                    angle: Math.random() * 10, vAngle: (Math.random() - 0.5) * 0.5, type: 'confetti', size: 0
                });
            }

            // Robust Removal: Find actual index in case of shifts
            const actualIndex = this.em.list.indexOf(deadEnemy);
            if (actualIndex > -1) {
                this.em.list.splice(actualIndex, 1);
            } else {
                // Fallback (should rarely happen)
                this.em.list.splice(index, 1);
            }

            // Clear Tracking Projectiles on Death
            for (let i = this.em.projectiles.length - 1; i >= 0; i--) {
                if (this.em.projectiles[i].type === 'tracking') {
                    this.em.spawnConfetti(this.em.projectiles[i].x, this.em.projectiles[i].y, '#0ff', 5);
                    this.em.projectiles.splice(i, 1);
                }
            }
            return true;
        }

        // SINGULARITY IMMUNITY LOGIC
        if (deadEnemy.type === 3) {
            if (source === 'explosion') {
                // Nuke always kills
            } else if (deadEnemy.warmupTimer > 0) {
                // Vulnerable during warmup
            } else {
                // Immune to dashes once active
                if (deadEnemy.hitCooldown > 0) return false;
                AudioSys.deflect();
                deadEnemy.hitCooldown = 10; // Prevent spam
                return false;
            }
        }

        if (deadEnemy.invuln > 0) return false;

        if (deadEnemy.type === 5 && deadEnemy.lives > 0) {
            deadEnemy.lives--;
            deadEnemy.invuln = 5; // 0.08s Invulnerability (Reduced from 15)
            deadEnemy.stunned = 30; // 0.5s Stun to prevent instant kill after teleport
            // this.em.spawnText(dx, dy, "GLITCH", "#0f0");
            AudioSys.deflect();

            // Safe Teleport (Refined Logic in EntityManager)
            this.em.teleportEnemy(deadEnemy);
            return false;
        }

        // STUN SHOCKWAVE (When killing near Shielded)
        const stunRadiusSq = 40000; // 200^2
        this.em.list.forEach(e => {
            if (e.hasShield && e.stunned <= 0) {
                const distSq = (e.x - dx) ** 2 + (e.y - dy) ** 2;
                if (distSq < stunRadiusSq) {
                    e.stunned = 120; // 2 seconds
                    this.em.spawnConfetti(e.x, e.y, '#0ff', 10);
                    AudioSys.stun();
                }
            }
        });

        // Robust Removal for ALL enemies
        const actualIndex = this.em.list.indexOf(deadEnemy);
        if (actualIndex > -1) {
            this.em.list.splice(actualIndex, 1);
        } else {
            // Fallback
            this.em.list.splice(index, 1);
        }
        this.totalKills++;

        const hue = this.combo > 5 ? this.hue : 0;
        const color = hue ? `hsl(${hue}, 100%, 50%)` : (deadEnemy.color || '#fff');
        this.em.spawnConfetti(dx, dy, color, 20);

        // DIRECT SCORING
        let baseScore = 100;
        if (deadEnemy.type === 1) baseScore = 150; // Shooter
        if (deadEnemy.hasShield) baseScore = 200; // Shielded
        if (deadEnemy.type === 5) baseScore = 300; // Glitch
        if (deadEnemy.type === 3) baseScore = 500; // Singularity

        // Combo Multiplier (Direct Multiplier: 10 Combo = 10x Score)
        const multiplier = Math.max(1, this.combo);
        this.score += baseScore * multiplier;
        AudioSys.collect(); // Keep sound for feedback


        this.updateUI();

        // BULLET CLEARING: Destroy nearby projectiles
        for (let i = this.em.projectiles.length - 1; i >= 0; i--) {
            let p = this.em.projectiles[i];
            const dist = Math.hypot(p.x - dx, p.y - dy);
            if (dist < 50) { // Clear radius 50px
                this.em.projectiles.splice(i, 1);
                this.em.spawnConfetti(p.x, p.y, '#fa0', 3); // Fizzle effect
            }
        }

        // VISUAL: Flashy Death Effect
        // 1. Physical Grid Warp (Small Pop)
        this.applyGridForce(dx, dy, 150, 50);

        // 2. Thin Warp Grid Shockwave on Death
        // Sharper, Brighter Pulse
        this.addGridShockwave(dx, dy, 200, -1, 15, 20); // Width 20 (Thinner) for death

        return false;
    },

    updateUI() {
        const scoreEl = document.getElementById('score-disp');

        // COMBO COLOR SCHEME
        let cColor = '#fff'; // Tier 0 (0-14)
        if (this.combo >= 50) cColor = `hsl(${this.hue}, 100%, 50%)`; // Tier 3+ (Rainbow)
        else if (this.combo >= 30) cColor = '#f0f'; // Tier 2 (30-49)
        else if (this.combo >= 15) cColor = '#0ff'; // Tier 1 (15-29)

        if (scoreEl) {
            scoreEl.innerText = Math.floor(this.score);
            scoreEl.style.color = cColor;
        }

        // HEAT / TIER GAUGE
        const heatFill = document.getElementById('heat-gauge-fill');
        const tierText = document.getElementById('heat-tier-text');

        if (heatFill && tierText) {
            let progress = 0;
            let tierName = "BASE";
            if (this.powerTier === 0) {
                progress = (this.combo / 15) * 100;
                tierName = "TIER 0";
            } else if (this.powerTier === 1) {
                progress = ((this.combo - 15) / (30 - 15)) * 100;
                tierName = "TIER 1: ECHO";
            } else if (this.powerTier === 2) {
                progress = ((this.combo - 30) / (50 - 30)) * 100;
                tierName = "TIER 2: MINE";
            } else {
                progress = 100;
                tierName = "TIER 3: NUKE";
            }

            heatFill.style.width = Math.min(100, Math.max(0, progress)) + "%";
            heatFill.style.backgroundColor = `hsl(${this.hue}, 100%, 50%)`;
            tierText.innerText = tierName;
            tierText.style.color = `hsl(${this.hue}, 100%, 50%)`;
        }

        const comboEl = document.getElementById('combo-disp');
        if (comboEl) {
            if (this.combo > 1) {
                comboEl.style.display = 'block';
                const cv = document.getElementById('combo-val');
                cv.innerText = this.combo;

                comboEl.style.color = cColor;
                comboEl.style.transform = `scale(${1 + (this.combo / 20)})`;
            } else { comboEl.style.display = 'none'; }
        }
    },

    draw() {
        this.ctx.save();
        try {
            // Trails
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.fillRect(0, 0, this.width, this.height);

            // Grid
            // Grid
            // RITUAL MODE: Force Rainbow
            const forceRainbow = this.victoryMode || this.finalBossActive;
            this.grid.draw(this.ctx, this.hue, this.width / 2, this.height / 2, this.combo, forceRainbow, this.distortionLevel);

            // Additive blending for neon glow
            this.ctx.globalCompositeOperation = 'lighter';

            // Entities
            this.em.list.forEach(e => {
                this.ctx.globalAlpha = e.opacity !== undefined ? e.opacity : 1.0;

                if (e.type === 4) {
                    // WARDEN (Type 4)
                    this.ctx.strokeStyle = '#fff'; this.ctx.lineWidth = 10;
                    e.shields.forEach((angle, i) => {
                        this.ctx.beginPath(); const r = e.radius + 20 + (i * 15);
                        this.ctx.arc(e.x, e.y, r, angle, angle + Math.PI * 0.4);
                        this.ctx.stroke();
                    });
                    // Draw Body
                    this.ctx.beginPath();
                    this.ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                    const rainbow = `hsl(${this.hue * 5}, 100%, 50%)`;
                    const eGrad = this.ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
                    eGrad.addColorStop(0, '#fff'); eGrad.addColorStop(0.6, rainbow); eGrad.addColorStop(1, '#000');
                    this.ctx.fillStyle = eGrad;
                    this.ctx.fill();

                } else if (e.type === 3) {
                    // SINGULARITY (Type 3)
                    // Use pre-calculated visual coordinates
                    const dPos = { x: e.visualX || e.x, y: e.visualY || e.y };
                    // REMOVED shadowBlur for perf
                    this.ctx.fillStyle = '#f80';
                    this.ctx.beginPath(); this.ctx.arc(dPos.x, dPos.y, e.radius * 0.8, 0, Math.PI * 2); this.ctx.fill();
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    this.ctx.beginPath(); this.ctx.arc(dPos.x, dPos.y, e.radius * 0.4, 0, Math.PI * 2); this.ctx.fill();

                    if (e.warmupTimer <= 0) {
                        this.ctx.beginPath(); this.ctx.arc(dPos.x, dPos.y, 70, 0, Math.PI * 2);
                        this.ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)'; this.ctx.lineWidth = 1;
                        this.ctx.stroke();
                    }

                } else if (e.type === 5) {
                    // GLITCH (Type 5) - Square/Digital Look
                    this.ctx.save();
                    this.ctx.translate(e.x, e.y);
                    this.ctx.rotate(Math.random() * 0.5 - 0.25); // Jitter rotation

                    // Glitch Effect: Random offset
                    const ox = (Math.random() - 0.5) * 5;
                    const oy = (Math.random() - 0.5) * 5;

                    // HIT FLASH LOGIC
                    if (e.invuln > 0) {
                        this.ctx.fillStyle = '#fff'; // Flash White
                    } else {
                        this.ctx.fillStyle = '#0f0';
                    }

                    this.ctx.fillRect(-e.radius + ox, -e.radius + oy, e.radius * 2, e.radius * 2);

                    // Wireframe overlay
                    this.ctx.strokeStyle = '#fff';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(-e.radius, -e.radius, e.radius * 2, e.radius * 2);

                    this.ctx.restore();

                } else if (e.type === 6) {
                    // JOUSTER (Type 6) - Triangle
                    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return; // Safety Check

                    this.ctx.save();
                    this.ctx.translate(e.x, e.y);

                    let angle = 0;
                    if (e.state === 2) { // Dashing - Face Velocity
                        angle = Math.atan2(e.vy, e.vx) || 0;
                    } else { // Tracking/Charging/Cooldown - Face Player
                        angle = Math.atan2(this.player.y - e.y, this.player.x - e.x) || 0;
                    }
                    this.ctx.rotate(angle);

                    // 1. Draw Laser Sight (State 1) - BEFORE Body Path
                    if (e.state === 1) {
                        this.ctx.save();
                        this.ctx.rotate(-angle); // Undo rotation to draw absolute line
                        this.ctx.beginPath();
                        this.ctx.moveTo(0, 0);
                        this.ctx.lineTo(e.dashTarget.x - e.x, e.dashTarget.y - e.y);
                        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
                        this.ctx.lineWidth = 1;
                        this.ctx.setLineDash([2, 2]); // Faint dash
                        this.ctx.stroke();
                        this.ctx.restore();
                    }

                    // 2. Draw Body
                    this.ctx.beginPath();
                    this.ctx.moveTo(e.radius, 0);
                    this.ctx.lineTo(-e.radius, -e.radius * 0.6);
                    this.ctx.lineTo(-e.radius, e.radius * 0.6);
                    this.ctx.closePath();

                    if (e.state === 1) {
                        if (Math.floor(this.gameFrame / 5) % 2 === 0) {
                            this.ctx.fillStyle = '#fff'; // Flash
                        } else {
                            this.ctx.fillStyle = e.color;
                        }
                    }
                    this.ctx.fill();

                    if (e.state === 2) {
                        // REMOVED shadowBlur for perf
                        this.ctx.strokeStyle = '#fff'; this.ctx.lineWidth = 2; this.ctx.stroke();
                    }
                    this.ctx.restore();

                } else if (e.type === 1) {
                    // GUNNER (Type 1) - Hexagon
                    this.ctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 3) * i;
                        const hx = e.x + Math.cos(angle) * e.radius;
                        const hy = e.y + Math.sin(angle) * e.radius;
                        if (i === 0) this.ctx.moveTo(hx, hy);
                        else this.ctx.lineTo(hx, hy);
                    }
                    this.ctx.closePath();

                    const eGrad = this.ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
                    eGrad.addColorStop(0, '#fff'); eGrad.addColorStop(0.6, e.color); eGrad.addColorStop(1, '#000');
                    this.ctx.fillStyle = eGrad;
                    this.ctx.fill();

                } else {
                    // STANDARD ENEMIES (Type 0, 1, Shielded)
                    // 1. Draw Body First
                    this.ctx.beginPath();
                    this.ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                    const eGrad = this.ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
                    eGrad.addColorStop(0, '#fff'); eGrad.addColorStop(0.6, e.color); eGrad.addColorStop(1, '#000');
                    this.ctx.fillStyle = eGrad;
                    this.ctx.fill();

                    // 2. Draw Shield (Overlay)
                    if (e.hasShield) {
                        this.ctx.save();
                        if (e.stunned > 0) {
                            this.ctx.strokeStyle = '#0ff'; // Cyan for Stunned
                            this.ctx.setLineDash([5, 5]); // Dashed Line
                        } else {
                            this.ctx.strokeStyle = '#fff';
                            this.ctx.setLineDash([]);
                        }
                        this.ctx.lineWidth = 4;
                        this.ctx.beginPath();
                        // Draw shield arc based on shieldAngle
                        // Increased radius to +8 for better visibility
                        // 70% Coverage = PI * 0.7 * 2 = 1.4 PI (252 degrees)
                        this.ctx.arc(e.x, e.y, e.radius + 8, e.shieldAngle - (Math.PI * 0.7), e.shieldAngle + (Math.PI * 0.7));
                        this.ctx.stroke();
                        this.ctx.restore();
                    }
                }
            });
            this.ctx.globalAlpha = 1.0;

            // Star Nodes (Final Boss)
            if (this.finalBossActive) {
                this.ctx.save();
                this.starNodes.forEach(node => {
                    if (!node.active) return;
                    this.ctx.beginPath();
                    this.ctx.fillStyle = node.color;
                    const step = Math.PI * 2 / (node.points * 2);
                    for (let i = 0; i < node.points * 2; i++) {
                        const r = (i % 2 === 0) ? node.radius : node.radius / 2;
                        const a = (i * step) - Math.PI / 2;
                        this.ctx.lineTo(node.x + Math.cos(a) * r, node.y + Math.sin(a) * r);
                    }
                    this.ctx.closePath();
                    this.ctx.fill();
                    this.ctx.stroke();

                    this.ctx.fillStyle = '#000';
                    this.ctx.font = 'bold 16px Courier New';
                    this.ctx.fillText(node.id, node.x - 5, node.y + 5);

                    if (node.id === this.nextStarTarget) {
                        this.ctx.beginPath();
                        this.ctx.arc(node.x, node.y, node.radius + 10 + Math.sin(this.gameFrame * 0.2) * 5, 0, Math.PI * 2);
                        this.ctx.strokeStyle = '#fff';
                        this.ctx.lineWidth = 2;
                        this.ctx.stroke();
                    }
                });
                this.ctx.restore();
            }

            this.em.spawnQueue.forEach(s => {
                this.ctx.beginPath();
                const size = 40 * (s.timer / 60);
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${1 - s.timer / 60})`;

                let sx = s.x;
                let sy = s.y;

                if (s.type === 3) { // Singularity
                    this.ctx.strokeStyle = `rgba(255, 128, 0, ${1 - s.timer / 60})`; // Orange
                }

                this.ctx.rect(sx - size / 2, sy - size / 2, size, size);
                this.ctx.stroke();
            });

            this.em.slashLines.forEach(l => {
                this.ctx.beginPath(); this.ctx.moveTo(l.x1, l.y1); this.ctx.lineTo(l.x2, l.y2);
                const color = l.color || (l.lethal ? '#0ff' : '#fff');
                this.ctx.strokeStyle = color; this.ctx.lineWidth = l.width;
                // REMOVED shadowBlur
                this.ctx.stroke();
            });

            let pGrad;
            // Player is drawn at TRUE position (Undistorted)
            let px = this.player.x;
            let py = this.player.y;

            // OVERHEAT JITTER
            if (this.player.overheat > 0) {
                px += (Math.random() - 0.5) * 10;
                py += (Math.random() - 0.5) * 10;
            }

            if (this.aim.active && this.player.ram > 0) {
                this.ctx.beginPath(); this.ctx.moveTo(px, py);
                const dx = this.mouse.x - px; const dy = this.mouse.y - py;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Draw Aim Line
                const dashDist = Math.min(dist, this.maxDashRange);
                this.ctx.lineTo(px + (dx / dist) * dashDist, py + (dy / dist) * dashDist);
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]);
                this.ctx.stroke();
                this.ctx.setLineDash([]);

                // Draw Range Ring (Super Faint & Shimmering)
                const shimmer = 0.1 + Math.sin(this.gameFrame * 0.1) * 0.05; // 0.05 to 0.15
                this.ctx.beginPath();
                this.ctx.arc(px, py, this.maxDashRange, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${shimmer})`;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

                pGrad = this.ctx.createRadialGradient(px, py, 0, px, py, this.player.radius);
                pGrad.addColorStop(0, '#fff'); pGrad.addColorStop(0.4, '#eee'); pGrad.addColorStop(1, '#aaa');
            } else {
                // Default pGrad if not aiming
                pGrad = this.ctx.createRadialGradient(px, py, 0, px, py, this.player.radius);
                if (this.player.overheat > 0) {
                    // CRITICAL OVERHEAT (Red/Black)
                    pGrad.addColorStop(0, '#fff');
                    pGrad.addColorStop(0.2, '#f00');
                    pGrad.addColorStop(1, '#000');
                } else {
                    pGrad.addColorStop(0, '#fff'); pGrad.addColorStop(0.4, '#eee'); pGrad.addColorStop(1, '#aaa');
                }
            }

            this.ctx.beginPath(); this.ctx.arc(px, py, this.player.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = pGrad; this.ctx.fill();
            this.ctx.beginPath(); this.ctx.arc(px, py, this.player.radius * 0.4, 0, Math.PI * 2);
            this.ctx.fillStyle = '#fff'; this.ctx.fill();

            // RAM DOTS
            const ramRadius = this.player.radius + 25;
            const dotSize = 4;
            const ramColor = this.player.overheat > 0 ? '#f00' : '#fff'; // White by default
            const baseAngle = this.gameFrame * 0.02; // Slow rotation

            for (let i = 0; i < this.player.maxRam; i++) {
                const angle = baseAngle + (Math.PI * 2 / this.player.maxRam) * i;
                const dx = px + Math.cos(angle) * ramRadius;
                const dy = py + Math.sin(angle) * ramRadius;

                this.ctx.beginPath();
                this.ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);

                if (i < this.player.ram) {
                    // Filled (Available)
                    this.ctx.fillStyle = ramColor;
                    // REMOVED shadowBlur
                    this.ctx.fill();
                } else {
                    // Empty (Used)
                    this.ctx.strokeStyle = '#444';
                    this.ctx.lineWidth = 1;
                    this.ctx.stroke();
                }
            }

            // COMBO TIER RING
            if (this.combo > 0) {
                let progress = 0;
                let ringColor = '#fff';

                if (this.combo < 15) {
                    progress = this.combo / 15;
                    ringColor = '#fff';
                } else if (this.combo < 30) {
                    progress = (this.combo - 15) / 15;
                    ringColor = '#0ff';
                } else if (this.combo < 50) {
                    progress = (this.combo - 30) / 20;
                    ringColor = '#f0f';
                } else {
                    progress = 1;
                    ringColor = `hsl(${this.hue}, 100%, 50%)`;
                }

                const ringRadius = this.player.radius + 15;
                const startAngle = -Math.PI / 2;
                const endAngle = startAngle + (Math.PI * 2 * progress);

                this.ctx.beginPath();
                this.ctx.arc(px, py, ringRadius, startAngle, endAngle);
                this.ctx.strokeStyle = ringColor;
                this.ctx.lineWidth = 2; // Thinner
                this.ctx.lineCap = 'round';
                // REMOVED shadowBlur
                this.ctx.stroke();
                this.ctx.lineCap = 'butt'; // Reset
            }

            // NUKE CHARGE RING
            if (this.nukeCharge > 0) {
                this.ctx.beginPath();
                this.ctx.arc(px, py, 100 * this.nukeCharge, 0, Math.PI * 2); // Reverted to 100
                this.ctx.strokeStyle = `rgba(255, 100, 0, ${this.nukeCharge})`; // More opaque
                this.ctx.lineWidth = 2; // Slightly thicker to compensate
                // REMOVED shadowBlur
                this.ctx.stroke();
            }

            this.em.mines.forEach(m => {
                this.ctx.beginPath();
                this.ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);

                // Manual Fill (to allow Stroke on top)
                const mGrad = this.ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius);
                mGrad.addColorStop(0, '#fff');
                mGrad.addColorStop(0.6, m.color);
                mGrad.addColorStop(1, '#000');
                this.ctx.fillStyle = mGrad;
                this.ctx.fill();

                // SPIKE DRAWING LOGIC (Restored)
                const spikes = 8;
                this.ctx.beginPath();
                for (let i = 0; i < spikes; i++) {
                    const angle = (Math.PI * 2 / spikes) * i + this.gameFrame * 0.05;
                    const sx = m.x + Math.cos(angle) * (m.radius + 5);
                    const sy = m.y + Math.sin(angle) * (m.radius + 5);
                    this.ctx.moveTo(m.x, m.y);
                    this.ctx.lineTo(sx, sy);
                }
                this.ctx.strokeStyle = m.color;
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                // Mine Mastery Indicator (Tier 2+)
                if (this.powerTier >= 2) {
                    this.ctx.beginPath();
                    this.ctx.arc(m.x, m.y, m.radius + 2, 0, Math.PI * 2); // Slightly larger
                    this.ctx.strokeStyle = '#f80';
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
            });

            // BATCH RENDER: Projectiles
            // 1. Standard (Orange Circles)
            this.ctx.beginPath();
            let hasStandard = false;
            this.em.projectiles.forEach(p => {
                if (p.type !== 'tracking') {
                    this.ctx.moveTo(p.x + p.radius, p.y);
                    this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    hasStandard = true;
                }
            });
            if (hasStandard) {
                this.ctx.fillStyle = '#fa0';
                this.ctx.fill();
            }

            // 2. Tracking (Cyan Triangles) - Geometry Batching
            this.ctx.beginPath();
            let hasTracking = false;
            this.em.projectiles.forEach(p => {
                if (p.type === 'tracking') {
                    const cos = Math.cos(p.angle);
                    const sin = Math.sin(p.angle);

                    // Vertex 1: Tip (r, 0)
                    const x1 = p.x + p.radius * cos;
                    const y1 = p.y + p.radius * sin;

                    // Vertex 2: Back Left (-r, 0.8r)
                    // x' = x*cos - y*sin
                    // y' = x*sin + y*cos
                    // local: (-r, 0.8r)
                    const lx2 = -p.radius; const ly2 = p.radius * 0.8;
                    const x2 = p.x + (lx2 * cos - ly2 * sin);
                    const y2 = p.y + (lx2 * sin + ly2 * cos);

                    // Vertex 3: Back Right (-r, -0.8r)
                    const lx3 = -p.radius; const ly3 = -p.radius * 0.8;
                    const x3 = p.x + (lx3 * cos - ly3 * sin);
                    const y3 = p.y + (lx3 * sin + ly3 * cos);

                    this.ctx.moveTo(x1, y1);
                    this.ctx.lineTo(x2, y2);
                    this.ctx.lineTo(x3, y3);
                    hasTracking = true;
                }
            });
            if (hasTracking) {
                this.ctx.fillStyle = '#0ff';
                this.ctx.fill();
            }

            this.ctx.fillStyle = '#fff'; // Default
            this.em.particles.forEach(p => {
                // Optimize: Avoid save/restore stack by using setTransform
                // Matrix: [cos, sin, -sin, cos, x, y]
                const c = Math.cos(p.angle || 0);
                const s = Math.sin(p.angle || 0);
                this.ctx.setTransform(c, s, -s, c, p.x, p.y);

                this.ctx.globalAlpha = Math.max(0, p.life / (p.initialLife || 50));

                if (p.type === 'confetti') {
                    this.ctx.fillStyle = p.color;
                    this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                } else if (p.type === 'data') {
                    this.ctx.fillStyle = '#0f0';
                    this.ctx.font = '12px Courier New';
                    this.ctx.fillText('1', 0, 0);
                } else if (p.type === 'teleportLine') {
                    this.ctx.strokeStyle = '#0f0';
                    this.ctx.lineWidth = 4;
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, 0);
                    // Use transformed coordinates or revert for absolute line?
                    // Line is relative to p.x/p.y, so (0,0) is start.
                    // But p.tx/p.ty are absolute. We need relative diff.
                    // setTransform puts (0,0) at p.x, p.y.
                    // Rotate affects it too. Teleport lines shouldn't rotate usually?
                    // If p.angle is 0 for teleport lines, it's fine.
                    // Check spawnTeleportLine: angle is 0.
                    this.ctx.lineTo(p.tx - p.x, p.ty - p.y);
                    this.ctx.stroke();
                }

                // Removed Nanite (dead code)
            });
            // Reset Transform and Alpha
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.globalAlpha = 1.0;

            this.em.texts.forEach(t => {
                this.ctx.fillStyle = t.color;
                this.ctx.font = `bold ${t.size}px Courier New`;
                this.ctx.fillText(t.text, t.x, t.y);
            });

            // RITUAL PHASE: RAINBOW BLACKHOLE (Subtle/Pleasant)
            if (this.finalBossActive) {
                // Subtle Vignette instead of wash
                // this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
                // this.ctx.fillRect(0,0,this.width, this.height);
            }


        } catch (err) {
            console.error("Draw Error:", err);
        } finally {
            this.ctx.restore();
        }
    },

    loop(timestamp) {
        if (!this.lastTime) { this.lastTime = timestamp; }
        let dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        if (isNaN(dt)) dt = 0;
        if (dt < 0) dt = 0;
        if (dt > 0.1) dt = 0.1;

        try {
            this.update(dt);
        } catch (e) {
            console.error("Game Loop Update Error:", e);
        }

        try {
            this.draw();
        } catch (e) {
            console.error("Game Loop Draw Error:", e);
        }
        requestAnimationFrame(t => this.loop(t));
    }
};
