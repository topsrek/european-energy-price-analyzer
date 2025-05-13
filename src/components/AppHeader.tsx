
import React from 'react';
import Header from './Header';
import { ThemeToggle } from './ThemeToggle';
import VersionInfo from './VersionInfo';

const AppHeader = () => {
  return (
    <div className="relative w-full">
      <Header />
      <div className="absolute top-4 right-4 flex items-center gap-4">
        <VersionInfo />
        <ThemeToggle />
      </div>
    </div>
  );
};

export default AppHeader;
