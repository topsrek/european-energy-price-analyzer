import { useEffect } from 'react';

export const usePageMetadata = (title: string) => {
  useEffect(() => {
    document.documentElement.lang = 'de-AT';
    document.title = title;
  }, [title]);
};
