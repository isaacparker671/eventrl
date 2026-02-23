"use client";

import { useMemo, useState } from "react";

type EventImageItem = {
  id: string;
  publicUrl: string;
  isCover?: boolean;
};

export default function EventImageGallery({
  images,
  title,
}: {
  images: EventImageItem[];
  title: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const validImages = useMemo(() => images.filter((image) => Boolean(image.publicUrl)), [images]);

  if (!validImages.length) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <div
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const container = event.currentTarget;
          const width = container.clientWidth;
          if (!width) return;
          const nextIndex = Math.round(container.scrollLeft / width);
          if (nextIndex >= 0 && nextIndex < validImages.length) {
            setActiveIndex(nextIndex);
          }
        }}
      >
        {validImages.map((image, index) => (
          <div key={image.id} className="relative w-full shrink-0 snap-center">
            <img
              src={image.publicUrl}
              alt={`${title} image ${index + 1}`}
              className="h-48 w-full rounded-xl border border-neutral-200 object-cover"
            />
            {image.isCover ? (
              <span className="absolute left-2 top-2 rounded-full border border-orange-200 bg-white/90 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                Cover
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {validImages.length > 1 ? (
        <div className="flex items-center justify-center gap-1.5">
          {validImages.map((image, index) => (
            <span
              key={image.id}
              className={index === activeIndex ? "h-1.5 w-4 rounded-full bg-orange-600" : "h-1.5 w-1.5 rounded-full bg-neutral-300"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
