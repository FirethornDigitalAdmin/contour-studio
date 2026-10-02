import { Coffee } from "lucide-react";
import { coffeeUrl } from "./distribution";

export default function CoffeeLink({ className = "" }: { className?: string }) {
  return <a className={`coffee-link ${className}`} href={coffeeUrl} target="_blank" rel="noopener noreferrer" aria-label="Buy me a coffee — optional thank you" title="Buy me a coffee — optional thank you"><Coffee size={18} aria-hidden="true" /><span>Buy me a coffee</span></a>;
}
