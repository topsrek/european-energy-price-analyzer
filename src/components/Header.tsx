
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
          <h1 className="text-2xl font-bold text-foreground">Strompreisrechner Österreich</h1>
        </div>
        <VersionInfo />
        <ThemeToggle />
      </div>
    </header>
  );
};

export default Header;
