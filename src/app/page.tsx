import DietWiseLogo from '@/components/DietWiseLogo';
import DataVisualizer from '@/components/DataVisualizer';

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="py-6 px-4 md:px-8 border-b">
        <div className="container mx-auto flex items-center justify-between">
          <DietWiseLogo />
          {/* Add nav items here if needed later */}
        </div>
      </header>
      
      <DataVisualizer />

      <footer className="py-6 text-center text-sm text-muted-foreground border-t mt-12">
        <div className="container mx-auto">
          &copy; {new Date().getFullYear()} DietWise. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
