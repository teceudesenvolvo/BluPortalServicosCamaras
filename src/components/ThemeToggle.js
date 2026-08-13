import React from 'react';
import { LiaMoonSolid, LiaSunSolid } from 'react-icons/lia';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            type="button"
            className={`portal-theme-toggle ${isDark ? 'is-dark' : 'is-light'}`}
            onClick={toggleTheme}
            aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title={isDark ? 'Tema claro' : 'Tema escuro'}
        >
            {isDark ? <LiaSunSolid /> : <LiaMoonSolid />}
        </button>
    );
};

export default ThemeToggle;
