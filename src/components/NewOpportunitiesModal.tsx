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

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center px-4">
            <div className="w-full max-w-2xl bg-white border border-[#c4c6d3] shadow-2xl relative">

                {/* Header */}
                <div className="bg-[#002155] text-white px-5 py-4 flex justify-between items-center">
                    <h2 className="text-sm font-bold uppercase tracking-widest">
                        New Opportunities
                    </h2>
                    <button
                        onClick={() => setOpen(false)}
                        className="text-white text-lg"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 max-h-[70vh] overflow-y-auto space-y-6">

                    {/* Hackathons */}
                    {hackathons.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-widest text-[#0b6b2e] mb-3">
                                Hackathons
                            </h3>
                            <div className="space-y-2">
                                {hackathons.map((h) => (
                                    <Link key={h.id} href={`/innovation/events/${h.id}`}>
                                        <div className="border border-[#c4c6d3] p-3 hover:bg-[#f5f4f0] transition flex justify-between items-center">
                                            <span className="text-sm font-semibold text-[#002155]">
                                                {h.title}
                                            </span>
                                            <span className="text-[10px] bg-[#fd9923] text-white px-2 py-0.5 font-bold uppercase animate-pulse">
                                                New
                                            </span>
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
                                    <Link key={p.id} href="/innovation/problems">
                                        <div className="border border-[#c4c6d3] p-3 hover:bg-[#f5f4f0] transition flex justify-between items-center">
                                            <span className="text-sm font-semibold text-[#002155]">
                                                {p.title}
                                            </span>
                                            <span className="text-[10px] bg-[#fd9923] text-white px-2 py-0.5 font-bold uppercase animate-pulse">
                                                New
                                            </span>
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