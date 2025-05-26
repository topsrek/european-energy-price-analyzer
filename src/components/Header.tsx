
import React from 'react';
import VersionInfo from './VersionInfo';
import { ThemeToggle } from './ThemeToggle';


interface HeaderProps {
  version?: string;
  lastUpdated?: string;
}

const Header: React.FC<HeaderProps> = () => {
  return (
    <header className="bg-background shadow-sm py-4">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Wiener Strompreis-Rechner</h1>
        </div>
        <div className="top-4 right-4 flex flex-wrap items-center gap-2 md:gap-4">
          <a 
            href="https://github.com/topsrek/austrian-energy-insight" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub
          </a>

          <VersionInfo />
          <ThemeToggle />

        </div>
      </div>
    </header>
  );
};

export default Header;
