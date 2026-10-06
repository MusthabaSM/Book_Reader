import React, { useMemo } from 'react';
import type { LibraryBook } from '../../library/models';
import './BookSpine.css';

// Automatically discover all uploaded custom spine images placed in src/assets/spines/[genre]/
const customSpinesGlob = import.meta.glob('../../assets/spines/**/*.{jpg,jpeg,png,webp,avif}', { eager: true, query: '?url', import: 'default' });
export const genreSpines: Record<string, string[]> = {};
for (const [path, url] of Object.entries(customSpinesGlob)) {
    // path format: ../../assets/spines/philosophy/spine.jpg
    const parts = path.split('/');
    if (parts.length >= 3) {
        const genre = parts[parts.length - 2].toLowerCase(); // folder name is the genre
        // Capitalize first letter for display
        const displayGenre = genre.charAt(0).toUpperCase() + genre.slice(1);
        if (!genreSpines[displayGenre]) genreSpines[displayGenre] = [];
        genreSpines[displayGenre].push(url as string);
    }
}
export const availableSpineGenres = Object.keys(genreSpines);

interface BookSpineProps {
    book: LibraryBook;
    isActive: boolean;
}

const MATERIALS = ['leather', 'cloth', 'hardcover', 'paper', 'buckram', 'glossy', 'velvet'] as const;

const FOILS = ['none', 'gold', 'brass', 'copper', 'silver'] as const;
type Foil = typeof FOILS[number];

const COLORS = [
    '#5a2b31', // Burgundy
    '#681b27', // Deep crimson
    '#253f2e', // Forest green
    '#2c3325', // Dark olive
    '#1c2d42', // Navy
    '#111928', // Midnight blue
    '#3e2a1b', // Walnut
    '#2a1e12', // Dark brown
    '#24262b', // Charcoal
    '#362244', // Deep purple
    '#2a4b4c', // Muted teal
    '#805621', // Ochre
    '#8c4a32', // Terracotta
    '#e2d5c3', // Cream
];

// WCAG Relative Luminance Utility
const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

