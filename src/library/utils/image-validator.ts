export const MAX_COVER_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB

export function validateImageUpload(data: Uint8Array): { valid: boolean; mimeType?: string; error?: string } {
    if (!data || data.length === 0) {
        return { valid: false, error: 'Image data is empty.' };
    }

    if (data.length > MAX_COVER_UPLOAD_SIZE) {
        return { valid: false, error: `Image size exceeds the maximum allowed size of 5MB.` };
    }

    // Magic byte detection
    if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
        return { valid: true, mimeType: 'image/jpeg' };
    }

    if (data.length >= 8 && 
        data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47 && 
        data[4] === 0x0D && data[5] === 0x0A && data[6] === 0x1A && data[7] === 0x0A) {
        return { valid: true, mimeType: 'image/png' };
    }

    if (data.length >= 12 && 
        data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && // 'RIFF'
        data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) { // 'WEBP'
        return { valid: true, mimeType: 'image/webp' };
    }

    return { valid: false, error: 'Unsupported image format. Please upload a valid JPEG, PNG, or WebP image.' };
}
