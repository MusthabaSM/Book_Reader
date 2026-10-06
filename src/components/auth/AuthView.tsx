import React, { useState } from 'react';
import { supabase } from '../../sync/supabase';

export const AuthView: React.FC<{ onSkip: () => void, onLoginSuccess: () => void }> = ({ onSkip, onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        
        try {
            if (mode === 'signup') {
                const { error: signUpError } = await supabase.auth.signUp({ email, password });
                if (signUpError) throw signUpError;
                alert('Account created! You can now log in.');
                setMode('login');
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) throw signInError;
                onLoginSuccess();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-primary)'
        }}>
            <div style={{
                background: 'var(--bg-secondary)',
                padding: '2rem',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '400px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}>
                <h1 style={{ textAlign: 'center', marginBottom: '0.5rem', fontWeight: 600 }}>OHARA</h1>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    Sign in to synchronize your library.
                </p>

                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {error && (
                        <div style={{ color: 'var(--danger)', fontSize: '0.9rem', textAlign: 'center' }}>
                            {error}
                        </div>
                    )}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="library-input"
                            style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="library-input"
                            style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>
                    <button type="submit" className="library-btn library-btn-primary" disabled={loading} style={{ marginTop: '1rem', justifyContent: 'center' }}>
                        {loading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
                    {mode === 'login' ? (
                        <>Don't have an account? <button onClick={() => setMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>Sign up</button></>
                    ) : (
                        <>Already have an account? <button onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>Sign in</button></>
                    )}
                </div>

                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <button onClick={onSkip} className="library-btn library-btn-ghost" style={{ fontSize: '0.9rem' }}>
                        Continue Offline (Local Only)
                    </button>
                </div>
            </div>
        </div>
    );
};
