"use client";

import { useState } from "react";

type NewsItem = {
  id: number;
  title: string;
  caption: string;
  imageUrl: string | null;
  publishedAt: Date | string; // Handled dynamically in the formatter
};

// Local formatting logic
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default function NewsCard({ item }: { item: NewsItem }) {
  const [isOpen, setIsOpen] = useState(false);

  // Local helper for formatting
  const formatDate = (dateInput: Date | string) => {
    const date =
      typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    return dateFormatter.format(date);
  };

  return (
    <>
      {/* Clickable Card */}
      <article
        onClick={() => setIsOpen(true)}
        className="border border-[#c4c6d3] bg-white group cursor-pointer hover:shadow-lg transition-all duration-300"
      >
        <div className="w-full h-44 bg-[#efeeea] overflow-hidden relative border-b border-[#c4c6d3]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full h-full object-cover  transition-all duration-500"
            alt={item.title}
            src={item.imageUrl || "/vercel.svg"}
          />
          <div className="absolute top-3 left-3 bg-[#002155] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1">
            {formatDate(item.publishedAt)}
          </div>
        </div>
        <div className="p-5">
          <h3 className="font-body font-semibold text-[#002155] mb-2 leading-tight group-hover:text-[#8c4f00] transition-colors">
            {item.title}
          </h3>
          <p className="text-sm text-[#434651] line-clamp-3">{item.caption}</p>
        </div>
      </article>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002155]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto border-t-8 border-[#fd9923] shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white p-2 rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-[#002155]">
                close
              </span>
            </button>

            <div className="p-6 md:p-10">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-bold text-[#8c4f00] uppercase tracking-[0.2em]">
                  {formatDate(item.publishedAt)}
                </span>
                <span className="w-8 h-[1px] bg-[#c4c6d3]" />
                <span className="text-[10px] font-bold text-[#747782] uppercase tracking-widest">
                  TCET CoE Press
                </span>
              </div>

              <h2 className="font-headline text-3xl md:text-4xl text-[#002155] leading-tight mb-6">
                {item.title}
              </h2>

              <div className="w-full aspect-video bg-[#f5f4f0] mb-8 border border-[#c4c6d3] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl || "/vercel.svg"}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="prose prose-sm max-w-none text-[#434651] font-['Inter'] leading-relaxed whitespace-pre-wrap">
                {item.caption}
              </div>

              <div className="mt-10 pt-6 border-t border-[#c4c6d3] flex justify-between items-center">
                <span className="text-[9px] font-bold text-[#747782] uppercase">
                  © TCET Center of Excellence
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-xs font-bold text-[#002155] uppercase tracking-widest border-b-2 border-[#fd9923]"
                >
                  Back to News
                </button>
              </div>
            </div>
          </div>
          {/* Backdrop Click to Close */}
          <div
            className="absolute inset-0 -z-10"
            onClick={() => setIsOpen(false)}
          />
        </div>
      )}
    </>
  );
}
