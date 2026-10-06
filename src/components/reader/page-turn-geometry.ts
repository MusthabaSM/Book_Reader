export interface CurlGeometry {
    x: number;
    z: number;
    rotationY: number;
}

export function calculateCurlGeometry(
    progress: number, // 0 to 1
    direction: 1 | -1, // 1 for forward, -1 for backward
    width: number,
    segmentCount: number
): CurlGeometry[] {
    const segments: CurlGeometry[] = [];
    const w = width / segmentCount;

    let A: number;
    let B: number;

    if (direction === 1) {
        A = -180 * Math.max(0, 2 * progress - 1);
        B = -180 * Math.min(1, 2 * progress);
    } else {
        A = -180 * (1 - Math.max(0, 2 * progress - 1));
        B = -180 * (1 - Math.min(1, 2 * progress));
    }

    let currentX = 0;
    let currentZ = 0;

    for (let i = 0; i < segmentCount; i++) {
        const t = i / (segmentCount - 1);
        const easedT = t * t * (3 - 2 * t);
        const thetaDeg = A * (1 - easedT) + B * easedT;
        const thetaRad = (thetaDeg * Math.PI) / 180;

        segments.push({
            x: currentX,
            z: currentZ,
            rotationY: thetaDeg
        });

        currentX += w * Math.cos(thetaRad);
        currentZ -= w * Math.sin(thetaRad);
    }

    return segments;
}

export interface DiagonalFoldGeometry {
    frontClipPath: string;
    backClipPath: string;
    flapTransformOrigin: string;
    flapTransform: string;
    foldLineAngle: number;
    foldLineX: number;
    foldLineY: number;
}

export function calculateDiagonalFold(
    progress: number, // 0 to 1
    direction: 1 | -1, // 1 for forward (right-to-left), -1 for backward (left-to-right)
    width: number,
    height: number,
    origin: 'top' | 'bottom' = 'top'
): DiagonalFoldGeometry {
    // We constrain progress strictly between 0 and 1
    const p = Math.max(0.0001, Math.min(0.9999, progress));
    
    const isForward = direction === 1;
    const P0x = isForward ? width : 0;
    const P0y = origin === 'top' ? 0 : height;

    let Xc, Yc;
    const yArc = Math.sin(p * Math.PI) * (height / 2);
    
    if (isForward) {
        Xc = width - p * 2 * width;
        Yc = origin === 'top' ? yArc : height - yArc;
    } else {
        Xc = p * 2 * width;
        Yc = origin === 'top' ? yArc : height - yArc;
    }

    const Mx = (P0x + Xc) / 2;
    const My = (P0y + Yc) / 2;

    const dx = P0x - Xc;
    const dy = P0y - Yc;

    const angleRad = Math.atan2(dy, dx); 
    const foldAngleDeg = (angleRad * 180 / Math.PI);

    const isSafe = (x: number, y: number) => ((x - Mx) * dx + (y - My) * dy) <= 0;
    const intersect = (x1: number, y1: number, x2: number, y2: number) => {
        const d1 = (x1 - Mx) * dx + (y1 - My) * dy;
        const d2 = (x2 - Mx) * dx + (y2 - My) * dy;
        const t = d1 / (d1 - d2);
        return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };

    const clipPolygon = (points: number[][], keepSafe: boolean) => {
        const result: number[][] = [];
        for (let i = 0; i < points.length; i++) {
            const curr = points[i];
            const next = points[(i + 1) % points.length];
            
            const currSafe = isSafe(curr[0], curr[1]) === keepSafe;
            const nextSafe = isSafe(next[0], next[1]) === keepSafe;

            if (currSafe) {
                result.push(curr);
            }
            if (currSafe !== nextSafe) {
                result.push(intersect(curr[0], curr[1], next[0], next[1]));
            }
        }
        return result;
    };

    const rect = [[0,0], [width,0], [width,height], [0,height]];
    const frontPoly = clipPolygon(rect, true);
    const backPoly = clipPolygon(rect, false);

    const toStr = (poly: number[][]) => poly.map(pt => `${pt[0].toFixed(2)}px ${pt[1].toFixed(2)}px`).join(', ');

    // 3D flip transform for the flap (back page)
    const vx = -dy;
    const vy = dx;
    const len = Math.sqrt(vx*vx + vy*vy);
    const nvx = vx / len;
    const nvy = vy / len;

    const flapTransformOrigin = `${Mx}px ${My}px`;
    // rotate3d with the normal vector
    const flapTransform = `rotate3d(${nvx}, ${nvy}, 0, 180deg)`;

    return {
        frontClipPath: `polygon(${toStr(frontPoly)})`,
        backClipPath: `polygon(${toStr(backPoly)})`,
        flapTransformOrigin,
        flapTransform,
        foldLineAngle: foldAngleDeg,
        foldLineX: Mx,
        foldLineY: My
    };
}
