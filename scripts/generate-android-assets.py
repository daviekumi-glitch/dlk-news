#!/usr/bin/env python3
"""Generate Android launcher icons and splash screens for Agent Mobile.

Run this after changing the source artwork. It is committed so the generated
assets are reproducible rather than opaque binaries nobody can regenerate.

    python3 scripts/generate-android-assets.py \
        --icon  assets/icon.png \
        --splash assets/splash.png

Inputs are expected to be square PNGs. `--icon` is used for the launcher icon
and the adaptive-icon foreground; `--splash` fills every density of the splash
drawable.

Why the adaptive foreground is scaled down
------------------------------------------
Android composites an adaptive icon as `foreground` over `background` inside a
108dp canvas, but only the central 72dp is guaranteed visible across launchers —
and only the central 66dp is fully safe. The source artwork already has its own
rounded-square backdrop, so the script insets it to ~66% and paints the
background layer with the artwork's own corner colour. The result reads as a
deliberate mark on a matching tile instead of a clipped rectangle.

Only the standard library plus Pillow is required.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - environment guard
    sys.exit("Pillow is required: pip install Pillow")


# Launcher icon sizes, in density buckets.
LEGACY_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# Adaptive layers use a 108dp canvas at each density.
ADAPTIVE_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

# Splash images per density, portrait (width, height). Landscape is the swap.
SPLASH_PORTRAIT = {
    "mdpi": (320, 480),
    "hdpi": (480, 800),
    "xhdpi": (720, 1280),
    "xxhdpi": (960, 1600),
    "xxxhdpi": (1280, 1920),
}

# Fraction of the adaptive canvas the artwork occupies.
FOREGROUND_INSET = 0.66


def corner_colour(image: Image.Image) -> tuple[int, int, int]:
    """Average the four corners — the artwork's backdrop colour."""
    w, h = image.size
    inset = max(1, min(w, h) // 50)
    picks = [
        image.getpixel((inset, inset)),
        image.getpixel((w - 1 - inset, inset)),
        image.getpixel((inset, h - 1 - inset)),
        image.getpixel((w - 1 - inset, h - 1 - inset)),
    ]
    channels = list(zip(*[p[:3] for p in picks]))
    return tuple(sum(c) // len(c) for c in channels)  # type: ignore[return-value]


def write_png(image: Image.Image, path: Path, quantize: bool = False, dither: bool = True) -> None:
    """Write a PNG, optionally reducing it to a 256-colour palette.

    Splash artwork is mostly flat colour with a soft gradient, so an adaptive
    palette shrinks the file dramatically. Floyd-Steinberg dithering is applied
    by default to keep the gradient smooth rather than banded.
    """
    path.parent.mkdir(parents=True, exist_ok=True)

    out = image
    if quantize and image.mode in ("RGB", "RGBA"):
        dither_mode = Image.FLOYDSTEINBERG if dither else Image.NONE
        out = image.convert("P", palette=Image.ADAPTIVE, colors=256, dither=dither_mode)

    out.save(path, format="PNG", optimize=True)
    print(f"  wrote {path.name}  {image.size[0]}x{image.size[1]}")


def squarify(image: Image.Image) -> Image.Image:
    """Centre-crop to a square, so non-square input cannot distort the mark."""
    w, h = image.size
    if w == h:
        return image
    edge = min(w, h)
    left = (w - edge) // 2
    top = (h - edge) // 2
    return image.crop((left, top, left + edge, top + edge))


def generate_icons(icon_path: Path, res_root: Path) -> None:
    source = squarify(Image.open(icon_path).convert("RGBA"))
    background = corner_colour(source)
    print(f"icon source {source.size[0]}x{source.size[1]}, backdrop {background}")

    for density, size in LEGACY_SIZES.items():
        resized = source.resize((size, size), Image.LANCZOS)
        write_png(resized, res_root / f"mipmap-{density}" / "ic_launcher.png")
        write_png(resized, res_root / f"mipmap-{density}" / "ic_launcher_round.png")

    for density, canvas in ADAPTIVE_SIZES.items():
        # Transparent-layer foreground: the artwork inset into the safe zone.
        layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        inner = max(1, int(canvas * FOREGROUND_INSET))
        art = source.resize((inner, inner), Image.LANCZOS)
        offset = (canvas - inner) // 2
        layer.paste(art, (offset, offset), art)
        write_png(layer, res_root / f"mipmap-{density}" / "ic_launcher_foreground.png")

    # The adaptive descriptor and the colour it references.
    anydpi = res_root / "mipmap-anydpi-v26"
    descriptor = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        "</adaptive-icon>\n"
    )
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        target = anydpi / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(descriptor, encoding="utf-8")
        print(f"  wrote {name}")

    hex_colour = "#FF%02X%02X%02X" % background
    values = res_root / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{hex_colour}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    print(f"  wrote ic_launcher_background.xml ({hex_colour})")


def generate_splashes(splash_path: Path, res_root: Path) -> None:
    source = Image.open(splash_path).convert("RGB").copy()
    print(f"splash source {source.size[0]}x{source.size[1]}")

    for density, (width, height) in SPLASH_PORTRAIT.items():
        # CENTER_CROP is configured in capacitor.config.ts, so the artwork is
        # scaled to COVER the target and cropped, never letter-boxed.
        for orientation, (w, h) in (
            ("port", (width, height)),
            ("land", (height, width)),
        ):
            target_ratio = w / h
            src_ratio = source.size[0] / source.size[1]
            if src_ratio > target_ratio:
                new_h = source.size[1]
                new_w = int(new_h * target_ratio)
            else:
                new_w = source.size[0]
                new_h = int(new_w / target_ratio)
            left = (source.size[0] - new_w) // 2
            top = (source.size[1] - new_h) // 2
            cropped = source.crop((left, top, left + new_w, top + new_h))
            write_png(
                cropped.resize((w, h), Image.LANCZOS),
                res_root / f"drawable-{orientation}-{density}" / "splash.png",
                quantize=True,
            )

    # A density-independent fallback for anything the buckets do not cover.
    write_png(source.resize((1152, 1152), Image.LANCZOS), res_root / "drawable" / "splash.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--icon", required=True, type=Path, help="square launcher-icon PNG")
    parser.add_argument("--splash", required=True, type=Path, help="square splash PNG")
    parser.add_argument(
        "--res",
        type=Path,
        default=Path("android/app/src/main/res"),
        help="Android res directory (default: android/app/src/main/res)",
    )
    args = parser.parse_args()

    for label, path in (("icon", args.icon), ("splash", args.splash)):
        if not path.is_file():
            sys.exit(f"{label} not found: {path}")
    if not args.res.is_dir():
        sys.exit(f"res directory not found: {args.res} (run `npx cap add android` first)")

    print("launcher icons")
    generate_icons(args.icon, args.res)
    print("splash screens")
    generate_splashes(args.splash, args.res)
    print("done")


if __name__ == "__main__":
    main()
