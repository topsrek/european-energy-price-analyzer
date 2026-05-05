
import React from 'react';
import { ThemeToggle } from './ThemeToggle';
import RegionSwitcher from './RegionSwitcher';
import AppInfoModal from './AppInfoModal';
import { RegionConfig } from '@/config/regions';


interface HeaderProps {
  region: RegionConfig;
}

const Header: React.FC<HeaderProps> = ({ region }) => {
  return (
    <header className="bg-background shadow-sm py-3 md:py-4">
      <div className="container mx-auto px-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-foreground md:text-2xl">{region.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <RegionSwitcher currentRegion={region} />
          <AppInfoModal />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;
