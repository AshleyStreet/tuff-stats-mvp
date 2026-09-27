import { useEffect, useState } from "react";

export function TeamLogo({
  name,
  src,
  className = "avatar team-avatar",
  fallback,
  exportSrc
}: {
  name: string;
  src?: string;
  className?: string;
  fallback?: string;
  /** Same-origin copy of `src` that card exports can draw (see lib/cardExport). */
  exportSrc?: string;
}) {
  const [failed, setFailed] = useState(false);
  const mark = (fallback ?? name.replace(/^the\s+/i, "").slice(0, 2)).toUpperCase();

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        className={className}
        src={src}
        alt=""
        data-export-src={exportSrc}
        onError={() => setFailed(true)}
      />
    );
  }

  return <div className={className}>{mark}</div>;
}
