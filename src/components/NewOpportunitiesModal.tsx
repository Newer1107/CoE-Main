"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Hackathon = {
    id: number;
    title: string;
    status: string;
};

type Problem = {
    id: number;
    title: string;
    problemType: 'OPEN' | 'INTERNSHIP';
};

export default function NewOpportunitiesModal({
    hackathons,
    problems,
}: {
    hackathons: Hackathon[];
    problems: Problem[];
}) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (hackathons.length || problems.length) {
            setOpen(true);
        }
    }, [hackathons, problems]);


    useEffect(() => {
        if (open) {
            const scrollY = window.scrollY;

            document.body.style.position = "fixed";
            document.body.style.top = `-${scrollY}px`;
            document.body.style.left = "0";
            document.body.style.right = "0";
            document.body.style.overflow = "hidden";
        } else {
            const scrollY = document.body.style.top;

            document.body.style.position = "";
            document.body.style.top = "";
            document.body.style.left = "";
            document.body.style.right = "";
            document.body.style.overflow = "";

            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || "0") * -1);
            }
        }

        return () => {
            document.body.style.position = "";
            document.body.style.top = "";
            document.body.style.left = "";
            document.body.style.right = "";
            document.body.style.overflow = "";
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-xs flex items-center justify-center px-3 sm:px-4">
            <div className="w-full max-w-2xl bg-white border border-[#c4c6d3] shadow-2xl relative">

                {/* Header */}
                <div className="bg-[#002155] text-white px-5 py-4 flex justify-between items-center">
                    <h2 className="text-sm font-bold uppercase tracking-widest">
                        New Opportunities
                    </h2>
                    <button
                        onClick={() => setOpen(false)}
                        aria-label="Close"
                        className="text-white text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-5 max-h-[70vh] overflow-y-auto space-y-6">

                    {/* Hackathons */}
                    {hackathons.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-[#0b6b2e] mb-3">
                                Hackathons
                            </h3>
                            <div className="space-y-2">
                                {hackathons.map((h) => (
                                    <Link key={h.id} href={`/innovation/events/${h.id}`}>
                                        <div className="border border-[#c4c6d3] p-3 hover:bg-[#f5f4f0] transition">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <span className="text-sm font-semibold text-[#002155] break-words">
                                                {h.title}
                                            </span>
                                            <span className="inline-flex w-fit text-[10px] bg-[#fd9923] text-white px-2 py-0.5 font-bold uppercase animate-pulse">
                                                New
                                            </span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Problems */}
                    {problems.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-[#8c4f00] mb-3">
                                Problem Statements
                            </h3>
                            <div className="space-y-2">
                                {problems.map((p) => (
                                    <Link key={p.id} href={p.problemType === 'INTERNSHIP' ? '/industry-internship' : '/innovation/problems'}>
                                        <div className="border border-[#c4c6d3] p-3 hover:bg-[#f5f4f0] transition">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0 sm:pr-3">
                                                <span className="text-sm font-semibold text-[#002155] block break-words">
                                                    {p.title}
                                                </span>
                                                {p.problemType === 'INTERNSHIP' ? (
                                                    <span className="inline-flex mt-1 border border-[#8c4f00] bg-[#fff8ee] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8c4f00] w-fit">
                                                        Industry Internship Opportunity
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                                {p.problemType === 'INTERNSHIP' ? (
                                                    <span className="text-[10px] bg-[#8c4f00] text-white px-2 py-0.5 font-bold uppercase">
                                                        Internship
                                                    </span>
                                                ) : null}
                                                <span className="text-[10px] bg-[#fd9923] text-white px-2 py-0.5 font-bold uppercase animate-pulse">
                                                    New
                                                </span>
                                            </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}