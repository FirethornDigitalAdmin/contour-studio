import { ArrowUpRight, Globe, Twitter } from "lucide-react";
import { creator } from "./distribution";
import "./creator.css";

export function CreatorLinks({ compact = false }: { compact?: boolean }) {
  return <div className={`creator-links${compact ? " creator-links-compact" : ""}`}>
    <a href={creator.twitterUrl} target="_blank" rel="noopener noreferrer" aria-label={`Follow ${creator.twitterHandle} on Twitter / X (opens in a new tab)`}>
      <Twitter size={18} aria-hidden="true" />
      <span>{compact ? creator.twitterHandle : `Follow ${creator.twitterHandle}`}<small>Twitter / X</small></span>
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
    <a href={creator.portfolioUrl} target="_blank" rel="noopener noreferrer" aria-label="Visit Louis Goldsbrough’s portfolio (opens in a new tab)">
      <Globe size={18} aria-hidden="true" />
      <span>{compact ? "Portfolio" : "Explore my portfolio"}<small>louisgoldsbrough.co.uk</small></span>
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>
  </div>;
}

export default function Creator({ headingId, compact = false }: { headingId: string; compact?: boolean }) {
  return <div className={`creator${compact ? " creator-compact" : ""}`}>
    <img className="creator-portrait" src="./louis-profile-monochrome.webp" alt="Louis Goldsbrough" width={1254} height={1254} loading="lazy" decoding="async" />
    <div className="creator-copy">
      <p className="creator-kicker">THE PERSON BEHIND CONTOUR STUDIO</p>
      <h2 id={headingId}>Hi, I’m Louis.</h2>
      <p>I’m {creator.name}, a Lead Engineer who builds software and creative projects. Contour Studio is one of those projects: a free, open-source way to turn meaningful places into something you can make and keep.</p>
      <p>Follow along for Contour Studio updates and other things I’m building, or explore more of my work in my portfolio.</p>
      <CreatorLinks />
    </div>
  </div>;
}
