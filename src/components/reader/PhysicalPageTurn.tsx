import React, { useEffect, useRef, useState } from 'react';
import type { PageTurnDirection } from '../../animation/gsap/config';
import type { PaginationConfig } from '../../pagination/layout/config';
import type { PresentationPage } from '../../pagination/page-model';
import { DiagonalPageTurn } from './DiagonalPageTurn';
import { CylinderPageTurn } from './CylinderPageTurn';

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
    totalSpreads: number;
    spreadIndex: number;
    bookId: string;
}

type TurnStyle = 'diagonal-top' | 'diagonal-bottom' | 'cylinder';
const bookDeckCache = new Map<string, TurnStyle[]>();

function getTurnStyleForSpread(bookId: string, totalSpreads: number, spreadIndex: number): TurnStyle {
    if (bookId === 'unknown' || totalSpreads === 0) {
        // Fallback for missing info
        const rand = Math.random();
        if (rand < 0.68) return 'diagonal-top';
        if (rand < 0.93) return 'diagonal-bottom';
        return 'cylinder';
    }

    if (!bookDeckCache.has(bookId) || bookDeckCache.get(bookId)!.length !== totalSpreads) {
        const deck: TurnStyle[] = [];
        const topCount = Math.round(totalSpreads * 0.68);
        const bottomCount = Math.round(totalSpreads * 0.25);
        const cylinderCount = totalSpreads - topCount - bottomCount;

        for (let i = 0; i < topCount; i++) deck.push('diagonal-top');
        for (let i = 0; i < bottomCount; i++) deck.push('diagonal-bottom');
        for (let i = 0; i < cylinderCount; i++) deck.push('cylinder');

        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        bookDeckCache.set(bookId, deck);
    }

    const deck = bookDeckCache.get(bookId)!;
    // ensure index is within bounds (should always be, but safe fallback)
    const safeIndex = Math.max(0, Math.min(spreadIndex, totalSpreads - 1));
    return deck[safeIndex];
}

export const PhysicalPageTurn: React.FC<Props> = (props) => {
    const { isTurning, bookId, totalSpreads, spreadIndex } = props;
    const [turnStyle, setTurnStyle] = useState<TurnStyle>('diagonal-top');
    const wasTurning = useRef(false);

    useEffect(() => {
        if (isTurning && !wasTurning.current) {
            setTurnStyle(getTurnStyleForSpread(bookId, totalSpreads, spreadIndex));
        }
        wasTurning.current = isTurning;
    }, [isTurning, bookId, totalSpreads, spreadIndex]);

    if (!isTurning) return null;

    if (turnStyle === 'diagonal-top') {
        return <DiagonalPageTurn {...props} origin="top" />;
    } else if (turnStyle === 'diagonal-bottom') {
        return <DiagonalPageTurn {...props} origin="bottom" />;
    } else {
        const cylinderProps = { ...props };
        if (props.direction === 'backward') {
            cylinderProps.frontPage = props.backPage;
            cylinderProps.backPage = props.frontPage;
        }
        return <CylinderPageTurn {...cylinderProps} />;
    }
};
