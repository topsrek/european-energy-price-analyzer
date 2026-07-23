import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    document.title = "Seite nicht gefunden – Strompreisrechner Österreich";
    const metaRobots = document.querySelector('meta[name="robots"]');
    const previousRobots = metaRobots?.getAttribute('content');
    if (metaRobots) {
      metaRobots.setAttribute('content', 'noindex, nofollow');
    } else {
      const tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      tag.setAttribute('content', 'noindex, nofollow');
      document.head.appendChild(tag);
    }
        
    // Log 404 errors only in development mode
    if (import.meta.env.DEV) {
      console.error(
        "404 Error: User attempted to access non-existent route:",
        location.pathname
      );
    }
    return () => {
      // Optional: restore indexing settings when navigating away
      const robots = document.querySelector('meta[name="robots"]');
      if (robots && previousRobots) {
        robots.setAttribute('content', previousRobots);
      }
    };

  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-4">Oops! Page not found</p>
        <a href="/" className="text-primary hover:text-secondary underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