const getRelativeLuminance = (r: number, g: number, b: number) => {
    const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255.0;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

const getContrastRatio = (l1: number, l2: number) => {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
};

// Approximate luminance of the foil gradients for contrast checking
const FOIL_LUMINANCE: Record<Foil, number> = {
    none: 0,
    gold: 0.40,
    brass: 0.26,
    copper: 0.19,
    silver: 0.65
};

// Simple deterministic hash function for string
const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

export const getSpineWidth = (seed: string): number => {
    const hash1 = hashString(seed);
    const hash2 = hashString(seed + '_salt1');
    return 30 + ((hash1 + hash2) % 16);
};

export const BookSpine: React.FC<BookSpineProps> = ({ book, isActive }) => {
    const { material, color, foil, width, heightPct, tilt, foilStyle, ruleStyle, isLightSpine, customSpineImage } = useMemo(() => {
        // Use book.id as deterministic seed. Fallback to title if id is weirdly empty.
        const seed = book.id || book.title || 'unknown';
        const hash1 = hashString(seed);
        const hash2 = hashString(seed + '_salt1');
        const hash3 = hashString(seed + '_salt2');
        const hash4 = hashString(seed + '_salt3');

        // Material selection
        const materialIndex = hash1 % MATERIALS.length;
        const material = MATERIALS[materialIndex];

        // Color selection
        const colorIndex = hash2 % COLORS.length;
        const color = COLORS[colorIndex];
        
        // Calculate contrast
        const rgb = hexToRgb(color);
        const spineLuminance = getRelativeLuminance(rgb.r, rgb.g, rgb.b);
        const isLightSpine = spineLuminance > 0.179;

        // Foil selection: 70% none, 10% gold, 10% brass, 5% copper, 5% silver
        const foilRand = hash3 % 100;
        let foil: Foil = 'none';
        if (foilRand < 10) foil = 'gold';
        else if (foilRand < 20) foil = 'brass';
        else if (foilRand < 25) foil = 'copper';
        else if (foilRand < 30) foil = 'silver';

        // Validate foil contrast, fallback to none if unreadable
        if (foil !== 'none') {
            const contrast = getContrastRatio(spineLuminance, FOIL_LUMINANCE[foil]);
            if (contrast < 4.5) { // Strict WCAG AA requirement (4.5:1) for small text readability
                foil = 'none';
            }
        }

        // Geometry variation
        // Height: 90% to 100%
        const heightPct = 90 + (hash4 % 11);
        
        // Width: 30px to 45px
        const width = getSpineWidth(seed);

        // Tilt: -1deg to 1deg (approx -1, 0, 1)
        const tilt = (hash3 % 3) - 1;
        
        // Foil style mapping - using embossing and subtle highlights
        // WebkitBackgroundClip is used to color the text with the gradient.
        // The textShadow provides the physical stamping depth.
        const foilStyles: Record<Foil, React.CSSProperties> = {
            none: {},
            gold: { 
                backgroundImage: 'linear-gradient(170deg, #dfc688 0%, #a88a44 30%, #dfc688 70%, #d8bb71 100%)', 
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent',
                // Embossed into material: dark shadow on top/left, subtle light on bottom/right
                textShadow: 'inset 1px 1px 1px rgba(0,0,0,0.8), -1px -1px 1px rgba(0,0,0,0.4), 1px 1px 1px rgba(255,255,255,0.2)',
            },
            brass: { 
                backgroundImage: 'linear-gradient(170deg, #c5a970 0%, #8c7644 30%, #c5a970 70%, #b89c62 100%)', 
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent',
                textShadow: 'inset 1px 1px 1px rgba(0,0,0,0.8), -1px -1px 1px rgba(0,0,0,0.4), 1px 1px 1px rgba(255,255,255,0.15)',
            },
            copper: { 
                backgroundImage: 'linear-gradient(170deg, #c87d60 0%, #9c4c34 30%, #c87d60 70%, #b4684c 100%)', 
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent',
                textShadow: 'inset 1px 1px 1px rgba(0,0,0,0.8), -1px -1px 1px rgba(0,0,0,0.5), 1px 1px 1px rgba(255,255,255,0.1)',
            },
            silver: { 
                backgroundImage: 'linear-gradient(170deg, #e0e4e8 0%, #9ba1a8 30%, #e0e4e8 70%, #d0d5db 100%)', 
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent',
                textShadow: 'inset 1px 1px 1px rgba(0,0,0,0.6), -1px -1px 1px rgba(0,0,0,0.3), 1px 1px 1px rgba(255,255,255,0.3)',
            }
        };

        const ruleStyle = foil !== 'none' ? { 
            backgroundImage: foilStyles[foil].backgroundImage,
            boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.6), 0 1px 1px rgba(255,255,255,0.2)'
        } : {};

        let customSpineImage = undefined;
        
        // Check if any of the book's genres have a custom spine image folder
        if (book.genres && book.genres.length > 0) {
            for (const g of book.genres) {
                // Ensure genre matches folder name exactly or approximately (e.g., lowercase)
                const genreName = g.name.toLowerCase().trim();
                
                // Allow partial matches if exact doesn't exist (e.g. 'philosophy' matches 'western philosophy')
                const matchedFolder = Object.keys(genreSpines).find(folder => genreName.includes(folder) || folder.includes(genreName));
                
                if (matchedFolder && genreSpines[matchedFolder].length > 0) {
                    const availableSpines = genreSpines[matchedFolder];
                    const spineIndex = hash1 % availableSpines.length; // Deterministic selection
                    customSpineImage = availableSpines[spineIndex];
                    break; // Use the first matched genre
                }
            }
        }

        return { 
            material, color, foil, width, heightPct, tilt, foilStyle: foilStyles[foil], ruleStyle, isLightSpine, 
            customSpineImage 
        };
    }, [book.id, book.title, book.genres]);

    const titleColor = foil === 'none' 
        ? (isLightSpine ? '#2a2522' : '#f2ebe1') // Deep charcoal on light, warm ivory on dark
        : undefined;
        
    const detailColor = foil === 'none'
        ? (isLightSpine ? 'rgba(42, 37, 34, 0.7)' : 'rgba(242, 235, 225, 0.7)')
        : undefined;
        
    // Deep embossing text shadow for non-foil text
    const textShadowStyle = isLightSpine 
        ? '-1px -1px 1px rgba(0,0,0,0.1), 1px 1px 1px rgba(255,255,255,0.5)' // Printed/debossed on light paper/cloth
        : '-1px -1px 1px rgba(0,0,0,0.6), 1px 1px 1px rgba(255,255,255,0.1)'; // Debossed into dark leather/cloth

    return (
        <div 
            className={`book-spine-physical material-${material} ${isActive ? 'is-active' : ''} ${customSpineImage ? 'has-custom-image' : ''}`}
            style={{ 
                backgroundColor: color, 
                width: `calc(${width}px * var(--spine-scale, 1))`,
                height: `${heightPct}%`,
                transform: isActive ? 'rotateY(-90deg)' : `rotateY(-90deg) rotateX(${tilt}deg)`,
                color: titleColor
            }}
        >
            <div 
                className="spine-surface-texture" 
                style={customSpineImage ? {
                    backgroundImage: `url('${customSpineImage}')`,
                    backgroundSize: 'cover', // Preserve aspect ratio
                    backgroundPositionX: 'center',
                    backgroundPositionY: 'center',
                    backgroundRepeat: 'no-repeat',
                    opacity: 1,
                    mixBlendMode: 'normal',
                    transform: 'scale(1.5)', // Zoom in heavily to push transparent edges/tilted corners out of the bounding box
                    transformOrigin: 'center center'
                } : undefined}
            />
            <div className="spine-lighting-overlay" />
            
            <div className="spine-content">
                {/* Optional decorative top rule */}
                {foil !== 'none' && <div className="spine-rule top-rule" style={ruleStyle} />}
                
                <div 
                    className="spine-title" 
                    title={book.title || 'Untitled'}
                    style={foil !== 'none' ? foilStyle : { textShadow: textShadowStyle }}
                >
                    {book.title || 'Untitled'}
                </div>
                
                <div 
                    className="spine-author"
                    style={foil !== 'none' ? foilStyle : { color: detailColor, textShadow: textShadowStyle }}
                >
                    {book.authors && book.authors.length > 0 ? book.authors[0].displayName : ''}
                </div>
                
                {/* Decorative ridge accents (hub mimics) */}
                <div className="spine-ridges">
                    <div className="spine-ridge" />
                    <div className="spine-ridge" />
                    <div className="spine-ridge" />
                </div>
                
                {/* Bottom rule */}
                {foil !== 'none' && <div className="spine-rule bottom-rule" style={ruleStyle} />}
            </div>
            
            <div className="spine-depth-edges" />
        </div>
    );
};
