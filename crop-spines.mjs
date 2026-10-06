import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dir = 'c:/Users/lenovo/Book Reader/src/assets/spines/history';

async function processImages() {
    const files = fs.readdirSync(dir).filter(f => f.match(/\.(jpg|jpeg|png|webp|avif)$/i) && !f.startsWith('cropped_'));
    for (const file of files) {
        const filePath = path.join(dir, file);
        const outPath = path.join(dir, 'cropped_' + file);
        try {
            console.log(`Processing ${file}...`);
            await sharp(filePath)
                .trim({ threshold: 10 }) 
                .toFile(outPath);
            
            console.log(`Successfully auto-cropped ${file}`);
            
            // Delete original file safely
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                console.error(`Could not delete original ${file}`, e);
            }
        } catch (err) {
            console.error(`Failed to crop ${file}:`, err);
        }
    }
}

processImages();
