import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dir = 'c:/Users/lenovo/Book Reader/src/assets/spines/history';

async function processImages() {
    const files = fs.readdirSync(dir).filter(f => f.match(/\.(jpg|jpeg|png|webp|avif)$/i) && f.startsWith('cropped_'));
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const outPath = path.join(dir, 'super_' + file);
        try {
            console.log(`Processing ${file}...`);
            
            // 1. Get raw pixel data
            const image = sharp(filePath);
            const metadata = await image.metadata();
            const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
            
            const { width, height, channels } = info;
            
            let minX = width, maxX = 0, minY = height, maxY = 0;
            
            // 2. Scan pixels to find the real bounding box of the spine
            // We assume the background is mostly white, transparent, or very light gray.
            // A book spine will have darker or more saturated pixels.
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * channels;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = channels === 4 ? data[idx + 3] : 255;
                    
                    // Is this pixel part of the background?
                    // Check if it's transparent OR if it's very light (e.g. white/light gray > 230)
                    const isTransparent = a < 50;
                    const isWhiteBg = (r > 220 && g > 220 && b > 220);
                    
                    // Shadows might be gray, so let's also check variance. If it's pure gray, it might be shadow.
                    // But to be safe, if a pixel is significantly dark (r,g,b < 200) and opaque, it's the book.
                    const isBook = !isTransparent && !isWhiteBg;
                    
                    if (isBook) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            
            // If we found a valid bounding box that isn't the whole image
            if (minX <= maxX && minY <= maxY) {
                // Add a small safety margin to avoid chopping the very edge of the spine, but keep it tight
                const margin = 2;
                minX = Math.max(0, minX - margin);
                maxX = Math.min(width - 1, maxX + margin);
                minY = Math.max(0, minY - margin);
                maxY = Math.min(height - 1, maxY + margin);
                
                const cropWidth = maxX - minX;
                const cropHeight = maxY - minY;
                
                console.log(`Cropping ${file} to x:${minX} y:${minY} w:${cropWidth} h:${cropHeight}`);
                
                await sharp(filePath)
                    .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
                    .toFile(outPath);
                
                console.log(`Successfully smart-cropped ${file}`);
                
                // Replace old cropped file
                fs.unlinkSync(filePath);
                fs.renameSync(outPath, filePath);
            } else {
                console.log(`Could not find bounding box for ${file}`);
            }
            
        } catch (err) {
            console.error(`Failed to smart-crop ${file}:`, err);
        }
    }
}

processImages();
