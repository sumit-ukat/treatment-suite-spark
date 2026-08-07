import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'ukat-theme';

/**
 * The single place `.dark` gets added to or removed from <html>. Everything in styles.css that
 * responds to dark mode — both this app's original tokens and the ones ported from the Lovable
 * redesign — now keys off that one class rather than the system `prefers-color-scheme` media query,
 * so a manual choice here is never second-guessed by the OS setting once it's made. System preference
 * is only consulted for the very first visit, before anything has been stored.
 */
export function ThemeToggle({ className }: { className?: string | undefined }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(initial);
    document.documentElement.classList.toggle('dark', initial);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'grid min-h-10 min-w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted',
        className,
      )}
    >
      {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
