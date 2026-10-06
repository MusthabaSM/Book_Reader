import React, { useEffect, useRef, useState } from 'react';
import { calculateDiagonalFold } from './page-turn-geometry';
import { PageTurnController } from '../../animation/gsap/controller';
import { defaultPageTurnConfig, type PageTurnDirection } from '../../animation/gsap/config';
import { PageRendererResolver } from './PageRendererResolver';
import type { PaginationConfig } from '../../pagination/layout/config';
import type { PresentationPage } from '../../pagination/page-model';

interface Props {
    frontPage: PresentationPage | null;
    backPage: PresentationPage | null;
    width: number;
    height: number;
    spineX: number;
    direction: PageTurnDirection;
    origin?: 'top' | 'bottom';
    isTurning: boolean;
    turnId: number;
    config: PaginationConfig;
    zoomLevel: number;
    reducedMotion: boolean;
    onTurnComplete: (turnId: number) => void;
}

export const DiagonalPageTurn: React.FC<Props> = ({
    frontPage, backPage, width, height, spineX, direction, origin = 'top', isTurning, turnId, config, zoomLevel, reducedMotion, onTurnComplete
}) => {
    const sourceFrontRef = useRef<HTMLDivElement>(null);
    const sourceBackRef = useRef<HTMLDivElement>(null);
    const frontContainerRef = useRef<HTMLDivElement>(null);
    const flapContainerRef = useRef<HTMLDivElement>(null);
    const shadowLineRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<PageTurnController>(new PageTurnController());
    
    const [isCloned, setIsCloned] = useState(false);

    useEffect(() => {
        if (!isTurning || isCloned) return;

        const sourceFront = sourceFrontRef.current;
        const sourceBack = sourceBackRef.current;
        const frontTarget = frontContainerRef.current;
        const flapTarget = flapContainerRef.current;
        
        if (!sourceFront || !sourceBack || !frontTarget || !flapTarget) return;

        const frontClone = sourceFront.firstChild?.cloneNode(true) as HTMLElement;
        const backClone = sourceBack.firstChild?.cloneNode(true) as HTMLElement;

        if (!frontClone || !backClone) return;

        frontTarget.innerHTML = '';
        frontTarget.appendChild(frontClone);

        flapTarget.innerHTML = '';
        const backWrapper = document.createElement('div');
        backWrapper.style.width = '100%';
        backWrapper.style.height = '100%';
        backWrapper.style.transform = 'rotateY(180deg)';
        backWrapper.appendChild(backClone);
        flapTarget.appendChild(backWrapper);

        // Copy canvas contents for PDFs
        const copyCanvases = (sourceRef: React.RefObject<HTMLDivElement | null>, targetEl: HTMLElement) => {
            if (!sourceRef.current) return;
            const sourceCanvases = Array.from(sourceRef.current.querySelectorAll('canvas'));
            const targetCanvases = Array.from(targetEl.querySelectorAll('canvas'));
            
            for (let j = 0; j < sourceCanvases.length; j++) {
                const s = sourceCanvases[j];
                const t = targetCanvases[j];
                if (s && t && s.width > 0 && s.height > 0) {
                    if (t.width !== s.width || t.height !== s.height) {
                        t.width = s.width;
                        t.height = s.height;
                        t.style.width = s.style.width;
                        t.style.height = s.style.height;
                    }
                    t.getContext('2d')?.drawImage(s, 0, 0);
                }
            }
        };

        setTimeout(() => {
            copyCanvases(sourceFrontRef, frontTarget);
            copyCanvases(sourceBackRef, flapTarget);
        }, 0);

        setIsCloned(true);
    }, [isTurning, isCloned]);

    useEffect(() => {
        if (isTurning && isCloned) {
            if (reducedMotion) {
                setIsCloned(false);
                onTurnComplete(turnId);
                return;
            }

            const controller = controllerRef.current;
            const frontEl = frontContainerRef.current;
            const flapEl = flapContainerRef.current;
            const shadowEl = shadowLineRef.current;
            
            if (!frontEl || !flapEl || !shadowEl) return;

            const dir = direction === 'forward' ? 1 : -1;

            const updateSegments = (progress: number) => {
                const geo = calculateDiagonalFold(progress, dir, width, height, origin);
                
                // 1. Clip the front page
                frontEl.style.clipPath = geo.frontClipPath;
                // Safari fallback
                (frontEl.style as any).webkitClipPath = geo.frontClipPath;

                // 2. Transform and clip the back flap
                // The flap container wraps the back page. We apply transform to it.
                flapEl.style.transformOrigin = geo.flapTransformOrigin;
                flapEl.style.transform = geo.flapTransform;
                flapEl.style.clipPath = geo.backClipPath;
                (flapEl.style as any).webkitClipPath = geo.backClipPath;

                // 3. Update the fold shadow line
                // We position a tall thin div along the fold line to cast a shadow onto the front page
                shadowEl.style.transform = `translate(${geo.foldLineX}px, ${geo.foldLineY}px) rotate(${geo.foldLineAngle}deg)`;
                // Fade shadow in at the start, fade out at the end
                const opacity = Math.sin(progress * Math.PI) * 0.4;
                shadowEl.style.opacity = opacity.toString();
            };

            try {
                const audio = new Audio('/page_turn.mp3');
                audio.volume = 1.0;
                audio.play().catch(e => console.warn('Audio blocked by browser:', e));
            } catch (e) {}

            updateSegments(0);

            controller.startTurn({
                direction,
                config: defaultPageTurnConfig,
                onUpdate: updateSegments,
                onComplete: () => {
                    setIsCloned(false);
                    onTurnComplete(turnId);
                }
            });
        }
    }, [isTurning, isCloned, direction, turnId, width, height, onTurnComplete, reducedMotion]);

    useEffect(() => {
        if (!isTurning) {
            controllerRef.current.cleanup();
            setIsCloned(false);
        }
    }, [isTurning]);

    if (!isTurning) return null;

    return (
        <div style={{ position: 'absolute', left: direction === 'forward' ? spineX : 0, top: 0, width, height, zIndex: 10, pointerEvents: 'none', transformStyle: 'preserve-3d' }}>
            {/* Hidden source renderers for cloning */}
            <div ref={sourceFrontRef} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width, height, overflow: 'hidden' }}>
                {frontPage ? <PageRendererResolver page={frontPage} config={config} zoomLevel={zoomLevel} /> : <div style={{width:'100%',height:'100%',backgroundColor:'#fff'}} />}
            </div>
            <div ref={sourceBackRef} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width, height, overflow: 'hidden' }}>
                {backPage ? <PageRendererResolver page={backPage} config={config} zoomLevel={zoomLevel} /> : <div style={{width:'100%',height:'100%',backgroundColor:'#fff'}} />}
            </div>

            {/* Rendered 2D Fold Elements */}
            <div ref={frontContainerRef} style={{ 
                position: 'absolute', width, height, overflow: 'hidden', backgroundColor: '#fff',
                willChange: 'clip-path'
            }} />
            
            <div ref={flapContainerRef} style={{ 
                position: 'absolute', width, height, overflow: 'hidden', backgroundColor: '#fff',
                willChange: 'transform, clip-path', backfaceVisibility: 'visible',
                // We pre-flip the back page by 180deg Y so that when the 3D flap transform folds it over, it becomes readable!
                // Wait, if we apply it here on flapContainerRef, the clip-path coordinates would be wrong because they are calculated for the untransformed bounds.
                // We must apply the pre-flip to the INNER child.
            }}>
                {/* We'll inject the cloned back page into flapContainerRef, but we need it pre-flipped. 
                    Let's use a wrapper div. */}
            </div>

            {/* Fold Shadow */}
            <div ref={shadowLineRef} style={{
                position: 'absolute',
                width: '100px',
                height: '4000px', // very tall to cover any diagonal
                left: '-50px', // center on fold line
                top: '-2000px',
                background: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)',
                pointerEvents: 'none',
                transformOrigin: 'center center',
                willChange: 'transform, opacity'
            }} />
        </div>
    );
};
