export class WarpGrid {
    constructor(width, height, spacing) {
        this.width = width;
        this.height = height;
        this.spacing = spacing;
        this.cols = Math.ceil(width / spacing) + 1;
        this.rows = Math.ceil(height / spacing) + 1;
        this.points = [];
        this.colorShockwaves = [];
        this.displayPoints = null; // Cache for distorted points

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                this.points.push({
                    x: x * spacing,
                    y: y * spacing,
                    bx: x * spacing,
                    by: y * spacing,
                    vx: 0, vy: 0
                });
            }
        }
    }

    applyForce(x, y, radius, force) {
        this.points.forEach(p => {
            const dx = p.x - x; const dy = p.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < radius * radius) {
                const dist = Math.sqrt(distSq);
                const f = (1 - dist / radius) * force;
                const angle = Math.atan2(dy, dx);
                p.vx += Math.cos(angle) * f;
                p.vy += Math.sin(angle) * f;
            }
        });
    }

    addColorShockwave(x, y, radius, color, life) {
        this.colorShockwaves.push({ x, y, radius, color, life, maxLife: life });
    }

    update() {
        this.points.forEach(p => {
            const dx = p.bx - p.x; const dy = p.by - p.y;
            // Snappy Spring Physics (High Damping to fix Whiplash)
            p.vx += dx * 0.2; p.vy += dy * 0.2;
            p.vx *= 0.60; p.vy *= 0.60;
            p.x += p.vx; p.y += p.vy;
        });

        for (let i = this.colorShockwaves.length - 1; i >= 0; i--) {
            this.colorShockwaves[i].life--;
            if (this.colorShockwaves[i].life <= 0) this.colorShockwaves.splice(i, 1);
        }
    }

    preCompute(centerX, centerY, tier) {
        // Initialize cache if needed
        if (!this.displayPoints || this.displayPoints.length !== this.points.length * 2) {
            this.displayPoints = new Float32Array(this.points.length * 2);
        }

        const distortionStrength = 0.0003 + (tier * 0.0006);

        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const dx = p.x - centerX;
            const dy = p.y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const distortion = 1 + (dist * distortionStrength);

            this.displayPoints[i * 2] = centerX + dx * distortion;
            this.displayPoints[i * 2 + 1] = centerY + dy * distortion;
        }
    }

    getDistortedPoint(x, y, centerX, centerY, tier) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Match distortion strength from preCompute
        const distortionStrength = 0.0003 + (tier * 0.0006);
        const distortion = 1 + (dist * distortionStrength);

        return {
            x: centerX + dx * distortion,
            y: centerY + dy * distortion
        };
    }

    getInverseDistortedPoint(screenX, screenY, centerX, centerY, tier) {
        const dx = screenX - centerX;
        const dy = screenY - centerY;
        const screenDist = Math.sqrt(dx * dx + dy * dy);

        if (screenDist < 0.001) return { x: centerX, y: centerY, scale: 1 };

        const k = 0.0003 + (tier * 0.0006);

        // Solve quadratic: k*r_grid^2 + r_grid - r_screen = 0
        // r_grid = (-1 + sqrt(1 + 4*k*r_screen)) / (2*k)
        const gridDist = (-1 + Math.sqrt(1 + 4 * k * screenDist)) / (2 * k);
        const scale = gridDist / screenDist;

        return {
            x: centerX + dx * scale,
            y: centerY + dy * scale,
            scale: scale
        };
    }

    draw(ctx, hue, centerX, centerY, combo, rainbowMode = false, tier = 0) {
        ctx.lineWidth = 1;

        // 1. Pre-calculate distorted geometry
        this.preCompute(centerX, centerY, tier);

        const getWarpColor = (p1, p2) => {
            const d1 = Math.sqrt((p1.x - p1.bx) ** 2 + (p1.y - p1.by) ** 2);
            const d2 = Math.sqrt((p2.x - p2.bx) ** 2 + (p2.y - p2.by) ** 2);
            const avgDisp = (d1 + d2) / 2;
            const warpThreshold = 3;

            // Check for color shockwaves (Iterate Backwards for Visibility)
            let shockColor = null;
            const mpX = (p1.x + p2.x) / 2;
            const mpY = (p1.y + p2.y) / 2;

            for (let i = this.colorShockwaves.length - 1; i >= 0; i--) {
                const sw = this.colorShockwaves[i];
                const dist = Math.hypot(mpX - sw.x, mpY - sw.y);
                const diff = Math.abs(dist - sw.radius);

                if (diff < 50) { // Ring width
                    const intensity = 1 - (diff / 50);
                    if (sw.color === -1) {
                        shockColor = `rgba(255, 255, 255, ${intensity})`;
                    } else if (typeof sw.color === 'string') {
                        // Quick Hex to RGB
                        let c = sw.color.substring(1);
                        let r = parseInt(c.substring(0, 2), 16);
                        let g = parseInt(c.substring(2, 4), 16);
                        let b = parseInt(c.substring(4, 6), 16);
                        shockColor = `rgba(${r}, ${g}, ${b}, ${intensity})`;
                    } else {
                        const sat = intensity * 100;
                        const light = 100 - (intensity * 50);
                        shockColor = `hsl(${sw.color}, ${sat}%, ${light}%)`;
                    }
                    break;
                }
            }

            if (shockColor) return shockColor;

            if (rainbowMode || avgDisp > warpThreshold) {
                const warpHue = (hue + avgDisp * 3 + (rainbowMode ? (p1.x + p1.y) * 0.1 : 0)) % 360;
                const comboFactor = Math.min(1, combo / 50);
                const saturation = rainbowMode ? 100 : Math.min(100, 20 + avgDisp * 2 + comboFactor * 60);
                const lightness = rainbowMode ? 50 : Math.min(70, 30 + avgDisp);
                return `hsl(${warpHue}, ${saturation}%, ${lightness}%)`;
            } else {
                return null; // Signal default color
            }
        };

        // Optimized Draw Pass (Continuous Strips)
        const drawGridPass = (offsetX, offsetY, colorOverride = null, axis = 'both') => {

            // PASS 1: Base Grid (Batch all rows/cols into one path)
            ctx.beginPath();
            if (colorOverride) ctx.strokeStyle = colorOverride;
            else ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';

            // Horizontal Strips (Rows) - Drawn if axis is 'both' or 'horizontal'
            if (axis === 'both' || axis === 'horizontal') {
                for (let y = 0; y < this.rows; y++) {
                    let i = y * this.cols; // Start of row
                    ctx.moveTo(this.displayPoints[i * 2] + offsetX, this.displayPoints[i * 2 + 1] + offsetY);
                    for (let x = 1; x < this.cols; x++) {
                        i++;
                        ctx.lineTo(this.displayPoints[i * 2] + offsetX, this.displayPoints[i * 2 + 1] + offsetY);
                    }
                }
            }

            // Vertical Strips (Cols) - Drawn if axis is 'both' or 'vertical'
            if (axis === 'both' || axis === 'vertical') {
                for (let x = 0; x < this.cols; x++) {
                    let i = x; // Start of col
                    ctx.moveTo(this.displayPoints[i * 2] + offsetX, this.displayPoints[i * 2 + 1] + offsetY);
                    for (let y = 1; y < this.rows; y++) {
                        i += this.cols;
                        ctx.lineTo(this.displayPoints[i * 2] + offsetX, this.displayPoints[i * 2 + 1] + offsetY);
                    }
                }
            }
            ctx.stroke();

            // PASS 2: Colored Highlights (Only for main pass)
            if (!colorOverride) {
                for (let y = 0; y < this.rows; y++) {
                    for (let x = 0; x < this.cols; x++) {
                        const i = y * this.cols + x;
                        const p = this.points[i];
                        const px = this.displayPoints[i * 2];
                        const py = this.displayPoints[i * 2 + 1];

                        // Right Neighbor
                        if (x < this.cols - 1) {
                            const pRight = this.points[i + 1];
                            const color = getWarpColor(p, pRight);
                            if (color) {
                                ctx.beginPath();
                                ctx.strokeStyle = color;
                                ctx.moveTo(px, py);
                                ctx.lineTo(this.displayPoints[(i + 1) * 2], this.displayPoints[(i + 1) * 2 + 1]);
                                ctx.stroke();
                            }
                        }

                        // Bottom Neighbor
                        if (y < this.rows - 1) {
                            const pDown = this.points[i + this.cols];
                            const color = getWarpColor(p, pDown);
                            if (color) {
                                ctx.beginPath();
                                ctx.strokeStyle = color;
                                ctx.moveTo(px, py);
                                ctx.lineTo(this.displayPoints[(i + this.cols) * 2], this.displayPoints[(i + this.cols) * 2 + 1]);
                                ctx.stroke();
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
            // INTERLACED ABERRATION: Red = Horizontal, Blue = Vertical
            drawGridPass(-offset, 0, 'rgba(255, 0, 0, 0.5)', 'horizontal');
            drawGridPass(offset, 0, 'rgba(0, 0, 255, 0.5)', 'vertical');
            ctx.restore();
        }

        drawGridPass(0, 0, null, 'both');
    }
}
