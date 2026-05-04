
import React from 'react';
import VersionInfo from './VersionInfo';
import { ThemeToggle } from './ThemeToggle';
import RegionSwitcher from './RegionSwitcher';
import { RegionConfig } from '@/config/regions';


interface HeaderProps {
  region: RegionConfig;
}

const Header: React.FC<HeaderProps> = ({ region }) => {
  return (
    <header className="bg-background shadow-sm py-4">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{region.title}</h1>
          <p className="text-sm text-muted-foreground">{region.appCode}</p>
        </div>
        <div className="flex items-center gap-2">
          <RegionSwitcher currentRegion={region} />
          <VersionInfo />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;
