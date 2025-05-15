
import React from 'react';
import VersionInfo from './VersionInfo';

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
          <p className="text-sm text-muted-foreground">Historische Energiepreise und Tarifrechnungen</p>
        </div>
        <div>
          <a 
            href="https://github.com/yourusername/strompreisrechner" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
