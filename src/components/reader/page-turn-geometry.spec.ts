import { describe, it, expect } from 'vitest';
import { calculateCurlGeometry } from './page-turn-geometry';

describe('page-turn-geometry', () => {
    it('returns flat page at progress = 0 (forward)', () => {
        const result = calculateCurlGeometry(0, 1, 100, 4);
        expect(result.length).toBe(4);
        expect(result[0].rotationY).toBeCloseTo(0);
        expect(result[3].rotationY).toBeCloseTo(0);
        expect(result[0].x).toBeCloseTo(0);
        expect(result[0].z).toBe(0);
        // segments just build out to the right
        expect(result[3].x).toBeCloseTo(75);
    });

    it('returns flat flipped page at progress = 1 (forward)', () => {
        const result = calculateCurlGeometry(1, 1, 100, 4);
        expect(result[0].rotationY).toBe(-180);
        expect(result[3].rotationY).toBe(-180);
        // builds out to the left
        expect(result[3].x).toBeCloseTo(-75);
    });

    it('returns flat flipped page at progress = 0 (backward)', () => {
        const result = calculateCurlGeometry(0, -1, 100, 4);
        expect(result[0].rotationY).toBe(-180);
        expect(result[3].rotationY).toBe(-180);
        expect(result[3].x).toBeCloseTo(-75);
    });

    it('returns flat page at progress = 1 (backward)', () => {
        const result = calculateCurlGeometry(1, -1, 100, 4);
        expect(result[0].rotationY).toBeCloseTo(0);
        expect(result[3].rotationY).toBeCloseTo(0);
        expect(result[3].x).toBeCloseTo(75);
    });

    it('maintains spine anchor at 0,0', () => {
        const res = calculateCurlGeometry(0.5, 1, 100, 10);
        expect(res[0].x).toBe(0);
        expect(res[0].z).toBe(0);
    });

    it('creates curvature near the middle of the animation', () => {
        const res = calculateCurlGeometry(0.5, 1, 100, 10);
        // spine is 0, free edge is -180
        expect(res[0].rotationY).toBeCloseTo(0);
        expect(res[9].rotationY).toBe(-180);
        // check that intermediate values exist
        expect(res[4].rotationY).toBeLessThan(0);
        expect(res[4].rotationY).toBeGreaterThan(-180);
    });

    it('produces valid coordinates with no NaNs', () => {
        const res = calculateCurlGeometry(0.25, -1, 150, 16);
        res.forEach(seg => {
            expect(Number.isNaN(seg.x)).toBe(false);
            expect(Number.isNaN(seg.z)).toBe(false);
            expect(Number.isNaN(seg.rotationY)).toBe(false);
            expect(Number.isFinite(seg.x)).toBe(true);
        });
    });

    it('maintains mathematical continuity between segments', () => {
        // CSS rotateY(theta) rotates +X towards -Z. 
        // A point (w, 0, 0) rotated by theta around Y becomes (w*cos(theta), 0, -w*sin(theta)).
        const width = 100;
        const segmentCount = 16;
        const w = width / segmentCount;

        const checkContinuity = (progress: number, direction: 1 | -1) => {
            const res = calculateCurlGeometry(progress, direction, width, segmentCount);
            
            for (let i = 0; i < segmentCount - 1; i++) {
                const current = res[i];
                const next = res[i + 1];

                const thetaRad = (current.rotationY * Math.PI) / 180;
                
                // Transformed right edge of current segment
                const rightX = current.x + w * Math.cos(thetaRad);
                const rightZ = current.z - w * Math.sin(thetaRad);

                // Should equal the left edge (origin) of the next segment
                expect(rightX).toBeCloseTo(next.x, 3);
                expect(rightZ).toBeCloseTo(next.z, 3);
            }
        };

        checkContinuity(0.25, 1);
        checkContinuity(0.5, 1);
        checkContinuity(0.75, 1);
        checkContinuity(0.25, -1);
        checkContinuity(0.5, -1);
    });

    it('preserves the total length of the page curve', () => {
        const width = 100;
        const segmentCount = 16;
        const w = width / segmentCount;
        const res = calculateCurlGeometry(0.5, 1, width, segmentCount);
        
        let curveLength = 0;
        for (let i = 0; i < segmentCount - 1; i++) {
            const dx = res[i+1].x - res[i].x;
            const dz = res[i+1].z - res[i].z;
            curveLength += Math.sqrt(dx*dx + dz*dz);
        }
        curveLength += w; // add the last segment's width
        
        expect(curveLength).toBeCloseTo(width, 3);
    });
});
