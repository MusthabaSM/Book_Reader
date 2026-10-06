import React from 'react';
import type { TocEntry } from '../../book/models';

interface Props {
    toc: TocEntry[];
    onSelect: (pageIndex: number) => void;
    onClose: () => void;
}

export const TocModal: React.FC<Props> = ({ toc, onSelect, onClose }) => {
    const renderNode = (node: TocEntry, level: number = 0) => {
        return (
            <div key={node.title + level} style={{ marginLeft: `${level * 20}px`, marginBottom: '10px' }}>
                <div 
                    onClick={() => {
                        if (node.targetPageIndex !== undefined) {
                            onSelect(node.targetPageIndex);
                        }
                    }}
                    style={{
                        padding: '8px 12px',
                        cursor: node.targetPageIndex !== undefined ? 'pointer' : 'default',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px',
                        display: 'inline-block',
                        width: '100%',
                        boxSizing: 'border-box',
                        transition: 'background-color 0.2s',
                        fontWeight: level === 0 ? 'bold' : 'normal',
                        borderLeft: level > 0 ? '2px solid #ccc' : 'none'
                    }}
                    onMouseEnter={(e) => {
                        if (node.targetPageIndex !== undefined) {
                            e.currentTarget.style.backgroundColor = '#e0e0e0';
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }}
                >
                    {node.title} {node.targetPageIndex !== undefined && <span style={{ fontSize: '0.8em', color: '#666', float: 'right' }}>Page {node.targetPageIndex + 1}</span>}
                </div>
                {node.children && node.children.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                        {node.children.map(child => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                width: '90%',
                maxWidth: '500px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}>
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#333' }}>Table of Contents</h2>
                    <button 
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: '#666'
                        }}
                    >×</button>
                </div>
                <div style={{
                    padding: '20px',
                    overflowY: 'auto',
                    flex: 1
                }}>
                    {toc.map(node => renderNode(node))}
                </div>
            </div>
        </div>
    );
};
