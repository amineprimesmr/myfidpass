import { Button } from "./ui/button";

const GIF =
  "https://media.giphy.com/media/26tn33aiTi1jIQ8Cc/giphy.gif";

export function FeaturesChess() {
  return (
    <section id="services" className="bg-black px-6 py-24 md:px-16 lg:px-24">
      <div className="mx-auto max-w-6xl">
        <span className="liquid-glass ai-section-badge">Capabilities</span>
        <h2 className="ai-section-heading mt-2">Pro features. Zero complexity.</h2>

        <div className="mt-16 flex flex-col gap-16 lg:flex-row lg:items-center lg:gap-12">
          <div className="flex-1">
            <h3 className="font-heading text-3xl italic tracking-tight text-white md:text-4xl">
              Designed to convert. Built to perform.
            </h3>
            <p className="ai-body mt-4 max-w-lg">
              Every pixel is intentional. Our AI studies what works across thousands of top sites—then builds yours to
              outperform them all.
            </p>
            <Button type="button" className="mt-6">
              Learn more
            </Button>
          </div>
          <div className="liquid-glass flex-1 overflow-hidden rounded-2xl">
            <img src={GIF} alt="" className="h-auto w-full object-cover" loading="lazy" />
          </div>
        </div>

        <div className="mt-20 flex flex-col gap-16 lg:mt-24 lg:flex-row-reverse lg:items-center lg:gap-12">
          <div className="flex-1">
            <h3 className="font-heading text-3xl italic tracking-tight text-white md:text-4xl">
              It gets smarter. Automatically.
            </h3>
            <p className="ai-body mt-4 max-w-lg">
              Your site evolves on its own. AI monitors every click, scroll, and conversion—then optimizes in real time.
              No manual updates. Ever.
            </p>
            <Button type="button" variant="outlineGlass" className="mt-6">
              See how it works
            </Button>
          </div>
          <div className="liquid-glass flex-1 overflow-hidden rounded-2xl">
            <img src={GIF} alt="" className="h-auto w-full object-cover" loading="lazy" />
          </div>
        </div>
      </div>
    </section>
  );
}
