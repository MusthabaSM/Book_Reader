import gsap from 'gsap';
import type { PageTurnConfig, PageTurnDirection } from './config';

export type PageTurnState = 'idle' | 'turning-forward' | 'turning-backward' | 'completing' | 'cancelling';

export interface PageTurnContext {
    direction: PageTurnDirection;
    turningElement?: HTMLElement;
    shadowElement?: HTMLElement;
    config: PageTurnConfig;
    onUpdate?: (progress: number) => void;
    onComplete: () => void;
}

export class PageTurnController {
    private timeline: gsap.core.Timeline | null = null;
    public state: PageTurnState = 'idle';

    public startTurn(context: PageTurnContext) {
        if (this.state !== 'idle') return;

        this.state = context.direction === 'forward' ? 'turning-forward' : 'turning-backward';
        
        const { turningElement, shadowElement, config, onUpdate, onComplete } = context;

        if (turningElement) {
            gsap.set(turningElement, {
                transformOrigin: 'left center',
                transformStyle: 'preserve-3d'
            });

            const startRot = context.direction === 'forward' ? 0 : -180;
            const endRot = context.direction === 'forward' ? -180 : 0;
            gsap.set(turningElement, { rotationY: startRot });
            if (shadowElement) {
                gsap.set(shadowElement, { opacity: 0 });
            }

            this.timeline = gsap.timeline({
                onComplete: () => {
                    this.state = 'completing';
                    onComplete();
                    this.cleanup();
                }
            });

            this.timeline.to(turningElement, {
                rotationY: endRot,
                duration: config.duration,
                ease: config.easing
            }, 0);

            if (shadowElement) {
                this.timeline.to(shadowElement, {
                    opacity: config.shadowIntensity,
                    duration: config.duration / 2,
                    ease: 'power1.in'
                }, 0);
                this.timeline.to(shadowElement, {
                    opacity: 0,
                    duration: config.duration / 2,
                    ease: 'power1.out'
                }, config.duration / 2);
            }
        } else if (onUpdate) {
            // New physical page turn flow
            const proxy = { progress: 0 };
            
            this.timeline = gsap.timeline({
                onUpdate: () => {
                    onUpdate(proxy.progress);
                },
                onComplete: () => {
                    this.state = 'completing';
                    // ensure final state is pushed
                    onUpdate(1);
                    onComplete();
                    this.cleanup();
                }
            });

            this.timeline.to(proxy, {
                progress: 1,
                duration: config.duration,
                ease: config.easing
            }, 0);
        }
    }

    public cancelTurn(onCancelled: () => void) {
        if (this.timeline && this.state !== 'cancelling') {
            this.state = 'cancelling';
            this.timeline.reverse().then(() => {
                this.cleanup();
                onCancelled();
            });
        }
    }

    public cleanup() {
        if (this.timeline) {
            this.timeline.kill();
            this.timeline = null;
        }
        this.state = 'idle';
    }
    
    public isLocked(): boolean {
        return this.state !== 'idle';
    }
}
