import { Graticule } from "@/components/ui/Graticule";

/**
 * The design system's cover motif: a strip of unequal bands, like map layers
 * stacked in a legend, with a plus-grid cut from the brand block.
 *
 * Proportions and colours are the cover's own (brand 392, ink 112, dataCat3
 * 176, dataCat2 88, dataMatrix2 160, gaps of spacingS), expressed as flex
 * ratios so the strip holds its rhythm at any width. On a phone the two
 * narrowest blocks drop out rather than shrinking to slivers.
 *
 * It appears once, at the top of the homepage, and nowhere else: the design
 * system's rule is that a data colour means one thing everywhere, and the
 * homepage hero is the one surface that is about the brand rather than about
 * a dataset. It is decorative and aria-hidden.
 */
export function CoverStrip() {
  return (
    <div aria-hidden="true" className="flex h-10 gap-2 lg:h-14">
      <div className="relative basis-0 grow-[392] overflow-hidden rounded-b-fluent-medium bg-accent">
        <Graticule ground="brand" />
      </div>
      <div className="basis-0 grow-[112] rounded-b-fluent-medium bg-ink" />
      <div className="basis-0 grow-[176] rounded-b-fluent-medium bg-(--data-cat-3)" />
      <div className="hidden basis-0 grow-[88] rounded-b-fluent-medium bg-(--data-cat-2) sm:block" />
      <div className="hidden basis-0 grow-[160] rounded-b-fluent-medium bg-(--data-matrix-2) sm:block" />
    </div>
  );
}
