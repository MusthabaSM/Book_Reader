import React, { useEffect, useRef, useState } from 'react';
import { calculateCurlGeometry } from './page-turn-geometry';
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
    isTurning: boolean;
    turnId: number;
    config: PaginationConfig;
    zoomLevel: number;
    reducedMotion: boolean;
    onTurnComplete: (turnId: number) => void;
}

const SEGMENT_COUNT = 16;

export const CylinderPageTurn: React.FC<Props> = ({
    frontPage, backPage, width, height, spineX, direction, isTurning, turnId, config, zoomLevel, reducedMotion, onTurnComplete
}) => {
    const sourceFrontRef = useRef<HTMLDivElement>(null);
    const sourceBackRef = useRef<HTMLDivElement>(null);
    const segmentsContainerRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<PageTurnController>(new PageTurnController());
    
    const [isCloned, setIsCloned] = useState(false);

    useEffect(() => {
        if (!isTurning || isCloned) return;

        const container = segmentsContainerRef.current;
        const sourceFront = sourceFrontRef.current;
        const sourceBack = sourceBackRef.current;
        if (!container || !sourceFront || !sourceBack) return;

        const frontClone = sourceFront.firstChild?.cloneNode(true) as HTMLElement;
        const backClone = sourceBack.firstChild?.cloneNode(true) as HTMLElement;

        if (!frontClone || !backClone) return;

        const segments = Array.from(container.children) as HTMLElement[];
        
        segments.forEach((segment) => {
            const pageContainer = segment.querySelector('.curl-page-container') as HTMLElement;
            if (pageContainer) {
                const frontFace = pageContainer.querySelector('.front-face') as HTMLElement;
                const backFace = pageContainer.querySelector('.back-face') as HTMLElement;
                
                frontFace.innerHTML = '';
                frontFace.appendChild(frontClone.cloneNode(true));
                
                backFace.innerHTML = '';
                backFace.appendChild(backClone.cloneNode(true));
            }
        });

        const copyCanvases = (sourceRef: React.RefObject<HTMLDivElement | null>, faceClass: string) => {
            if (!sourceRef.current) return;
            const sourceCanvases = Array.from(sourceRef.current.querySelectorAll('canvas'));
            if (sourceCanvases.length === 0) return;

            segments.forEach(segment => {
                const targetFace = segment.querySelector(faceClass);
                if (!targetFace) return;
                const targetCanvases = Array.from(targetFace.querySelectorAll('canvas'));
                
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
            });
        };

        setTimeout(() => {
            copyCanvases(sourceFrontRef, '.front-face');
            copyCanvases(sourceBackRef, '.back-face');
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
            const container = segmentsContainerRef.current;
            if (!container) return;

            const segments = Array.from(container.children) as HTMLElement[];
            const dir = direction === 'forward' ? 1 : -1;

            const updateSegments = (progress: number) => {
                const geometry = calculateCurlGeometry(progress, dir, width, SEGMENT_COUNT);
                
                segments.forEach((segment, i) => {
                    const geo = geometry[i];
                    segment.style.transform = `translate3d(${geo.x}px, 0, ${geo.z}px) rotateY(${geo.rotationY}deg)`;
                    
                    const isBack = Math.abs(geo.rotationY) >= 90;
                    const frontFace = segment.querySelector('.front-face') as HTMLElement;
                    const backFace = segment.querySelector('.back-face') as HTMLElement;
                    if (frontFace && backFace) {
                        frontFace.style.display = isBack ? 'none' : 'block';
                        backFace.style.display = isBack ? 'block' : 'none';
                    }

                    const shadowOverlay = segment.querySelector('.curl-shadow') as HTMLElement;
                    if (shadowOverlay) {
                        const arch = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
                        const segmentArch = Math.sin((i / (SEGMENT_COUNT - 1)) * Math.PI);
                        const intensity = arch * segmentArch * 0.15;
                        shadowOverlay.style.opacity = intensity.toString();
                    }
                });
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
    }, [isTurning, isCloned, direction, turnId, width, reducedMotion, onTurnComplete]);

    useEffect(() => {
        if (!isTurning) {
            controllerRef.current.cleanup();
            setIsCloned(false);
        }
    }, [isTurning]);

    if (!isTurning) return null;

    const segmentNodes = Array.from({ length: SEGMENT_COUNT });
    const segmentWidth = width / SEGMENT_COUNT;
    const SHOW_PAGE_SEGMENTS = false;

    return (
        <div style={{ position: 'absolute', left: spineX, top: 0, width, height, perspective: '1800px', zIndex: 10, pointerEvents: 'none' }}>
            <div ref={sourceFrontRef} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width, height, overflow: 'hidden' }}>
                {frontPage ? <PageRendererResolver page={frontPage} config={config} zoomLevel={zoomLevel} /> : <div style={{width:'100%',height:'100%',backgroundColor:'#fff'}} />}
            </div>
            <div ref={sourceBackRef} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width, height, overflow: 'hidden' }}>
                {backPage ? <PageRendererResolver page={backPage} config={config} zoomLevel={zoomLevel} /> : <div style={{width:'100%',height:'100%',backgroundColor:'#fff'}} />}
            </div>

            <div ref={segmentsContainerRef} style={{ position: 'absolute', width, height, transformStyle: 'preserve-3d' }}>
                {segmentNodes.map((_, i) => (
                    <div key={i} className="curl-segment" style={{
                        position: 'absolute', width: segmentWidth, height: height, overflow: 'hidden',
                        transformOrigin: 'left center', transformStyle: 'preserve-3d',
                        borderRight: SHOW_PAGE_SEGMENTS ? '1px solid red' : 'none', boxSizing: 'border-box'
                    }}>
                        <div className="curl-page-container" style={{
                            position: 'absolute', left: 0,
                            transform: `translate3d(${-i * segmentWidth}px, 0, 0)`,
                            width: width, height: height, transformStyle: 'preserve-3d'
                        }}>
                            <div className="front-face" style={{
                                position: 'absolute', width, height, transform: 'rotateY(0deg)', backgroundColor: '#fff'
                            }} />
                            <div className="back-face" style={{
                                position: 'absolute', width, height, transform: 'rotateY(180deg)', backgroundColor: '#fff', display: 'none'
                            }} />
                        </div>
                        <div className="curl-shadow" style={{
                            position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
                            backgroundColor: 'black', opacity: 0, pointerEvents: 'none'
                        }} />
                    </div>
                ))}
            </div>
        </div>
    );
};
