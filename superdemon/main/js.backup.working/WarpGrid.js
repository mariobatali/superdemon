export class WarpGrid {
    constructor(width, height, spacing = 30) {
        this.width = width;
        this.height = height;
        this.spacing = spacing;
        this.cols = Math.ceil(width / spacing) + 1;
        this.rows = Math.ceil(height / spacing) + 1;

        const count = this.cols * this.rows;
        this.count = count;

        // DATA ORIENTED DESIGN (SoA)
        this.pX = new Float32Array(count); // Position X
        this.pY = new Float32Array(count); // Position Y
        this.oX = new Float32Array(count); // Origin X
        this.oY = new Float32Array(count); // Origin Y
        this.vX = new Float32Array(count); // Velocity X
        this.vY = new Float32Array(count); // Velocity Y

        // Cache used for rendering to avoid recreating Float32Array every frame if we used that before
        // But here we can just read pX/pY directly? 
        // We do have PreComputed distortion... 
        // Let's keep display buffers separate for distortion.
        this.dP_X = new Float32Array(count);
        this.dP_Y = new Float32Array(count);

        this.colorShockwaves = [];

        // Initialize
        let i = 0;
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const px = x * spacing;
                const py = y * spacing;
                this.pX[i] = px; this.pY[i] = py;
                this.oX[i] = px; this.oY[i] = py;
                this.vX[i] = 0; this.vY[i] = 0;
                i++;
            }
        }
    }

    applyForce(x, y, radius, force) {
        const rSq = radius * radius;
        for (let i = 0; i < this.count; i++) {
            const dx = this.pX[i] - x;
            const dy = this.pY[i] - y;
            const distSq = dx * dx + dy * dy;

            if (distSq < rSq) {
                const dist = Math.sqrt(distSq);
                const f = (1 - dist / radius) * force;
                // Fast Atan2? approx? or just normalize
                if (dist > 0.001) {
                    this.vX[i] += (dx / dist) * f;
                    this.vY[i] += (dy / dist) * f;
                }
            }
        }
    }

    addColorShockwave(x, y, radius, color, life, width = 50) {
        this.colorShockwaves.push({ x, y, targetRadius: radius, currentRadius: 0, color, life, maxLife: life, width });
    }

    update() {
        // 1. Grid Physics
        for (let i = 0; i < this.count; i++) {
            const dx = this.oX[i] - this.pX[i];
            const dy = this.oY[i] - this.pY[i];

            // Hooke's Law (Spring)
            this.vX[i] += dx * 0.2;
            this.vY[i] += dy * 0.2;

            // Damping
            this.vX[i] *= 0.60;
            this.vY[i] *= 0.60;

            // Integrate
            this.pX[i] += this.vX[i];
            this.pY[i] += this.vY[i];
        }

        // 2. Shockwaves
        for (let i = this.colorShockwaves.length - 1; i >= 0; i--) {
            let sw = this.colorShockwaves[i];
            sw.life--;
            sw.currentRadius += (sw.targetRadius / sw.maxLife) * 1.5;
            if (sw.life <= 0) this.colorShockwaves.splice(i, 1);
        }
    }

    preCompute(centerX, centerY, tier) {
        const distortionStrength = 0.0003 + (tier * 0.0006);

        for (let i = 0; i < this.count; i++) {
            const px = this.pX[i];
            const py = this.pY[i];

            const dx = px - centerX;
            const dy = py - centerY;

            // Optimization: If close to center, fast math?
            // Sqrt is needed for accurate circular distortion
            const dist = Math.sqrt(dx * dx + dy * dy);
            const distortion = 1 + (dist * distortionStrength);

            this.dP_X[i] = centerX + dx * distortion;
            this.dP_Y[i] = centerY + dy * distortion;
        }
    }

    getDistortedPoint(x, y, centerX, centerY, tier) {
        // This is a utility for entities, not main loop
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distortionStrength = 0.0003 + (tier * 0.0006);
        const distortion = 1 + (dist * distortionStrength);
        return { x: centerX + dx * distortion, y: centerY + dy * distortion };
    }

    getInverseDistortedPoint(screenX, screenY, centerX, centerY, tier) {
        // ... (Math unchanged, just adapting to class structure if needed, but this is pure math fn)
        const dx = screenX - centerX;
        const dy = screenY - centerY;
        const screenDist = Math.sqrt(dx * dx + dy * dy);
        if (screenDist < 0.001) return { x: centerX, y: centerY, scale: 1 };
        const k = 0.0003 + (tier * 0.0006);
        const gridDist = (-1 + Math.sqrt(1 + 4 * k * screenDist)) / (2 * k);
        const scale = gridDist / screenDist;
        return { x: centerX + dx * scale, y: centerY + dy * scale, scale: scale };
    }

    draw(ctx, hue, centerX, centerY, combo, rainbowMode = false, tier = 0) {
        ctx.lineWidth = 1;

        // 1. Pre-calculate distorted geometry
        this.preCompute(centerX, centerY, tier);

        const getWarpColor = (i, j) => {
            // i, j are indices
            // 1. Check Color Shockwaves
            if (this.colorShockwaves.length > 0) {
                const x1 = this.pX[i]; const y1 = this.pY[i];
                const x2 = this.pX[j]; const y2 = this.pY[j];
                const mpX = (x1 + x2) / 2;
                const mpY = (y1 + y2) / 2;

                for (let k = this.colorShockwaves.length - 1; k >= 0; k--) {
                    const sw = this.colorShockwaves[k];
                    const range = sw.currentRadius + sw.width + this.spacing;
                    if (Math.abs(mpX - sw.x) > range || Math.abs(mpY - sw.y) > range) continue;

                    const dSq = (mpX - sw.x) ** 2 + (mpY - sw.y) ** 2;
                    const outerR = sw.currentRadius + sw.width;
                    if (dSq > outerR * outerR) continue;

                    const dist = Math.sqrt(dSq);
                    const diff = Math.abs(dist - sw.currentRadius);

                    if (diff < sw.width) {
                        return typeof sw.color === 'string' ? sw.color : `hsl(${sw.color}, 100%, 50%)`;
                    }
                }
            }

            // 2. Base Distortion
            const d1Sq = (this.pX[i] - this.oX[i]) ** 2 + (this.pY[i] - this.oY[i]) ** 2;
            const d2Sq = (this.pX[j] - this.oX[j]) ** 2 + (this.pY[j] - this.oY[j]) ** 2;

            if (d1Sq < 4 && d2Sq < 4) return null;

            const avgDisp = (Math.sqrt(d1Sq) + Math.sqrt(d2Sq)) / 2;
            const warpThreshold = 3;

            if (rainbowMode || avgDisp > warpThreshold) {
                const warpHue = (hue + avgDisp * 3 + (rainbowMode ? (this.pX[i] + this.pY[i]) * 0.1 : 0)) % 360;
                const saturation = rainbowMode ? 100 : Math.min(100, 20 + avgDisp * 2);
                const lightness = rainbowMode ? 50 : Math.min(70, 30 + avgDisp);
                return `hsl(${warpHue}, ${saturation}%, ${lightness}%)`;
            }

            return null;
        };

        // Optimized Draw Pass
        const drawGridPass = (offsetX, offsetY, colorOverride = null, axis = 'both') => {
            ctx.beginPath();
            if (colorOverride) ctx.strokeStyle = colorOverride;
            else ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';

            // Horizontal
            if (axis === 'both' || axis === 'horizontal') {
                for (let y = 0; y < this.rows; y++) {
                    let i = y * this.cols;
                    ctx.moveTo(this.dP_X[i] + offsetX, this.dP_Y[i] + offsetY);
                    for (let x = 1; x < this.cols; x++) {
                        i++;
                        ctx.lineTo(this.dP_X[i] + offsetX, this.dP_Y[i] + offsetY);
                    }
                }
            }
            // Vertical
            if (axis === 'both' || axis === 'vertical') {
                for (let x = 0; x < this.cols; x++) {
                    let i = x;
                    ctx.moveTo(this.dP_X[i] + offsetX, this.dP_Y[i] + offsetY);
                    for (let y = 1; y < this.rows; y++) {
                        i += this.cols;
                        ctx.lineTo(this.dP_X[i] + offsetX, this.dP_Y[i] + offsetY);
                    }
                }
            }
            ctx.stroke();

            // PASS 2: Colored Highlights
            // PASS 2: Colored Highlights (Scatter / Inverse Loop)
            // Optimization: Iterate Shockwaves -> Grid Points
            if (!colorOverride && this.colorShockwaves.length > 0) {

                for (let k = 0; k < this.colorShockwaves.length; k++) {
                    const sw = this.colorShockwaves[k];
                    const outerR = sw.currentRadius + sw.width;

                    // PADDING: Add margin to prevent clipping distorted points
                    const margin = this.spacing * 4;
                    const minCol = Math.max(0, Math.floor((sw.x - outerR - margin) / this.spacing));
                    const maxCol = Math.min(this.cols - 1, Math.ceil((sw.x + outerR + margin) / this.spacing));
                    const minRow = Math.max(0, Math.floor((sw.y - outerR - margin) / this.spacing));
                    const maxRow = Math.min(this.rows - 1, Math.ceil((sw.y + outerR + margin) / this.spacing));

                    for (let y = minRow; y < maxRow; y++) {
                        for (let x = minCol; x < maxCol; x++) {
                            const i = y * this.cols + x;

                            // Check Neighbors (Right & Bottom)
                            // Right
                            if (x < this.cols - 1) {
                                const neighborI = i + 1;
                                // In-line Check for Speed
                                const px = this.dP_X[i]; const py = this.dP_Y[i];
                                const npx = this.dP_X[neighborI]; const npy = this.dP_Y[neighborI];

                                const mpX = (px + npx) / 2; const mpY = (py + npy) / 2;
                                const dSq = (mpX - sw.x) ** 2 + (mpY - sw.y) ** 2;

                                if (dSq < outerR * outerR) {
                                    const dist = Math.sqrt(dSq);
                                    const diff = Math.abs(dist - sw.currentRadius);
                                    if (diff < sw.width) {
                                        ctx.beginPath();
                                        const fade = sw.life / sw.maxLife;
                                        const intensity = (1 - (diff / sw.width)) * fade;
                                        let color;
                                        if (sw.color === -1) color = `rgba(255, 255, 255, ${intensity})`;
                                        else if (typeof sw.color === 'string') color = sw.color;
                                        else color = `hsl(${sw.color}, ${intensity * 100}%, ${100 - intensity * 50}%)`;

                                        ctx.strokeStyle = color;
                                        ctx.moveTo(px, py);
                                        ctx.lineTo(npx, npy);
                                        ctx.stroke();
                                    }
                                }
                            }

                            // Bottom
                            if (y < this.rows - 1) {
                                const neighborI = i + this.cols;
                                const px = this.dP_X[i]; const py = this.dP_Y[i];
                                const npx = this.dP_X[neighborI]; const npy = this.dP_Y[neighborI];
                                const mpX = (px + npx) / 2; const mpY = (py + npy) / 2;
                                const dSq = (mpX - sw.x) ** 2 + (mpY - sw.y) ** 2;

                                if (dSq < outerR * outerR) {
                                    const dist = Math.sqrt(dSq);
                                    const diff = Math.abs(dist - sw.currentRadius);
                                    if (diff < sw.width) {
                                        ctx.beginPath();
                                        const fade = sw.life / sw.maxLife;
                                        const intensity = (1 - (diff / sw.width)) * fade;
                                        let color;
                                        if (sw.color === -1) color = `rgba(255, 255, 255, ${intensity})`;
                                        else if (typeof sw.color === 'string') color = sw.color;
                                        else color = `hsl(${sw.color}, ${intensity * 100}%, ${100 - intensity * 50}%)`;

                                        ctx.strokeStyle = color;
                                        ctx.moveTo(px, py);
                                        ctx.lineTo(npx, npy);
                                        ctx.stroke();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        if (tier > 0 && combo >= 10) {
            const offset = tier * 2;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.6;
            drawGridPass(-offset, 0, 'rgba(255, 0, 0, 0.5)', 'horizontal');
            drawGridPass(offset, 0, 'rgba(0, 0, 255, 0.5)', 'vertical');
            ctx.restore();
        }

        drawGridPass(0, 0, null, 'both');
    }
}
