import Image from "next/image";
import type { Photo } from "@/lib/site";

/** A photograph across the page between two sections, opening like a shutter, with what it shows beneath. */
export function PhotoBand({ photo, caption }: { photo: Photo; caption?: string }) {
  return (
    <figure className="w-photoband">
      <div className="w-photoband__pic" data-reveal="shutter">
        <Image src={photo.src} alt={photo.alt} fill sizes="100vw" style={{ objectPosition: photo.pos }} />
      </div>
      {caption && <figcaption className="w-photoband__cap w-wrap">{caption}</figcaption>}
    </figure>
  );
}
