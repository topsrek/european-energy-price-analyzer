
import React from 'react';
import Header from './Header';
import { RegionConfig } from '@/config/regions';

interface AppHeaderProps {
  title: string;
  region?: RegionConfig;
  isComparison?: boolean;
}

const AppHeader = ({ title, region, isComparison = false }: AppHeaderProps) => {
  return (
    <div className="relative w-full bg-background">
      <Header title={title} region={region} isComparison={isComparison} />
    </div>
  );
};

export default AppHeader;
