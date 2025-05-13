
import React from 'react';

interface HeaderProps {
  version?: string;
  lastUpdated?: string;
}

const Header: React.FC<HeaderProps> = ({ version = '1.0.0', lastUpdated = '-' }) => {
  return (
    <header className="bg-white shadow-sm py-4">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-energy-primary">Wiener Strompreis-Rechner</h1>
          <div className="flex gap-4 items-center">
            <p className="text-sm text-muted-foreground">Historische Energiepreise und Tarifrechnungen</p>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">v{version}</span>
            <span className="text-xs text-gray-500">Zuletzt aktualisiert: {lastUpdated}</span>
          </div>
        </div>
        <div>
          <a 
            href="https://github.com/yourusername/strompreisrechner" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-energy-primary hover:underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
