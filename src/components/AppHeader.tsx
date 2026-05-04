
import React from 'react';
import Header from './Header';
import { RegionConfig } from '@/config/regions';

interface AppHeaderProps {
  region: RegionConfig;
}

const AppHeader = ({ region }: AppHeaderProps) => {
  return (
    <div className="relative w-full bg-background">
      <Header region={region} />
    </div>
  );
};

export default AppHeader;
