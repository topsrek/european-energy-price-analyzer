
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-sm py-4">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-energy-primary">Wiener Strompreis-Rechner</h1>
          <p className="text-sm text-muted-foreground">Historische Energiepreise und Tarifrechnungen</p>
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
