
import React from 'react';
import { Link } from 'react-router-dom';
import { House } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import RegionSwitcher from './RegionSwitcher';
import AppInfoModal from './AppInfoModal';
import { RegionConfig } from '@/config/regions';


interface HeaderProps {
  title: string;
  region?: RegionConfig;
  isComparison?: boolean;
}

const Header: React.FC<HeaderProps> = ({ title, region, isComparison = false }) => {
  return (
    <header className="bg-background shadow-sm py-3 md:py-4">
      <div className="container mx-auto px-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground md:text-2xl">
            <Link
              to="/"
              title="Zur Startseite"
              className="flex min-w-0 items-center gap-2 rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <House className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="sr-only">Startseite: </span>
              <span className="truncate">{title}</span>
            </Link>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <RegionSwitcher currentRegion={region} isComparison={isComparison} />
          <AppInfoModal />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;
