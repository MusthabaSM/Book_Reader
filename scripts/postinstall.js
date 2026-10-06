import fs from 'fs';
import path from 'path';

// Copy WASM files
fs.mkdirSync('public/wasm', { recursive: true });
fs.cpSync('node_modules/pdfjs-dist/wasm', 'public/wasm', { recursive: true });

// Copy Worker
fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'public/pdf.worker.mjs');

console.log('Successfully copied PDF.js assets to public directory');
