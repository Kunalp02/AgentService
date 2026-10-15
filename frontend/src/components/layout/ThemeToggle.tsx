import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';

/** Light and dark. Light mode is always Polaris. */
export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = usePlatform();
  const isLight = theme === 'light';

  const item = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
      active ? 'bg-accent text-accent-fg shadow-sm' : 'text-fg-muted hover:text-fg-strong'
    }`;

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-lg border border-line-strong bg-surface-2 p-0.5"
    >
      <button
        type="button"
        title="Light theme"
        aria-label="Light theme"
        aria-pressed={isLight}
        onClick={() => setTheme('light')}
        className={item(isLight)}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Dark theme"
        aria-label="Dark theme"
        aria-pressed={!isLight}
        onClick={() => setTheme('dark')}
        className={item(!isLight)}
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
};
