
import React from 'react';
import Header from './Header';
import { ThemeToggle } from './ThemeToggle';
import VersionInfo from './VersionInfo';

const AppHeader = () => {
  return (
    <div className="relative w-full bg-background">
      <Header />
    </div>
  );
};

export default AppHeader;
