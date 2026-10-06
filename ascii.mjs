import sharp from 'sharp';
import fs from 'fs';

const chars = '@%#*+=-:. ';

async function renderAscii(filePath) {
    try {
        const { data, info } = await sharp(filePath)
            .resize(80, 40, { fit: 'inside' })
            .greyscale()
            .raw()
            .toBuffer({ resolveWithObject: true });
        
        let ascii = '';
        for (let y = 0; y < info.height; y++) {
            let row = '';
            for (let x = 0; x < info.width; x++) {
                const pixel = data[y * info.width + x];
                const charIdx = Math.floor((pixel / 255) * (chars.length - 1));
                row += chars[charIdx];
            }
            ascii += row + '\n';
        }
        console.log(`\nASCII art for ${filePath}:\n`);
        console.log(ascii);
    } catch (e) {
        console.error(e);
    }
}

renderAscii('c:/Users/lenovo/Book Reader/src/assets/spines/history/OIP.webp');
