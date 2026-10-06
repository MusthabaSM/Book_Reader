import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const srcDir = 'c:/Users/lenovo/Book Reader/src/assets/spines/history';
const outDir = 'c:/Users/lenovo/Book Reader/src/assets/spines/history_temp';

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

async function processImages() {
    const targetFiles = [
        'old-book-spine-white-background_118047-16950.avif',
        'old-book-spine-white-background_118047-19309.avif'
    ];
    
    for (const file of targetFiles) {
        const filePath = path.join(srcDir, file);
        if (!fs.existsSync(filePath)) {
            console.log(`Skipping ${file} - not found`);
            continue;
        }
        
        const outPath = path.join(outDir, file);
        try {
            console.log(`Processing ${file}...`);
            
            // 1. Get raw pixel data
            const image = sharp(filePath);
            const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
            const { width, height, channels } = info;
            
            let minX = width, maxX = 0, minY = height, maxY = 0;
            
            // 2. Scan pixels to find the real bounding box of the spine
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * channels;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = channels === 4 ? data[idx + 3] : 255;
                    
                    const isTransparent = a < 100; 
                    const isWhiteBg = (r > 200 && g > 200 && b > 200);
                    
                    const isBook = !isTransparent && !isWhiteBg;
                    
                    if (isBook) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            
            if (minX <= maxX && minY <= maxY) {
                const w = maxX - minX;
                const h = maxY - minY;
                const shaveX = Math.floor(w * 0.05); // shave 5% off left and right
                const shaveY = Math.floor(h * 0.02); // shave 2% off top and bottom
                
                const finalX = minX + shaveX;
                const finalY = minY + shaveY;
                const finalW = w - (shaveX * 2);
                const finalH = h - (shaveY * 2);
                
                console.log(`Aggressively cropping ${file} to x:${finalX} y:${finalY} w:${finalW} h:${finalH}`);
                
                await sharp(filePath)
                    .extract({ left: finalX, top: finalY, width: finalW, height: finalH })
                    .toFile(outPath);
                
                console.log(`Successfully cropped ${file}`);
            }
        } catch (err) {
            console.error(`Failed to crop ${file}:`, err);
        }
    }
}

processImages().then(() => {
    console.log("Done cropping two new images.");
});
