"use client";

import { trackEvent } from "@/lib/analytics";

type TrackedContentLinkProps = {
  href: string;
  className?: string;
  target?: string;
  rel?: string;
  children: React.ReactNode;
  contentType: "news" | "grant" | "announcement" | "event";
  contentId: string;
  contentTitle: string;
};

export default function TrackedContentLink({
  href,
  className,
  target,
  rel,
  children,
  contentType,
  contentId,
  contentTitle,
}: TrackedContentLinkProps) {
  const handleClick = () => {
    try {
      trackEvent("content_viewed", {
        content_type: contentType,
        content_id: contentId,
        content_title: contentTitle,
      });
    } catch {
      // analytics must never block navigation
    }
  };

  return (
    <a href={href} target={target} rel={rel} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
