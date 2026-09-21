"""Draw the Arcstamp mark.

The mark is an open ring — an arc, not a closed circle — with a check inside it:
the seal a payment gets once the chain has been read. Everything is drawn at 4x
and downsampled, and every stroke is heavy enough to survive being shown at
32 px, which is the size that actually decides whether a logo works.

    python scripts/make-logo.py

Writes public/logo-512.png and public/icon.svg.
"""

from pathlib import Path
import math
from PIL import Image, ImageDraw

SIDE = 512
SCALE = 4
S = SIDE * SCALE

BACKGROUND = (39, 117, 202)  # USDC blue
MARK = (255, 255, 255)

CENTER = S / 2
RING_RADIUS = 200 * SCALE
RING_STROKE = 28 * SCALE
CHECK_STROKE = 34 * SCALE

# Gap centred on the upper right, so the ring reads as an arc rather than as a
# generic verification badge.
ARC_START = -15
ARC_END = 285

CHECK = [(175, 258), (232, 315), (340, 200)]


def round_cap(draw: ImageDraw.ImageDraw, x: float, y: float, stroke: float) -> None:
    r = stroke / 2
    draw.ellipse((x - r, y - r, x + r, y + r), fill=MARK)


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "public"
    out_dir.mkdir(exist_ok=True)

    image = Image.new("RGB", (S, S), BACKGROUND)
    draw = ImageDraw.Draw(image)

    box = (
        CENTER - RING_RADIUS,
        CENTER - RING_RADIUS,
        CENTER + RING_RADIUS,
        CENTER + RING_RADIUS,
    )
    draw.arc(box, start=ARC_START, end=ARC_END, fill=MARK, width=int(RING_STROKE))

    for angle in (ARC_START, ARC_END):
        radians = math.radians(angle)
        round_cap(
            draw,
            CENTER + RING_RADIUS * math.cos(radians),
            CENTER + RING_RADIUS * math.sin(radians),
            RING_STROKE,
        )

    points = [(x * SCALE, y * SCALE) for x, y in CHECK]
    draw.line(points, fill=MARK, width=int(CHECK_STROKE), joint="curve")
    for x, y in points:
        round_cap(draw, x, y, CHECK_STROKE)

    image.resize((SIDE, SIDE), Image.LANCZOS).save(out_dir / "logo-512.png", optimize=True)

    # Same mark as vector, for the site.
    def polar(angle: float) -> str:
        radians = math.radians(angle)
        return f"{256 + 200 * math.cos(radians):.2f} {256 + 200 * math.sin(radians):.2f}"

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Arcstamp">
  <rect width="512" height="512" fill="#2775ca"/>
  <g fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round">
    <path d="M {polar(ARC_START)} A 200 200 0 1 1 {polar(ARC_END)}"/>
    <polyline points="175,258 232,315 340,200" stroke-width="34" stroke-linejoin="round"/>
  </g>
</svg>
"""
    (out_dir / "icon.svg").write_text(svg, encoding="utf-8")

    print(f"wrote {out_dir / 'logo-512.png'} and {out_dir / 'icon.svg'}")


if __name__ == "__main__":
    main()
