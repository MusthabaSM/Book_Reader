import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const srcDir = 'c:/Users/lenovo/Book Reader/src/assets/spines/history';
const outDir = 'c:/Users/lenovo/Book Reader/src/assets/spines/history_temp';

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

async function processImages() {
    // Only process original files that were uploaded, ignore our previous attempts
    const allFiles = fs.readdirSync(srcDir);
    // Find the original 3 images (OIP, old-book-spine..., side-view...)
    const originalFiles = allFiles.filter(f => !f.startsWith('cropped_') && !f.startsWith('super_'));
    
    // If the originals were deleted, use the best available
    let targetFiles = originalFiles;
    if (targetFiles.length === 0) {
        targetFiles = allFiles.filter(f => f.startsWith('cropped_') && !f.startsWith('super_'));
    }
    
    for (const file of targetFiles) {
        const filePath = path.join(srcDir, file);
        const outPath = path.join(outDir, file.replace('cropped_', '')); // clean name
        try {
            console.log(`Processing ${file}...`);
            
            // 1. Get raw pixel data
            const image = sharp(filePath);
            const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
            const { width, height, channels } = info;
            
            let minX = width, maxX = 0, minY = height, maxY = 0;
            
            // 2. Scan pixels to find the real bounding box of the spine
            // We want to aggressively crop out white/light gray padding and transparent pixels
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * channels;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = channels === 4 ? data[idx + 3] : 255;
                    
                    // Is this pixel part of the background?
                    const isTransparent = a < 100; // Aggressive transparency check
                    const isWhiteBg = (r > 200 && g > 200 && b > 200); // Aggressive white/light check
                    
                    // A pixel belongs to the spine if it's dark/colored enough AND opaque
                    const isBook = !isTransparent && !isWhiteBg;
                    
                    if (isBook) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            
            // If we found a valid bounding box
            if (minX <= maxX && minY <= maxY) {
                // Aggressive crop: we even cut 5% into the detected box to be absolutely sure no background remains!
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
            } else {
                console.log(`Could not find bounding box for ${file}`);
            }
            
        } catch (err) {
            console.error(`Failed to crop ${file}:`, err);
        }
    }
}

processImages().then(() => {
    console.log("Done cropping.");
});
