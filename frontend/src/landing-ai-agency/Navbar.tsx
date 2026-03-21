import { ArrowUpRight } from "lucide-react";
import { Button } from "./ui/button";

const links = ["Home", "Services", "Work", "Process", "Pricing"];

export function Navbar() {
  return (
    <header className="fixed left-0 right-0 top-4 z-50 px-4 md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <img
          src="/assets/iconweb.png"
          alt="Logo"
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
        <nav className="liquid-glass absolute left-1/2 hidden -translate-x-1/2 rounded-full px-2 py-1.5 md:block">
          <div className="flex items-center gap-1 pr-1">
            {links.map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase()}`}
                className="rounded-full px-3 py-1.5 font-body text-sm font-medium text-white/90 transition-colors hover:text-white"
              >
                {label}
              </a>
            ))}
            <Button variant="solid" size="sm" className="ml-1 gap-1" type="button">
              Get Started
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </nav>
        <div className="md:w-12" aria-hidden />
      </div>
      <div className="mx-auto mt-3 flex justify-center md:hidden">
        <Button variant="solid" size="sm" className="gap-1" type="button">
          Get Started
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
